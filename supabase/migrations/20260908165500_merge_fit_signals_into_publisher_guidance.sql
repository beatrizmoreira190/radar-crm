drop function if exists public.crm_publisher_fit_signals(uuid,uuid);

create or replace function public.crm_publisher_guidance(p_organization_id uuid, p_publisher_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  p public.publishers%rowtype;
  task_due timestamptz;
  task_title text;
  has_dm boolean;
  latest_result text;
  action_code text;
  action_label text;
  reason text;
  v_profile_fit_signals jsonb := '[]'::jsonb;
begin
  if not private.is_org_member(p_organization_id) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  select * into p from public.publishers where id=p_publisher_id and organization_id=p_organization_id and not archived;
  if not found then return null; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile',ep.profile,
        'pnld_literario',coalesce(w.pnld_literario,0),
        'pnld_didatico',coalesce(w.pnld_didatico,0),
        'pnld_tecnico_metodologico',coalesce(w.pnld_tecnico_metodologico,0),
        'radar_licitacoes',coalesce(w.radar_licitacoes,0),
        'radar_oportunidades',coalesce(w.radar_oportunidades,0),
        'religious_core',coalesce(w.religious_core,false)
      ) order by ep.ord
    ),
    '[]'::jsonb
  ) into v_profile_fit_signals
  from unnest(coalesce(p.editorial_profile,array[]::text[])) with ordinality ep(profile,ord)
  left join private.radar_profile_weights w on w.profile=ep.profile;

  select t.due_at,t.title into task_due,task_title from public.tasks t where t.organization_id=p_organization_id and t.publisher_id=p.id and t.assigned_to=auth.uid() and t.status in ('open','in_progress') order by t.due_at nulls last limit 1;
  select exists(select 1 from public.contacts c where c.publisher_id=p.id and c.active and c.is_decision_maker) into has_dm;
  select i.result into latest_result from public.interactions i where i.publisher_id=p.id order by i.occurred_at desc limit 1;
  if task_due is not null and task_due<now() then action_code:='overdue_task'; action_label:='Concluir tarefa atrasada'; reason:=coalesce(task_title,'Há uma tarefa vencida nesta conta.');
  elsif p.next_action_at is not null and p.next_action_at<=now() then action_code:='due_followup'; action_label:='Executar próximo passo'; reason:='A próxima ação registrada já venceu ou é para agora.';
  elsif p.owner_user_id is null then action_code:='claim'; action_label:='Assumir esta editora'; reason:=case when coalesce(p.radar_fit_score,0)>=70 then 'Alta aderência aos serviços da Radar e ainda sem responsável.' when coalesce(p.radar_fit_score,0)<20 then 'Conta sem responsável, mas com baixa aderência editorial; priorize outras antes.' else 'A conta ainda não tem responsável.' end;
  elsif p.last_contact_at is null then action_code:='first_contact'; action_label:='Fazer primeiro contato'; reason:=case when coalesce(p.best_product,'')<>'' then 'Melhor aderência identificada: '||replace(p.best_product,'_',' ')||'.' else 'Ainda não há contato comercial registrado.' end;
  elsif latest_result in ('busy','callback_scheduled','follow_up','asked_email') then action_code:='follow_up'; action_label:='Fazer follow-up'; reason:='O último resultado indica que a conversa precisa continuar.';
  elsif not has_dm then action_code:='find_decision_maker'; action_label:='Pesquisar decisor'; reason:='Ainda não há decisor identificado na editora.';
  elsif p.last_contact_at<now()-interval '14 days' then action_code:='reengage'; action_label:='Retomar contato'; reason:='A conta está há mais de 14 dias sem interação.';
  else action_code:='review'; action_label:='Revisar conta'; reason:='Acompanhe histórico, etapa e próximo passo.'; end if;

  return jsonb_build_object(
    'publisher_id',p.id,
    'score',p.score,
    'score_reason',p.score_reason,
    'score_breakdown',p.score_breakdown,
    'score_updated_at',p.score_updated_at,
    'data_quality_score',p.data_quality_score,
    'commercial_potential_score',p.commercial_potential_score,
    'radar_fit_score',p.radar_fit_score,
    'best_product',p.best_product,
    'product_fits',jsonb_build_object(
      'pnld_literario',p.fit_pnld_literario,
      'pnld_didatico',p.fit_pnld_didatico,
      'pnld_tecnico_metodologico',p.fit_pnld_tecnico_metodologico,
      'radar_licitacoes',p.fit_radar_licitacoes,
      'radar_oportunidades',p.fit_radar_oportunidades
    ),
    'profile_fit_signals',v_profile_fit_signals,
    'action_code',action_code,
    'action_label',action_label,
    'reason',reason
  );
end;
$function$;
