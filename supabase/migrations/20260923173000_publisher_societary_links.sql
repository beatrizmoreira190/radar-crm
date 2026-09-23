-- Detecta CNPJs relacionados por sócios pessoas físicas compartilhados.
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
      'shared_owner_count',0,
      'related_publishers','[]'::jsonb,
      'method','exact_normalized_owner_name'
    );
  end if;

  with current_owners as materialized (
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
  grouped as (
    select
      m.publisher_id,
      array_agg(distinct m.owner_name order by m.owner_name) as shared_owners
    from matches m
    group by m.publisher_id
  ),
  related as (
    select
      p.id as publisher_id,
      coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),p.legal_name) as display_name,
      p.legal_name,
      p.cnpj,
      p.registration_status,
      p.stage_id,
      ps.name as stage_name,
      g.shared_owners,
      cardinality(g.shared_owners) as shared_owner_count,
      (
        select count(*)::int
        from public.opportunities o
        where o.organization_id=p_organization_id
          and o.publisher_id=p.id
          and coalesce(o.stage,'') not in ('won','lost')
      ) as active_opportunities
    from grouped g
    join public.publishers p
      on p.id=g.publisher_id
     and p.organization_id=p_organization_id
     and not p.archived
    left join public.pipeline_stages ps
      on ps.id=p.stage_id
     and ps.organization_id=p_organization_id
  )
  select jsonb_build_object(
    'related_count',(select count(*) from related),
    'shared_owner_count',(
      select count(distinct m.owner_key)
      from matches m
      join related r on r.publisher_id=m.publisher_id
    ),
    'related_publishers',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'publisher_id',r.publisher_id,
          'display_name',r.display_name,
          'legal_name',r.legal_name,
          'cnpj',r.cnpj,
          'registration_status',r.registration_status,
          'stage_id',r.stage_id,
          'stage_name',r.stage_name,
          'shared_owners',to_jsonb(r.shared_owners),
          'shared_owner_count',r.shared_owner_count,
          'active_opportunities',r.active_opportunities
        )
        order by r.shared_owner_count desc,r.display_name
      )
      from related r
    ),'[]'::jsonb),
    'method','exact_normalized_owner_name',
    'notice','Vínculo societário detectado por sócio em comum na base da Receita Federal. Isso não confirma, por si só, grupo econômico ou comercial.'
  ) into result;

  return coalesce(result,jsonb_build_object(
    'related_count',0,
    'shared_owner_count',0,
    'related_publishers','[]'::jsonb,
    'method','exact_normalized_owner_name'
  ));
end;
$function$;

revoke all on function public.crm_publisher_societary_links(uuid,uuid) from public;
grant execute on function public.crm_publisher_societary_links(uuid,uuid) to authenticated;
