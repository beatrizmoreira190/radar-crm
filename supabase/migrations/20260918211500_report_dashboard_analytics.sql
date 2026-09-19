CREATE OR REPLACE FUNCTION public.crm_report_dashboard(p_organization_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_days integer:=greatest(coalesce(p_days,30),1);
  v_since timestamptz:=now()-make_interval(days=>greatest(coalesce(p_days,30),1));
  v_prev_since timestamptz:=now()-make_interval(days=>greatest(coalesce(p_days,30),1)*2);
  v_role text;
  v_manager boolean;
  v_result jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado.' using errcode='42501';
  end if;

  v_role:=private.org_role(p_organization_id);
  v_manager:=v_role in ('owner','admin','supervisor');

  with
  scoped_publishers as (
    select p.*
    from public.publishers p
    where p.organization_id=p_organization_id
      and p.archived=false
      and (v_manager or p.owner_user_id=auth.uid())
  ),
  scoped_interactions as (
    select i.*
    from public.interactions i
    where i.organization_id=p_organization_id
      and (v_manager or i.user_id=auth.uid())
  ),
  scoped_meetings as (
    select m.*
    from public.meetings m
    where m.organization_id=p_organization_id
      and (v_manager or m.presenter_user_id=auth.uid() or m.scheduled_by=auth.uid())
  ),
  scoped_opportunities as (
    select o.*
    from public.opportunities o
    where o.organization_id=p_organization_id
      and (v_manager or o.owner_user_id=auth.uid() or o.created_by=auth.uid())
  ),
  scoped_tasks as (
    select t.*
    from public.tasks t
    where t.organization_id=p_organization_id
      and (v_manager or t.assigned_to=auth.uid() or t.created_by=auth.uid())
  ),
  scoped_enrollments as (
    select e.*
    from public.cadence_enrollments e
    where e.organization_id=p_organization_id
      and (v_manager or e.user_id=auth.uid())
  ),
  days as (
    select generate_series(v_since::date,current_date,interval '1 day')::date as day
  ),
  activity as (
    select d.day,
      (select count(*) from scoped_interactions i where i.occurred_at>=d.day and i.occurred_at<d.day+1) interactions,
      (select count(*) from scoped_meetings m where m.scheduled_start>=d.day and m.scheduled_start<d.day+1) meetings,
      (select count(*) from scoped_opportunities o where o.created_at>=d.day and o.created_at<d.day+1) opportunities
    from days d
  ),
  funnel_stages as (
    select s.*
    from public.pipeline_stages s
    where s.organization_id=p_organization_id
      and s.active=true
      and s.stage_type in ('open','won')
  ),
  publisher_max_stage as (
    select p.id,
      greatest(
        coalesce(cs.position,0),
        coalesce(max(hs.position),0)
      ) as max_position
    from scoped_publishers p
    left join public.pipeline_stages cs
      on cs.id=p.stage_id and cs.stage_type in ('open','won')
    left join public.activity_log al
      on al.organization_id=p_organization_id
     and al.entity_type='publishers'
     and al.publisher_id=p.id
     and al.action='update'
     and nullif(al.after_data->>'stage_id','') is not null
    left join public.pipeline_stages hs
      on hs.id=(nullif(al.after_data->>'stage_id',''))::uuid
     and hs.stage_type in ('open','won')
    group by p.id,cs.position
  ),
  stage_entered as (
    select p.id,p.stage_id,
      coalesce(
        max(al.created_at) filter (
          where nullif(al.after_data->>'stage_id','')::uuid=p.stage_id
            and nullif(al.before_data->>'stage_id','') is distinct from nullif(al.after_data->>'stage_id','')
        ),
        p.created_at
      ) entered_at
    from scoped_publishers p
    left join public.activity_log al
      on al.organization_id=p_organization_id
     and al.entity_type='publishers'
     and al.publisher_id=p.id
     and al.action='update'
    group by p.id,p.stage_id,p.created_at
  ),
  current_period as (
    select jsonb_build_object(
      'interactions',(select count(*) from scoped_interactions where occurred_at>=v_since),
      'publishers_worked',(select count(distinct publisher_id) from scoped_interactions where occurred_at>=v_since),
      'meetings',(select count(*) from scoped_meetings where scheduled_start>=v_since),
      'meetings_completed',(select count(*) from scoped_meetings where scheduled_start>=v_since and status='completed'),
      'opportunities_created',(select count(*) from scoped_opportunities where created_at>=v_since),
      'tasks_completed',(select count(*) from scoped_tasks where completed_at>=v_since),
      'won_opportunities',(select count(*) from scoped_opportunities where stage='won' and updated_at>=v_since)
    ) value
  ),
  previous_period as (
    select jsonb_build_object(
      'interactions',(select count(*) from scoped_interactions where occurred_at>=v_prev_since and occurred_at<v_since),
      'publishers_worked',(select count(distinct publisher_id) from scoped_interactions where occurred_at>=v_prev_since and occurred_at<v_since),
      'meetings',(select count(*) from scoped_meetings where scheduled_start>=v_prev_since and scheduled_start<v_since),
      'meetings_completed',(select count(*) from scoped_meetings where scheduled_start>=v_prev_since and scheduled_start<v_since and status='completed'),
      'opportunities_created',(select count(*) from scoped_opportunities where created_at>=v_prev_since and created_at<v_since),
      'tasks_completed',(select count(*) from scoped_tasks where completed_at>=v_prev_since and completed_at<v_since),
      'won_opportunities',(select count(*) from scoped_opportunities where stage='won' and updated_at>=v_prev_since and updated_at<v_since)
    ) value
  ),
  score_dist as (
    select bucket,sort,count(*)::int count
    from (
      select case
        when coalesce(score,0)>=90 then '90–100'
        when coalesce(score,0)>=80 then '80–89'
        when coalesce(score,0)>=70 then '70–79'
        when coalesce(score,0)>=50 then '50–69'
        else '0–49' end bucket,
        case
        when coalesce(score,0)>=90 then 5
        when coalesce(score,0)>=80 then 4
        when coalesce(score,0)>=70 then 3
        when coalesce(score,0)>=50 then 2
        else 1 end sort
      from scoped_publishers
    ) q
    group by bucket,sort
  ),
  product_fit as (
    select *
    from (
      select 'pnld_literario' key,'PNLD Literário' label,
        count(*) filter (where fit_pnld_literario>=70)::int high_fit,
        count(*) filter (where fit_pnld_literario>=70 and last_contact_at is null)::int uncontacted
      from scoped_publishers
      union all
      select 'pnld_didatico','PNLD Didático',
        count(*) filter (where fit_pnld_didatico>=70)::int,
        count(*) filter (where fit_pnld_didatico>=70 and last_contact_at is null)::int
      from scoped_publishers
      union all
      select 'pnld_tecnico_metodologico','PNLD Técnico-Metodológico',
        count(*) filter (where fit_pnld_tecnico_metodologico>=70)::int,
        count(*) filter (where fit_pnld_tecnico_metodologico>=70 and last_contact_at is null)::int
      from scoped_publishers
      union all
      select 'radar_licitacoes','Radar de Licitações',
        count(*) filter (where fit_radar_licitacoes>=70)::int,
        count(*) filter (where fit_radar_licitacoes>=70 and last_contact_at is null)::int
      from scoped_publishers
      union all
      select 'radar_oportunidades','Radar de Oportunidades',
        count(*) filter (where fit_radar_oportunidades>=70)::int,
        count(*) filter (where fit_radar_oportunidades>=70 and last_contact_at is null)::int
      from scoped_publishers
    ) x
  ),
  meeting_period as (
    select m.*
    from scoped_meetings m
    where m.scheduled_start>=v_since
  ),
  completed_meeting_period as (
    select m.*
    from meeting_period m
    where m.status='completed'
  ),
  meeting_conversion as (
    select
      count(*)::int completed,
      count(*) filter (
        where exists(
          select 1 from scoped_opportunities o
          where o.publisher_id=m.publisher_id
            and o.created_at>=m.scheduled_start
            and o.created_at<=m.scheduled_start+interval '30 days'
        )
      )::int followed_by_opportunity,
      round(avg(
        extract(epoch from (
          m.scheduled_start-
          (
            select min(i.occurred_at)
            from scoped_interactions i
            where i.publisher_id=m.publisher_id
              and i.occurred_at<=m.scheduled_start
          )
        ))/86400
      ) filter (
        where exists(
          select 1 from scoped_interactions i2
          where i2.publisher_id=m.publisher_id
            and i2.occurred_at<=m.scheduled_start
        )
      ),1) avg_days_first_contact_to_meeting
    from completed_meeting_period m
  ),
  cadence_period as (
    select e.*,c.name cadence_name,c.cadence_key
    from scoped_enrollments e
    join public.cadences c on c.id=e.cadence_id
    where e.started_at>=v_since
  ),
  cadence_perf as (
    select cp.cadence_id,cp.cadence_name,cp.cadence_key,
      count(*)::int enrollments,
      count(*) filter (where cp.status='completed')::int completed,
      count(*) filter (
        where exists(
          select 1 from public.tasks t
          where t.cadence_enrollment_id=cp.id
            and t.result_code in ('connected','replied','asked_email','meeting_scheduled','proposal_requested','qualified','contact_updated')
        )
      )::int responses,
      count(*) filter (
        where exists(
          select 1 from public.tasks t
          where t.cadence_enrollment_id=cp.id and t.result_code='meeting_scheduled'
        )
      )::int meetings,
      count(*) filter (
        where exists(
          select 1 from public.tasks t
          where t.cadence_enrollment_id=cp.id and t.result_code in ('proposal_requested','qualified')
        )
      )::int opportunities
    from cadence_period cp
    group by cp.cadence_id,cp.cadence_name,cp.cadence_key
  ),
  cadence_channel as (
    select t.task_type channel,
      count(*)::int attempts,
      count(*) filter (
        where t.result_code in ('connected','replied','asked_email','meeting_scheduled','proposal_requested','qualified','contact_updated')
      )::int positive
    from public.tasks t
    join scoped_enrollments e on e.id=t.cadence_enrollment_id
    where t.result_at>=v_since
    group by t.task_type
  ),
  financial_by_stage as (
    select o.stage,
      count(*)::int count,
      coalesce(sum(o.estimated_value),0)::numeric gross_value,
      coalesce(sum(o.estimated_value*coalesce(o.probability,0)/100.0),0)::numeric weighted_value
    from scoped_opportunities o
    where o.stage not in ('won','lost')
    group by o.stage
  ),
  geography as (
    select p.state,
      count(*)::int base_count,
      count(*) filter (where p.last_contact_at is not null)::int contacted,
      (
        select count(*)::int
        from scoped_interactions i
        join public.publishers ip on ip.id=i.publisher_id
        where i.occurred_at>=v_since
          and ip.state=p.state
      ) interactions
    from scoped_publishers p
    where p.state is not null and p.state<>''
    group by p.state
  ),
  team_base as (
    select m.user_id,m.full_name,m.email,m.role,m.commercial_functions
    from public.org_members m
    where m.organization_id=p_organization_id
      and m.active=true
      and (
        m.role in ('owner','admin','supervisor')
        or cardinality(coalesce(m.commercial_functions,'{}'::text[]))>0
      )
  ),
  team_perf as (
    select tb.*,
      (select count(*) from public.publishers p where p.organization_id=p_organization_id and not p.archived and p.owner_user_id=tb.user_id)::int portfolio,
      (select count(*) from public.publishers p where p.organization_id=p_organization_id and not p.archived and p.owner_user_id=tb.user_id and p.last_contact_at is not null)::int contacted,
      (select count(*) from public.interactions i where i.organization_id=p_organization_id and i.user_id=tb.user_id and i.occurred_at>=v_since)::int interactions,
      (select count(*) from public.meetings m where m.organization_id=p_organization_id and m.presenter_user_id=tb.user_id and m.scheduled_start>=v_since)::int meetings,
      (select count(*) from public.opportunities o where o.organization_id=p_organization_id and (o.owner_user_id=tb.user_id or o.created_by=tb.user_id) and o.created_at>=v_since)::int opportunities,
      (select count(*) from public.tasks t where t.organization_id=p_organization_id and t.assigned_to=tb.user_id and t.status in ('open','in_progress') and t.due_at<now())::int overdue
    from team_base tb
  )
  select jsonb_build_object(
    'scope',case when v_manager then 'team' else 'personal' end,
    'days',v_days,
    'period',jsonb_build_object(
      'current_start',v_since,
      'previous_start',v_prev_since,
      'previous_end',v_since
    ),
    'current',(select value from current_period),
    'previous',(select value from previous_period),
    'activity_series',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',day,
        'interactions',interactions,
        'meetings',meetings,
        'opportunities',opportunities
      ) order by day)
      from activity
    ),'[]'::jsonb),
    'funnel',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'name',s.name,
        'position',s.position,
        'stage_type',s.stage_type,
        'reached',(select count(*) from publisher_max_stage pms where pms.max_position>=s.position)
      ) order by s.position)
      from funnel_stages s
    ),'[]'::jsonb),
    'stage_aging',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'name',s.name,
        'count',count(p.id),
        'avg_days',round(avg(extract(epoch from (now()-se.entered_at))/86400),1)
      ) order by s.position)
      from public.pipeline_stages s
      left join scoped_publishers p on p.stage_id=s.id
      left join stage_entered se on se.id=p.id
      where s.organization_id=p_organization_id and s.active=true
      group by s.id,s.name,s.position
    ),'[]'::jsonb),
    'score_distribution',coalesce((
      select jsonb_agg(jsonb_build_object('bucket',bucket,'count',count) order by sort desc)
      from score_dist
    ),'[]'::jsonb),
    'score_alerts',jsonb_build_object(
      'high_score_uncontacted',(select count(*) from scoped_publishers where score>=90 and last_contact_at is null),
      'high_score_unassigned',case when v_manager then (select count(*) from scoped_publishers where score>=90 and owner_user_id is null) else 0 end
    ),
    'product_fit',coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',key,'label',label,'high_fit',high_fit,'uncontacted',uncontacted
      ) order by high_fit desc,label)
      from product_fit
    ),'[]'::jsonb),
    'meetings',jsonb_build_object(
      'scheduled',(select count(*) from meeting_period where status='scheduled'),
      'completed',(select count(*) from meeting_period where status='completed'),
      'cancelled',(select count(*) from meeting_period where status='cancelled'),
      'no_show',(select count(*) from meeting_period where status='no_show'),
      'followed_by_opportunity',(select followed_by_opportunity from meeting_conversion),
      'avg_days_first_contact_to_meeting',(select avg_days_first_contact_to_meeting from meeting_conversion),
      'by_presenter',coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id',m.presenter_user_id,
          'meetings',count(*),
          'completed',count(*) filter (where m.status='completed')
        ) order by count(*) desc)
        from meeting_period m
        group by m.presenter_user_id
      ),'[]'::jsonb)
    ),
    'cadences',jsonb_build_object(
      'performance',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',cadence_id,
          'name',cadence_name,
          'key',cadence_key,
          'enrollments',enrollments,
          'completed',completed,
          'responses',responses,
          'meetings',meetings,
          'opportunities',opportunities
        ) order by enrollments desc,cadence_name)
        from cadence_perf
      ),'[]'::jsonb),
      'channels',coalesce((
        select jsonb_agg(jsonb_build_object(
          'channel',channel,'attempts',attempts,'positive',positive
        ) order by attempts desc,channel)
        from cadence_channel
      ),'[]'::jsonb)
    ),
    'financial',jsonb_build_object(
      'gross_open',coalesce((select sum(gross_value) from financial_by_stage),0),
      'weighted_open',coalesce((select sum(weighted_value) from financial_by_stage),0),
      'by_stage',coalesce((
        select jsonb_agg(jsonb_build_object(
          'stage',stage,'count',count,'gross_value',gross_value,'weighted_value',weighted_value
        ) order by gross_value desc)
        from financial_by_stage
      ),'[]'::jsonb)
    ),
    'team',case when v_manager then coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',user_id,'full_name',full_name,'email',email,'role',role,
        'portfolio',portfolio,'contacted',contacted,'interactions',interactions,
        'meetings',meetings,'opportunities',opportunities,'overdue',overdue
      ) order by interactions desc,full_name nulls last,email)
      from team_perf
    ),'[]'::jsonb) else '[]'::jsonb end,
    'geography',coalesce((
      select jsonb_agg(jsonb_build_object(
        'state',state,'base_count',base_count,'contacted',contacted,'interactions',interactions
      ) order by base_count desc,state)
      from geography
    ),'[]'::jsonb),
    'alerts',jsonb_build_object(
      'opportunities_without_next_action',(
        select count(*) from scoped_opportunities
        where stage not in ('won','lost') and next_action_at is null
      ),
      'stale_conversations_30d',(
        select count(*) from scoped_publishers p
        join public.pipeline_stages s on s.id=p.stage_id
        where s.name='Conversando'
          and coalesce(p.last_activity_at,p.updated_at,p.created_at)<now()-interval '30 days'
      ),
      'overdue_tasks',(
        select count(*) from scoped_tasks
        where status in ('open','in_progress') and due_at<now()
      ),
      'no_next_action_publishers',(
        select count(*) from scoped_publishers
        where last_contact_at is not null and next_action_at is null
      )
    )
  ) into v_result;

  return v_result;
end;
$function$
;

grant execute on function public.crm_report_dashboard(uuid,integer) to authenticated;
