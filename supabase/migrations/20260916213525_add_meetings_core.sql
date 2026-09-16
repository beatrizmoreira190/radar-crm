create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  title text not null default 'Apresentação comercial' check (btrim(title) <> ''),
  meeting_type text not null default 'presentation' check (meeting_type in ('presentation','negotiation','follow_up','other')),
  scheduled_start timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 10 and 480),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','no_show')),
  scheduled_by uuid not null references auth.users(id) on delete restrict,
  presenter_user_id uuid not null references auth.users(id) on delete restrict,
  notes text,
  outcome_notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_org_publisher_start_idx
  on public.meetings (organization_id, publisher_id, scheduled_start desc);
create index if not exists meetings_presenter_start_idx
  on public.meetings (presenter_user_id, scheduled_start);
create index if not exists meetings_scheduled_by_idx
  on public.meetings (scheduled_by);
create index if not exists meetings_created_by_idx
  on public.meetings (created_by);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  source text not null default 'manual' check (source in ('crm_contact','manual')),
  full_name text not null check (btrim(full_name) <> ''),
  email text,
  job_title text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists meeting_participants_meeting_idx
  on public.meeting_participants (meeting_id);
create index if not exists meeting_participants_contact_idx
  on public.meeting_participants (contact_id);
create index if not exists meeting_participants_created_by_idx
  on public.meeting_participants (created_by);

alter table public.publisher_materials
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null;
create index if not exists publisher_materials_meeting_id_idx
  on public.publisher_materials (meeting_id);

alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;

revoke all on table public.meetings from anon;
revoke all on table public.meeting_participants from anon;
grant select, insert, update, delete on table public.meetings to authenticated;
grant select, insert, update, delete on table public.meeting_participants to authenticated;

create or replace function private.validate_meeting_row()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
begin
  if not exists (
    select 1 from public.org_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.scheduled_by
      and m.active = true
  ) then
    raise exception 'O responsável pelo agendamento precisa ser membro ativo da organização.' using errcode='23514';
  end if;

  if not exists (
    select 1 from public.org_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.presenter_user_id
      and m.active = true
      and 'commercial_presentation' = any(m.commercial_functions)
  ) then
    raise exception 'O apresentador precisa ter a função comercial Apresentação comercial.' using errcode='23514';
  end if;

  if not exists (
    select 1 from public.publishers p
    where p.id = new.publisher_id
      and p.organization_id = new.organization_id
  ) then
    raise exception 'A editora não pertence à organização da reunião.' using errcode='23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.publisher_id is distinct from old.publisher_id
       or new.scheduled_by is distinct from old.scheduled_by
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Identidade, organização, editora e origem da reunião não podem ser alteradas.' using errcode='42501';
    end if;

    if caller is not null then
      caller_role := private.org_role(old.organization_id);
      if caller_role not in ('owner','admin','supervisor')
         and caller = old.presenter_user_id
         and caller <> old.scheduled_by then
        if new.title is distinct from old.title
           or new.meeting_type is distinct from old.meeting_type
           or new.scheduled_start is distinct from old.scheduled_start
           or new.duration_minutes is distinct from old.duration_minutes
           or new.presenter_user_id is distinct from old.presenter_user_id then
          raise exception 'O apresentador pode atualizar status e registros da reunião, mas não alterar o agendamento.' using errcode='42501';
        end if;
      end if;
    end if;

    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.validate_meeting_row() from public;

drop trigger if exists trg_validate_meeting_row on public.meetings;
create trigger trg_validate_meeting_row
before insert or update on public.meetings
for each row execute function private.validate_meeting_row();

create or replace function private.validate_meeting_participant_row()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  meeting_org uuid;
  meeting_publisher uuid;
begin
  select m.organization_id, m.publisher_id
    into meeting_org, meeting_publisher
  from public.meetings m
  where m.id = new.meeting_id;

  if meeting_org is null then
    raise exception 'Reunião não encontrada.' using errcode='23503';
  end if;

  if meeting_org <> new.organization_id then
    raise exception 'Participante e reunião precisam pertencer à mesma organização.' using errcode='23514';
  end if;

  if new.contact_id is not null then
    if not exists (
      select 1 from public.contacts c
      where c.id = new.contact_id
        and c.organization_id = new.organization_id
        and c.publisher_id = meeting_publisher
    ) then
      raise exception 'O contato selecionado não pertence à editora desta reunião.' using errcode='23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_meeting_participant_row() from public;

