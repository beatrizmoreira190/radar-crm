
create table if not exists private.radar_score_config (
  singleton boolean primary key default true check (singleton),
  active_version text not null check (active_version in ('radar_v2','radar_v3')),
  changed_at timestamptz not null default now()
);

insert into private.radar_score_config(singleton,active_version)
values(true,'radar_v2')
on conflict(singleton) do nothing;

do $$
declare
  v_exists boolean;
  v_def text;
begin
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='recalculate_publisher_score_v2'
      and pg_get_function_identity_arguments(p.oid)='p_id uuid'
  ) into v_exists;

  if not v_exists then
    select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='recalculate_publisher_score'
      and pg_get_function_identity_arguments(p.oid)='p_id uuid';

    if v_def is null then
      raise exception 'Função radar_v2 atual não encontrada';
    end if;

    v_def:=replace(
      v_def,
      'CREATE OR REPLACE FUNCTION public.recalculate_publisher_score(p_id uuid)',
      'CREATE OR REPLACE FUNCTION private.recalculate_publisher_score_v2(p_id uuid)'
    );
    execute v_def;
  end if;
end;
$$;

revoke all on function private.recalculate_publisher_score_v2(uuid) from public;

create or replace function private.recalculate_publisher_score_v3(p_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  p public.publishers%rowtype;
  v_preview jsonb;
  v_score integer;
  v_fit integer;
  v_potential integer;
  v_quality integer;
  v_prelim integer;
  v_fit_points integer;
  v_potential_points integer;
  v_quality_points integer;
  v_product_fits jsonb;
  v_best_product text;
  v_reasons jsonb:='[]'::jsonb;
  v_breakdown jsonb:='{}'::jsonb;
begin
  select * into p from public.publishers where id=p_id;
  if not found then return null; end if;

  v_preview:=private.radar_v3_preview(p_id);
  if v_preview is null then return null; end if;

  v_score:=coalesce((v_preview->>'score')::int,0);
  v_fit:=coalesce((v_preview->'components'->>'editorial_fit')::int,0);
  v_potential:=coalesce((v_preview->'components'->>'commercial_potential')::int,0);
  v_quality:=coalesce((v_preview->'components'->>'data_quality')::int,0);
  v_prelim:=coalesce((v_preview->>'pre_cap_score')::int,v_score);
  v_fit_points:=coalesce((v_preview->'points'->>'editorial_fit')::int,round(v_fit*.70));
  v_potential_points:=coalesce((v_preview->'points'->>'commercial_potential')::int,round(v_potential*.20));
  v_quality_points:=coalesce((v_preview->'points'->>'data_quality')::int,round(v_quality*.10));
  v_product_fits:=coalesce(v_preview->'product_fits','{}'::jsonb);
  v_best_product:=nullif(v_preview->>'recommended_product','');

  v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object(
    'code','editorial_fit','label','Aderência aos serviços da Radar','points',v_fit_points
  ));
  v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object(
    'code','commercial_potential','label','Potencial comercial','points',v_potential_points
  ));
  v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object(
    'code','data_quality','label','Prospectabilidade / qualidade dos dados','points',v_quality_points
  ));
  if v_score<>v_prelim then
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object(
      'code','v3_cap',
      'label',case
        when v_fit<20 then 'Teto: aderência editorial muito baixa'
        when v_fit<40 then 'Teto: aderência editorial baixa'
        else 'Ajuste por relacionamento comercial'
      end,
      'points',v_score-v_prelim
    ));
  end if;

  v_breakdown:=jsonb_build_object(
    'version','radar_v3',
    'weights',coalesce(v_preview->'weights',jsonb_build_object('editorial_fit',70,'commercial_potential',20,'data_quality',10)),
    'components',coalesce(v_preview->'components','{}'::jsonb),
    'product_fits',v_product_fits,
    'best_product',v_best_product,
    'top_products',coalesce(v_preview->'top_products','[]'::jsonb),
    'canonical_profiles',coalesce(v_preview->'canonical_profiles','[]'::jsonb),
    'unknown_profiles',coalesce(v_preview->'unknown_profiles','[]'::jsonb),
    'profile_status',p.editorial_profile_status,
    'profile_confidence',p.editorial_profile_confidence,
    'confidence_factor',v_preview->'confidence_factor',
    'pre_cap_score',v_prelim,
    'opportunities_recalibrated',true,
    'confessional_global_cap',false
  );

  update public.publishers
  set score=v_score,
      data_quality_score=v_quality,
      commercial_potential_score=v_potential,
      radar_fit_score=v_fit,
      fit_pnld_literario=coalesce((v_product_fits->>'pnld_literario')::int,0),
      fit_pnld_didatico=coalesce((v_product_fits->>'pnld_didatico')::int,0),
      fit_pnld_tecnico_metodologico=coalesce((v_product_fits->>'pnld_tecnico_metodologico')::int,0),
      fit_radar_licitacoes=coalesce((v_product_fits->>'radar_licitacoes')::int,0),
      fit_radar_oportunidades=coalesce((v_product_fits->>'radar_oportunidades')::int,0),
      best_product=v_best_product,
      score_version='radar_v3',
      score_reason=v_reasons,
      score_breakdown=v_breakdown,
      score_updated_at=now()
  where id=p.id;

  return v_score;
