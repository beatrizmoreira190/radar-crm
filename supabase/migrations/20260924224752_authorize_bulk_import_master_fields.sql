-- Autoriza somente a rotina controlada de importacao em massa a atualizar campos cadastrais protegidos.

CREATE OR REPLACE FUNCTION public.protect_publisher_master_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r text;
  authorized_handoff boolean:=coalesce(current_setting('app.crm_authorized_handoff',true),'')='1';
  authorized_cnpj_sync boolean:=coalesce(current_setting('app.crm_cnpj_sync',true),'')='1';
  authorized_bulk_import boolean:=coalesce(current_setting('app.crm_bulk_import',true),'')='1';
begin
  r := private.org_role(old.organization_id);

  if not authorized_cnpj_sync and not authorized_bulk_import and r not in ('owner','admin') then
    if new.name is distinct from old.name
      or new.legal_name is distinct from old.legal_name
      or new.trade_name is distinct from old.trade_name
      or new.cnpj is distinct from old.cnpj
      or new.country is distinct from old.country
      or new.city is distinct from old.city
      or new.state is distinct from old.state
      or new.postal_code is distinct from old.postal_code
      or new.address_street is distinct from old.address_street
      or new.address_number is distinct from old.address_number
      or new.address_complement is distinct from old.address_complement
      or new.neighborhood is distinct from old.neighborhood
      or new.cnae_primary is distinct from old.cnae_primary
      or new.cnae_description is distinct from old.cnae_description
      or new.legal_nature is distinct from old.legal_nature
      or new.registration_status is distinct from old.registration_status
      or new.company_size is distinct from old.company_size
      or new.estimated_revenue is distinct from old.estimated_revenue
      or new.employee_range is distinct from old.employee_range
      or new.market_segments is distinct from old.market_segments
      or new.editorial_profile is distinct from old.editorial_profile
      or new.editorial_profile_status is distinct from old.editorial_profile_status
      or new.editorial_profile_confidence is distinct from old.editorial_profile_confidence
      or new.editorial_profile_sources is distinct from old.editorial_profile_sources
      or new.editorial_profile_verified_at is distinct from old.editorial_profile_verified_at
      or new.editorial_profile_notes is distinct from old.editorial_profile_notes
    then
      raise exception 'Somente administradores podem alterar dados cadastrais da editora';
    end if;
  end if;

  if not authorized_cnpj_sync and not authorized_bulk_import and r = 'member' then
    if old.owner_user_id is null and new.owner_user_id is null then
      if (to_jsonb(new) - array['updated_at','updated_by','score','score_reason','score_updated_at','last_activity_at','last_activity_by'])
         is distinct from
         (to_jsonb(old) - array['updated_at','updated_by','score','score_reason','score_updated_at','last_activity_at','last_activity_by'])
      then
        raise exception 'Assuma a editora antes de alterar informações comerciais';
      end if;
    end if;

    if new.owner_user_id is distinct from old.owner_user_id then
      if authorized_handoff then
        null;
      elsif old.owner_user_id is null and new.owner_user_id = auth.uid() then
        null;
      elsif old.owner_user_id = auth.uid() and new.owner_user_id is null then
        null;
      else
        raise exception 'Prospectadores podem apenas assumir editoras sem responsável ou liberar editoras sob sua própria responsabilidade';
      end if;
    end if;
  end if;

  return new;
end;
$function$
