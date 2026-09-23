-- Corrige a validação interna da função SECURITY DEFINER do worker CNPJ.
-- A autorização do worker permanece restrita por GRANT EXECUTE ao service_role.

create or replace function public.crm_worker_finish_cnpj_sync(
  p_run_id uuid,
  p_source_period text,
  p_source_url text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  run_row public.cnpj_sync_runs%rowtype;
  matched_count integer;
  changed_count integer;
  error_count integer;
  not_found_count integer;
begin
  select * into run_row from public.cnpj_sync_runs where id=p_run_id for update;
  if not found or run_row.status <> 'running' then
    raise exception 'Execução de sincronização não está ativa';
  end if;

  insert into public.publisher_cnpj_verifications(
    publisher_id,organization_id,last_run_id,normalized_cnpj,status,source_period,last_verified_at,error_message
  )
  select t.publisher_id,t.organization_id,p_run_id,t.cnpj,'not_found',p_source_period,now(),null
  from public.cnpj_sync_targets t
  left join public.publisher_cnpj_verifications v
    on v.publisher_id=t.publisher_id and v.last_run_id=p_run_id
  where t.run_id=p_run_id and v.publisher_id is null
  on conflict (publisher_id) do update set
    organization_id=excluded.organization_id,
    last_run_id=excluded.last_run_id,
    normalized_cnpj=excluded.normalized_cnpj,
    status='not_found',
    source_period=excluded.source_period,
    last_verified_at=excluded.last_verified_at,
    error_message=null;

  select count(*) into matched_count
  from public.publisher_cnpj_verifications where last_run_id=p_run_id and status='matched';

  select count(*) into changed_count
  from public.cnpj_sync_changes where run_id=p_run_id;

  select count(*) into error_count
  from public.publisher_cnpj_verifications where last_run_id=p_run_id and status='error';

  select count(*) into not_found_count
  from public.publisher_cnpj_verifications where last_run_id=p_run_id and status='not_found';

  update public.cnpj_sync_runs set
    status='completed',
    stage='Concluída',
    progress=100,
    source_period=p_source_period,
    source_url=p_source_url,
    matched_publishers=matched_count,
    updated_publishers=changed_count,
    unchanged_publishers=greatest(matched_count-changed_count,0),
    not_found_publishers=not_found_count,
    error_publishers=error_count,
    finished_at=now(),
    heartbeat_at=now(),
    message=case when error_count>0 then 'Concluída com ocorrências para revisão.' else 'Sincronização concluída.' end,
    metadata=coalesce(p_metadata,'{}'::jsonb)
  where id=p_run_id
  returning * into run_row;

  return to_jsonb(run_row);
end;
$$;

revoke all on function public.crm_worker_finish_cnpj_sync(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.crm_worker_finish_cnpj_sync(uuid,text,text,jsonb) to service_role;
