alter table public.google_calendar_connections alter column encrypted_refresh_token drop not null;

alter table public.google_calendar_connections
  add column if not exists connection_method text not null default 'apps_script',
  add column if not exists bridge_url text,
  add column if not exists bridge_key text,
  add column if not exists bridge_status text not null default 'pending',
  add column if not exists last_verified_at timestamptz;

alter table public.google_calendar_connections
  drop constraint if exists google_calendar_connections_method_check,
  drop constraint if exists google_calendar_connections_bridge_status_check,
  drop constraint if exists google_calendar_connections_bridge_url_check,
  drop constraint if exists google_calendar_connections_bridge_key_check;

alter table public.google_calendar_connections
  add constraint google_calendar_connections_method_check check (connection_method = 'apps_script'),
  add constraint google_calendar_connections_bridge_status_check check (bridge_status in ('pending','connected','error')),
  add constraint google_calendar_connections_bridge_url_check check (bridge_url is null or bridge_url ~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec(?:\?.*)?$'),
  add constraint google_calendar_connections_bridge_key_check check (bridge_key is null or char_length(bridge_key) >= 32);

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

  if new.connection_method = 'apps_script' and new.bridge_status = 'connected' then
    if new.bridge_url is null or new.bridge_key is null then
      raise exception 'Conexão Apps Script ativa exige URL e chave.' using errcode='23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_google_calendar_connection() from public;
