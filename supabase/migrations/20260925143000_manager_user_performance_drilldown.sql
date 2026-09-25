CREATE OR REPLACE FUNCTION public.crm_user_performance_detail(p_organization_id uuid, p_user_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  role_name text;
  period_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  since_ts timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  result jsonb;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  role_name := private.org_role(p_organization_id);
  if role_name not in ('owner','admin','supervisor') then
    raise exception 'Acesso restrito à gestão' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.org_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
  ) then
    raise exception 'Usuário não pertence à organização' using errcode='22023';
  end if;

  with
  target_member as (
    select m.user_id, m.full_name, m.email, m.job_title, m.role, m.active, m.commercial_functions
    from public.org_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
    limit 1
  ),
  activity_resolved as (
    select
      a.id,
      a.actor_user_id,
      a.entity_type,
      a.entity_id,
      a.action,
      a.label,
      a.before_data,
      a.after_data,
      a.created_at,
      coalesce(
        case
          when a.entity_type='publishers'
           and a.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then a.entity_id::uuid
          else null
        end,
        mt.publisher_id,
        tk.publisher_id,
        ix.publisher_id,
        op.publisher_id,
        ct.publisher_id,
        case
          when coalesce(a.after_data->>'publisher_id', a.before_data->>'publisher_id','')
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.after_data->>'publisher_id', a.before_data->>'publisher_id')::uuid
          else null
        end
      ) as publisher_id
    from public.audit_events a
    left join public.meetings mt
      on a.entity_type='meetings' and a.entity_id=mt.id::text
    left join public.tasks tk
      on a.entity_type='tasks' and a.entity_id=tk.id::text
    left join public.interactions ix
      on a.entity_type='interactions' and a.entity_id=ix.id::text
    left join public.opportunities op
      on a.entity_type='opportunities' and a.entity_id=op.id::text
    left join public.contacts ct
      on a.entity_type='contacts' and a.entity_id=ct.id::text
    where a.organization_id = p_organization_id
      and a.actor_user_id = p_user_id
      and a.created_at >= since_ts
  ),
  stage_events_all as (
    select
      a.id,
      a.entity_id,
      a.actor_user_id,
      a.before_data->>'stage_id' as before_stage_id,
      a.after_data->>'stage_id' as after_stage_id,
      a.created_at,
      lag(a.created_at) over (
        partition by a.entity_id
        order by a.created_at, a.id
      ) as previous_stage_changed_at
    from public.audit_events a
    where a.organization_id = p_organization_id
      and a.entity_type = 'publishers'
      and a.action = 'update'
      and a.before_data ? 'stage_id'
      and a.after_data ? 'stage_id'
      and (a.before_data->>'stage_id') is distinct from (a.after_data->>'stage_id')
  ),
  stage_moves as (
    select
      se.id as event_id,
      se.entity_id::uuid as publisher_id,
      coalesce(nullif(btrim(p.commercial_name),''), nullif(btrim(p.trade_name),''), nullif(btrim(p.name),''), nullif(btrim(p.legal_name),''), 'Editora') as publisher_name,
      bs.name as from_stage,
      ns.name as to_stage,
      se.created_at as moved_at,
      se.previous_stage_changed_at,
      case when se.previous_stage_changed_at is not null
        then extract(epoch from (se.created_at - se.previous_stage_changed_at))/3600.0
        else null
      end as hours_in_previous_stage
    from stage_events_all se
    left join public.publishers p
      on p.id=se.entity_id::uuid and p.organization_id=p_organization_id
    left join public.pipeline_stages bs
      on bs.id = nullif(se.before_stage_id,'')::uuid
    left join public.pipeline_stages ns
      on ns.id = nullif(se.after_stage_id,'')::uuid
    where se.actor_user_id = p_user_id
      and se.created_at >= since_ts
  ),
  completed_tasks as (
    select
      t.id,
      t.publisher_id,
      coalesce(nullif(btrim(p.commercial_name),''), nullif(btrim(p.trade_name),''), nullif(btrim(p.name),''), nullif(btrim(p.legal_name),''), 'Sem editora') as publisher_name,
      t.title,
      t.task_type,
      t.priority,
      t.created_at,
      t.due_at,
      t.completed_at,
      t.result_code,
      t.result_note,
      extract(epoch from (t.completed_at - t.created_at))/3600.0 as completion_hours,
      (t.due_at is not null and t.completed_at > t.due_at) as completed_after_due
    from public.tasks t
    left join public.publishers p
      on p.id=t.publisher_id and p.organization_id=p_organization_id
    where t.organization_id = p_organization_id
      and t.assigned_to = p_user_id
      and t.status = 'done'
      and t.completed_at is not null
      and t.completed_at >= since_ts
      and t.completed_at >= t.created_at
  ),
  publisher_rollup as (
    select
      ar.publisher_id,
      coalesce(nullif(btrim(p.commercial_name),''), nullif(btrim(p.trade_name),''), nullif(btrim(p.name),''), nullif(btrim(p.legal_name),''), 'Editora') as publisher_name,
      count(*) as activity_count,
      min(ar.created_at) as first_activity_at,
      max(ar.created_at) as last_activity_at,
      count(*) filter (
        where ar.entity_type='publishers'
          and ar.action='update'
          and ar.before_data ? 'stage_id'
          and ar.after_data ? 'stage_id'
          and (ar.before_data->>'stage_id') is distinct from (ar.after_data->>'stage_id')
      ) as stage_moves,
      ps.name as current_stage
    from activity_resolved ar
    join public.publishers p
      on p.id=ar.publisher_id and p.organization_id=p_organization_id
    left join public.pipeline_stages ps on ps.id=p.stage_id
    where ar.publisher_id is not null
    group by ar.publisher_id, p.commercial_name, p.trade_name, p.name, p.legal_name, ps.name
  ),
  daily_activity as (
    select ar.created_at::date as activity_date, count(*) as actions
    from activity_resolved ar
    group by ar.created_at::date
    order by activity_date
  ),
  timeline as (
    select ar.*
    from activity_resolved ar
    order by ar.created_at desc, ar.id desc
    limit 120
  ),
  meeting_rows as (
    select
      m.id,
      m.publisher_id,
      coalesce(nullif(btrim(p.commercial_name),''), nullif(btrim(p.trade_name),''), nullif(btrim(p.name),''), nullif(btrim(p.legal_name),''), 'Editora') as publisher_name,
      m.title,
      m.meeting_type,
      m.scheduled_start,
      m.duration_minutes,
      m.status,
      m.scheduled_by,
      m.presenter_user_id,
      (m.scheduled_by=p_user_id) as scheduled_by_user,
      (m.presenter_user_id=p_user_id) as presented_by_user,
      m.created_at
    from public.meetings m
    left join public.publishers p
      on p.id=m.publisher_id and p.organization_id=p_organization_id
    where m.organization_id=p_organization_id
      and (m.scheduled_by=p_user_id or m.presenter_user_id=p_user_id)
      and greatest(m.created_at,m.scheduled_start) >= since_ts
  )
  select jsonb_build_object(
    'period_days', period_days,
    'history_available_since', (
      select min(a.created_at)
      from public.audit_events a
      where a.organization_id=p_organization_id
    ),
    'member', (
      select to_jsonb(tm) from target_member tm
    ),
    'summary', jsonb_build_object(
      'activities', (select count(*) from activity_resolved),
      'active_days', (select count(distinct created_at::date) from activity_resolved),
      'publishers_touched', (select count(*) from publisher_rollup),
      'stage_moves', (select count(*) from stage_moves),
      'interactions', (
        select count(*) from public.interactions i
        where i.organization_id=p_organization_id
          and i.user_id=p_user_id
          and i.occurred_at>=since_ts
      ),
      'publishers_contacted', (
        select count(distinct i.publisher_id) from public.interactions i
        where i.organization_id=p_organization_id
          and i.user_id=p_user_id
          and i.occurred_at>=since_ts
      ),
      'tasks_done', (select count(*) from completed_tasks),
      'tasks_overdue_now', (
        select count(*) from public.tasks t
        where t.organization_id=p_organization_id
          and t.assigned_to=p_user_id
          and t.status in ('open','in_progress')
          and t.due_at<now()
      ),
      'avg_task_completion_hours', (
        select round(avg(completion_hours)::numeric,2) from completed_tasks
      ),
      'median_task_completion_hours', (
        select round(percentile_cont(0.5) within group (order by completion_hours)::numeric,2)
        from completed_tasks
      ),
      'avg_stage_duration_hours', (
        select round(avg(hours_in_previous_stage)::numeric,2)
        from stage_moves
        where hours_in_previous_stage is not null
      ),
      'meetings_scheduled', (
        select count(*) from public.meetings m
        where m.organization_id=p_organization_id
          and m.scheduled_by=p_user_id
          and m.created_at>=since_ts
      ),
      'meetings_presented', (
        select count(*) from public.meetings m
        where m.organization_id=p_organization_id
          and m.presenter_user_id=p_user_id
          and m.status='completed'
          and m.scheduled_start>=since_ts
      ),
      'meeting_no_shows', (
        select count(*) from public.meetings m
        where m.organization_id=p_organization_id
          and (m.scheduled_by=p_user_id or m.presenter_user_id=p_user_id)
          and m.status='no_show'
          and m.scheduled_start>=since_ts
      ),
      'originated_publishers', (
        select count(*) from public.publishers p
        where p.organization_id=p_organization_id
          and not p.archived
          and p.prospector_user_id=p_user_id
      ),
      'current_responsibility', (
        select count(*) from public.publishers p
        where p.organization_id=p_organization_id
          and not p.archived
          and p.owner_user_id=p_user_id
      ),
      'first_action_at', (select min(created_at) from activity_resolved),
      'last_action_at', (select max(created_at) from activity_resolved)
    ),
    'publishers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'publisher_id',pr.publisher_id,
          'publisher_name',pr.publisher_name,
          'activity_count',pr.activity_count,
          'first_activity_at',pr.first_activity_at,
          'last_activity_at',pr.last_activity_at,
          'stage_moves',pr.stage_moves,
          'current_stage',pr.current_stage
        )
        order by pr.last_activity_at desc
      )
      from publisher_rollup pr
    ), '[]'::jsonb),
    'stage_moves', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_id',sm.event_id,
          'publisher_id',sm.publisher_id,
          'publisher_name',sm.publisher_name,
          'from_stage',sm.from_stage,
          'to_stage',sm.to_stage,
          'moved_at',sm.moved_at,
          'previous_stage_changed_at',sm.previous_stage_changed_at,
          'hours_in_previous_stage',case when sm.hours_in_previous_stage is null then null else round(sm.hours_in_previous_stage::numeric,2) end
        )
        order by sm.moved_at desc
      )
      from stage_moves sm
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',ct.id,
          'publisher_id',ct.publisher_id,
          'publisher_name',ct.publisher_name,
          'title',ct.title,
          'task_type',ct.task_type,
          'priority',ct.priority,
          'created_at',ct.created_at,
          'due_at',ct.due_at,
          'completed_at',ct.completed_at,
          'completion_hours',round(ct.completion_hours::numeric,2),
          'completed_after_due',ct.completed_after_due,
          'result_code',ct.result_code,
          'result_note',ct.result_note
        )
        order by ct.completed_at desc
      )
      from completed_tasks ct
    ), '[]'::jsonb),
    'meetings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',mr.id,
          'publisher_id',mr.publisher_id,
          'publisher_name',mr.publisher_name,
          'title',mr.title,
          'meeting_type',mr.meeting_type,
          'scheduled_start',mr.scheduled_start,
          'duration_minutes',mr.duration_minutes,
          'status',mr.status,
          'scheduled_by_user',mr.scheduled_by_user,
          'presented_by_user',mr.presented_by_user
        )
        order by mr.scheduled_start desc
      )
      from meeting_rows mr
    ), '[]'::jsonb),
    'daily_activity', coalesce((
      select jsonb_agg(
        jsonb_build_object('date',da.activity_date,'actions',da.actions)
        order by da.activity_date
      )
      from daily_activity da
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',tl.id,
          'entity_type',tl.entity_type,
          'entity_id',tl.entity_id,
          'action',tl.action,
          'label',tl.label,
          'before_data',tl.before_data,
          'after_data',tl.after_data,
          'created_at',tl.created_at,
          'publisher_id',tl.publisher_id,
          'publisher_name',coalesce(nullif(btrim(p.commercial_name),''), nullif(btrim(p.trade_name),''), nullif(btrim(p.name),''), nullif(btrim(p.legal_name),''))
        )
        order by tl.created_at desc, tl.id desc
      )
      from timeline tl
      left join public.publishers p
        on p.id=tl.publisher_id and p.organization_id=p_organization_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke all on function public.crm_user_performance_detail(uuid,uuid,integer) from public;
revoke all on function public.crm_user_performance_detail(uuid,uuid,integer) from anon;
grant execute on function public.crm_user_performance_detail(uuid,uuid,integer) to authenticated;
