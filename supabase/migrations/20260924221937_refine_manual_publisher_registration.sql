-- Refina o cadastro manual completo de editoras.
-- CNPJ e identificacao obrigatorios, checagem antecipada de duplicidade
-- e criacao atomica da editora com pessoas vinculadas.

CREATE OR REPLACE FUNCTION public.crm_check_publisher_cnpj(p_organization_id uuid, p_cnpj text)
 RETURNS TABLE(publisher_id uuid, publisher_name text, archived boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    p.id,
    coalesce(
      nullif(btrim(p.commercial_name),''),
      nullif(btrim(p.trade_name),''),
      nullif(btrim(p.name),''),
      nullif(btrim(p.legal_name),''),
      'Editora cadastrada'
    ) as publisher_name,
    p.archived
  from public.publishers p
  where p.organization_id = p_organization_id
    and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g')
        = regexp_replace(coalesce(p_cnpj,''),'[^0-9]','','g')
    and length(regexp_replace(coalesce(p_cnpj,''),'[^0-9]','','g')) = 14
  order by p.archived, p.created_at
  limit 1;
$function$

revoke all on function public.crm_check_publisher_cnpj(uuid,text) from public;
revoke all on function public.crm_check_publisher_cnpj(uuid,text) from anon;
grant execute on function public.crm_check_publisher_cnpj(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.crm_create_publisher_manual_full(p_organization_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  role_name text;

  clean_name text := nullif(btrim(coalesce(p_payload->>'name','')),'');
  clean_commercial_name text := nullif(btrim(coalesce(p_payload->>'commercial_name','')),'');
  clean_trade_name text := nullif(btrim(coalesce(p_payload->>'trade_name','')),'');
  clean_legal_name text := nullif(btrim(coalesce(p_payload->>'legal_name','')),'');
  clean_cnpj text := regexp_replace(coalesce(p_payload->>'cnpj',''),'[^0-9]','','g');

  clean_state text := upper(nullif(btrim(coalesce(p_payload->>'state','')),''));
  clean_email text := nullif(lower(btrim(coalesce(p_payload->>'general_email',''))),'');
  clean_priority text := lower(coalesce(nullif(btrim(p_payload->>'priority'),''),'medium'));
  clean_commercial_profile text := lower(coalesce(nullif(btrim(p_payload->>'commercial_profile_code'),''),'publisher_company'));
  clean_temperature text := lower(nullif(btrim(coalesce(p_payload->>'commercial_temperature','')),''));

  stage_uuid uuid;
  owner_uuid uuid;
  duplicate_id uuid;
  duplicate_name text;
  duplicate_archived boolean;
  new_id uuid;

  alternate_emails_value text[] := array[]::text[];
  editorial_profile_value text[] := array[]::text[];

  legal_contacts jsonb := coalesce(p_payload->'legal_contacts','[]'::jsonb);
  other_contacts jsonb := coalesce(p_payload->'other_contacts','[]'::jsonb);
  person jsonb;
  person_name text;
  person_email text;
  person_job text;
  person_department text;
  person_preferred_channel text;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso nao autorizado' using errcode='42501';
  end if;

  role_name := private.org_role(p_organization_id);

  if clean_name is null then
    raise exception 'Nome principal no CRM e obrigatorio';
  end if;
  if clean_commercial_name is null then
    raise exception 'Nome comercial / marca e obrigatorio';
  end if;
  if clean_trade_name is null then
    raise exception 'Nome fantasia oficial e obrigatorio';
  end if;
  if clean_legal_name is null then
    raise exception 'Razao social e obrigatoria';
  end if;
  if clean_cnpj = '' then
    raise exception 'CNPJ e obrigatorio';
  end if;
  if length(clean_cnpj) <> 14 then
    raise exception 'CNPJ deve conter 14 digitos';
  end if;

  if clean_state is not null
     and not (clean_state = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])) then
    raise exception 'UF invalida para cadastro no Brasil';
  end if;

  if clean_email is not null
     and clean_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'Informe um e-mail geral valido';
  end if;

  if clean_priority not in ('low','medium','high','urgent') then
    raise exception 'Prioridade invalida';
  end if;

  if clean_temperature is not null and clean_temperature not in ('cold','warm','hot') then
    raise exception 'Temperatura comercial invalida';
  end if;

  if jsonb_typeof(coalesce(p_payload->'alternate_emails','[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload->'editorial_profile','[]'::jsonb)) <> 'array'
     or jsonb_typeof(legal_contacts) <> 'array'
     or jsonb_typeof(other_contacts) <> 'array' then
    raise exception 'Um ou mais campos de lista possuem formato invalido';
  end if;

  select coalesce(
    array_agg(distinct lower(btrim(value))) filter (where nullif(btrim(value),'') is not null),
    array[]::text[]
  )
  into alternate_emails_value
  from jsonb_array_elements_text(coalesce(p_payload->'alternate_emails','[]'::jsonb));

  if exists (
    select 1
    from unnest(alternate_emails_value) e
    where e !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ) then
    raise exception 'Existe um e-mail alternativo invalido';
  end if;

  select coalesce(
    array_agg(value order by lower(value)),
    array[]::text[]
  )
  into editorial_profile_value
  from (
    select min(btrim(value)) as value
    from jsonb_array_elements_text(coalesce(p_payload->'editorial_profile','[]'::jsonb))
    where nullif(btrim(value),'') is not null
    group by lower(btrim(value))
  ) normalized_profiles;

  stage_uuid := nullif(btrim(coalesce(p_payload->>'stage_id','')),'')::uuid;
  if stage_uuid is not null and not exists (
    select 1 from public.pipeline_stages s
    where s.id=stage_uuid
      and s.organization_id=p_organization_id
      and s.active
  ) then
    raise exception 'Etapa do pipeline invalida';
  end if;

  owner_uuid := nullif(btrim(coalesce(p_payload->>'owner_user_id','')),'')::uuid;
  if owner_uuid is not null then
    if role_name not in ('owner','admin','supervisor') then
      owner_uuid := null;
    elsif not exists (
      select 1 from public.org_members m
      where m.organization_id=p_organization_id
        and m.user_id=owner_uuid
        and m.active
    ) then
      raise exception 'Responsavel atual invalido';
    end if;
  end if;

  if role_name in ('owner','admin','supervisor') then
    if clean_commercial_profile not in (
      'publisher_company','independent_author','imprint','printer','book_distributor','bookstore',
      'literary_agency','editorial_services','content_studio','self_publishing_platform',
      'education_company','university_press','association_foundation','rights_licensing',
      'digital_publishing','cultural_producer','other'
    ) then
      raise exception 'Perfil comercial invalido';
    end if;
  else
    clean_commercial_profile := 'publisher_company';
  end if;

  select p.id,
         coalesce(
           nullif(btrim(p.commercial_name),''),
           nullif(btrim(p.trade_name),''),
           nullif(btrim(p.name),''),
           nullif(btrim(p.legal_name),''),
           'Editora existente'
         ),
         p.archived
    into duplicate_id,duplicate_name,duplicate_archived
  from public.publishers p
  where p.organization_id=p_organization_id
    and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g')=clean_cnpj
  order by p.archived,p.created_at
  limit 1;

  if duplicate_id is not null then
    if duplicate_archived then
      raise exception 'Este CNPJ pertence a uma editora arquivada: %', duplicate_name using errcode='23505';
    end if;
    raise exception 'Este CNPJ ja esta cadastrado para a editora: %', duplicate_name using errcode='23505';
  end if;

  -- Valida as pessoas antes de criar qualquer registro.
  for person in select value from jsonb_array_elements(legal_contacts) loop
    person_name := nullif(btrim(coalesce(person->>'full_name','')),'');
    person_job := nullif(btrim(coalesce(person->>'job_title','')),'');
    person_email := nullif(lower(btrim(coalesce(person->>'email',''))),'');
    if person_name is null then
      raise exception 'Informe o nome de todos os socios ou responsaveis legais';
    end if;
    if person_job is null then
      raise exception 'Informe a funcao ou vinculo de todos os socios ou responsaveis legais';
    end if;
    if person_email is not null
       and person_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
      raise exception 'Existe um e-mail invalido entre socios ou responsaveis legais';
    end if;
  end loop;

  for person in select value from jsonb_array_elements(other_contacts) loop
    person_name := nullif(btrim(coalesce(person->>'full_name','')),'');
    person_email := nullif(lower(btrim(coalesce(person->>'email',''))),'');
    if person_name is null then
      raise exception 'Informe o nome de todas as pessoas de contato adicionadas';
    end if;
    if person_email is not null
       and person_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
      raise exception 'Existe um e-mail invalido entre as pessoas de contato';
    end if;
  end loop;

  insert into public.publishers(
    organization_id,
    name,commercial_name,trade_name,legal_name,cnpj,
    website,country,city,state,postal_code,address_type,address_street,address_number,address_complement,neighborhood,
    phone,secondary_phone,general_email,alternate_emails,linkedin_url,instagram,ibge_code,
    cnae_primary,cnae_description,cnae_secondary,matrix_branch,registration_status,legal_nature,
    company_size,size_label,tax_regime,share_capital,estimated_revenue,employee_range,age_range,
    simples_nacional,mei,cnpj_status_date,cnpj_status_reason,cnpj_start_date,cnpj_special_status,cnpj_special_status_date,
    editorial_profile,editorial_profile_status,editorial_profile_confidence,
    commercial_profile_code,commercial_profile_source,commercial_profile_note,commercial_profile_reviewed_at,commercial_profile_reviewed_by,
    priority,stage_id,owner_user_id,prospector_user_id,next_action_at,notes,commercial_temperature,
    source,archived,created_by,updated_by
  )
  values(
    p_organization_id,
    clean_name,clean_commercial_name,clean_trade_name,clean_legal_name,clean_cnpj,
    nullif(btrim(coalesce(p_payload->>'website','')),''),
    coalesce(nullif(btrim(coalesce(p_payload->>'country','')),''),'Brasil'),
    nullif(btrim(coalesce(p_payload->>'city','')),''),
    clean_state,
    nullif(btrim(coalesce(p_payload->>'postal_code','')),''),
    nullif(btrim(coalesce(p_payload->>'address_type','')),''),
    nullif(btrim(coalesce(p_payload->>'address_street','')),''),
    nullif(btrim(coalesce(p_payload->>'address_number','')),''),
    nullif(btrim(coalesce(p_payload->>'address_complement','')),''),
    nullif(btrim(coalesce(p_payload->>'neighborhood','')),''),
    nullif(btrim(coalesce(p_payload->>'phone','')),''),
    nullif(btrim(coalesce(p_payload->>'secondary_phone','')),''),
    clean_email,
    alternate_emails_value,
    nullif(btrim(coalesce(p_payload->>'linkedin_url','')),''),
    nullif(btrim(coalesce(p_payload->>'instagram','')),''),
    nullif(btrim(coalesce(p_payload->>'ibge_code','')),''),
    nullif(btrim(coalesce(p_payload->>'cnae_primary','')),''),
    nullif(btrim(coalesce(p_payload->>'cnae_description','')),''),
    nullif(btrim(coalesce(p_payload->>'cnae_secondary','')),''),
    nullif(btrim(coalesce(p_payload->>'matrix_branch','')),''),
    nullif(btrim(coalesce(p_payload->>'registration_status','')),''),
    nullif(btrim(coalesce(p_payload->>'legal_nature','')),''),
    nullif(btrim(coalesce(p_payload->>'company_size','')),''),
    nullif(btrim(coalesce(p_payload->>'size_label','')),''),
    nullif(btrim(coalesce(p_payload->>'tax_regime','')),''),
    nullif(btrim(coalesce(p_payload->>'share_capital','')),''),
    nullif(btrim(coalesce(p_payload->>'estimated_revenue','')),''),
    nullif(btrim(coalesce(p_payload->>'employee_range','')),''),
    nullif(btrim(coalesce(p_payload->>'age_range','')),''),
    nullif(btrim(coalesce(p_payload->>'simples_nacional','')),''),
    nullif(btrim(coalesce(p_payload->>'mei','')),''),
    nullif(btrim(coalesce(p_payload->>'cnpj_status_date','')),'')::date,
    nullif(btrim(coalesce(p_payload->>'cnpj_status_reason','')),''),
    nullif(btrim(coalesce(p_payload->>'cnpj_start_date','')),'')::date,
    nullif(btrim(coalesce(p_payload->>'cnpj_special_status','')),''),
    nullif(btrim(coalesce(p_payload->>'cnpj_special_status_date','')),'')::date,
    editorial_profile_value,
    case when cardinality(editorial_profile_value)>0 then 'confirmed' else 'pending' end,
    case when cardinality(editorial_profile_value)>0 then 'high' else null end,
    clean_commercial_profile,
    case
      when role_name in ('owner','admin','supervisor')
       and nullif(btrim(coalesce(p_payload->>'commercial_profile_code','')),'') is not null
        then 'manual'
      else 'system_default'
    end,
    case when role_name in ('owner','admin','supervisor')
      then nullif(btrim(coalesce(p_payload->>'commercial_profile_note','')),'')
      else null
    end,
    case
      when role_name in ('owner','admin','supervisor')
       and nullif(btrim(coalesce(p_payload->>'commercial_profile_code','')),'') is not null
        then now()
      else null
    end,
    case
      when role_name in ('owner','admin','supervisor')
       and nullif(btrim(coalesce(p_payload->>'commercial_profile_code','')),'') is not null
        then uid
      else null
    end,
    clean_priority,stage_uuid,owner_uuid,uid,
    nullif(btrim(coalesce(p_payload->>'next_action_at','')),'')::timestamptz,
    nullif(btrim(coalesce(p_payload->>'notes','')),''),
    clean_temperature,
    'manual_crm',false,uid,uid
  )
  returning id into new_id;

  for person in select value from jsonb_array_elements(legal_contacts) loop
    person_name := btrim(person->>'full_name');
    person_job := btrim(person->>'job_title');
    person_department := nullif(btrim(coalesce(person->>'department','')),'');
    person_email := nullif(lower(btrim(coalesce(person->>'email',''))),'');
    person_preferred_channel := nullif(lower(btrim(coalesce(person->>'preferred_channel',''))),'');
    if person_preferred_channel not in ('phone','email','whatsapp','linkedin','other') then
      person_preferred_channel := null;
    end if;

    insert into public.contacts(
      organization_id,publisher_id,full_name,job_title,department,
      email,phone,mobile,linkedin_url,is_decision_maker,preferred_channel,notes,
      active,created_by,updated_by,source_ref
    )
    values(
      p_organization_id,new_id,person_name,person_job,person_department,
      person_email,
      nullif(btrim(coalesce(person->>'phone','')),''),
      nullif(btrim(coalesce(person->>'mobile','')),''),
      nullif(btrim(coalesce(person->>'linkedin_url','')),''),
      coalesce((person->>'is_decision_maker')::boolean,false),
      person_preferred_channel,
      nullif(btrim(coalesce(person->>'notes','')),''),
      true,uid,uid,'manual_crm:legal'
    );
  end loop;

  for person in select value from jsonb_array_elements(other_contacts) loop
    person_name := btrim(person->>'full_name');
    person_job := nullif(btrim(coalesce(person->>'job_title','')),'');
    person_department := nullif(btrim(coalesce(person->>'department','')),'');
    person_email := nullif(lower(btrim(coalesce(person->>'email',''))),'');
    person_preferred_channel := nullif(lower(btrim(coalesce(person->>'preferred_channel',''))),'');
    if person_preferred_channel not in ('phone','email','whatsapp','linkedin','other') then
      person_preferred_channel := null;
    end if;

    insert into public.contacts(
      organization_id,publisher_id,full_name,job_title,department,
      email,phone,mobile,linkedin_url,is_decision_maker,preferred_channel,notes,
      active,created_by,updated_by,source_ref
    )
    values(
      p_organization_id,new_id,person_name,person_job,person_department,
      person_email,
      nullif(btrim(coalesce(person->>'phone','')),''),
      nullif(btrim(coalesce(person->>'mobile','')),''),
      nullif(btrim(coalesce(person->>'linkedin_url','')),''),
      coalesce((person->>'is_decision_maker')::boolean,false),
      person_preferred_channel,
      nullif(btrim(coalesce(person->>'notes','')),''),
      true,uid,uid,'manual_crm:contact'
    );
  end loop;

  return jsonb_build_object(
    'ok',true,
    'publisher_id',new_id,
    'source','manual_crm',
    'legal_contacts_created',jsonb_array_length(legal_contacts),
    'other_contacts_created',jsonb_array_length(other_contacts)
  );
end;
$function$

revoke all on function public.crm_create_publisher_manual_full(uuid,jsonb) from public;
revoke all on function public.crm_create_publisher_manual_full(uuid,jsonb) from anon;
grant execute on function public.crm_create_publisher_manual_full(uuid,jsonb) to authenticated;
