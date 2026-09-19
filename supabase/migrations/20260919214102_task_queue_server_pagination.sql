CREATE OR REPLACE FUNCTION public.crm_task_queue(p_organization_id uuid, p_scope text DEFAULT 'mine'::text, p_status text DEFAULT 'open'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_scope text:=case when p_scope='team' then 'team' else 'mine' end;
  v_status text:=case when p_status in ('open','done','all') then p_status else 'open' end;
  v_search text:=nullif(trim(coalesce(p_search,'')),'');
  v_role text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  select om.role into v_role
  from public.org_members om
  where om.organization_id=p_organization_id
    and om.user_id=auth.uid()
    and om.active
  limit 1;

  if v_role is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  if v_scope='team' and v_role not in ('owner','admin','supervisor') then
    raise exception 'Visão de equipe restrita à gestão' using errcode='42501';
  end if;

  with filtered as (
    select
      t.id,t.title,t.description,t.task_type,t.due_at,t.status,t.priority,
      t.publisher_id,t.assigned_to,t.created_at,t.completed_at,t.meeting_id,
      t.automation_key,t.cadence_enrollment_id,t.cadence_step_id,
      t.result_code,t.result_note,t.outreach_template_id,
      p.name as publisher_name,
      om.full_name as assignee_name,
      om.email as assignee_email,
      ot.name as template_name,
      ot.body as template_body,
      ot.channel as template_channel,
      ot.purpose as template_purpose
    from public.tasks t
    left join public.publishers p
      on p.id=t.publisher_id and p.organization_id=t.organization_id
    left join public.org_members om
      on om.organization_id=t.organization_id and om.user_id=t.assigned_to
    left join public.outreach_templates ot
      on ot.id=t.outreach_template_id and ot.organization_id=t.organization_id
    where t.organization_id=p_organization_id
      and (v_scope='team' or t.assigned_to=auth.uid())
      and (
        v_status='all'
        or (v_status='open' and t.status in ('open','in_progress'))
        or (v_status='done' and t.status='done')
      )
      and (
        v_search is null
        or t.title ilike '%'||v_search||'%'
        or coalesce(t.description,'') ilike '%'||v_search||'%'
        or coalesce(p.name,'') ilike '%'||v_search||'%'
        or coalesce(om.full_name,'') ilike '%'||v_search||'%'
        or coalesce(om.email,'') ilike '%'||v_search||'%'
      )
  ),
  paged as (
    select *
    from filtered
    order by
      case when v_status='done' then coalesce(completed_at,created_at) end desc nulls last,
      case when v_status<>'done' then due_at end asc nulls last,
      case priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end desc,
      created_at desc,
      id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'limit',v_limit,
    'offset',v_offset,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,
        'title',x.title,
        'description',x.description,
        'task_type',x.task_type,
        'due_at',x.due_at,
        'status',x.status,
        'priority',x.priority,
        'publisher_id',x.publisher_id,
        'assigned_to',x.assigned_to,
        'created_at',x.created_at,
        'completed_at',x.completed_at,
        'meeting_id',x.meeting_id,
        'automation_key',x.automation_key,
        'cadence_enrollment_id',x.cadence_enrollment_id,
        'cadence_step_id',x.cadence_step_id,
        'result_code',x.result_code,
        'result_note',x.result_note,
        'outreach_template_id',x.outreach_template_id,
        'publishers',case when x.publisher_id is null then null else jsonb_build_object('name',x.publisher_name) end,
        'assignee',jsonb_build_object('full_name',x.assignee_name,'email',x.assignee_email),
        'outreach_templates',case when x.outreach_template_id is null then null else jsonb_build_object(
          'name',x.template_name,'body',x.template_body,'channel',x.template_channel,'purpose',x.template_purpose
        ) end
      ) order by
        case when v_status='done' then coalesce(x.completed_at,x.created_at) end desc nulls last,
        case when v_status<>'done' then x.due_at end asc nulls last,
        case x.priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end desc,
        x.created_at desc,
        x.id
      )
      from paged x
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;

revoke all on function public.crm_task_queue(uuid,text,text,text,integer,integer) from public,anon;
grant execute on function public.crm_task_queue(uuid,text,text,text,integer,integer) to authenticated;

create index if not exists tasks_org_assignee_status_due_idx
  on public.tasks(organization_id,assigned_to,status,due_at);
