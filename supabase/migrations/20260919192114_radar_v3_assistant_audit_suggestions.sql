-- Assistant audit suggestions for Radar v3.
-- Suggestions are read-only for CRM users and never count as human review.

create table if not exists public.radar_v3_suggestions (
  organization_id uuid not null,
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  suggestion_status text not null
    check (suggestion_status in ('validated','needs_adjustment','later')),
  suggestion_note text not null,
  suggestion_basis text not null default 'assistant_audit',
  generated_at timestamptz not null default now(),
  primary key (organization_id,publisher_id)
);

create index if not exists radar_v3_suggestions_publisher_id_idx
  on public.radar_v3_suggestions(publisher_id);

alter table public.radar_v3_suggestions enable row level security;

drop policy if exists radar_v3_suggestions_select_manager on public.radar_v3_suggestions;
create policy radar_v3_suggestions_select_manager
on public.radar_v3_suggestions
for select
to authenticated
using (
  private.org_role(organization_id)=any(array['owner'::text,'admin'::text,'supervisor'::text])
);

revoke all on table public.radar_v3_suggestions from public,anon,authenticated;
grant select on table public.radar_v3_suggestions to authenticated;

drop function if exists public.crm_radar_v3_lab_rows_review(uuid,integer,integer,text,text,text,text,text);
drop function if exists public.crm_radar_v3_lab_rows_review(uuid,integer,integer,text,text,text,text,text,text);

create function public.crm_radar_v3_lab_rows_review(
  p_organization_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort text default 'abs',
  p_search text default null,
  p_status text default 'confirmed',
  p_review_status text default null,
  p_audit_flag text default null,
  p_suggestion_status text default null
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
  suggestion_status text,
  suggestion_note text,
  suggestion_basis text,
  suggestion_generated_at timestamptz,
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
    r.review_note,r.reviewed_at,
    sug.suggestion_status,sug.suggestion_note,sug.suggestion_basis,sug.generated_at,
    s.calculated_at
  from public.radar_v3_simulations s
  left join public.radar_v3_reviews r
    on r.organization_id=s.organization_id and r.publisher_id=s.publisher_id
  left join public.radar_v3_suggestions sug
    on sug.organization_id=s.organization_id and sug.publisher_id=s.publisher_id
  where s.organization_id=p_organization_id
    and (p_status is null or p_status='' or s.editorial_profile_status=p_status)
    and (p_review_status is null or p_review_status='' or coalesce(r.review_status,'pending')=p_review_status)
    and (p_audit_flag is null or p_audit_flag='' or s.audit_flags ? p_audit_flag)
    and (
      p_suggestion_status is null or p_suggestion_status=''
      or (p_suggestion_status='__any__' and sug.suggestion_status is not null)
      or (p_suggestion_status='__none__' and sug.suggestion_status is null)
      or sug.suggestion_status=p_suggestion_status
    )
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

revoke all on function public.crm_radar_v3_lab_rows_review(uuid,integer,integer,text,text,text,text,text,text) from public,anon;
grant execute on function public.crm_radar_v3_lab_rows_review(uuid,integer,integer,text,text,text,text,text,text) to authenticated;

create or replace function public.crm_radar_v3_lab_summary(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,private,pg_temp
as $$
declare result jsonb;
begin
  with x as (
    select s.*,
           coalesce(r.review_status,'pending') review_status,
           sug.suggestion_status
    from public.radar_v3_simulations s
    left join public.radar_v3_reviews r
      on r.organization_id=s.organization_id and r.publisher_id=s.publisher_id
    left join public.radar_v3_suggestions sug
      on sug.organization_id=s.organization_id and sug.publisher_id=s.publisher_id
    where s.organization_id=p_organization_id
      and s.editorial_profile_status='confirmed'
  )
  select jsonb_build_object(
    'total',count(*),
    'last_refreshed',max(calculated_at),
    'v2_avg',round(avg(v2_score),1),
    'v3_avg',round(avg(v3_score),1),
    'v2_median',percentile_cont(.5) within group(order by v2_score),
    'v3_median',percentile_cont(.5) within group(order by v3_score),
    'v2_80_plus',count(*) filter(where v2_score>=80),
    'v3_80_plus',count(*) filter(where v3_score>=80),
    'v2_90_plus',count(*) filter(where v2_score>=90),
    'v3_90_plus',count(*) filter(where v3_score>=90),
    'v2_fit_100',count(*) filter(where v2_fit=100),
    'v3_fit_100',count(*) filter(where v3_fit=100),
    'v2_fit_90_plus',count(*) filter(where v2_fit>=90),
    'v3_fit_90_plus',count(*) filter(where v3_fit>=90),
    'within_5',count(*) filter(where abs(delta)<=5),
    'up_10_plus',count(*) filter(where delta>=10),
    'down_10_plus',count(*) filter(where delta<=-10),
    'up_25_plus',count(*) filter(where delta>=25),
    'down_25_plus',count(*) filter(where delta<=-25),
    'ties',count(*) filter(where jsonb_array_length(top_products)>1),
    'three_plus_ties',count(*) filter(where jsonb_array_length(top_products)>=3),
    'unknown_profiles',count(*) filter(where jsonb_array_length(unknown_profiles)>0),
    'review_pending',count(*) filter(where review_status='pending'),
    'review_validated',count(*) filter(where review_status='validated'),
    'review_needs_adjustment',count(*) filter(where review_status='needs_adjustment'),
    'review_later',count(*) filter(where review_status='later'),
    'suggestions_total',count(*) filter(where suggestion_status is not null),
    'suggestions_validated',count(*) filter(where suggestion_status='validated'),
    'suggestions_needs_adjustment',count(*) filter(where suggestion_status='needs_adjustment'),
    'suggestions_later',count(*) filter(where suggestion_status='later'),
    'best_products',(
      select coalesce(jsonb_agg(to_jsonb(z) order by z.n desc),'[]'::jsonb)
      from (
        select coalesce(v3_best_product,'none') product,count(*) n,round(avg(v3_score),1) avg_score
        from x group by 1
      ) z
    )
  ) into result from x;
  return result;
end;
$$;
