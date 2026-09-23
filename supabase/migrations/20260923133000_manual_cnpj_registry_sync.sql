-- Sincronização manual anual dos dados cadastrais do CNPJ.
-- A execução só é criada por owner/admin; o worker externo usa service_role.

create or replace function private.crm_normalize_cnpj(p_value text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select upper(regexp_replace(coalesce(p_value,''),'[^0-9A-Z]','','g'))
$$;

alter table public.publishers
  add column if not exists simples_nacional text,
  add column if not exists mei text,
  add column if not exists cnpj_status_date date,
  add column if not exists cnpj_status_reason text,
  add column if not exists cnpj_start_date date,
  add column if not exists cnpj_special_status text,
  add column if not exists cnpj_special_status_date date;

create table if not exists public.cnpj_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','cancelled')),
  stage text not null default 'Na fila',
  progress integer not null default 0 check (progress between 0 and 100),
  source_period text,
  source_url text,
  total_publishers integer not null default 0,
  matched_publishers integer not null default 0,
  updated_publishers integer not null default 0,
  unchanged_publishers integer not null default 0,
  not_found_publishers integer not null default 0,
  error_publishers integer not null default 0,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  message text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists cnpj_sync_one_active_run_per_org
  on public.cnpj_sync_runs(organization_id)
  where status in ('pending','running');

create index if not exists cnpj_sync_runs_org_requested_idx
  on public.cnpj_sync_runs(organization_id, requested_at desc);

create table if not exists public.cnpj_sync_targets (
  run_id uuid not null references public.cnpj_sync_runs(id) on delete cascade,
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cnpj text not null,
  primary key (run_id, publisher_id)
);

create index if not exists cnpj_sync_targets_run_cnpj_idx
  on public.cnpj_sync_targets(run_id, cnpj);

create table if not exists public.cnpj_sync_changes (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.cnpj_sync_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  cnpj text not null,
  changed_fields text[] not null default '{}'::text[],
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, publisher_id)
);

create index if not exists cnpj_sync_changes_run_idx
  on public.cnpj_sync_changes(run_id, created_at);

create table if not exists public.publisher_cnpj_verifications (
  publisher_id uuid primary key references public.publishers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  last_run_id uuid references public.cnpj_sync_runs(id) on delete set null,
  normalized_cnpj text,
  status text not null check (status in ('matched','not_found','error')),
  source_period text,
  last_verified_at timestamptz not null default now(),
  error_message text
);

create index if not exists publisher_cnpj_verifications_org_idx
  on public.publisher_cnpj_verifications(organization_id, last_verified_at desc);

alter table public.cnpj_sync_runs enable row level security;
alter table public.cnpj_sync_targets enable row level security;
alter table public.cnpj_sync_changes enable row level security;
alter table public.publisher_cnpj_verifications enable row level security;

drop policy if exists cnpj_sync_runs_admin_read on public.cnpj_sync_runs;
create policy cnpj_sync_runs_admin_read
on public.cnpj_sync_runs
for select
to authenticated
using (private.org_role(organization_id) in ('owner','admin'));

drop policy if exists cnpj_sync_changes_admin_read on public.cnpj_sync_changes;
create policy cnpj_sync_changes_admin_read
on public.cnpj_sync_changes
for select
to authenticated
using (private.org_role(organization_id) in ('owner','admin'));

drop policy if exists publisher_cnpj_verifications_admin_read on public.publisher_cnpj_verifications;
create policy publisher_cnpj_verifications_admin_read
on public.publisher_cnpj_verifications
for select
to authenticated
using (private.org_role(organization_id) in ('owner','admin'));

-- Permite que apenas a rotina interna de sincronização altere os campos-mestre sem sessão de usuário.
create or replace function public.protect_publisher_master_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r text;
  authorized_handoff boolean:=coalesce(current_setting('app.crm_authorized_handoff',true),'')='1';
  authorized_cnpj_sync boolean:=coalesce(current_setting('app.crm_cnpj_sync',true),'')='1';
