-- Mantém a tela de Atividade focada em ações humanas e reduz crescimento do banco.
-- Processos automáticos continuam rastreáveis em suas tabelas de execução (ex.: cnpj_sync_runs),
-- mas não geram milhares de eventos individuais atribuídos falsamente a uma pessoa.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  org uuid;
  eid text;
  actor uuid:=auth.uid();
  audit_suppressed boolean:=coalesce(current_setting('app.crm_audit_suppress',true),'')='1';
  lbl text;
  beforej jsonb;
  afterj jsonb;
  oldj jsonb;
  newj jsonb;
  changed_keys text[];
  entity_name text;
  publisher_name text;
  publisher_uuid uuid;
  ignored_publisher_keys text[]:=array[
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
  -- Atividade = ação humana autenticada diretamente no CRM.
  -- Jobs, service_role, sincronizações e scripts internos não entram no feed.
  if audit_suppressed or actor is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op='UPDATE' then
    oldj:=to_jsonb(old);
    newj:=to_jsonb(new);

    if tg_table_name='publishers' and (oldj-ignored_publisher_keys)=(newj-ignored_publisher_keys) then
      return new;
    end if;

    select coalesce(array_agg(k.key order by k.key),array[]::text[])
      into changed_keys
    from jsonb_object_keys(oldj||newj) as k(key)
    where oldj->k.key is distinct from newj->k.key
      and (tg_table_name<>'publishers' or not(k.key=any(ignored_publisher_keys)));

    if cardinality(changed_keys)=0 then return new; end if;

    select coalesce(jsonb_object_agg(k,coalesce(oldj->k,'null'::jsonb)),'{}'::jsonb)
      into beforej
    from unnest(changed_keys) as k;

    select coalesce(jsonb_object_agg(k,coalesce(newj->k,'null'::jsonb)),'{}'::jsonb)
      into afterj
    from unnest(changed_keys) as k;

    org:=new.organization_id;
    eid:=new.id::text;
  elsif tg_op='DELETE' then
    org:=old.organization_id;
    eid:=old.id::text;
    beforej:=to_jsonb(old);
    afterj:=null;
  else
    org:=new.organization_id;
    eid:=new.id::text;
    beforej:=null;
    afterj:=to_jsonb(new);
  end if;

  if tg_table_name='publishers' then
    entity_name:=coalesce(
      case when tg_op<>'DELETE' then nullif(btrim(new.commercial_name),'') end,
      case when tg_op<>'DELETE' then nullif(btrim(new.trade_name),'') end,
      case when tg_op<>'DELETE' then nullif(btrim(new.name),'') end,
      case when tg_op<>'DELETE' then nullif(btrim(new.legal_name),'') end,
      case when tg_op<>'INSERT' then nullif(btrim(old.commercial_name),'') end,
      case when tg_op<>'INSERT' then nullif(btrim(old.trade_name),'') end,
      case when tg_op<>'INSERT' then nullif(btrim(old.name),'') end,
      case when tg_op<>'INSERT' then nullif(btrim(old.legal_name),'') end
    );
    lbl:=case tg_op when 'INSERT' then 'Cadastrou editora' when 'UPDATE' then 'Atualizou editora' else 'Excluiu editora' end;
  elsif tg_table_name='contacts' then
    entity_name:=coalesce(
      case when tg_op<>'DELETE' then nullif(btrim(new.full_name),'') end,
      case when tg_op<>'INSERT' then nullif(btrim(old.full_name),'') end
    );
    publisher_uuid:=case when tg_op='DELETE' then old.publisher_id else new.publisher_id end;
    select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),''))
      into publisher_name from public.publishers p where p.id=publisher_uuid;
    lbl:=case tg_op when 'INSERT' then 'Adicionou pessoa de contato' when 'UPDATE' then 'Atualizou pessoa de contato' else 'Excluiu pessoa de contato' end;
  elsif tg_table_name='interactions' then
    publisher_uuid:=case when tg_op='DELETE' then old.publisher_id else new.publisher_id end;
    select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),''))
      into publisher_name from public.publishers p where p.id=publisher_uuid;
    entity_name:=publisher_name;
    lbl:=case tg_op when 'INSERT' then 'Registrou interação' when 'UPDATE' then 'Corrigiu interação' else 'Excluiu interação' end;
  elsif tg_table_name='tasks' then
    entity_name:=coalesce(
      case when tg_op<>'DELETE' then nullif(btrim(new.title),'') end,
      case when tg_op<>'INSERT' then nullif(btrim(old.title),'') end
    );
    publisher_uuid:=case when tg_op='DELETE' then old.publisher_id else new.publisher_id end;
    select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),''))
      into publisher_name from public.publishers p where p.id=publisher_uuid;
    lbl:=case tg_op when 'INSERT' then 'Criou tarefa' when 'UPDATE' then 'Atualizou tarefa' else 'Excluiu tarefa' end;
  elsif tg_table_name='opportunities' then
    entity_name:=coalesce(
      case when tg_op<>'DELETE' then nullif(btrim(new.title),'') end,
      case when tg_op<>'INSERT' then nullif(btrim(old.title),'') end
    );
    publisher_uuid:=case when tg_op='DELETE' then old.publisher_id else new.publisher_id end;
    select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),''))
      into publisher_name from public.publishers p where p.id=publisher_uuid;
    lbl:=case tg_op when 'INSERT' then 'Criou oportunidade' when 'UPDATE' then 'Atualizou oportunidade' else 'Excluiu oportunidade' end;
  else
    lbl:=case tg_op when 'INSERT' then 'Criou' when 'UPDATE' then 'Atualizou' else 'Excluiu' end||' '||replace(tg_table_name,'_',' ');
  end if;

  if nullif(btrim(entity_name),'') is not null then
    lbl:=lbl||' · '||entity_name;
  end if;
  if tg_table_name in ('contacts','tasks','opportunities') and nullif(btrim(publisher_name),'') is not null
     and publisher_name is distinct from entity_name then
    lbl:=lbl||' · '||publisher_name;
  end if;

  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,action,label,before_data,after_data)
  values(org,actor,tg_table_name,eid,lower(tg_op),lbl,beforej,afterj);

  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;

