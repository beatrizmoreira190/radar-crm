-- Importacao XLSX v3 alinhada ao cadastro manual de editoras.
-- CNPJ e a chave de negocio da importacao. Editoras e pessoas usam abas separadas.

CREATE OR REPLACE FUNCTION private.ensure_publisher_prospector()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  -- Cargas administrativas em massa nao devem inventar um prospector de origem.
  if coalesce(current_setting('app.crm_bulk_import',true),'')='1' then
    return new;
  end if;

  if tg_op='INSERT' then
    if new.prospector_user_id is null and new.owner_user_id is not null then
      new.prospector_user_id:=new.owner_user_id;
    end if;
  elsif tg_op='UPDATE' and old.owner_user_id is distinct from new.owner_user_id then
    if new.prospector_user_id is null then
      new.prospector_user_id:=coalesce(old.prospector_user_id,old.owner_user_id,new.owner_user_id);
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.crm_preview_import_workbook_v3(p_organization_id uuid, p_publishers jsonb, p_contacts jsonb DEFAULT '[]'::jsonb, p_mode text DEFAULT 'skip'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  role_name text := private.org_role(p_organization_id);
  item jsonb;
  row_number text;
  publisher_name text;
  clean_cnpj text;
  state_value text;
  email_value text;
  stage_name_value text;
  owner_email_value text;
  existing_id uuid;
  existing_archived boolean;
  existing_contact_id uuid;
  publisher_id_for_contact uuid;
  row_status text;
  seen_cnpjs text[] := array[]::text[];
  seen_people text[] := array[]::text[];
  person_key text;
  kind_value text;
  person_name text;
  person_email text;

  publisher_inserted integer := 0;
  publisher_updated integer := 0;
  publisher_skipped integer := 0;
  contact_inserted integer := 0;
  contact_updated integer := 0;
  contact_skipped integer := 0;
  error_count integer := 0;
  warning_count integer := 0;
  details jsonb := '[]'::jsonb;
begin
  if role_name not in ('owner','admin','supervisor') then
    raise exception 'Apenas administradores e supervisores podem validar importacoes de editoras'
      using errcode='42501';
  end if;

  if jsonb_typeof(p_publishers) <> 'array' or jsonb_typeof(p_contacts) <> 'array' then
    raise exception 'Formato de importacao invalido';
  end if;

  if p_mode not in ('skip','update') then
    p_mode := 'skip';
  end if;

  for item in select value from jsonb_array_elements(p_publishers) loop
    begin
      row_number := coalesce(item->>'_row','?');
      publisher_name := nullif(btrim(item->>'name'),'');
      clean_cnpj := regexp_replace(coalesce(item->>'cnpj',''),'[^0-9]','','g');
      state_value := upper(nullif(btrim(item->>'state'),''));
      email_value := nullif(lower(btrim(item->>'general_email')),'');
      stage_name_value := nullif(btrim(item->>'stage_name'),'');
      owner_email_value := nullif(lower(btrim(item->>'owner_email')),'');
      existing_id := null;
      existing_archived := false;

      if publisher_name is null then
        raise exception 'Nome principal no CRM e obrigatorio';
      end if;
      if nullif(btrim(item->>'commercial_name'),'') is null then
        raise exception 'Nome comercial / marca e obrigatorio';
      end if;
      if nullif(btrim(item->>'trade_name'),'') is null then
        raise exception 'Nome fantasia oficial e obrigatorio';
      end if;
      if nullif(btrim(item->>'legal_name'),'') is null then
        raise exception 'Razao social e obrigatoria';
      end if;
      if clean_cnpj = '' then
        raise exception 'CNPJ e obrigatorio';
      end if;
      if length(clean_cnpj) <> 14 then
        raise exception 'CNPJ deve conter 14 digitos';
      end if;

      if clean_cnpj = any(seen_cnpjs) then
        raise exception 'CNPJ repetido na aba Editoras';
      end if;
      seen_cnpjs := array_append(seen_cnpjs,clean_cnpj);

      if state_value is not null
         and not (state_value = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])) then
        raise exception 'UF invalida: %',state_value;
      end if;

      if email_value is not null
         and email_value !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
        raise exception 'E-mail geral invalido';
      end if;

      if nullif(btrim(item->>'priority'),'') is not null
         and lower(btrim(item->>'priority')) not in ('low','medium','high','urgent') then
        raise exception 'Prioridade invalida';
      end if;

      if nullif(btrim(item->>'commercial_temperature'),'') is not null
         and lower(btrim(item->>'commercial_temperature')) not in ('cold','warm','hot') then
        raise exception 'Temperatura comercial invalida';
      end if;

      if nullif(btrim(item->>'commercial_profile_code'),'') is not null
         and lower(btrim(item->>'commercial_profile_code')) not in (
           'publisher_company','independent_author','imprint','printer','book_distributor','bookstore',
           'literary_agency','editorial_services','content_studio','self_publishing_platform',
           'education_company','university_press','association_foundation','rights_licensing',
           'digital_publishing','cultural_producer','other'
         ) then
        raise exception 'Perfil comercial Radar invalido';
      end if;

      if nullif(btrim(item->>'cnpj_status_date'),'') is not null then
        perform (item->>'cnpj_status_date')::date;
      end if;
      if nullif(btrim(item->>'cnpj_start_date'),'') is not null then
        perform (item->>'cnpj_start_date')::date;
      end if;
      if nullif(btrim(item->>'cnpj_special_status_date'),'') is not null then
        perform (item->>'cnpj_special_status_date')::date;
      end if;
      if nullif(btrim(item->>'next_action_at'),'') is not null then
        perform (item->>'next_action_at')::timestamptz;
      end if;

      if stage_name_value is not null and not exists (
        select 1 from public.pipeline_stages s
        where s.organization_id=p_organization_id
          and s.active
          and lower(btrim(s.name))=lower(stage_name_value)
      ) then
        raise exception 'Etapa do pipeline nao encontrada: %',stage_name_value;
      end if;

      if owner_email_value is not null and not exists (
        select 1 from public.org_members m
        where m.organization_id=p_organization_id
          and m.active
          and lower(btrim(coalesce(m.email,'')))=owner_email_value
      ) then
        raise exception 'Responsavel atual nao encontrado pelo e-mail: %',owner_email_value;
      end if;

      select p.id,p.archived
        into existing_id,existing_archived
      from public.publishers p
      where p.organization_id=p_organization_id
        and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g')=clean_cnpj
      order by p.archived,p.created_at
      limit 1;

      if existing_id is not null and existing_archived then
        raise exception 'Este CNPJ pertence a uma editora arquivada';
      end if;

      if existing_id is null then
        publisher_inserted := publisher_inserted + 1;
        row_status := 'insert';
      elsif p_mode='update' then
        publisher_updated := publisher_updated + 1;
        row_status := 'update';
      else
        publisher_skipped := publisher_skipped + 1;
        row_status := 'skip';
      end if;

      if existing_id is not null then
        details := details || jsonb_build_array(jsonb_build_object(
          'sheet','Editoras',
          'row',row_number,
          'name',publisher_name,
          'status',row_status,
          'matched_by','CNPJ',
          'warning',case when p_mode='skip'
            then 'CNPJ ja cadastrado; a linha sera preservada sem alteracao.'
            else 'CNPJ ja cadastrado; somente campos preenchidos serao atualizados.'
          end
        ));
        warning_count := warning_count + 1;
      end if;

    exception when others then
      error_count := error_count + 1;
      details := details || jsonb_build_array(jsonb_build_object(
        'sheet','Editoras',
        'row',coalesce(item->>'_row','?'),
        'name',coalesce(item->>'name',''),
        'status','error',
        'error',sqlerrm
      ));
    end;
  end loop;

  for item in select value from jsonb_array_elements(p_contacts) loop
    begin
      row_number := coalesce(item->>'_row','?');
      clean_cnpj := regexp_replace(coalesce(item->>'publisher_cnpj',''),'[^0-9]','','g');
      kind_value := lower(nullif(btrim(item->>'contact_kind'),''));
      person_name := nullif(btrim(item->>'full_name'),'');
      person_email := nullif(lower(btrim(item->>'email')),'');
      publisher_id_for_contact := null;
      existing_contact_id := null;

      if clean_cnpj = '' or length(clean_cnpj) <> 14 then
        raise exception 'CNPJ da editora e obrigatorio e deve conter 14 digitos';
      end if;
      if kind_value not in ('legal','contact') then
        raise exception 'Tipo de vinculo invalido';
      end if;
      if person_name is null then
        raise exception 'Nome da pessoa e obrigatorio';
      end if;
      if kind_value='legal' and nullif(btrim(item->>'job_title'),'') is null then
        raise exception 'Funcao / vinculo e obrigatorio para socio ou responsavel legal';
      end if;
      if person_email is not null
         and person_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
        raise exception 'E-mail da pessoa invalido';
      end if;
      if nullif(btrim(item->>'preferred_channel'),'') is not null
         and lower(btrim(item->>'preferred_channel')) not in ('phone','email','whatsapp','linkedin','other') then
        raise exception 'Canal preferencial invalido';
      end if;

      person_key := clean_cnpj||'|'||lower(person_name)||'|'||coalesce(person_email,'');
      if person_key = any(seen_people) then
        raise exception 'Pessoa repetida na aba Pessoas para o mesmo CNPJ';
      end if;
      seen_people := array_append(seen_people,person_key);

      select p.id into publisher_id_for_contact
      from public.publishers p
      where p.organization_id=p_organization_id
        and not p.archived
        and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g')=clean_cnpj
      order by p.created_at
      limit 1;

      if publisher_id_for_contact is null and not exists (
        select 1
        from jsonb_array_elements(p_publishers) pub
        where regexp_replace(coalesce(pub->>'cnpj',''),'[^0-9]','','g')=clean_cnpj
      ) then
        raise exception 'CNPJ nao localizado na base nem na aba Editoras';
      end if;

      if publisher_id_for_contact is not null then
        if person_email is not null then
          select c.id into existing_contact_id
          from public.contacts c
          where c.organization_id=p_organization_id
            and c.publisher_id=publisher_id_for_contact
            and c.active
            and lower(btrim(coalesce(c.email,'')))=person_email
          order by c.created_at
          limit 1;
        else
          select c.id into existing_contact_id
          from public.contacts c
          where c.organization_id=p_organization_id
            and c.publisher_id=publisher_id_for_contact
            and c.active
            and lower(btrim(c.full_name))=lower(person_name)
          order by c.created_at
          limit 1;
        end if;
      end if;

      if existing_contact_id is null then
        contact_inserted := contact_inserted + 1;
        row_status := 'insert';
      elsif p_mode='update' then
        contact_updated := contact_updated + 1;
        row_status := 'update';
      else
        contact_skipped := contact_skipped + 1;
        row_status := 'skip';
      end if;

      if existing_contact_id is not null then
        warning_count := warning_count + 1;
        details := details || jsonb_build_array(jsonb_build_object(
          'sheet','Pessoas',
          'row',row_number,
          'name',person_name,
          'status',row_status,
          'matched_by',case when person_email is not null then 'E-mail' else 'Nome' end,
          'warning',case when p_mode='skip'
            then 'Pessoa ja cadastrada nesta editora; sera preservada sem alteracao.'
            else 'Pessoa ja cadastrada nesta editora; somente campos preenchidos serao atualizados.'
          end
        ));
      end if;

    exception when others then
      error_count := error_count + 1;
      details := details || jsonb_build_array(jsonb_build_object(
        'sheet','Pessoas',
        'row',coalesce(item->>'_row','?'),
        'name',coalesce(item->>'full_name',''),
        'status','error',
        'error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'publishers',jsonb_build_object(
      'inserted',publisher_inserted,
      'updated',publisher_updated,
      'skipped',publisher_skipped
    ),
    'contacts',jsonb_build_object(
      'inserted',contact_inserted,
      'updated',contact_updated,
      'skipped',contact_skipped
    ),
    'errors',error_count,
    'warnings',warning_count,
    'details',details
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.crm_import_workbook_v3(p_organization_id uuid, p_publishers jsonb, p_contacts jsonb DEFAULT '[]'::jsonb, p_mode text DEFAULT 'skip'::text, p_source_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  role_name text := private.org_role(p_organization_id);
  preview jsonb;
  item jsonb;
  clean_cnpj text;
  existing_id uuid;
  publisher_id_value uuid;
  existing_contact_id uuid;
  stage_uuid uuid;
  owner_uuid uuid;
  email_value text;
  person_email text;
  person_name text;
  kind_value text;
  alternate_emails_value text[];
  editorial_profile_value text[];
  source_row_value integer;

  publisher_inserted integer := 0;
  publisher_updated integer := 0;
  publisher_skipped integer := 0;
  contact_inserted integer := 0;
  contact_updated integer := 0;
  contact_skipped integer := 0;
begin
  if role_name not in ('owner','admin','supervisor') then
    raise exception 'Apenas administradores e supervisores podem importar editoras'
      using errcode='42501';
  end if;

  if p_mode not in ('skip','update') then
    p_mode := 'skip';
  end if;

  preview := public.crm_preview_import_workbook_v3(
    p_organization_id,p_publishers,p_contacts,p_mode
  );

  if coalesce((preview->>'errors')::integer,0) > 0 then
    raise exception 'A planilha possui erros de validacao. Corrija-os antes de importar.';
  end if;

  perform set_config('app.crm_audit_suppress','1',true);
  perform set_config('app.crm_bulk_import','1',true);

  for item in select value from jsonb_array_elements(p_publishers) loop
    clean_cnpj := regexp_replace(coalesce(item->>'cnpj',''),'[^0-9]','','g');
    existing_id := null;
    stage_uuid := null;
    owner_uuid := null;
    email_value := nullif(lower(btrim(item->>'general_email')),'');
    source_row_value := nullif(item->>'_row','')::integer;

    select coalesce(array_agg(lower(btrim(value))) filter (where nullif(btrim(value),'') is not null),array[]::text[])
      into alternate_emails_value
    from jsonb_array_elements_text(coalesce(item->'alternate_emails','[]'::jsonb));

    select coalesce(array_agg(btrim(value)) filter (where nullif(btrim(value),'') is not null),array[]::text[])
      into editorial_profile_value
    from jsonb_array_elements_text(coalesce(item->'editorial_profile','[]'::jsonb));

    if nullif(btrim(item->>'stage_name'),'') is not null then
      select s.id into stage_uuid
      from public.pipeline_stages s
      where s.organization_id=p_organization_id
        and s.active
        and lower(btrim(s.name))=lower(btrim(item->>'stage_name'))
      limit 1;
    end if;

    if nullif(btrim(item->>'owner_email'),'') is not null then
      select m.user_id into owner_uuid
      from public.org_members m
      where m.organization_id=p_organization_id
        and m.active
        and lower(btrim(coalesce(m.email,'')))=lower(btrim(item->>'owner_email'))
      limit 1;
    end if;

    select p.id into existing_id
    from public.publishers p
    where p.organization_id=p_organization_id
      and not p.archived
      and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g')=clean_cnpj
    order by p.created_at
    limit 1;

    if existing_id is not null and p_mode='skip' then
      publisher_skipped := publisher_skipped + 1;
      continue;
    end if;

    if existing_id is not null then
      update public.publishers p
      set
        name = coalesce(nullif(btrim(item->>'name'),''),p.name),
        commercial_name = coalesce(nullif(btrim(item->>'commercial_name'),''),p.commercial_name),
        trade_name = coalesce(nullif(btrim(item->>'trade_name'),''),p.trade_name),
        legal_name = coalesce(nullif(btrim(item->>'legal_name'),''),p.legal_name),
        website = coalesce(nullif(btrim(item->>'website'),''),p.website),
        country = coalesce(nullif(btrim(item->>'country'),''),p.country),
        city = coalesce(nullif(btrim(item->>'city'),''),p.city),
        state = coalesce(upper(nullif(btrim(item->>'state'),'')),p.state),
        postal_code = coalesce(nullif(btrim(item->>'postal_code'),''),p.postal_code),
        address_type = coalesce(nullif(btrim(item->>'address_type'),''),p.address_type),
        address_street = coalesce(nullif(btrim(item->>'address_street'),''),p.address_street),
        address_number = coalesce(nullif(btrim(item->>'address_number'),''),p.address_number),
        address_complement = coalesce(nullif(btrim(item->>'address_complement'),''),p.address_complement),
        neighborhood = coalesce(nullif(btrim(item->>'neighborhood'),''),p.neighborhood),
        phone = coalesce(nullif(btrim(item->>'phone'),''),p.phone),
        secondary_phone = coalesce(nullif(btrim(item->>'secondary_phone'),''),p.secondary_phone),
        general_email = coalesce(email_value,p.general_email),
        alternate_emails = case when cardinality(alternate_emails_value)>0 then alternate_emails_value else p.alternate_emails end,
        linkedin_url = coalesce(nullif(btrim(item->>'linkedin_url'),''),p.linkedin_url),
        instagram = coalesce(nullif(btrim(item->>'instagram'),''),p.instagram),
        ibge_code = coalesce(nullif(btrim(item->>'ibge_code'),''),p.ibge_code),
        cnae_primary = coalesce(nullif(btrim(item->>'cnae_primary'),''),p.cnae_primary),
        cnae_description = coalesce(nullif(btrim(item->>'cnae_description'),''),p.cnae_description),
        cnae_secondary = coalesce(nullif(btrim(item->>'cnae_secondary'),''),p.cnae_secondary),
        matrix_branch = coalesce(nullif(btrim(item->>'matrix_branch'),''),p.matrix_branch),
        registration_status = coalesce(nullif(btrim(item->>'registration_status'),''),p.registration_status),
        legal_nature = coalesce(nullif(btrim(item->>'legal_nature'),''),p.legal_nature),
        company_size = coalesce(nullif(btrim(item->>'company_size'),''),p.company_size),
        size_label = coalesce(nullif(btrim(item->>'size_label'),''),p.size_label),
        tax_regime = coalesce(nullif(btrim(item->>'tax_regime'),''),p.tax_regime),
        simples_nacional = coalesce(nullif(btrim(item->>'simples_nacional'),''),p.simples_nacional),
        mei = coalesce(nullif(btrim(item->>'mei'),''),p.mei),
        share_capital = coalesce(nullif(btrim(item->>'share_capital'),''),p.share_capital),
        estimated_revenue = coalesce(nullif(btrim(item->>'estimated_revenue'),''),p.estimated_revenue),
        employee_range = coalesce(nullif(btrim(item->>'employee_range'),''),p.employee_range),
        age_range = coalesce(nullif(btrim(item->>'age_range'),''),p.age_range),
        cnpj_status_date = coalesce(nullif(btrim(item->>'cnpj_status_date'),'')::date,p.cnpj_status_date),
        cnpj_status_reason = coalesce(nullif(btrim(item->>'cnpj_status_reason'),''),p.cnpj_status_reason),
        cnpj_start_date = coalesce(nullif(btrim(item->>'cnpj_start_date'),'')::date,p.cnpj_start_date),
        cnpj_special_status = coalesce(nullif(btrim(item->>'cnpj_special_status'),''),p.cnpj_special_status),
        cnpj_special_status_date = coalesce(nullif(btrim(item->>'cnpj_special_status_date'),'')::date,p.cnpj_special_status_date),
        editorial_profile = case when cardinality(editorial_profile_value)>0 then editorial_profile_value else p.editorial_profile end,
        editorial_profile_status = case when cardinality(editorial_profile_value)>0 then 'confirmed' else p.editorial_profile_status end,
        editorial_profile_confidence = case when cardinality(editorial_profile_value)>0 then 'high' else p.editorial_profile_confidence end,
        commercial_profile_code = coalesce(nullif(lower(btrim(item->>'commercial_profile_code')),''),p.commercial_profile_code),
        commercial_profile_source = case when nullif(btrim(item->>'commercial_profile_code'),'') is not null then 'manual' else p.commercial_profile_source end,
        commercial_profile_note = coalesce(nullif(btrim(item->>'commercial_profile_note'),''),p.commercial_profile_note),
        commercial_profile_reviewed_at = case when nullif(btrim(item->>'commercial_profile_code'),'') is not null then now() else p.commercial_profile_reviewed_at end,
        commercial_profile_reviewed_by = case when nullif(btrim(item->>'commercial_profile_code'),'') is not null then uid else p.commercial_profile_reviewed_by end,
        priority = coalesce(nullif(lower(btrim(item->>'priority')),''),p.priority),
        stage_id = coalesce(stage_uuid,p.stage_id),
        owner_user_id = case when nullif(btrim(item->>'owner_email'),'') is not null then owner_uuid else p.owner_user_id end,
        commercial_temperature = coalesce(nullif(lower(btrim(item->>'commercial_temperature')),''),p.commercial_temperature),
        next_action_at = coalesce(nullif(btrim(item->>'next_action_at'),'')::timestamptz,p.next_action_at),
        notes = coalesce(nullif(btrim(item->>'notes'),''),p.notes),
        source = 'xlsx_import',
        source_sheet = 'Editoras',
        source_row = source_row_value,
        imported_at = now(),
        updated_by = uid,
        updated_at = now()
      where p.id=existing_id
        and p.organization_id=p_organization_id;

      publisher_updated := publisher_updated + 1;
    else
      insert into public.publishers(
        organization_id,name,commercial_name,trade_name,legal_name,cnpj,
        website,country,city,state,postal_code,address_type,address_street,address_number,address_complement,neighborhood,
        phone,secondary_phone,general_email,alternate_emails,linkedin_url,instagram,ibge_code,
        cnae_primary,cnae_description,cnae_secondary,matrix_branch,registration_status,legal_nature,
        company_size,size_label,tax_regime,simples_nacional,mei,share_capital,estimated_revenue,employee_range,age_range,
        cnpj_status_date,cnpj_status_reason,cnpj_start_date,cnpj_special_status,cnpj_special_status_date,
        editorial_profile,editorial_profile_status,editorial_profile_confidence,
        commercial_profile_code,commercial_profile_source,commercial_profile_note,commercial_profile_reviewed_at,commercial_profile_reviewed_by,
        priority,stage_id,owner_user_id,prospector_user_id,commercial_temperature,next_action_at,notes,
        source,source_sheet,source_row,imported_at,archived,created_by,updated_by
      )
      values(
        p_organization_id,
        btrim(item->>'name'),
        btrim(item->>'commercial_name'),
        btrim(item->>'trade_name'),
        btrim(item->>'legal_name'),
        clean_cnpj,
        nullif(btrim(item->>'website'),''),
        coalesce(nullif(btrim(item->>'country'),''),'Brasil'),
        nullif(btrim(item->>'city'),''),
        upper(nullif(btrim(item->>'state'),'')),
        nullif(btrim(item->>'postal_code'),''),
        nullif(btrim(item->>'address_type'),''),
        nullif(btrim(item->>'address_street'),''),
        nullif(btrim(item->>'address_number'),''),
        nullif(btrim(item->>'address_complement'),''),
        nullif(btrim(item->>'neighborhood'),''),
        nullif(btrim(item->>'phone'),''),
        nullif(btrim(item->>'secondary_phone'),''),
        email_value,
        alternate_emails_value,
        nullif(btrim(item->>'linkedin_url'),''),
        nullif(btrim(item->>'instagram'),''),
        nullif(btrim(item->>'ibge_code'),''),
        nullif(btrim(item->>'cnae_primary'),''),
        nullif(btrim(item->>'cnae_description'),''),
        nullif(btrim(item->>'cnae_secondary'),''),
        nullif(btrim(item->>'matrix_branch'),''),
        nullif(btrim(item->>'registration_status'),''),
        nullif(btrim(item->>'legal_nature'),''),
        nullif(btrim(item->>'company_size'),''),
        nullif(btrim(item->>'size_label'),''),
        nullif(btrim(item->>'tax_regime'),''),
        nullif(btrim(item->>'simples_nacional'),''),
        nullif(btrim(item->>'mei'),''),
        nullif(btrim(item->>'share_capital'),''),
        nullif(btrim(item->>'estimated_revenue'),''),
        nullif(btrim(item->>'employee_range'),''),
        nullif(btrim(item->>'age_range'),''),
        nullif(btrim(item->>'cnpj_status_date'),'')::date,
        nullif(btrim(item->>'cnpj_status_reason'),''),
        nullif(btrim(item->>'cnpj_start_date'),'')::date,
        nullif(btrim(item->>'cnpj_special_status'),''),
        nullif(btrim(item->>'cnpj_special_status_date'),'')::date,
        editorial_profile_value,
        case when cardinality(editorial_profile_value)>0 then 'confirmed' else 'pending' end,
        case when cardinality(editorial_profile_value)>0 then 'high' else null end,
        coalesce(nullif(lower(btrim(item->>'commercial_profile_code')),''),'publisher_company'),
        case when nullif(btrim(item->>'commercial_profile_code'),'') is not null then 'manual' else 'system_default' end,
        nullif(btrim(item->>'commercial_profile_note'),''),
        case when nullif(btrim(item->>'commercial_profile_code'),'') is not null then now() else null end,
        case when nullif(btrim(item->>'commercial_profile_code'),'') is not null then uid else null end,
        coalesce(nullif(lower(btrim(item->>'priority')),''),'medium'),
        stage_uuid,
        owner_uuid,
        null,
        nullif(lower(btrim(item->>'commercial_temperature')),''),
        nullif(btrim(item->>'next_action_at'),'')::timestamptz,
        nullif(btrim(item->>'notes'),''),
        'xlsx_import',
        'Editoras',
        source_row_value,
        now(),
        false,
        uid,
        uid
      );
      publisher_inserted := publisher_inserted + 1;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_contacts) loop
    clean_cnpj := regexp_replace(coalesce(item->>'publisher_cnpj',''),'[^0-9]','','g');
    kind_value := lower(btrim(item->>'contact_kind'));
    person_name := btrim(item->>'full_name');
    person_email := nullif(lower(btrim(item->>'email')),'');
    publisher_id_value := null;
    existing_contact_id := null;

    select p.id into publisher_id_value
    from public.publishers p
    where p.organization_id=p_organization_id
      and not p.archived
      and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g')=clean_cnpj
    order by p.created_at
    limit 1;

    if publisher_id_value is null then
      raise exception 'Nao foi possivel vincular a pessoa % ao CNPJ %',person_name,clean_cnpj;
    end if;

    if person_email is not null then
      select c.id into existing_contact_id
      from public.contacts c
      where c.organization_id=p_organization_id
        and c.publisher_id=publisher_id_value
        and c.active
        and lower(btrim(coalesce(c.email,'')))=person_email
      order by c.created_at
      limit 1;
    else
      select c.id into existing_contact_id
      from public.contacts c
      where c.organization_id=p_organization_id
        and c.publisher_id=publisher_id_value
        and c.active
        and lower(btrim(c.full_name))=lower(person_name)
      order by c.created_at
      limit 1;
    end if;

    if existing_contact_id is not null and p_mode='skip' then
      contact_skipped := contact_skipped + 1;
      continue;
    end if;

    if existing_contact_id is not null then
      update public.contacts c
      set
        full_name = coalesce(nullif(btrim(item->>'full_name'),''),c.full_name),
        job_title = coalesce(nullif(btrim(item->>'job_title'),''),c.job_title),
        department = coalesce(nullif(btrim(item->>'department'),''),c.department),
        email = coalesce(person_email,c.email),
        phone = coalesce(nullif(btrim(item->>'phone'),''),c.phone),
        mobile = coalesce(nullif(btrim(item->>'mobile'),''),c.mobile),
        linkedin_url = coalesce(nullif(btrim(item->>'linkedin_url'),''),c.linkedin_url),
        preferred_channel = coalesce(nullif(lower(btrim(item->>'preferred_channel')),''),c.preferred_channel),
        is_decision_maker = case when item ? 'is_decision_maker' then coalesce((item->>'is_decision_maker')::boolean,c.is_decision_maker) else c.is_decision_maker end,
        notes = coalesce(nullif(btrim(item->>'notes'),''),c.notes),
        source_ref = coalesce(c.source_ref,case when kind_value='legal' then 'xlsx_import:legal' else 'xlsx_import:contact' end),
        updated_by = uid,
        updated_at = now()
      where c.id=existing_contact_id
        and c.organization_id=p_organization_id;
      contact_updated := contact_updated + 1;
    else
      insert into public.contacts(
        organization_id,publisher_id,full_name,job_title,department,email,phone,mobile,linkedin_url,
        is_decision_maker,preferred_channel,notes,active,created_by,updated_by,source_ref
      )
      values(
        p_organization_id,publisher_id_value,person_name,
        nullif(btrim(item->>'job_title'),''),
        nullif(btrim(item->>'department'),''),
        person_email,
        nullif(btrim(item->>'phone'),''),
        nullif(btrim(item->>'mobile'),''),
        nullif(btrim(item->>'linkedin_url'),''),
        coalesce((item->>'is_decision_maker')::boolean,false),
        nullif(lower(btrim(item->>'preferred_channel')),''),
        nullif(btrim(item->>'notes'),''),
        true,uid,uid,
        case when kind_value='legal' then 'xlsx_import:legal' else 'xlsx_import:contact' end
      );
      contact_inserted := contact_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'publishers',jsonb_build_object(
      'inserted',publisher_inserted,
      'updated',publisher_updated,
      'skipped',publisher_skipped
    ),
    'contacts',jsonb_build_object(
      'inserted',contact_inserted,
      'updated',contact_updated,
      'skipped',contact_skipped
    ),
    'errors',0,
    'warnings',0,
    'details','[]'::jsonb,
    'source_name',p_source_name
  );
end;
$function$


revoke all on function public.crm_preview_import_workbook_v3(uuid,jsonb,jsonb,text) from public;
revoke all on function public.crm_preview_import_workbook_v3(uuid,jsonb,jsonb,text) from anon;
grant execute on function public.crm_preview_import_workbook_v3(uuid,jsonb,jsonb,text) to authenticated;

revoke all on function public.crm_import_workbook_v3(uuid,jsonb,jsonb,text,text) from public;
revoke all on function public.crm_import_workbook_v3(uuid,jsonb,jsonb,text,text) from anon;
grant execute on function public.crm_import_workbook_v3(uuid,jsonb,jsonb,text,text) to authenticated;
