alter table public.meetings
  add column if not exists calendar_sync_status text not null default 'not_synced',
  add column if not exists google_event_id text,
  add column if not exists google_event_url text,
  add column if not exists google_meet_url text,
  add column if not exists google_last_synced_at timestamptz,
  add column if not exists google_sync_error text;

alter table public.meetings
  drop constraint if exists meetings_calendar_sync_status_check;
alter table public.meetings
  add constraint meetings_calendar_sync_status_check
  check (calendar_sync_status in ('not_synced','pending','synced','error'));

create table if not exists public.presenter_availability_rules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  active_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  break_start time,
  break_end time,
  buffer_minutes integer not null default 15,
  min_notice_minutes integer not null default 60,
  default_duration_minutes integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id),
  constraint presenter_availability_days_check check (active_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint presenter_availability_work_check check (work_end > work_start),
  constraint presenter_availability_break_check check ((break_start is null and break_end is null) or (break_start is not null and break_end is not null and break_end > break_start)),
  constraint presenter_availability_buffer_check check (buffer_minutes between 0 and 120),
  constraint presenter_availability_notice_check check (min_notice_minutes between 0 and 10080),
  constraint presenter_availability_duration_check check (default_duration_minutes between 10 and 480)
);

create index if not exists presenter_availability_rules_user_idx on public.presenter_availability_rules(user_id);

alter table public.presenter_availability_rules enable row level security;
revoke all on table public.presenter_availability_rules from anon;
grant select, insert, update, delete on table public.presenter_availability_rules to authenticated;

drop policy if exists presenter_availability_rules_read on public.presenter_availability_rules;
create policy presenter_availability_rules_read on public.presenter_availability_rules
for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists presenter_availability_rules_insert on public.presenter_availability_rules;
create policy presenter_availability_rules_insert on public.presenter_availability_rules
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists presenter_availability_rules_update on public.presenter_availability_rules;
create policy presenter_availability_rules_update on public.presenter_availability_rules
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('owner','admin')
  )
)
with check (
  private.is_org_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists presenter_availability_rules_delete on public.presenter_availability_rules;
create policy presenter_availability_rules_delete on public.presenter_availability_rules
for delete to authenticated
using (
  private.is_org_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('owner','admin')
  )
);

create or replace function private.protect_presenter_availability_rule()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.user_id is distinct from old.user_id then
      raise exception 'Identidade da regra de disponibilidade não pode ser alterada.' using errcode='42501';
    end if;
  end if;

  if not exists (
    select 1 from public.org_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.user_id
      and m.active = true
  ) then
    raise exception 'Usuário não pertence à organização informada.' using errcode='23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_presenter_availability_rule() from public;

drop trigger if exists trg_protect_presenter_availability_rule on public.presenter_availability_rules;
create trigger trg_protect_presenter_availability_rule
before insert or update on public.presenter_availability_rules
for each row execute function private.protect_presenter_availability_rule();
