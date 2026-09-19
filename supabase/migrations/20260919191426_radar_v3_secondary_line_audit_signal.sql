-- Adds a review-only signal when a strong Radar v3 recommendation is driven
-- by a catalog line that appears after the three primary editorial profiles.
-- The signal never changes radar_v2 or the experimental v3 score itself.

create or replace function private.radar_v3_primary_support(p_id uuid,p_product text)
returns jsonb
language sql
stable
security definer
set search_path=public,private,pg_temp
as $$
  with p as (
    select editorial_profile from public.publishers where id=p_id
  ),
  normalized as (
    select ep.ord::int ord,
           coalesce(w0.profile,a.canonical_profile) canonical_profile
    from p
    cross join lateral unnest(coalesce(p.editorial_profile,array[]::text[])) with ordinality ep(profile,ord)
    left join private.radar_profile_weights w0 on w0.profile=ep.profile
    left join private.radar_profile_aliases_v3 a on a.alias=ep.profile
  ),
  values_by_profile as (
    select n.ord,
      case p_product
        when 'pnld_literario' then w.pnld_literario
        when 'pnld_didatico' then w.pnld_didatico
        when 'pnld_tecnico_metodologico' then w.pnld_tecnico_metodologico
        when 'radar_licitacoes' then w.radar_licitacoes
        when 'radar_oportunidades' then greatest(0,w.radar_oportunidades-15)
        else 0
      end value
    from normalized n
    join private.radar_profile_weights w on w.profile=n.canonical_profile
  )
  select jsonb_build_object(
    'primary_raw_max',coalesce(max(value) filter(where ord<=3),0),
    'all_raw_max',coalesce(max(value),0)
  )
  from values_by_profile;
$$;

revoke all on function private.radar_v3_primary_support(uuid,text) from public;

alter table public.radar_v3_simulations
  add column if not exists audit_meta jsonb not null default '{}'::jsonb;

create or replace function private.refresh_radar_v3_simulations(p_org uuid)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_count integer;
begin
  delete from public.radar_v3_simulations where organization_id=p_org;

  insert into public.radar_v3_simulations(
    publisher_id,organization_id,publisher_name,editorial_profile_status,editorial_profile_confidence,editorial_profile,
    v2_score,v2_fit,v2_best_product,v3_score,v3_fit,v3_best_product,delta,
    top_products,product_fits,canonical_profiles,unknown_profiles,audit_flags,audit_meta,calculated_at
  )
  select
    p.id,p.organization_id,p.name,p.editorial_profile_status,p.editorial_profile_confidence,p.editorial_profile,
    p.score,p.radar_fit_score,p.best_product,
    (v.preview->>'score')::int,
    (v.preview->'components'->>'editorial_fit')::int,
    v.preview->>'recommended_product',
    (v.preview->>'score')::int-coalesce(p.score,0),
    coalesce(v.preview->'top_products','[]'::jsonb),
    coalesce(v.preview->'product_fits','{}'::jsonb),
    coalesce(v.preview->'canonical_profiles','[]'::jsonb),
    coalesce(v.preview->'unknown_profiles','[]'::jsonb),
    to_jsonb(array_remove(array[
      case when (v.preview->>'score')::int-coalesce(p.score,0)>=25 then 'large_up' end,
      case when (v.preview->>'score')::int-coalesce(p.score,0)<=-15 then 'large_down' end,
      case when nullif(p.score_breakdown->>'confessional_guard_cap','') is not null
             or coalesce((p.score_breakdown->>'religious_profile')::boolean,false)
           then 'v2_cap_removed' end,
      case when p.best_product is distinct from (v.preview->>'recommended_product') then 'product_changed' end,
      case when jsonb_array_length(coalesce(v.preview->'top_products','[]'::jsonb))>1 then 'multi_product_tie' end,
      case when jsonb_array_length(coalesce(v.preview->'unknown_profiles','[]'::jsonb))>0 then 'unknown_taxonomy' end,
      case when jsonb_array_length(coalesce(v.preview->'canonical_profiles','[]'::jsonb))<=2 then 'specialized_catalog' end,
      case when p.best_product='radar_oportunidades'
             and (v.preview->>'score')::int<=coalesce(p.score,0)-10
           then 'opportunities_recalibrated' end,
      case when coalesce(p.radar_fit_score,0)=100
             and (v.preview->'components'->>'editorial_fit')::int<100
           then 'v2_fit_saturation_reduced' end,
      case when exists(
             select 1 from unnest(coalesce(p.editorial_profile,array[]::text[])) ep(profile)
             join private.radar_profile_aliases_v3 a on a.alias=ep.profile
           )
           then 'taxonomy_normalized' end,
      case when (v.preview->'components'->>'editorial_fit')::int>=80
             and coalesce((support.signal->>'primary_raw_max')::int,0)<60
             and coalesce((support.signal->>'all_raw_max')::int,0)>=80
           then 'secondary_line_drives_score' end
    ]::text[],null)),
    jsonb_build_object(
      'primary_product_support',support.signal,
      'recommended_product',v.preview->>'recommended_product'
    ),
    now()
  from public.publishers p
  cross join lateral (select private.radar_v3_preview(p.id) preview) v
  cross join lateral (
    select private.radar_v3_primary_support(p.id,v.preview->>'recommended_product') signal
  ) support
  where p.organization_id=p_org
    and not p.archived
    and coalesce(cardinality(p.editorial_profile),0)>0;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

