-- Arquivamento manual de editoras com motivo obrigatório.
-- Restrito a owner/admin/supervisor. Preserva histórico e encerra pendências operacionais.

alter table public.publishers
  add column if not exists archive_reason_code text,
  add column if not exists archive_reason_note text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='publishers_archive_reason_code_check'
      and conrelid='public.publishers'::regclass
  ) then
    alter table public.publishers
      add constraint publishers_archive_reason_code_check
      check (
        archive_reason_code is null
        or archive_reason_code in (
          'competitor',
          'no_interest',
          'no_fit',
          'duplicate',
          'inactive',
          'other'
        )
      );
  end if;
end $$;

create index if not exists publishers_archived_reason_idx
  on public.publishers(organization_id,archive_reason_code)
  where archived;

create or replace function public.crm_archive_publisher(
  p_organization_id uuid,
  p_publisher_id uuid,
  p_reason_code text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid:=auth.uid();
  role_name text;
  publisher_name text;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  role_name:=private.org_role(p_organization_id);
  if coalesce(role_name,'') not in ('owner','admin','supervisor') then
    raise exception 'Seu perfil não permite arquivar editoras' using errcode='42501';
  end if;

  if p_reason_code not in ('competitor','no_interest','no_fit','duplicate','inactive','other') then
    raise exception 'Selecione um motivo válido para arquivar a editora';
  end if;

  if p_reason_code='other' and nullif(btrim(coalesce(p_reason_note,'')),'') is null then
    raise exception 'Descreva o motivo do arquivamento';
  end if;

  select p.name into publisher_name
  from public.publishers p
  where p.id=p_publisher_id
    and p.organization_id=p_organization_id
    and not p.archived
  for update;

  if publisher_name is null then
    raise exception 'Editora não encontrada ou já arquivada' using errcode='P0002';
  end if;

  update public.publishers
  set archived=true,
      archive_reason_code=p_reason_code,
      archive_reason_note=nullif(btrim(coalesce(p_reason_note,'')),''),
      archived_at=now(),
      archived_by=uid,
      next_action_at=null,
      updated_by=uid,
      updated_at=now()
  where id=p_publisher_id
    and organization_id=p_organization_id;

  update public.tasks
  set status='cancelled',
      updated_at=now()
  where organization_id=p_organization_id
    and publisher_id=p_publisher_id
    and status in ('open','in_progress');

  update public.cadence_enrollments
  set status='cancelled',
      completed_at=coalesce(completed_at,now()),
      paused_until=null,
      pause_reason=coalesce(nullif(pause_reason,''),'Editora arquivada manualmente')
  where organization_id=p_organization_id
    and publisher_id=p_publisher_id
    and status in ('active','paused');

  return jsonb_build_object(
    'ok',true,
    'publisher_id',p_publisher_id,
    'publisher_name',publisher_name,
    'reason_code',p_reason_code
  );
end;
$function$;

revoke all on function public.crm_archive_publisher(uuid,uuid,text,text) from public;
grant execute on function public.crm_archive_publisher(uuid,uuid,text,text) to authenticated;
