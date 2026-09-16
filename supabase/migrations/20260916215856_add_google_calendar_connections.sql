create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  google_account_email text,
  calendar_id text not null default 'primary',
  encrypted_refresh_token text not null,
  granted_scopes text[] not null default '{}'::text[],
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_org_user_key unique (organization_id, user_id),
  constraint google_calendar_connections_calendar_id_check check (btrim(calendar_id) <> ''),
  constraint google_calendar_connections_token_check check (btrim(encrypted_refresh_token) <> '')
);

create index if not exists google_calendar_connections_user_id_idx on public.google_calendar_connections (user_id);
create index if not exists google_calendar_connections_org_idx on public.google_calendar_connections (organization_id);

alter table public.google_calendar_connections enable row level security;
revoke all on table public.google_calendar_connections from anon;
grant select, insert, update, delete on table public.google_calendar_connections to authenticated;

drop policy if exists google_calendar_connections_read on public.google_calendar_connections;
create policy google_calendar_connections_read on public.google_calendar_connections for select to authenticated
using (
  private.is_org_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'meeting_scheduling')
  )
);

drop policy if exists google_calendar_connections_insert on public.google_calendar_connections;
create policy google_calendar_connections_insert on public.google_calendar_connections for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and user_id = (select auth.uid())
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'commercial_presentation')
  )
);

drop policy if exists google_calendar_connections_update on public.google_calendar_connections;
create policy google_calendar_connections_update on public.google_calendar_connections for update to authenticated
using (private.is_org_member(organization_id) and user_id = (select auth.uid()))
with check (
  private.is_org_member(organization_id)
  and user_id = (select auth.uid())
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'commercial_presentation')
  )
);

drop policy if exists google_calendar_connections_delete on public.google_calendar_connections;
create policy google_calendar_connections_delete on public.google_calendar_connections for delete to authenticated
using (private.is_org_member(organization_id) and user_id = (select auth.uid()));

create or replace function private.protect_google_calendar_connection()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.user_id is distinct from old.user_id
       or new.connected_at is distinct from old.connected_at then
      raise exception 'Identidade da conexão do Google Agenda não pode ser alterada.' using errcode='42501';
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

revoke all on function private.protect_google_calendar_connection() from public;

drop trigger if exists trg_protect_google_calendar_connection on public.google_calendar_connections;
create trigger trg_protect_google_calendar_connection
before insert or update on public.google_calendar_connections
for each row execute function private.protect_google_calendar_connection();
