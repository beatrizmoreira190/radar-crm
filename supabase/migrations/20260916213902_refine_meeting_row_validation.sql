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
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.org_members m
      where m.organization_id = new.organization_id
        and m.user_id = new.scheduled_by
        and m.active = true
    ) then
      raise exception 'O responsável pelo agendamento precisa ser membro ativo da organização.' using errcode='23514';
    end if;
  end if;

  if tg_op = 'INSERT' or new.presenter_user_id is distinct from old.presenter_user_id then
    if not exists (
      select 1 from public.org_members m
      where m.organization_id = new.organization_id
        and m.user_id = new.presenter_user_id
        and m.active = true
        and 'commercial_presentation' = any(m.commercial_functions)
    ) then
      raise exception 'O apresentador precisa ter a função comercial Apresentação comercial.' using errcode='23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.publishers p
      where p.id = new.publisher_id
        and p.organization_id = new.organization_id
    ) then
      raise exception 'A editora não pertence à organização da reunião.' using errcode='23514';
    end if;
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