end;
$$;

revoke all on function private.recalculate_publisher_score_v3(uuid) from public;

create or replace function public.recalculate_publisher_score(p_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_version text;
begin
  select active_version into v_version
  from private.radar_score_config
  where singleton=true;

  if coalesce(v_version,'radar_v2')='radar_v3' then
    return private.recalculate_publisher_score_v3(p_id);
  end if;

  return private.recalculate_publisher_score_v2(p_id);
end;
$$;

create or replace function public.enforce_radar_confessional_cap()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_version text;
  v_confessional integer:=0;
  v_secular integer:=0;
  v_cap integer:=100;
  v_label text:=null;
  v_before integer:=coalesce(new.score,0);
begin
  select active_version into v_version
  from private.radar_score_config
  where singleton=true;

  if coalesce(v_version,'radar_v2')<>'radar_v2' then
    return new;
  end if;

  select
    count(*) filter(where x.profile=any(array['Religioso/Cristão','Teologia','Discipulado']::text[]))::int,
    count(*) filter(where x.profile=any(array[
      'Generalista','Acadêmico/Científico','Arte/Design','Bilíngue/Idiomas','Ciências exatas','Ciências sociais',
      'Cultura afro-brasileira','Cultura indígena','Didático','Direito','Direitos humanos','Ecologia/Meio ambiente',
      'Educação','Educação financeira','Educação infantil','Educação musical','Engenharia','Filosofia','Formação de professores',
      'História/Humanidades','Linguística','Medicina','Negócios/Administração','Não ficção','Obras de referência',
      'Paradidático','Política/Sociedade','Psicologia','Psicopedagogia','Saúde','Serviço Social','Técnico-profissional','Tecnologia'
    ]::text[]))::int
  into v_confessional,v_secular
  from unnest(coalesce(new.editorial_profile,'{}'::text[])) x(profile);

  if v_confessional>=2 then
    v_cap:=15;
    v_label:='Teto: perfil predominantemente confessional/religioso';
  elsif v_confessional=1 and v_secular=0 then
    v_cap:=35;
    v_label:='Teto: sinal confessional sem evidência de catálogo secular';
  elsif v_confessional=1 and v_secular=1 then
    v_cap:=50;
    v_label:='Teto: sinal confessional com evidência secular limitada';
  elsif v_confessional=1 and v_secular=2 then
    v_cap:=65;
    v_label:='Teto: sinal confessional com catálogo secular ainda limitado';
  end if;

  if v_before>v_cap then
    new.score:=v_cap;
    new.score_reason:=coalesce(new.score_reason,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'code','confessional_guard','label',v_label,'points',v_cap-v_before
    ));
  end if;

  new.score_breakdown:=coalesce(new.score_breakdown,'{}'::jsonb)||jsonb_build_object(
    'confessional_signal_count',v_confessional,
    'secular_evidence_count',v_secular,
    'confessional_guard_cap',case when v_cap<100 then v_cap else null end
  );
  return new;
end;
$$;

