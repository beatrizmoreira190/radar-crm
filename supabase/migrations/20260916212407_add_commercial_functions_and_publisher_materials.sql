alter table public.org_members
  add column if not exists commercial_functions text[] not null default '{}'::text[];

alter table public.org_members
  drop constraint if exists org_members_commercial_functions_check;

alter table public.org_members
  add constraint org_members_commercial_functions_check
  check (commercial_functions <@ array[
    'prospecting',
    'meeting_scheduling',
    'commercial_presentation',
    'pre_meeting_materials',
    'negotiation_materials'
  ]::text[]);

create or replace function private.protect_org_member_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
begin
  if caller is null then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Identidade e organização do membro não podem ser alteradas.' using errcode='42501';
  end if;

  caller_role := private.org_role(old.organization_id);

  if caller_role not in ('owner','admin') then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at
       or new.commercial_functions is distinct from old.commercial_functions then
      raise exception 'Somente administradores podem alterar perfil de acesso, status, e-mail ou funções comerciais.' using errcode='42501';
    end if;

    if old.user_id <> caller then
      raise exception 'Você só pode alterar o próprio perfil.' using errcode='42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.has_commercial_function(p_organization_id uuid, p_function text)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.org_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.active = true
      and p_function = any(m.commercial_functions)
  );
$$;

revoke all on function private.has_commercial_function(uuid,text) from public;
grant execute on function private.has_commercial_function(uuid,text) to authenticated;

create table if not exists public.publisher_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  material_type text not null default 'other' check (material_type in ('presentation','pre_meeting','negotiation','proposal','curation','other')),
  url text not null check (url ~* '^https?://'),
  description text,
  status text not null default 'draft' check (status in ('draft','ready','sent','archived')),
  responsible_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists publisher_materials_org_publisher_idx
  on public.publisher_materials (organization_id, publisher_id, created_at desc);

alter table public.publisher_materials enable row level security;

revoke all on table public.publisher_materials from anon;
grant select, insert, update, delete on table public.publisher_materials to authenticated;

drop policy if exists publisher_materials_read on public.publisher_materials;
create policy publisher_materials_read
on public.publisher_materials
for select
to authenticated
using (organization_id in (select private.current_user_org_ids()));

drop policy if exists publisher_materials_insert on public.publisher_materials;
create policy publisher_materials_insert
on public.publisher_materials
for insert
to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by = auth.uid()
  and exists (
    select 1 from public.publishers p
    where p.id = publisher_id and p.organization_id = organization_id
  )
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);

drop policy if exists publisher_materials_update on public.publisher_materials;
create policy publisher_materials_update
on public.publisher_materials
for update
to authenticated
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
    where p.id = publisher_id and p.organization_id = organization_id
  )
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);

drop policy if exists publisher_materials_delete on public.publisher_materials;
create policy publisher_materials_delete
on public.publisher_materials
for delete
to authenticated
using (
  private.is_org_member(organization_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);

create or replace function private.protect_publisher_material_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.publisher_id is distinct from old.publisher_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Identidade e origem do material não podem ser alteradas.' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_publisher_material_update on public.publisher_materials;
create trigger trg_protect_publisher_material_update
before update on public.publisher_materials
for each row execute function private.protect_publisher_material_update();
