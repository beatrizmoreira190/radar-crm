import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';

const EXPECTED_REPOSITORY = 'beatrizmoreira190/radar-crm';
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const OIDC_AUDIENCE = 'radar-cnpj-sync';
const JWKS = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const key = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Configuração administrativa do Supabase indisponível.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authorizeWorker(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('Token do worker ausente.');
  const token = auth.slice(7);
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: OIDC_ISSUER,
    audience: OIDC_AUDIENCE,
  });

  if (payload.repository !== EXPECTED_REPOSITORY) throw new Error('Repositório não autorizado.');
  const workflowRef = String(payload.workflow_ref || '');
  if (!workflowRef.includes(`${EXPECTED_REPOSITORY}/.github/workflows/cnpj-sync.yml@`)) {
    throw new Error('Workflow não autorizado.');
  }
  const eventName = String(payload.event_name || '');
  if (!['schedule', 'workflow_dispatch'].includes(eventName)) {
    throw new Error('Evento do workflow não autorizado.');
  }
  return payload;
}

async function allTargets(supabase: ReturnType<typeof adminClient>, runId: string) {
  const rows: Array<{ publisher_id: string; cnpj: string }> = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('cnpj_sync_targets')
      .select('publisher_id,cnpj')
      .eq('run_id', runId)
      .order('publisher_id')
      .range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    await authorizeWorker(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Worker não autorizado.' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo JSON inválido.' }, 400);
  }

  const action = String(body.action || '');
  const supabase = adminClient();

  try {
    if (action === 'claim') {
      const { data: run, error } = await supabase
        .from('cnpj_sync_runs')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!run) return json({ run: null, targets: [] });

      const { data: claimed, error: claimError } = await supabase
        .from('cnpj_sync_runs')
        .update({
          status: 'running',
          stage: 'Preparando dados',
          progress: 2,
          started_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          message: 'Processamento iniciado pelo worker.',
        })
        .eq('id', run.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json({ run: null, targets: [] });

      const targets = await allTargets(supabase, claimed.id);
      return json({ run: claimed, targets });
    }

    const runId = String(body.run_id || '');
    if (!runId) return json({ error: 'run_id é obrigatório.' }, 400);

    if (action === 'progress') {
      const rawProgress = Number(body.progress ?? 0);
      const progress = Math.max(0, Math.min(99, Number.isFinite(rawProgress) ? Math.round(rawProgress) : 0));
      const stage = String(body.stage || 'Processando').slice(0, 180);
      const message = body.message == null ? null : String(body.message).slice(0, 2000);
      const sourcePeriod = body.source_period == null ? undefined : String(body.source_period).slice(0, 20);
      const sourceUrl = body.source_url == null ? undefined : String(body.source_url).slice(0, 1000);
      const patch: Record<string, unknown> = {
        stage,
        progress,
        heartbeat_at: new Date().toISOString(),
        message,
      };
      if (sourcePeriod !== undefined) patch.source_period = sourcePeriod;
      if (sourceUrl !== undefined) patch.source_url = sourceUrl;

      const { error } = await supabase
        .from('cnpj_sync_runs')
        .update(patch)
        .eq('id', runId)
        .eq('status', 'running');
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'apply_batch') {
      const rows = body.rows;
      const sourcePeriod = String(body.source_period || '');
      if (!Array.isArray(rows) || !sourcePeriod) {
        return json({ error: 'rows e source_period são obrigatórios.' }, 400);
      }
      const { data, error } = await supabase.rpc('crm_worker_apply_cnpj_sync_batch', {
        p_run_id: runId,
        p_rows: rows,
        p_source_period: sourcePeriod,
      });
      if (error) throw error;
      return json({ ok: true, result: data });
    }

    if (action === 'finish') {
      const sourcePeriod = String(body.source_period || '');
      const sourceUrl = String(body.source_url || '');
      const metadata = (body.metadata && typeof body.metadata === 'object') ? body.metadata : {};
      if (!sourcePeriod || !sourceUrl) {
        return json({ error: 'source_period e source_url são obrigatórios.' }, 400);
      }
      const { data, error } = await supabase.rpc('crm_worker_finish_cnpj_sync', {
        p_run_id: runId,
        p_source_period: sourcePeriod,
        p_source_url: sourceUrl,
        p_metadata: metadata,
      });
      if (error) throw error;
      return json({ ok: true, run: data });
    }

    if (action === 'fail') {
      const message = String(body.message || 'Falha no processamento.').slice(0, 2000);
      const { error } = await supabase
        .from('cnpj_sync_runs')
        .update({
          status: 'failed',
          stage: 'Falha',
          message,
          finished_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq('id', runId)
        .in('status', ['pending', 'running']);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