drop function if exists private.radar_v3_ordered_preview(uuid);

drop function if exists public.crm_radar_v3_lab_rows_review(uuid,integer,integer,text,text,text,text);

create or replace function public.crm_radar_v3_lab_rows_review(
  p_organization_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort text default 'abs',
  p_search text default null,
  p_status text default 'confirmed',
  p_review_status text default null,
  p_audit_flag text default null
)
returns table(
  publisher_id uuid,
  publisher_name text,
  editorial_profile_status text,
  editorial_profile_confidence text,
  editorial_profile text[],
  v2_score integer,
  v3_score integer,
  delta integer,
  v2_fit integer,
  v3_fit integer,
  v2_best_product text,
  v3_best_product text,
  top_products jsonb,
  product_fits jsonb,
  unknown_profiles jsonb,
  audit_flags jsonb,
  audit_meta jsonb,
  review_status text,
  review_note text,
  reviewed_at timestamptz,
  calculated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path=public,private,pg_temp
as $$
begin
  return query
  select
    s.publisher_id,s.publisher_name,s.editorial_profile_status,s.editorial_profile_confidence,s.editorial_profile,
    s.v2_score,s.v3_score,s.delta,s.v2_fit,s.v3_fit,s.v2_best_product,s.v3_best_product,
    s.top_products,s.product_fits,s.unknown_profiles,s.audit_flags,s.audit_meta,
    coalesce(r.review_status,'pending') review_status,
    r.review_note,r.reviewed_at,s.calculated_at
  from public.radar_v3_simulations s
  left join public.radar_v3_reviews r
    on r.organization_id=s.organization_id and r.publisher_id=s.publisher_id
  where s.organization_id=p_organization_id
    and (p_status is null or p_status='' or s.editorial_profile_status=p_status)
    and (p_review_status is null or p_review_status='' or coalesce(r.review_status,'pending')=p_review_status)
    and (p_audit_flag is null or p_audit_flag='' or s.audit_flags ? p_audit_flag)
    and (p_search is null or trim(p_search)='' or s.publisher_name ilike '%'||trim(p_search)||'%')
  order by
    case when p_sort='up' then s.delta end desc nulls last,
    case when p_sort='down' then s.delta end asc nulls last,
    case when p_sort='v3' then s.v3_score end desc nulls last,
    case when p_sort='abs' then abs(s.delta) end desc nulls last,
    case when p_sort='name' then s.publisher_name end asc nulls last,
    abs(s.delta) desc,s.publisher_name
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(0,coalesce(p_offset,0));
end;
$$;

revoke all on function public.crm_radar_v3_lab_rows_review(uuid,integer,integer,text,text,text,text,text) from public,anon;
grant execute on function public.crm_radar_v3_lab_rows_review(uuid,integer,integer,text,text,text,text,text) to authenticated;