-- Remove do histórico o ruído já gerado por jobs/sincronizações.
delete from public.audit_events
where actor_user_id is null;

delete from public.audit_events a
using public.cnpj_sync_runs r
where a.organization_id=r.organization_id
  and a.actor_user_id=r.requested_by
  and a.entity_type='publishers'
  and a.action='update'
  and r.started_at is not null
  and a.created_at between r.started_at and coalesce(r.finished_at,now());

-- Arquivamento em massa de CNPJ BAIXADO feito pela migração cadastral não é ação humana.
delete from public.audit_events a
using public.publishers p
where a.entity_type='publishers'
  and a.entity_id=p.id::text
  and a.action='update'
  and upper(btrim(coalesce(p.registration_status,'')))='BAIXADA'
  and a.after_data='{"archived": true}'::jsonb;

-- Torna os eventos humanos restantes explícitos sobre qual editora/registro foi alterado.
update public.audit_events a
set label=(
  case a.action when 'insert' then 'Cadastrou editora' when 'update' then 'Atualizou editora' when 'delete' then 'Excluiu editora' else a.label end
  ||coalesce(' · '||(
    select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),''))
    from public.publishers p where p.id::text=a.entity_id
  ),'')
)
where a.entity_type='publishers';

update public.audit_events a
set label=(
  case a.action when 'insert' then 'Adicionou pessoa de contato' when 'update' then 'Atualizou pessoa de contato' when 'delete' then 'Excluiu pessoa de contato' else a.label end
  ||coalesce(' · '||(select c.full_name from public.contacts c where c.id::text=a.entity_id),'')
  ||coalesce(' · '||(select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),'')) from public.contacts c join public.publishers p on p.id=c.publisher_id where c.id::text=a.entity_id),'')
)
where a.entity_type='contacts';

