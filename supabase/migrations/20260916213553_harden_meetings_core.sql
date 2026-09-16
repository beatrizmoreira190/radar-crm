create index if not exists meetings_publisher_id_idx on public.meetings (publisher_id);
create index if not exists meeting_participants_organization_id_idx on public.meeting_participants (organization_id);

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
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.meeting_id is distinct from old.meeting_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Identidade, reunião e origem do participante não podem ser alteradas.' using errcode='42501';
    end if;
  end if;

  if new.source = 'crm_contact' and new.contact_id is null then
    raise exception 'Participantes vindos do CRM precisam manter o vínculo com o contato.' using errcode='23514';
  end if;

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