create or replace function public.crm_publisher_guidance(p_organization_id uuid,p_publisher_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,private,pg_temp
as $$
declare
  p public.publishers%rowtype;
  task_due timestamptz;
  task_title text;
  has_dm boolean;
  latest_result text;
  action_code text;
  action_label text;
  reason text;
  v_profile_fit_signals jsonb:='[]'::jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  select * into p
  from public.publishers
  where id=p_publisher_id and organization_id=p_organization_id and not archived;

  if not found then return null; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile',ep.profile,
        'canonical_profile',coalesce(w0.profile,a.canonical_profile,ep.profile),
        'pnld_literario',coalesce(w.pnld_literario,0),
        'pnld_didatico',coalesce(w.pnld_didatico,0),
        'pnld_tecnico_metodologico',coalesce(w.pnld_tecnico_metodologico,0),
        'radar_licitacoes',coalesce(w.radar_licitacoes,0),
        'radar_oportunidades',greatest(0,coalesce(w.radar_oportunidades,0)-15),
        'religious_core',coalesce(w.religious_core,false)
      ) order by ep.ord
    ),
    '[]'::jsonb
  ) into v_profile_fit_signals
  from unnest(coalesce(p.editorial_profile,array[]::text[])) with ordinality ep(profile,ord)
  left join private.radar_profile_weights w0 on w0.profile=ep.profile
  left join private.radar_profile_aliases_v3 a on a.alias=ep.profile
  left join private.radar_profile_weights w on w.profile=coalesce(w0.profile,a.canonical_profile);

  select t.due_at,t.title into task_due,task_title
  from public.tasks t
  where t.organization_id=p_organization_id
    and t.publisher_id=p.id
    and t.assigned_to=auth.uid()
    and t.status in ('open','in_progress')
  order by t.due_at nulls last limit 1;

  select exists(
    select 1 from public.contacts c
    where c.publisher_id=p.id and c.active and c.is_decision_maker
  ) into has_dm;

  select i.result into latest_result
  from public.interactions i
  where i.publisher_id=p.id
  order by i.occurred_at desc limit 1;

  if task_due is not null and task_due<now() then
    action_code:='overdue_task'; action_label:='Concluir tarefa atrasada'; reason:=coalesce(task_title,'Há uma tarefa vencida nesta conta.');
  elsif p.next_action_at is not null and p.next_action_at<=now() then
    action_code:='due_followup'; action_label:='Executar próximo passo'; reason:='A próxima ação registrada já venceu ou é para agora.';
  elsif p.owner_user_id is null then
    action_code:='claim'; action_label:='Assumir esta editora';
    reason:=case
      when coalesce(p.radar_fit_score,0)>=70 then 'Alta aderência aos serviços da Radar e ainda sem responsável.'
      when coalesce(p.radar_fit_score,0)<20 then 'Conta sem responsável, mas com baixa aderência editorial; priorize outras antes.'
      else 'A conta ainda não tem responsável.'
    end;
  elsif p.last_contact_at is null then
    action_code:='first_contact'; action_label:='Fazer primeiro contato';
    reason:=case
      when coalesce(p.best_product,'')<>'' then 'Melhor aderência identificada: '||replace(p.best_product,'_',' ')||'.'
      else 'Ainda não há contato comercial registrado.'
    end;
  elsif latest_result in ('busy','callback_scheduled','follow_up','asked_email') then
    action_code:='follow_up'; action_label:='Fazer follow-up'; reason:='O último resultado indica que a conversa precisa continuar.';
  elsif not has_dm then
    action_code:='find_decision_maker'; action_label:='Pesquisar decisor'; reason:='Ainda não há decisor identificado na editora.';
  elsif p.last_contact_at<now()-interval '14 days' then
    action_code:='reengage'; action_label:='Retomar contato'; reason:='A conta está há mais de 14 dias sem interação.';
  else
    action_code:='review'; action_label:='Revisar conta'; reason:='Acompanhe histórico, etapa e próximo passo.';
  end if;

  return jsonb_build_object(
    'publisher_id',p.id,
    'score',p.score,
    'score_version',p.score_version,
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
$$;

update private.radar_score_config
set active_version='radar_v3',changed_at=now()
where singleton=true;
