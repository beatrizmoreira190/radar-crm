create or replace function public.crm_opportunity_pipeline_summary(
  p_organization_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_days integer:=greatest(1,least(coalesce(p_days,30),365));
  v_since timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
  v_role text;
  v_manager boolean;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  select m.role into v_role
  from public.org_members m
  where m.organization_id=p_organization_id
    and m.user_id=v_uid
    and m.active
  limit 1;

  if v_role is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  v_manager:=v_role in ('owner','admin','supervisor');

  with scoped as (
    select o.*
    from public.opportunities o
    where o.organization_id=p_organization_id
      and (v_manager or o.owner_user_id=v_uid or o.created_by=v_uid)
  ),
  stage_rows as (
    select stage,count(*)::int as count
    from scoped
    where stage not in ('won','lost')
    group by stage
  ),
  service_rows as (
    select
      coalesce(service_key,'other') as service_key,
      count(*) filter (where stage not in ('won','lost'))::int as open_count,
      coalesce(sum(radar_opportunities_title_count) filter (
        where stage not in ('won','lost') and service_key='radar_oportunidades'
      ),0)::int as radar_opportunities_titles,
      coalesce(sum(pnld_works_count) filter (
        where stage not in ('won','lost') and service_key='pnld'
      ),0)::int as pnld_works
    from scoped
    group by coalesce(service_key,'other')
  )
  select jsonb_build_object(
    'scope',case when v_manager then 'team' else 'personal' end,
    'days',v_days,
    'open_total',(select count(*)::int from scoped where stage not in ('won','lost')),
    'identified_total',(select count(*)::int from scoped where stage='identified'),
    'qualified_total',(select count(*)::int from scoped where stage='qualified'),
    'proposal_total',(select count(*)::int from scoped where stage='proposal'),
    'negotiation_total',(select count(*)::int from scoped where stage='negotiation'),
    'on_hold_total',(select count(*)::int from scoped where stage='on_hold'),
    'won_period',(select count(*)::int from scoped where stage='won' and updated_at>=v_since),
    'lost_period',(select count(*)::int from scoped where stage='lost' and updated_at>=v_since),
    'radar_opportunities_titles_open',(
      select coalesce(sum(radar_opportunities_title_count),0)::int
      from scoped
      where stage not in ('won','lost') and service_key='radar_oportunidades'
    ),
    'pnld_works_open',(
      select coalesce(sum(pnld_works_count),0)::int
      from scoped
      where stage not in ('won','lost') and service_key='pnld'
    ),
    'by_stage',coalesce((
      select jsonb_agg(
        jsonb_build_object('stage',stage,'count',count)
        order by case stage
          when 'identified' then 1 when 'qualified' then 2 when 'proposal' then 3
          when 'negotiation' then 4 when 'on_hold' then 5 else 9 end
      )
      from stage_rows
    ),'[]'::jsonb),
    'by_service',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'service_key',service_key,
          'open_count',open_count,
          'radar_opportunities_titles',radar_opportunities_titles,
          'pnld_works',pnld_works
        )
        order by open_count desc,service_key
      )
      from service_rows
      where open_count>0
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.crm_opportunity_pipeline_summary(uuid,integer) from public;
grant execute on function public.crm_opportunity_pipeline_summary(uuid,integer) to authenticated;
grant execute on function public.crm_opportunity_pipeline_summary(uuid,integer) to service_role;