update public.audit_events a
set label=(
  case a.action when 'insert' then 'Criou tarefa' when 'update' then 'Atualizou tarefa' when 'delete' then 'Excluiu tarefa' else a.label end
  ||coalesce(' · '||(select t.title from public.tasks t where t.id::text=a.entity_id),'')
  ||coalesce(' · '||(select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),'')) from public.tasks t join public.publishers p on p.id=t.publisher_id where t.id::text=a.entity_id),'')
)
where a.entity_type='tasks';

update public.audit_events a
set label=(
  case a.action when 'insert' then 'Criou oportunidade' when 'update' then 'Atualizou oportunidade' when 'delete' then 'Excluiu oportunidade' else a.label end
  ||coalesce(' · '||(select o.title from public.opportunities o where o.id::text=a.entity_id),'')
  ||coalesce(' · '||(select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),'')) from public.opportunities o join public.publishers p on p.id=o.publisher_id where o.id::text=a.entity_id),'')
)
where a.entity_type='opportunities';

update public.audit_events a
set label=(
  case a.action when 'insert' then 'Registrou interação' when 'update' then 'Corrigiu interação' when 'delete' then 'Excluiu interação' else a.label end
  ||coalesce(' · '||(select coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),'')) from public.interactions i join public.publishers p on p.id=i.publisher_id where i.id::text=a.entity_id),'')
)
where a.entity_type='interactions';

-- O histórico anual da Receita já tem um resumo em cnpj_sync_runs.
-- Mantemos o detalhe, mas compactamos o JSON para apenas os campos realmente alterados.
create or replace function private.crm_compact_cnpj_sync_change()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  select coalesce(jsonb_object_agg(k,new.before_data->k),'{}'::jsonb)
    into new.before_data from unnest(coalesce(new.changed_fields,array[]::text[])) as k;
  select coalesce(jsonb_object_agg(k,new.after_data->k),'{}'::jsonb)
    into new.after_data from unnest(coalesce(new.changed_fields,array[]::text[])) as k;
  return new;
end;
$function$;

drop trigger if exists trg_compact_cnpj_sync_change on public.cnpj_sync_changes;
create trigger trg_compact_cnpj_sync_change
before insert or update of changed_fields,before_data,after_data
on public.cnpj_sync_changes
for each row execute function private.crm_compact_cnpj_sync_change();

update public.cnpj_sync_changes c
set before_data=(
      select coalesce(jsonb_object_agg(k,c.before_data->k),'{}'::jsonb)
      from unnest(coalesce(c.changed_fields,array[]::text[])) as k
    ),
    after_data=(
      select coalesce(jsonb_object_agg(k,c.after_data->k),'{}'::jsonb)
      from unnest(coalesce(c.changed_fields,array[]::text[])) as k
    );

-- Targets são fila transitória; depois que a execução termina o resumo em cnpj_sync_runs basta.
create or replace function private.crm_cleanup_cnpj_sync_terminal()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if new.status in ('completed','failed','cancelled')
     and old.status is distinct from new.status then
    delete from public.cnpj_sync_targets where run_id=new.id;

    -- Mantém detalhe somente da execução concluída mais recente por organização.
    if new.status='completed' then
      delete from public.cnpj_sync_changes c
      using public.cnpj_sync_runs r
      where c.run_id=r.id
        and r.organization_id=new.organization_id
        and r.status='completed'
        and r.id<>new.id
        and coalesce(r.finished_at,r.requested_at)<=coalesce(new.finished_at,now());
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_cleanup_cnpj_sync_terminal on public.cnpj_sync_runs;
create trigger trg_cleanup_cnpj_sync_terminal
after update of status on public.cnpj_sync_runs
for each row execute function private.crm_cleanup_cnpj_sync_terminal();

delete from public.cnpj_sync_targets t
using public.cnpj_sync_runs r
where t.run_id=r.id
  and r.status in ('completed','failed','cancelled');
