create or replace function public.crm_data_health_queue(
  p_organization_id uuid,
  p_limit integer default 80
)
returns table(
  publisher_id uuid,
  name text,
  city text,
  state text,
  score integer,
  issues text[],
  issue_count integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  if not exists (
    select 1
    from private.current_user_manager_org_ids() org_id
    where org_id = p_organization_id
  ) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  return query
  with decision_makers as materialized (
    select distinct c.publisher_id
    from public.contacts c
    where c.organization_id = p_organization_id
      and c.active
      and c.is_decision_maker
  ),
  base as (
    select
      p.id,
      p.name,
      p.city,
      p.state,
      p.score,
      p.general_email,
      p.phone,
      p.website,
      p.cnpj,
      p.owner_user_id,
      p.last_contact_at,
      (dm.publisher_id is not null) as has_decision_maker
    from public.publishers p
    left join decision_makers dm on dm.publisher_id = p.id
    where p.organization_id = p_organization_id
      and not p.archived
  ),
  scored as (
    select
      b.id,
      b.name,
      b.city,
      b.state,
      b.score,
      array_remove(array[
        case when nullif(trim(coalesce(b.general_email,'')),'') is null then 'Sem e-mail' end,
        case when nullif(trim(coalesce(b.phone,'')),'') is null then 'Sem telefone' end,
        case when nullif(trim(coalesce(b.website,'')),'') is null then 'Sem site' end,
        case when nullif(trim(coalesce(b.cnpj,'')),'') is null then 'Sem CNPJ' end,
        case when b.owner_user_id is null then 'Sem responsável' end,
        case when b.last_contact_at is null then 'Nunca contatada' end,
        case when not b.has_decision_maker then 'Sem decisor' end
      ],null)::text[] as issue_arr
    from base b
  )
  select
    s.id,
    s.name,
    s.city,
    s.state,
    s.score,
    s.issue_arr,
    cardinality(s.issue_arr)::int
  from scored s
  order by cardinality(s.issue_arr) desc, s.score desc nulls last, s.name
  limit greatest(1,least(coalesce(p_limit,80),200));
end;
$function$;

create or replace function public.crm_data_health_summary(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from private.current_user_manager_org_ids() org_id
    where org_id = p_organization_id
  ) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  with decision_makers as materialized (
    select distinct c.publisher_id
    from public.contacts c
    where c.organization_id = p_organization_id
      and c.active
      and c.is_decision_maker
  ),
  base as materialized (
    select
      p.general_email,
      p.phone,
      p.website,
      p.cnpj,
      p.owner_user_id,
      p.last_contact_at,
      (dm.publisher_id is not null) as has_decision_maker,
      nullif(regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g'),'') as cnpj_key,
      nullif(lower(regexp_replace(coalesce(p.name,''),'[^[:alnum:]]','','g')),'') as name_key
    from public.publishers p
    left join decision_makers dm on dm.publisher_id = p.id
    where p.organization_id = p_organization_id
      and not p.archived
  ),
  stats as (
    select
      count(*) as total,
      count(*) filter(where nullif(trim(coalesce(general_email,'')),'') is null) as missing_email,
      count(*) filter(where nullif(trim(coalesce(phone,'')),'') is null) as missing_phone,
      count(*) filter(where nullif(trim(coalesce(website,'')),'') is null) as missing_website,
      count(*) filter(where nullif(trim(coalesce(cnpj,'')),'') is null) as missing_cnpj,
      count(*) filter(where owner_user_id is null) as unassigned,
      count(*) filter(where last_contact_at is null) as never_contacted,
      count(*) filter(where last_contact_at is not null and last_contact_at < now()-interval '90 days') as stale_90_days,
      count(*) filter(where not has_decision_maker) as no_decision_maker
    from base
  ),
  duplicate_groups as (
    select cnpj_key as value
    from base
    where cnpj_key is not null
    group by cnpj_key
    having count(*) > 1
    union all
    select name_key
    from base
    where name_key is not null
    group by name_key
    having count(*) > 1
  )
  select jsonb_build_object(
    'total', s.total,
    'missing_email', s.missing_email,
    'missing_phone', s.missing_phone,
    'missing_website', s.missing_website,
    'missing_cnpj', s.missing_cnpj,
    'unassigned', s.unassigned,
    'never_contacted', s.never_contacted,
    'stale_90_days', s.stale_90_days,
    'no_decision_maker', s.no_decision_maker,
    'duplicate_groups', (select count(*) from duplicate_groups)
  )
  into result
  from stats s;

  return result;
end;
$function$;

create or replace function public.crm_duplicate_groups(
  p_organization_id uuid,
  p_limit integer default 50
)
returns table(
  match_type text,
  match_value text,
  total integer,
  publishers jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  if not exists (
    select 1
    from private.current_user_manager_org_ids() org_id
    where org_id = p_organization_id
  ) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  return query
  with base as materialized (
    select
      p.id,
      p.name,
      p.city,
      p.state,
      p.cnpj,
      nullif(regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g'),'') as cnpj_key,
      nullif(lower(regexp_replace(coalesce(p.name,''),'[^[:alnum:]]','','g')),'') as name_key
    from public.publishers p
    where p.organization_id = p_organization_id
      and not p.archived
  ),
  members as (
    select
      'CNPJ'::text as mt,
      b.cnpj_key as mv,
      b.id,b.name,b.city,b.state,b.cnpj
    from base b
    where b.cnpj_key is not null
    union all
    select
      'Nome'::text,
      b.name_key,
      b.id,b.name,b.city,b.state,b.cnpj
    from base b
    where b.name_key is not null
  )
  select
    m.mt,
    m.mv,
    count(*)::int,
    jsonb_agg(
      jsonb_build_object(
        'id',m.id,
        'name',m.name,
        'city',m.city,
        'state',m.state,
        'cnpj',m.cnpj
      )
      order by m.name
    )
  from members m
  group by m.mt,m.mv
  having count(*) > 1
  order by count(*) desc,m.mt,m.mv
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$function$;