begin
  r := private.org_role(old.organization_id);

  if not authorized_cnpj_sync and r not in ('owner','admin') then
    if new.name is distinct from old.name
      or new.legal_name is distinct from old.legal_name
      or new.trade_name is distinct from old.trade_name
      or new.cnpj is distinct from old.cnpj
      or new.country is distinct from old.country
      or new.city is distinct from old.city
      or new.state is distinct from old.state
      or new.postal_code is distinct from old.postal_code
      or new.address_street is distinct from old.address_street
      or new.address_number is distinct from old.address_number
      or new.address_complement is distinct from old.address_complement
      or new.neighborhood is distinct from old.neighborhood
      or new.cnae_primary is distinct from old.cnae_primary
      or new.cnae_description is distinct from old.cnae_description
      or new.legal_nature is distinct from old.legal_nature
      or new.registration_status is distinct from old.registration_status
      or new.company_size is distinct from old.company_size
      or new.estimated_revenue is distinct from old.estimated_revenue
      or new.employee_range is distinct from old.employee_range
      or new.market_segments is distinct from old.market_segments
      or new.editorial_profile is distinct from old.editorial_profile
      or new.editorial_profile_status is distinct from old.editorial_profile_status
      or new.editorial_profile_confidence is distinct from old.editorial_profile_confidence
      or new.editorial_profile_sources is distinct from old.editorial_profile_sources
      or new.editorial_profile_verified_at is distinct from old.editorial_profile_verified_at
      or new.editorial_profile_notes is distinct from old.editorial_profile_notes
    then
      raise exception 'Somente administradores podem alterar dados cadastrais da editora';
    end if;
  end if;

  if not authorized_cnpj_sync and r = 'member' then
    if old.owner_user_id is null and new.owner_user_id is null then
      if (to_jsonb(new) - array['updated_at','updated_by','score','score_reason','score_updated_at','last_activity_at','last_activity_by'])
         is distinct from
         (to_jsonb(old) - array['updated_at','updated_by','score','score_reason','score_updated_at','last_activity_at','last_activity_by'])
      then
        raise exception 'Assuma a editora antes de alterar informações comerciais';
      end if;
    end if;

    if new.owner_user_id is distinct from old.owner_user_id then
      if authorized_handoff then
        null;
      elsif old.owner_user_id is null and new.owner_user_id = auth.uid() then
        null;
      elsif old.owner_user_id = auth.uid() and new.owner_user_id is null then
        null;
      else
        raise exception 'Prospectadores podem apenas assumir editoras sem responsável ou liberar editoras sob sua própria responsabilidade';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Mantém o autor administrativo no log mesmo quando a atualização é feita pelo worker.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  org uuid;
  eid text;
  actor uuid := coalesce(
    auth.uid(),
    nullif(current_setting('app.crm_actor_user_id',true),'')::uuid
  );
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
$$;

