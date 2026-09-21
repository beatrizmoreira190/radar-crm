create or replace function public.protect_publisher_master_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r text;
  authorized_handoff boolean:=coalesce(current_setting('app.crm_authorized_handoff',true),'')='1';
begin
  r := private.org_role(old.organization_id);

  if r not in ('owner','admin') then
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

  if r = 'member' then
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
$function$;

create or replace function public.crm_complete_meeting_handoff(
  p_organization_id uuid,
  p_meeting_id uuid,
  p_outcome_interest text,
  p_outcome_notes text,
  p_next_step text,
  p_follow_up_at timestamptz,
  p_follow_up_assigned_to uuid,
  p_next_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  uid uuid:=auth.uid();
  mtg public.meetings%rowtype;
  current_owner uuid;
  next_owner uuid;
  role_name text;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  select * into mtg
  from public.meetings
  where id=p_meeting_id and organization_id=p_organization_id;

  if mtg.id is null then
    raise exception 'Reunião não encontrada' using errcode='P0002';
  end if;

  role_name:=private.org_role(p_organization_id);
  if role_name not in ('owner','admin','supervisor')
     and mtg.presenter_user_id is distinct from uid
     and mtg.scheduled_by is distinct from uid then
    raise exception 'Seu perfil não permite concluir esta reunião' using errcode='42501';
  end if;

  if p_follow_up_assigned_to is not null and not exists (
    select 1 from public.org_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_follow_up_assigned_to and m.active
  ) then
    raise exception 'Responsável pelo follow-up inválido';
  end if;

  next_owner:=p_next_owner_user_id;
  if next_owner is not null and not exists (
    select 1 from public.org_members m
    where m.organization_id=p_organization_id
      and m.user_id=next_owner and m.active
  ) then
    raise exception 'Responsável pelo próximo estágio inválido';
  end if;

  update public.meetings
    set status='completed',
        outcome_interest=nullif(btrim(coalesce(p_outcome_interest,'')),''),
        outcome_notes=nullif(btrim(coalesce(p_outcome_notes,'')),''),
        next_step=nullif(btrim(coalesce(p_next_step,'')),''),
        follow_up_at=p_follow_up_at,
        follow_up_assigned_to=case when p_follow_up_at is null then null else p_follow_up_assigned_to end,
        updated_at=now()
  where id=mtg.id and organization_id=p_organization_id;

  select owner_user_id into current_owner
  from public.publishers
  where id=mtg.publisher_id and organization_id=p_organization_id;

  if next_owner is not null and next_owner is distinct from current_owner then
    perform set_config('app.crm_authorized_handoff','1',true);
    update public.publishers
      set owner_user_id=next_owner,updated_by=uid,updated_at=now()
    where id=mtg.publisher_id and organization_id=p_organization_id and not archived;
    perform set_config('app.crm_authorized_handoff','0',true);
  end if;

  return jsonb_build_object(
    'ok',true,
    'publisher_id',mtg.publisher_id,
    'previous_owner_user_id',current_owner,
    'owner_user_id',coalesce(next_owner,current_owner),
    'handoff',next_owner is not null and next_owner is distinct from current_owner
  );
end;
$$;