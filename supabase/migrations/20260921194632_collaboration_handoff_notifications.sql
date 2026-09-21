alter table public.publishers
  add column if not exists prospector_user_id uuid;

create index if not exists publishers_org_prospector_idx
  on public.publishers (organization_id, prospector_user_id)
  where prospector_user_id is not null;

alter table public.notifications
  add column if not exists actor_user_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists notifications_org_user_created_idx
  on public.notifications (organization_id, user_id, created_at desc);

create index if not exists notifications_org_user_unread_idx
  on public.notifications (organization_id, user_id, created_at desc)
  where resolved_at is null and read_at is null;

create or replace function private.can_collaborate_publisher(
  p_organization_id uuid,
  p_publisher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public','private','pg_temp'
as $$
  select exists (
    select 1
    from public.publishers p
    where p.id=p_publisher_id
      and p.organization_id=p_organization_id
      and not p.archived
      and (
        p.owner_user_id=auth.uid()
        or private.org_role(p_organization_id) in ('owner','admin','supervisor')
        or private.has_commercial_function(p_organization_id,'prospecting')
      )
  );
$$;

create or replace function private.enqueue_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_type text,
  p_severity text,
  p_title text,
  p_body text,
  p_href text,
  p_source_type text,
  p_source_id text,
  p_dedupe_key text,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
begin
  if p_user_id is null then return; end if;
  if not exists (
    select 1 from public.org_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_user_id
      and m.active
  ) then return; end if;

  insert into public.notifications(
    organization_id,user_id,type,severity,title,body,href,
    source_type,source_id,dedupe_key,actor_user_id,metadata
  )
  values (
    p_organization_id,p_user_id,left(coalesce(p_type,'other'),80),
    left(coalesce(p_severity,'info'),30),
    left(coalesce(p_title,'Notificação'),180),
    case when p_body is null then null else left(p_body,1200) end,
    case when p_href is null then null else left(p_href,500) end,
    case when p_source_type is null then null else left(p_source_type,80) end,
    case when p_source_id is null then null else left(p_source_id,180) end,
    left(coalesce(p_dedupe_key,gen_random_uuid()::text),300),
    p_actor_user_id,
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (organization_id,user_id,dedupe_key)
  do update set
    type=excluded.type,
    severity=excluded.severity,
    title=excluded.title,
    body=excluded.body,
    href=excluded.href,
    source_type=excluded.source_type,
    source_id=excluded.source_id,
    actor_user_id=excluded.actor_user_id,
    metadata=excluded.metadata,
    read_at=null,
    resolved_at=null,
    created_at=now(),
    updated_at=now();
end;
$$;

create or replace function private.ensure_publisher_prospector()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
begin
  if tg_op='INSERT' then
    if new.prospector_user_id is null and new.owner_user_id is not null then
      new.prospector_user_id:=new.owner_user_id;
    end if;
  elsif tg_op='UPDATE' and old.owner_user_id is distinct from new.owner_user_id then
    if new.prospector_user_id is null then
      new.prospector_user_id:=coalesce(old.prospector_user_id,old.owner_user_id,new.owner_user_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_publishers_preserve_prospector on public.publishers;
create trigger trg_publishers_preserve_prospector
before insert or update of owner_user_id,prospector_user_id on public.publishers
for each row execute function private.ensure_publisher_prospector();

create or replace function private.notify_publisher_responsibility_change()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  actor uuid:=auth.uid();
  new_name text;
begin
  if old.owner_user_id is not distinct from new.owner_user_id then return new; end if;

  if new.owner_user_id is not null then
    update public.opportunities
      set owner_user_id=new.owner_user_id,updated_at=now()
    where organization_id=new.organization_id
      and publisher_id=new.id
      and stage not in ('won','lost')
      and owner_user_id is distinct from new.owner_user_id;

    select coalesce(nullif(btrim(m.full_name),''),m.email,'Equipe')
      into new_name
    from public.org_members m
    where m.organization_id=new.organization_id and m.user_id=new.owner_user_id;

    if new.owner_user_id is distinct from actor then
      perform private.enqueue_notification(
        new.organization_id,new.owner_user_id,'responsibility_assigned','info',
        'Você recebeu uma editora',
        new.name||' agora está sob sua responsabilidade atual.',
        '/app/editoras/'||new.id::text,'publisher',new.id::text,
        'publisher:'||new.id::text||':owner:'||new.owner_user_id::text,
        actor,
        jsonb_build_object('old_owner_user_id',old.owner_user_id,'new_owner_user_id',new.owner_user_id)
      );
    end if;

    if old.owner_user_id is not null
       and old.owner_user_id is distinct from new.owner_user_id
       and old.owner_user_id is distinct from actor then
      perform private.enqueue_notification(
        new.organization_id,old.owner_user_id,'responsibility_transferred','info',
        'Responsabilidade transferida',
        new.name||' passou para '||coalesce(new_name,'outra pessoa da equipe')||'.',
        '/app/editoras/'||new.id::text,'publisher',new.id::text,
        'publisher:'||new.id::text||':owner-out:'||old.owner_user_id::text||':'||new.owner_user_id::text,
        actor,
        jsonb_build_object('old_owner_user_id',old.owner_user_id,'new_owner_user_id',new.owner_user_id)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_publisher_responsibility on public.publishers;
create trigger trg_notify_publisher_responsibility
after update of owner_user_id on public.publishers
for each row
when (old.owner_user_id is distinct from new.owner_user_id)
execute function private.notify_publisher_responsibility_change();

create or replace function private.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  actor uuid:=auth.uid();
  publisher_name text;
begin
  if new.assigned_to is null then return new; end if;
  if tg_op='UPDATE' and old.assigned_to is not distinct from new.assigned_to then return new; end if;
  if new.assigned_to is not distinct from actor then return new; end if;
  if coalesce(new.automation_key,'') in ('meeting_preparation','meeting_outcome') then return new; end if;

  select p.name into publisher_name
  from public.publishers p
  where p.id=new.publisher_id and p.organization_id=new.organization_id;

  perform private.enqueue_notification(
    new.organization_id,new.assigned_to,
    case when new.automation_key='meeting_follow_up' then 'followup_assigned' else 'task_assigned' end,
    case when new.priority='urgent' then 'urgent' else 'info' end,
    case when new.automation_key='meeting_follow_up' then 'Novo follow-up atribuído' else 'Nova tarefa atribuída' end,
    coalesce(new.title,'Tarefa')||case when publisher_name is not null then ' · '||publisher_name else '' end,
    case when new.publisher_id is not null then '/app/editoras/'||new.publisher_id::text else '/app/tarefas' end,
    'task',new.id::text,
    'task:'||new.id::text||':assigned:'||new.assigned_to::text,
    actor,
    jsonb_build_object('publisher_id',new.publisher_id,'due_at',new.due_at)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_task_assignment on public.tasks;
create trigger trg_notify_task_assignment
after insert or update of assigned_to on public.tasks
for each row execute function private.notify_task_assignment();

create or replace function private.notify_meeting_change()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  actor uuid:=auth.uid();
  publisher_name text;
  target uuid;
begin
  select p.name into publisher_name
  from public.publishers p
  where p.id=new.publisher_id and p.organization_id=new.organization_id;

  if tg_op='INSERT' then
    target:=new.presenter_user_id;
    if target is not null and target is distinct from actor then
      perform private.enqueue_notification(
        new.organization_id,target,'meeting_assigned','info',
        'Reunião agendada para você',
        coalesce(publisher_name,'Editora')||' · '||coalesce(new.title,'Reunião comercial'),
        '/app/editoras/'||new.publisher_id::text,'meeting',new.id::text,
        'meeting:'||new.id::text||':presenter:'||target::text,
        actor,jsonb_build_object('scheduled_start',new.scheduled_start)
      );
    end if;
    return new;
  end if;

  if old.presenter_user_id is distinct from new.presenter_user_id then
    target:=new.presenter_user_id;
    if target is not null and target is distinct from actor then
      perform private.enqueue_notification(
        new.organization_id,target,'meeting_assigned','info',
        'Você foi definido como apresentador',
        coalesce(publisher_name,'Editora')||' · '||coalesce(new.title,'Reunião comercial'),
        '/app/editoras/'||new.publisher_id::text,'meeting',new.id::text,
        'meeting:'||new.id::text||':presenter:'||target::text,
        actor,jsonb_build_object('scheduled_start',new.scheduled_start)
      );
    end if;
  elsif old.status is distinct from new.status and new.status='cancelled' then
    if new.presenter_user_id is not null and new.presenter_user_id is distinct from actor then
      perform private.enqueue_notification(
        new.organization_id,new.presenter_user_id,'meeting_cancelled','warning',
        'Reunião cancelada',coalesce(publisher_name,'Editora'),
        '/app/editoras/'||new.publisher_id::text,'meeting',new.id::text,
        'meeting:'||new.id::text||':cancelled:'||new.presenter_user_id::text,
        actor,'{}'::jsonb
      );
    end if;
    if new.scheduled_by is not null
       and new.scheduled_by is distinct from actor
       and new.scheduled_by is distinct from new.presenter_user_id then
      perform private.enqueue_notification(
        new.organization_id,new.scheduled_by,'meeting_cancelled','warning',
        'Reunião cancelada',coalesce(publisher_name,'Editora'),
        '/app/editoras/'||new.publisher_id::text,'meeting',new.id::text,
        'meeting:'||new.id::text||':cancelled:'||new.scheduled_by::text,
        actor,'{}'::jsonb
      );
    end if;
  elsif old.scheduled_start is distinct from new.scheduled_start
     or old.duration_minutes is distinct from new.duration_minutes then
    if new.presenter_user_id is not null and new.presenter_user_id is distinct from actor then
      perform private.enqueue_notification(
        new.organization_id,new.presenter_user_id,'meeting_rescheduled','info',
        'Reunião reagendada',coalesce(publisher_name,'Editora'),
        '/app/editoras/'||new.publisher_id::text,'meeting',new.id::text,
        'meeting:'||new.id::text||':rescheduled:'||new.presenter_user_id::text,
        actor,jsonb_build_object('scheduled_start',new.scheduled_start)
      );
    end if;
    if new.scheduled_by is not null
       and new.scheduled_by is distinct from actor
       and new.scheduled_by is distinct from new.presenter_user_id then
      perform private.enqueue_notification(
        new.organization_id,new.scheduled_by,'meeting_rescheduled','info',
        'Reunião reagendada',coalesce(publisher_name,'Editora'),
        '/app/editoras/'||new.publisher_id::text,'meeting',new.id::text,
        'meeting:'||new.id::text||':rescheduled:'||new.scheduled_by::text,
        actor,jsonb_build_object('scheduled_start',new.scheduled_start)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_meeting_change on public.meetings;
create trigger trg_notify_meeting_change
after insert or update of presenter_user_id,scheduled_start,duration_minutes,status on public.meetings
for each row execute function private.notify_meeting_change();

create or replace function private.notify_material_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  actor uuid:=auth.uid();
  publisher_name text;
begin
  if new.responsible_user_id is null then return new; end if;
  if tg_op='UPDATE' and old.responsible_user_id is not distinct from new.responsible_user_id then return new; end if;
  if new.responsible_user_id is not distinct from actor then return new; end if;

  select p.name into publisher_name from public.publishers p
  where p.id=new.publisher_id and p.organization_id=new.organization_id;

  perform private.enqueue_notification(
    new.organization_id,new.responsible_user_id,'material_assigned','info',
    'Material atribuído a você',
    coalesce(new.title,'Material comercial')||case when publisher_name is not null then ' · '||publisher_name else '' end,
    '/app/editoras/'||new.publisher_id::text,'material',new.id::text,
    'material:'||new.id::text||':assigned:'||new.responsible_user_id::text,
    actor,jsonb_build_object('publisher_id',new.publisher_id,'status',new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_material_assignment on public.publisher_materials;
create trigger trg_notify_material_assignment
after insert or update of responsible_user_id on public.publisher_materials
for each row execute function private.notify_material_assignment();

create or replace function public.crm_notify_mentions(
  p_organization_id uuid,
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_href text,
  p_source_type text,
  p_source_id text,
  p_dedupe_prefix text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  actor uuid:=auth.uid();
  target uuid;
  sent integer:=0;
  prefix text;
begin
  if actor is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
  prefix:=coalesce(nullif(btrim(p_dedupe_prefix),''),
    'mention:'||coalesce(p_source_type,'item')||':'||coalesce(p_source_id,gen_random_uuid()::text));

  for target in
    select distinct x from unnest(coalesce(p_user_ids,'{}'::uuid[])) x where x is not null
  loop
    if target is distinct from actor and exists (
      select 1 from public.org_members m
      where m.organization_id=p_organization_id and m.user_id=target and m.active
    ) then
      perform private.enqueue_notification(
        p_organization_id,target,'mention','info',
        coalesce(nullif(btrim(p_title),''),'Você foi mencionado'),
        p_body,p_href,p_source_type,p_source_id,
        prefix||':'||target::text,actor,'{}'::jsonb
      );
      sent:=sent+1;
    end if;
  end loop;
  return sent;
end;
$$;

revoke all on function public.crm_notify_mentions(uuid,uuid[],text,text,text,text,text,text) from public;
grant execute on function public.crm_notify_mentions(uuid,uuid[],text,text,text,text,text,text) to authenticated;
grant execute on function public.crm_notify_mentions(uuid,uuid[],text,text,text,text,text,text) to service_role;

create or replace function public.crm_complete_meeting_handoff(
  p_organization_id uuid,
  p_meeting_id uuid,
  p_outcome_interest text,
  p_outcome_notes text,
  p_next_step text,
  p_follow_up_at timestamptz,
  p_follow_up_assigned_to uuid,
  p_next_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  uid uuid:=auth.uid();
  mtg public.meetings%rowtype;
  current_owner uuid;
  next_owner uuid;
  role_name text;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  select * into mtg
  from public.meetings
  where id=p_meeting_id and organization_id=p_organization_id;

  if mtg.id is null then
    raise exception 'Reunião não encontrada' using errcode='P0002';
  end if;

  role_name:=private.org_role(p_organization_id);
  if role_name not in ('owner','admin','supervisor')
     and mtg.presenter_user_id is distinct from uid
     and mtg.scheduled_by is distinct from uid then
    raise exception 'Seu perfil não permite concluir esta reunião' using errcode='42501';
  end if;

  if p_follow_up_assigned_to is not null and not exists (
    select 1 from public.org_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_follow_up_assigned_to and m.active
  ) then
    raise exception 'Responsável pelo follow-up inválido';
  end if;

  next_owner:=p_next_owner_user_id;
  if next_owner is not null and not exists (
    select 1 from public.org_members m
    where m.organization_id=p_organization_id
      and m.user_id=next_owner and m.active
  ) then
    raise exception 'Responsável pelo próximo estágio inválido';
  end if;

  update public.meetings
    set status='completed',
        outcome_interest=nullif(btrim(coalesce(p_outcome_interest,'')),''),
        outcome_notes=nullif(btrim(coalesce(p_outcome_notes,'')),''),
        next_step=nullif(btrim(coalesce(p_next_step,'')),''),
        follow_up_at=p_follow_up_at,
        follow_up_assigned_to=case when p_follow_up_at is null then null else p_follow_up_assigned_to end,
        updated_at=now()
  where id=mtg.id and organization_id=p_organization_id;

  select owner_user_id into current_owner
  from public.publishers
  where id=mtg.publisher_id and organization_id=p_organization_id;

  if next_owner is not null and next_owner is distinct from current_owner then
    update public.publishers
      set owner_user_id=next_owner,updated_by=uid,updated_at=now()
    where id=mtg.publisher_id and organization_id=p_organization_id and not archived;
  end if;

  return jsonb_build_object(
    'ok',true,
    'publisher_id',mtg.publisher_id,
    'previous_owner_user_id',current_owner,
    'owner_user_id',coalesce(next_owner,current_owner),
    'handoff',next_owner is not null and next_owner is distinct from current_owner
  );
end;
$$;

revoke all on function public.crm_complete_meeting_handoff(uuid,uuid,text,text,text,timestamptz,uuid,uuid) from public;
grant execute on function public.crm_complete_meeting_handoff(uuid,uuid,text,text,text,timestamptz,uuid,uuid) to authenticated;
grant execute on function public.crm_complete_meeting_handoff(uuid,uuid,text,text,text,timestamptz,uuid,uuid) to service_role;

create or replace function public.crm_origin_metrics(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  uid uuid:=auth.uid();
  manager boolean;
  result jsonb;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
  manager:=private.org_role(p_organization_id) in ('owner','admin','supervisor');

  select jsonb_build_object(
    'personal',jsonb_build_object(
      'originated_publishers',(select count(*) from public.publishers p where p.organization_id=p_organization_id and not p.archived and p.prospector_user_id=uid),
      'current_responsibility',(select count(*) from public.publishers p where p.organization_id=p_organization_id and not p.archived and p.owner_user_id=uid)
    ),
    'team',case when manager then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id',m.user_id,
        'originated_publishers',(select count(*) from public.publishers p where p.organization_id=p_organization_id and not p.archived and p.prospector_user_id=m.user_id),
        'current_responsibility',(select count(*) from public.publishers p where p.organization_id=p_organization_id and not p.archived and p.owner_user_id=m.user_id)
      ) order by coalesce(m.full_name,m.email)),'[]'::jsonb)
      from public.org_members m
      where m.organization_id=p_organization_id and m.active
    ) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;

revoke all on function public.crm_origin_metrics(uuid) from public;
grant execute on function public.crm_origin_metrics(uuid) to authenticated;
grant execute on function public.crm_origin_metrics(uuid) to service_role;

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
);

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
for update to authenticated
using (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
)
with check (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
);

drop policy if exists interactions_insert on public.interactions;
create policy interactions_insert on public.interactions
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
  and (
    user_id is null or user_id=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
);

drop policy if exists interactions_update_own_or_manager on public.interactions;
create policy interactions_update_own_or_manager on public.interactions
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    user_id=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
)
with check (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
  and (
    user_id=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
);

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks
for select to authenticated
using (organization_id in (select private.current_user_org_ids()));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and (publisher_id is null or private.can_collaborate_publisher(organization_id,publisher_id))
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or (
      assigned_to=auth.uid()
      and coalesce(created_by,auth.uid())=auth.uid()
    )
  )
);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    assigned_to=auth.uid()
    or created_by=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
)
with check (
  private.is_org_member(organization_id)
  and (publisher_id is null or private.can_collaborate_publisher(organization_id,publisher_id))
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or assigned_to=auth.uid()
    or created_by=auth.uid()
  )
);

drop policy if exists opportunities_read on public.opportunities;
create policy opportunities_read on public.opportunities
for select to authenticated
using (organization_id in (select private.current_user_org_ids()));

drop policy if exists opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or (
      coalesce(created_by,auth.uid())=auth.uid()
      and (
        owner_user_id is null
        or owner_user_id=auth.uid()
        or owner_user_id=(
          select p.owner_user_id from public.publishers p
          where p.id=publisher_id and p.organization_id=organization_id
        )
      )
    )
  )
);

drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    owner_user_id=auth.uid()
    or created_by=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
)
with check (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
  and (
    owner_user_id=auth.uid()
    or created_by=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
);

drop policy if exists publisher_materials_insert on public.publisher_materials;
create policy publisher_materials_insert on public.publisher_materials
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by=auth.uid()
  and exists (
    select 1 from public.publishers p
    where p.id=publisher_id
      and p.organization_id=organization_id
      and not p.archived
  )
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);

drop policy if exists publisher_materials_update on public.publisher_materials;
create policy publisher_materials_update on public.publisher_materials
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
)
with check (
  private.is_org_member(organization_id)
  and exists (
    select 1 from public.publishers p
    where p.id=publisher_id
      and p.organization_id=organization_id
      and not p.archived
  )
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);