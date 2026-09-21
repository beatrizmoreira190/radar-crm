create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  org uuid;
  eid text;
  actor uuid := auth.uid();
  lbl text;
  beforej jsonb;
  afterj jsonb;
  oldj jsonb;
  newj jsonb;
  changed_keys text[];
  ignored_publisher_keys text[] := array[
    'score','score_reason','score_updated_at','score_version','score_breakdown',
    'commercial_potential_score','data_quality_score',
    'fit_radar_oportunidades','fit_radar_licitacoes','fit_pnld_literario','fit_pnld_didatico','fit_pnld_tecnico_metodologico',
    'radar_fit_score','best_product',
    'updated_at','updated_by',
    'last_activity_at','last_activity_by','last_contact_at','last_contact_by',
    'market_segments','editorial_profile','editorial_profile_status',
    'editorial_profile_confidence','editorial_profile_sources','editorial_profile_verified_at','editorial_profile_notes'
  ];
begin
  if tg_op = 'UPDATE' then
    oldj := to_jsonb(old);
    newj := to_jsonb(new);

    if tg_table_name = 'publishers' and (oldj - ignored_publisher_keys) = (newj - ignored_publisher_keys) then
      return new;
    end if;

    select coalesce(array_agg(k.key order by k.key), array[]::text[])
      into changed_keys
    from jsonb_object_keys(oldj || newj) as k(key)
    where oldj -> k.key is distinct from newj -> k.key
      and (tg_table_name <> 'publishers' or not (k.key = any(ignored_publisher_keys)));

    if cardinality(changed_keys) = 0 then
      return new;
    end if;

    select coalesce(jsonb_object_agg(k, coalesce(oldj -> k, 'null'::jsonb)), '{}'::jsonb)
      into beforej
    from unnest(changed_keys) as k;

    select coalesce(jsonb_object_agg(k, coalesce(newj -> k, 'null'::jsonb)), '{}'::jsonb)
      into afterj
    from unnest(changed_keys) as k;

    org := new.organization_id;
    eid := new.id::text;
  elsif tg_op = 'DELETE' then
    org := old.organization_id;
    eid := old.id::text;
    beforej := to_jsonb(old);
    afterj := null;
  else
    org := new.organization_id;
    eid := new.id::text;
    beforej := null;
    afterj := to_jsonb(new);
  end if;

  if tg_table_name = 'publishers' then
    lbl := case tg_op when 'INSERT' then 'Cadastrou editora' when 'UPDATE' then 'Atualizou editora' else 'Excluiu editora' end;
  elsif tg_table_name = 'contacts' then
    lbl := case tg_op when 'INSERT' then 'Adicionou pessoa de contato' when 'UPDATE' then 'Atualizou pessoa de contato' else 'Excluiu pessoa de contato' end;
  elsif tg_table_name = 'interactions' then
    lbl := case tg_op when 'INSERT' then 'Registrou interação' when 'UPDATE' then 'Corrigiu interação' else 'Excluiu interação' end;
  elsif tg_table_name = 'tasks' then
    lbl := case tg_op when 'INSERT' then 'Criou tarefa' when 'UPDATE' then 'Atualizou tarefa' else 'Excluiu tarefa' end;
  elsif tg_table_name = 'opportunities' then
    lbl := case tg_op when 'INSERT' then 'Criou oportunidade' when 'UPDATE' then 'Atualizou oportunidade' else 'Excluiu oportunidade' end;
  else
    lbl := tg_op || ' ' || tg_table_name;
  end if;

  insert into public.audit_events(organization_id, actor_user_id, entity_type, entity_id, action, label, before_data, after_data)
  values (org, actor, tg_table_name, eid, lower(tg_op), lbl, beforej, afterj);

  return coalesce(new, old);
end;
$function$;
