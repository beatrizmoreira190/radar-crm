alter table public.meetings
  add column if not exists outcome_interest text,
  add column if not exists next_step text,
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_assigned_to uuid references auth.users(id) on delete set null;

alter table public.meetings
  drop constraint if exists meetings_outcome_interest_check;
alter table public.meetings
  add constraint meetings_outcome_interest_check
  check (outcome_interest is null or outcome_interest in ('none','low','medium','high'));

alter table public.tasks
  add column if not exists meeting_id uuid references public.meetings(id) on delete cascade,
  add column if not exists automation_key text;

create index if not exists tasks_meeting_id_idx on public.tasks(meeting_id);
create unique index if not exists tasks_meeting_automation_key_uidx
  on public.tasks(meeting_id, automation_key)
  where meeting_id is not null and automation_key is not null;

create or replace function private.validate_meeting_follow_up_assignee()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.follow_up_assigned_to is not null and not exists (
    select 1 from public.org_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.follow_up_assigned_to
      and m.active = true
  ) then
    raise exception 'O responsável pelo follow-up precisa ser membro ativo da organização.' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_meeting_follow_up_assignee() from public;

drop trigger if exists trg_validate_meeting_follow_up_assignee on public.meetings;
create trigger trg_validate_meeting_follow_up_assignee
before insert or update of follow_up_assigned_to on public.meetings
for each row execute function private.validate_meeting_follow_up_assignee();

create or replace function private.sync_meeting_workflow_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  publisher_name text;
  prep_status text;
  outcome_status text;
  prep_due timestamptz;
  outcome_due timestamptz;
  follow_assignee uuid;
begin
  select p.name into publisher_name
  from public.publishers p
  where p.id = new.publisher_id and p.organization_id = new.organization_id;

  publisher_name := coalesce(nullif(btrim(publisher_name),''),'Editora');
  prep_due := greatest(new.scheduled_start - interval '24 hours', now());
  outcome_due := new.scheduled_start + make_interval(mins => new.duration_minutes + 30);

  prep_status := case
    when new.status = 'scheduled' then 'open'
    when new.status = 'completed' then 'done'
    else 'cancelled'
  end;

  outcome_status := case
    when new.status = 'scheduled' then 'open'
    when new.status = 'completed' and (new.outcome_notes is not null or new.outcome_interest is not null or new.next_step is not null or new.follow_up_at is not null) then 'done'
    when new.status = 'completed' then 'open'
    else 'cancelled'
  end;

  insert into public.tasks(
    organization_id,publisher_id,meeting_id,automation_key,assigned_to,created_by,
    title,description,task_type,due_at,status,priority,completed_at,updated_at
  ) values (
    new.organization_id,new.publisher_id,new.id,'meeting_preparation',new.presenter_user_id,new.scheduled_by,
    'Preparar reunião — '||publisher_name,
    'Revisar contexto, participantes e materiais antes da reunião comercial.',
    'meeting',prep_due,prep_status,'high',case when prep_status='done' then now() else null end,now()
  )
  on conflict (meeting_id,automation_key) where meeting_id is not null and automation_key is not null
  do update set
    publisher_id=excluded.publisher_id,
    assigned_to=excluded.assigned_to,
    title=excluded.title,
    description=excluded.description,
    due_at=excluded.due_at,
    priority=excluded.priority,
    status=case when public.tasks.status='done' and excluded.status='open' then 'done' else excluded.status end,
    completed_at=case
      when public.tasks.status='done' and excluded.status='open' then public.tasks.completed_at
      when excluded.status='done' then coalesce(public.tasks.completed_at,now())
      else null
    end,
    updated_at=now();

  insert into public.tasks(
    organization_id,publisher_id,meeting_id,automation_key,assigned_to,created_by,
    title,description,task_type,due_at,status,priority,completed_at,updated_at
  ) values (
    new.organization_id,new.publisher_id,new.id,'meeting_outcome',new.presenter_user_id,new.scheduled_by,
    'Registrar resultado — '||publisher_name,
    'Registrar resultado, interesse percebido e próximos passos após a reunião.',
    'follow_up',outcome_due,outcome_status,'medium',case when outcome_status='done' then now() else null end,now()
  )
  on conflict (meeting_id,automation_key) where meeting_id is not null and automation_key is not null
  do update set
    publisher_id=excluded.publisher_id,
    assigned_to=excluded.assigned_to,
    title=excluded.title,
    description=excluded.description,
    due_at=excluded.due_at,
    priority=excluded.priority,
    status=excluded.status,
    completed_at=case when excluded.status='done' then coalesce(public.tasks.completed_at,now()) else null end,
    updated_at=now();

  if new.status='completed' and new.follow_up_at is not null then
    follow_assignee := coalesce(new.follow_up_assigned_to,new.scheduled_by);
    insert into public.tasks(
      organization_id,publisher_id,meeting_id,automation_key,assigned_to,created_by,
      title,description,task_type,due_at,status,priority,completed_at,updated_at
    ) values (
      new.organization_id,new.publisher_id,new.id,'meeting_follow_up',follow_assignee,new.scheduled_by,
      'Follow-up pós-reunião — '||publisher_name,
      coalesce(nullif(btrim(new.next_step),''),'Retomar o contato conforme encaminhamento definido após a reunião.'),
      'follow_up',new.follow_up_at,'open','medium',null,now()
    )
    on conflict (meeting_id,automation_key) where meeting_id is not null and automation_key is not null
    do update set
      assigned_to=excluded.assigned_to,
      description=excluded.description,
      due_at=excluded.due_at,
      status=case when public.tasks.status='done' then 'done' else 'open' end,
      completed_at=case when public.tasks.status='done' then public.tasks.completed_at else null end,
      updated_at=now();
  else
    update public.tasks
      set status='cancelled',completed_at=null,updated_at=now()
    where meeting_id=new.id and automation_key='meeting_follow_up' and status<>'done';
  end if;

  return new;
end;
$$;

revoke all on function private.sync_meeting_workflow_tasks() from public;

drop trigger if exists trg_sync_meeting_workflow_tasks on public.meetings;
create trigger trg_sync_meeting_workflow_tasks
after insert or update of scheduled_start,duration_minutes,status,presenter_user_id,outcome_notes,outcome_interest,next_step,follow_up_at,follow_up_assigned_to
on public.meetings
for each row execute function private.sync_meeting_workflow_tasks();