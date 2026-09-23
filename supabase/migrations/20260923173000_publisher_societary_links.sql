-- Detecta empresas relacionadas por sócios pessoas físicas compartilhados.
-- Filiais do mesmo CNPJ-base são consolidadas e não contam como empresas diferentes.
-- O vínculo é informativo: não presume grupo econômico ou comercial.

create or replace function public.crm_publisher_societary_links(
  p_organization_id uuid,
  p_publisher_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  result jsonb;
begin
  if auth.uid() is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.publishers p
    where p.id=p_publisher_id
      and p.organization_id=p_organization_id
      and not p.archived
  ) then
    return jsonb_build_object(
      'related_count',0,
      'related_cnpj_count',0,
      'shared_owner_count',0,
      'related_publishers','[]'::jsonb,
      'method','exact_normalized_owner_name'
    );
  end if;

  with current_publisher as materialized (
    select
      p.id,
      case
        when length(regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g'))>=8
          then left(regexp_replace(p.cnpj,'[^0-9]','','g'),8)
        else 'publisher:'||p.id::text
      end as entity_key
    from public.publishers p
    where p.id=p_publisher_id
      and p.organization_id=p_organization_id
      and not p.archived
  ),
  current_owners as materialized (
    select distinct
      lower(regexp_replace(c.full_name,'[^a-zA-ZÀ-ÿ0-9]','','g')) as owner_key,
      c.full_name as owner_name
    from public.contacts c
    where c.organization_id=p_organization_id
      and c.publisher_id=p_publisher_id
      and c.active
      and c.source_ref like 'receita:cnpj:%'
      and nullif(btrim(c.full_name),'') is not null
  ),
  matches as materialized (
    select distinct
      c.publisher_id,
      co.owner_key,
      co.owner_name
    from current_owners co
    join public.contacts c
      on c.organization_id=p_organization_id
     and c.active
     and c.source_ref like 'receita:cnpj:%'
     and c.publisher_id<>p_publisher_id
     and lower(regexp_replace(c.full_name,'[^a-zA-ZÀ-ÿ0-9]','','g'))=co.owner_key
  ),
  publisher_matches as materialized (
    select
      p.id as publisher_id,
      case
        when length(regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g'))>=8
          then left(regexp_replace(p.cnpj,'[^0-9]','','g'),8)
        else 'publisher:'||p.id::text
      end as entity_key,
      regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g') as cnpj_digits,
      coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),p.legal_name) as display_name,
      p.legal_name,
      p.cnpj,
      p.registration_status,
      ps.name as stage_name,
      m.owner_key,
      m.owner_name,
      (
        select count(*)::int
        from public.opportunities o
        where o.organization_id=p_organization_id
          and o.publisher_id=p.id
          and coalesce(o.stage,'') not in ('won','lost')
      ) as active_opportunities
    from matches m
    join public.publishers p
      on p.id=m.publisher_id
     and p.organization_id=p_organization_id
     and not p.archived
    left join public.pipeline_stages ps
      on ps.id=p.stage_id
     and ps.organization_id=p_organization_id
    cross join current_publisher cp
    where (
      case
        when length(regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g'))>=8
          then left(regexp_replace(p.cnpj,'[^0-9]','','g'),8)
        else 'publisher:'||p.id::text
      end
    )<>cp.entity_key
  ),
  entity_publishers as materialized (
    select distinct
      pm.publisher_id,
      pm.entity_key,
      pm.cnpj_digits,
      pm.display_name,
      pm.legal_name,
      pm.cnpj,
      pm.registration_status,
      pm.stage_name,
      pm.active_opportunities
    from publisher_matches pm
  ),
  entity_owners as (
    select
      pm.entity_key,
      array_agg(distinct pm.owner_name order by pm.owner_name) as shared_owners
    from publisher_matches pm
    group by pm.entity_key
  ),
  entities as (
    select
      ep.entity_key,
      (array_agg(ep.publisher_id order by (substring(ep.cnpj_digits from 9 for 4)='0001') desc,ep.display_name,ep.publisher_id))[1] as publisher_id,
      (array_agg(ep.display_name order by (substring(ep.cnpj_digits from 9 for 4)='0001') desc,ep.display_name))[1] as display_name,
      (array_agg(ep.legal_name order by (substring(ep.cnpj_digits from 9 for 4)='0001') desc,ep.display_name))[1] as legal_name,
      (array_agg(ep.cnpj order by (substring(ep.cnpj_digits from 9 for 4)='0001') desc,ep.cnpj))[1] as cnpj,
      array_agg(distinct ep.cnpj order by ep.cnpj) filter (where nullif(btrim(coalesce(ep.cnpj,'')),'') is not null) as cnpjs,
      count(distinct ep.cnpj) filter (where nullif(btrim(coalesce(ep.cnpj,'')),'') is not null)::int as cnpj_count,
      case
        when bool_or(upper(coalesce(ep.registration_status,''))='ATIVA') then 'ATIVA'
        else min(ep.registration_status)
      end as registration_status,
      array_agg(distinct ep.stage_name order by ep.stage_name) filter (where ep.stage_name is not null) as stage_names,
      sum(ep.active_opportunities)::int as active_opportunities
    from entity_publishers ep
    group by ep.entity_key
  ),
  related as (
    select
      e.publisher_id,
      e.display_name,
      e.legal_name,
      e.cnpj,
      coalesce(e.cnpjs,array[]::text[]) as cnpjs,
      greatest(e.cnpj_count,1) as cnpj_count,
      e.registration_status,
      coalesce(e.stage_names,array[]::text[]) as stage_names,
      eo.shared_owners,
      cardinality(eo.shared_owners) as shared_owner_count,
      e.active_opportunities
    from entities e
    join entity_owners eo using(entity_key)
  )
  select jsonb_build_object(
    'related_count',(select count(*) from related),
    'related_cnpj_count',(select coalesce(sum(r.cnpj_count),0) from related r),
    'shared_owner_count',(
      select count(distinct pm.owner_key)
      from publisher_matches pm
    ),
    'related_publishers',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'publisher_id',r.publisher_id,
          'display_name',r.display_name,
          'legal_name',r.legal_name,
          'cnpj',r.cnpj,
          'cnpjs',to_jsonb(r.cnpjs),
          'cnpj_count',r.cnpj_count,
          'registration_status',r.registration_status,
          'stage_names',to_jsonb(r.stage_names),
          'shared_owners',to_jsonb(r.shared_owners),
          'shared_owner_count',r.shared_owner_count,
          'active_opportunities',r.active_opportunities
        )
        order by r.shared_owner_count desc,r.display_name
      )
      from related r
    ),'[]'::jsonb),
    'method','exact_normalized_owner_name',
    'notice','Vínculo societário detectado por sócio em comum na base da Receita Federal. Filiais do mesmo CNPJ-base são consolidadas. Isso não confirma, por si só, grupo econômico ou comercial.'
  ) into result;

  return coalesce(result,jsonb_build_object(
    'related_count',0,
    'related_cnpj_count',0,
    'shared_owner_count',0,
    'related_publishers','[]'::jsonb,
    'method','exact_normalized_owner_name'
  ));
end;
$function$;

revoke all on function public.crm_publisher_societary_links(uuid,uuid) from public;
grant execute on function public.crm_publisher_societary_links(uuid,uuid) to authenticated;
