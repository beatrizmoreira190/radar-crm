-- Confirma automaticamente como Editora / empresa editorial os registros cujo
-- perfil editorial já foi confirmado pelo fluxo de enriquecimento.
-- Mantém origem distinta de revisão manual para preservar a rastreabilidade.

create or replace function private.crm_protect_publisher_commercial_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  role_name text;
  authorized_sync boolean:=coalesce(current_setting('app.crm_commercial_profile_sync',true),'')='1';
begin
  role_name:=private.org_role(old.organization_id);

  if not authorized_sync and (
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

alter table public.publishers
  drop constraint if exists publishers_commercial_profile_source_check;

alter table public.publishers
  add constraint publishers_commercial_profile_source_check
  check (commercial_profile_source in ('system_default','editorial_profile','manual'));

select set_config('app.crm_commercial_profile_sync','1',true);

update public.publishers
set commercial_profile_code='publisher_company',
    commercial_profile_source='editorial_profile',
    commercial_profile_note=case
      when nullif(btrim(coalesce(commercial_profile_note,'')),'') is null
        then 'Confirmado automaticamente a partir de perfil editorial com status Confirmado.'
      else commercial_profile_note
    end,
    commercial_profile_reviewed_at=coalesce(commercial_profile_reviewed_at,editorial_profile_verified_at,now()),
    commercial_profile_reviewed_by=null
where editorial_profile_status='confirmed'
  and commercial_profile_source='system_default';

select set_config('app.crm_commercial_profile_sync','0',true);

comment on column public.publishers.commercial_profile_source is
  'Origem da classificação comercial: system_default, editorial_profile ou manual.';