create or replace function public.crm_start_cnpj_sync(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  role_name text := private.org_role(p_organization_id);
  existing_run public.cnpj_sync_runs%rowtype;
  new_run public.cnpj_sync_runs%rowtype;
  total_count integer;
begin
  if role_name not in ('owner','admin') then
    raise exception 'Apenas administradores podem iniciar a atualização cadastral' using errcode='42501';
  end if;

  select * into existing_run
  from public.cnpj_sync_runs
  where organization_id = p_organization_id
    and status in ('pending','running')
  order by requested_at desc
  limit 1;

  if found then
    return jsonb_build_object('run',to_jsonb(existing_run),'already_running',true);
  end if;

  insert into public.cnpj_sync_runs(organization_id,requested_by,status,stage,progress)
  values (p_organization_id,auth.uid(),'pending','Na fila para processamento',0)
  returning * into new_run;

  insert into public.cnpj_sync_targets(run_id,publisher_id,organization_id,cnpj)
  select new_run.id,p.id,p.organization_id,private.crm_normalize_cnpj(p.cnpj)
  from public.publishers p
  where p.organization_id = p_organization_id
    and nullif(private.crm_normalize_cnpj(p.cnpj),'') is not null;

  select count(*) into total_count
  from public.cnpj_sync_targets
  where run_id = new_run.id;

  update public.cnpj_sync_runs
  set total_publishers=total_count
  where id=new_run.id
  returning * into new_run;

  return jsonb_build_object('run',to_jsonb(new_run),'already_running',false);
end;
$$;

create or replace function public.crm_worker_apply_cnpj_sync_batch(p_run_id uuid, p_rows jsonb, p_source_period text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  run_row public.cnpj_sync_runs%rowtype;
  item jsonb;
  pub public.publishers%rowtype;
  target_cnpj text;
  publisher_uuid uuid;
  fields text[];
  beforej jsonb;
  afterj jsonb;
  processed_count integer:=0;
  updated_count integer:=0;
  error_count integer:=0;
  msg text;
begin
  select * into run_row from public.cnpj_sync_runs where id=p_run_id for update;
  if not found or run_row.status <> 'running' then
    raise exception 'Execução de sincronização não está ativa';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Lote inválido';
  end if;

  perform set_config('app.crm_cnpj_sync','1',true);
  perform set_config('app.crm_actor_user_id',run_row.requested_by::text,true);

  for item in select value from jsonb_array_elements(p_rows) loop
    begin
      publisher_uuid := (item->>'publisher_id')::uuid;

      select t.cnpj into target_cnpj
      from public.cnpj_sync_targets t
      where t.run_id=p_run_id and t.publisher_id=publisher_uuid;

      if target_cnpj is null then
        raise exception 'Editora não pertence ao conjunto desta execução';
      end if;

      select * into pub
      from public.publishers
      where id=publisher_uuid and organization_id=run_row.organization_id
      for update;

      if not found then
        raise exception 'Editora não encontrada';
      end if;

      if private.crm_normalize_cnpj(pub.cnpj) <> target_cnpj
         or private.crm_normalize_cnpj(item->>'cnpj') <> target_cnpj then
        raise exception 'CNPJ mudou durante a sincronização';
      end if;

      beforej := jsonb_build_object(
        'legal_name',pub.legal_name,'trade_name',pub.trade_name,'country',pub.country,'city',pub.city,'state',pub.state,
        'postal_code',pub.postal_code,'address_type',pub.address_type,'address_street',pub.address_street,
        'address_number',pub.address_number,'address_complement',pub.address_complement,'neighborhood',pub.neighborhood,
        'phone',pub.phone,'secondary_phone',pub.secondary_phone,'general_email',pub.general_email,
        'cnae_primary',pub.cnae_primary,'cnae_description',pub.cnae_description,'cnae_secondary',pub.cnae_secondary,
        'matrix_branch',pub.matrix_branch,'registration_status',pub.registration_status,'legal_nature',pub.legal_nature,
        'company_size',pub.company_size,'share_capital',pub.share_capital,'owners_names',pub.owners_names,
        'simples_nacional',pub.simples_nacional,'mei',pub.mei,'cnpj_status_date',pub.cnpj_status_date,
        'cnpj_status_reason',pub.cnpj_status_reason,'cnpj_start_date',pub.cnpj_start_date,
        'cnpj_special_status',pub.cnpj_special_status,'cnpj_special_status_date',pub.cnpj_special_status_date
      );

      afterj := jsonb_build_object(
        'legal_name',nullif(btrim(item->>'legal_name'),''),
        'trade_name',nullif(btrim(item->>'trade_name'),''),
        'country',nullif(btrim(item->>'country'),''),
        'city',nullif(btrim(item->>'city'),''),
        'state',nullif(btrim(item->>'state'),''),
        'postal_code',nullif(btrim(item->>'postal_code'),''),
        'address_type',nullif(btrim(item->>'address_type'),''),
        'address_street',nullif(btrim(item->>'address_street'),''),
        'address_number',nullif(btrim(item->>'address_number'),''),
        'address_complement',nullif(btrim(item->>'address_complement'),''),
        'neighborhood',nullif(btrim(item->>'neighborhood'),''),
        'phone',nullif(btrim(item->>'phone'),''),
        'secondary_phone',nullif(btrim(item->>'secondary_phone'),''),
        'general_email',nullif(lower(btrim(item->>'general_email')),''),
        'cnae_primary',nullif(btrim(item->>'cnae_primary'),''),
        'cnae_description',nullif(btrim(item->>'cnae_description'),''),
        'cnae_secondary',nullif(btrim(item->>'cnae_secondary'),''),
        'matrix_branch',nullif(btrim(item->>'matrix_branch'),''),
        'registration_status',nullif(btrim(item->>'registration_status'),''),
        'legal_nature',nullif(btrim(item->>'legal_nature'),''),
        'company_size',nullif(btrim(item->>'company_size'),''),
        'share_capital',nullif(btrim(item->>'share_capital'),''),
        'owners_names',nullif(btrim(item->>'owners_names'),''),
        'simples_nacional',nullif(btrim(item->>'simples_nacional'),''),
        'mei',nullif(btrim(item->>'mei'),''),
        'cnpj_status_date',case when nullif(item->>'cnpj_status_date','') is null then null else (item->>'cnpj_status_date')::date end,
        'cnpj_status_reason',nullif(btrim(item->>'cnpj_status_reason'),''),
        'cnpj_start_date',case when nullif(item->>'cnpj_start_date','') is null then null else (item->>'cnpj_start_date')::date end,
        'cnpj_special_status',nullif(btrim(item->>'cnpj_special_status'),''),
        'cnpj_special_status_date',case when nullif(item->>'cnpj_special_status_date','') is null then null else (item->>'cnpj_special_status_date')::date end
      );

      select coalesce(array_agg(keys.key order by keys.key),array[]::text[]) into fields
      from jsonb_object_keys(beforej || afterj) as keys(key)
      where beforej->keys.key is distinct from afterj->keys.key;

      if cardinality(fields)>0 then
        update public.publishers set
          legal_name=afterj->>'legal_name',
          trade_name=afterj->>'trade_name',
          country=afterj->>'country',
          city=afterj->>'city',
          state=afterj->>'state',
          postal_code=afterj->>'postal_code',
          address_type=afterj->>'address_type',
          address_street=afterj->>'address_street',
          address_number=afterj->>'address_number',
          address_complement=afterj->>'address_complement',
          neighborhood=afterj->>'neighborhood',
          phone=afterj->>'phone',
          secondary_phone=afterj->>'secondary_phone',
          general_email=afterj->>'general_email',
          cnae_primary=afterj->>'cnae_primary',
          cnae_description=afterj->>'cnae_description',
          cnae_secondary=afterj->>'cnae_secondary',
          matrix_branch=afterj->>'matrix_branch',
          registration_status=afterj->>'registration_status',
          legal_nature=afterj->>'legal_nature',
          company_size=afterj->>'company_size',
          share_capital=afterj->>'share_capital',
          owners_names=afterj->>'owners_names',
          simples_nacional=afterj->>'simples_nacional',
          mei=afterj->>'mei',
          cnpj_status_date=nullif(afterj->>'cnpj_status_date','')::date,
          cnpj_status_reason=afterj->>'cnpj_status_reason',
          cnpj_start_date=nullif(afterj->>'cnpj_start_date','')::date,
          cnpj_special_status=afterj->>'cnpj_special_status',
          cnpj_special_status_date=nullif(afterj->>'cnpj_special_status_date','')::date,
          updated_by=run_row.requested_by,
          updated_at=now()
        where id=publisher_uuid;

        insert into public.cnpj_sync_changes(
          run_id,organization_id,publisher_id,cnpj,changed_fields,before_data,after_data
        ) values (
          p_run_id,run_row.organization_id,publisher_uuid,target_cnpj,fields,beforej,afterj
        ) on conflict (run_id,publisher_id) do nothing;

        updated_count:=updated_count+1;
      end if;

      insert into public.publisher_cnpj_verifications(
        publisher_id,organization_id,last_run_id,normalized_cnpj,status,source_period,last_verified_at,error_message
      ) values (
        publisher_uuid,run_row.organization_id,p_run_id,target_cnpj,'matched',p_source_period,now(),null
      )
      on conflict (publisher_id) do update set
        organization_id=excluded.organization_id,
        last_run_id=excluded.last_run_id,
        normalized_cnpj=excluded.normalized_cnpj,
        status='matched',
        source_period=excluded.source_period,
        last_verified_at=excluded.last_verified_at,
        error_message=null;

      processed_count:=processed_count+1;

    exception when others then
      error_count:=error_count+1;
      msg:=sqlerrm;
      if publisher_uuid is not null then
        insert into public.publisher_cnpj_verifications(
          publisher_id,organization_id,last_run_id,normalized_cnpj,status,source_period,last_verified_at,error_message
        ) values (
          publisher_uuid,run_row.organization_id,p_run_id,coalesce(target_cnpj,''),'error',p_source_period,now(),msg
        )
        on conflict (publisher_id) do update set
          organization_id=excluded.organization_id,
          last_run_id=excluded.last_run_id,
          normalized_cnpj=excluded.normalized_cnpj,
          status='error',
          source_period=excluded.source_period,
          last_verified_at=excluded.last_verified_at,
          error_message=excluded.error_message;
      end if;
    end;
  end loop;

  update public.cnpj_sync_runs
  set heartbeat_at=now(),
      matched_publishers=(
        select count(*) from public.publisher_cnpj_verifications v
        where v.last_run_id=p_run_id and v.status='matched'
      ),
      updated_publishers=(
        select count(*) from public.cnpj_sync_changes c where c.run_id=p_run_id
      ),
      error_publishers=(
        select count(*) from public.publisher_cnpj_verifications v
        where v.last_run_id=p_run_id and v.status='error'
      )
  where id=p_run_id;

  return jsonb_build_object('processed',processed_count,'updated',updated_count,'errors',error_count);
end;
$$;

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
  if current_user <> 'service_role' then
    raise exception 'Função restrita ao worker de sincronização' using errcode='42501';
  end if;

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

revoke all on table public.cnpj_sync_runs from anon, authenticated;
revoke all on table public.cnpj_sync_targets from anon, authenticated;
revoke all on table public.cnpj_sync_changes from anon, authenticated;
revoke all on table public.publisher_cnpj_verifications from anon, authenticated;

grant select on public.cnpj_sync_runs to authenticated;
grant select on public.cnpj_sync_changes to authenticated;
grant select on public.publisher_cnpj_verifications to authenticated;

revoke all on function public.crm_start_cnpj_sync(uuid) from public;
grant execute on function public.crm_start_cnpj_sync(uuid) to authenticated;

revoke all on function public.crm_worker_apply_cnpj_sync_batch(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.crm_worker_apply_cnpj_sync_batch(uuid,jsonb,text) to service_role;

revoke all on function public.crm_worker_finish_cnpj_sync(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.crm_worker_finish_cnpj_sync(uuid,text,text,jsonb) to service_role;
