-- Perfil comercial interno da Radar para diferenciar editoras, autores independentes,
-- gráficas, distribuidores e outros tipos de parceiro/prospecto.
-- Os registros existentes recebem Editora / empresa editorial como padrão do sistema.

alter table public.publishers
  add column if not exists commercial_profile_code text not null default 'publisher_company',
  add column if not exists commercial_profile_source text not null default 'system_default',
  add column if not exists commercial_profile_note text,
  add column if not exists commercial_profile_reviewed_at timestamptz,
  add column if not exists commercial_profile_reviewed_by uuid;

update public.publishers
set commercial_profile_code='publisher_company'
where commercial_profile_code is null or btrim(commercial_profile_code)='';

update public.publishers
set commercial_profile_source='system_default'
where commercial_profile_source is null or btrim(commercial_profile_source)='';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='publishers_commercial_profile_code_check'
      and conrelid='public.publishers'::regclass
  ) then
    alter table public.publishers
      add constraint publishers_commercial_profile_code_check
      check (commercial_profile_code in (
        'publisher_company',
        'independent_author',
        'imprint',
        'printer',
        'book_distributor',
        'bookstore',
        'literary_agency',
        'editorial_services',
        'content_studio',
        'self_publishing_platform',
        'education_company',
        'university_press',
        'association_foundation',
        'rights_licensing',
        'digital_publishing',
        'cultural_producer',
        'other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='publishers_commercial_profile_source_check'
      and conrelid='public.publishers'::regclass
  ) then
    alter table public.publishers
      add constraint publishers_commercial_profile_source_check
      check (commercial_profile_source in ('system_default','manual'));
  end if;
end $$;

create index if not exists publishers_commercial_profile_idx
  on public.publishers(organization_id,commercial_profile_code)
  where not archived;

create or replace function private.crm_protect_publisher_commercial_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  role_name text;
begin
  role_name:=private.org_role(old.organization_id);

  if (
    new.commercial_profile_code is distinct from old.commercial_profile_code
    or new.commercial_profile_source is distinct from old.commercial_profile_source
    or new.commercial_profile_note is distinct from old.commercial_profile_note
    or new.commercial_profile_reviewed_at is distinct from old.commercial_profile_reviewed_at
    or new.commercial_profile_reviewed_by is distinct from old.commercial_profile_reviewed_by
  ) and coalesce(role_name,'') not in ('owner','admin','supervisor') then
    raise exception 'Seu perfil não permite alterar o perfil comercial da editora' using errcode='42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_protect_publisher_commercial_profile on public.publishers;
create trigger trg_protect_publisher_commercial_profile
before update of commercial_profile_code,commercial_profile_source,commercial_profile_note,commercial_profile_reviewed_at,commercial_profile_reviewed_by
on public.publishers
for each row
execute function private.crm_protect_publisher_commercial_profile();

create or replace function public.crm_set_publisher_commercial_profile(
  p_organization_id uuid,
  p_publisher_id uuid,
  p_profile_code text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid:=auth.uid();
  role_name text;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  role_name:=private.org_role(p_organization_id);
  if coalesce(role_name,'') not in ('owner','admin','supervisor') then
    raise exception 'Seu perfil não permite alterar o perfil comercial da editora' using errcode='42501';
  end if;

  if p_profile_code not in (
    'publisher_company',
    'independent_author',
    'imprint',
    'printer',
    'book_distributor',
    'bookstore',
    'literary_agency',
    'editorial_services',
    'content_studio',
    'self_publishing_platform',
    'education_company',
    'university_press',
    'association_foundation',
    'rights_licensing',
    'digital_publishing',
    'cultural_producer',
    'other'
  ) then
    raise exception 'Perfil comercial inválido';
  end if;

  update public.publishers
  set commercial_profile_code=p_profile_code,
      commercial_profile_source='manual',
      commercial_profile_note=nullif(btrim(coalesce(p_note,'')),''),
      commercial_profile_reviewed_at=now(),
      commercial_profile_reviewed_by=uid,
      updated_by=uid,
      updated_at=now()
  where id=p_publisher_id
    and organization_id=p_organization_id;

  if not found then
    raise exception 'Editora não encontrada' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'ok',true,
    'publisher_id',p_publisher_id,
    'commercial_profile_code',p_profile_code
  );
end;
$function$;

revoke all on function public.crm_set_publisher_commercial_profile(uuid,uuid,text,text) from public;
grant execute on function public.crm_set_publisher_commercial_profile(uuid,uuid,text,text) to authenticated;