drop trigger if exists trg_validate_meeting_participant_row on public.meeting_participants;
create trigger trg_validate_meeting_participant_row
before insert or update on public.meeting_participants
for each row execute function private.validate_meeting_participant_row();

create or replace function private.validate_publisher_material_meeting()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.meeting_id is not null and not exists (
    select 1 from public.meetings m
    where m.id = new.meeting_id
      and m.organization_id = new.organization_id
      and m.publisher_id = new.publisher_id
  ) then
    raise exception 'O material só pode ser vinculado a uma reunião da mesma editora.' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_publisher_material_meeting() from public;

drop trigger if exists trg_validate_publisher_material_meeting on public.publisher_materials;
create trigger trg_validate_publisher_material_meeting
before insert or update on public.publisher_materials
for each row execute function private.validate_publisher_material_meeting();

drop policy if exists meetings_read on public.meetings;
create policy meetings_read
on public.meetings
for select
to authenticated
using (organization_id in (select private.current_user_org_ids()));

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert
on public.meetings
for insert
to authenticated
with check (
  private.is_org_member(organization_id)
  and scheduled_by = (select auth.uid())
  and created_by = (select auth.uid())
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'meeting_scheduling')
  )
);

drop policy if exists meetings_update on public.meetings;
create policy meetings_update
on public.meetings
for update
to authenticated
using (
  private.is_org_member(organization_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or scheduled_by = (select auth.uid())
    or presenter_user_id = (select auth.uid())
  )
)
with check (
  private.is_org_member(organization_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or scheduled_by = (select auth.uid())
    or presenter_user_id = (select auth.uid())
  )
);

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete
on public.meetings
for delete
to authenticated
using (
  private.is_org_member(organization_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or scheduled_by = (select auth.uid())
  )
);

drop policy if exists meeting_participants_read on public.meeting_participants;
create policy meeting_participants_read
on public.meeting_participants
for select
to authenticated
using (organization_id in (select private.current_user_org_ids()));

drop policy if exists meeting_participants_insert on public.meeting_participants;
create policy meeting_participants_insert
on public.meeting_participants
for insert
to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id
      and m.organization_id = organization_id
      and (
        private.org_role(organization_id) in ('owner','admin','supervisor')
        or m.scheduled_by = (select auth.uid())
      )
  )
);

drop policy if exists meeting_participants_update on public.meeting_participants;
create policy meeting_participants_update
on public.meeting_participants
for update
to authenticated
using (
  private.is_org_member(organization_id)
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id
      and m.organization_id = organization_id
      and (
        private.org_role(organization_id) in ('owner','admin','supervisor')
        or m.scheduled_by = (select auth.uid())
      )
  )
)
with check (
  private.is_org_member(organization_id)
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id
      and m.organization_id = organization_id
      and (
        private.org_role(organization_id) in ('owner','admin','supervisor')
        or m.scheduled_by = (select auth.uid())
      )
  )
);

drop policy if exists meeting_participants_delete on public.meeting_participants;
create policy meeting_participants_delete
on public.meeting_participants
for delete
to authenticated
using (
  private.is_org_member(organization_id)
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id
      and m.organization_id = organization_id
      and (
        private.org_role(organization_id) in ('owner','admin','supervisor')
        or m.scheduled_by = (select auth.uid())
      )
  )
);

create or replace function private.audit_meeting_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor uuid := auth.uid();
  lbl text;
begin
  lbl := case tg_op
    when 'INSERT' then 'Agendou reunião'
    when 'UPDATE' then case
      when new.status is distinct from old.status and new.status = 'completed' then 'Concluiu reunião'
      when new.status is distinct from old.status and new.status = 'cancelled' then 'Cancelou reunião'
      when new.scheduled_start is distinct from old.scheduled_start then 'Reagendou reunião'
      else 'Atualizou reunião'
    end
    else 'Excluiu reunião'
  end;

  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, action, label, before_data, after_data
  ) values (
    coalesce(new.organization_id, old.organization_id),
    actor,
    'meetings',
    coalesce(new.id, old.id)::text,
    lower(tg_op),
    lbl,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_meeting_change() from public;

drop trigger if exists trg_audit_meeting_change on public.meetings;
create trigger trg_audit_meeting_change
after insert or update or delete on public.meetings
for each row execute function private.audit_meeting_change();
