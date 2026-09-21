-- Permite que supervisores usem o fluxo seguro de importação v2.
CREATE OR REPLACE FUNCTION public.crm_import_publishers_v2(p_organization_id uuid, p_rows jsonb, p_mode text DEFAULT 'skip'::text, p_source_name text DEFAULT NULL::text)
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
  source_ref_value text;
  state_value text;
  country_value text;
  email_value text;
  priority_value text;
  profile_status_value text;
  profile_confidence_value text;
  source_id uuid;
  cnpj_id uuid;
  existing_id uuid;
  stage_uuid uuid;
  alternate_emails_value text[];
  market_segments_value text[];
  editorial_profile_value text[];
  source_row_value integer;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  error_count integer := 0;
  warning_count integer := 0;
  details jsonb := '[]'::jsonb;
  row_warnings text[];
begin
  if role_name not in ('owner','admin','supervisor') then
    raise exception 'Apenas administradores e supervisores podem importar editoras' using errcode='42501';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato de importação inválido';
  end if;

  if p_mode not in ('skip','update') then
    p_mode := 'skip';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    begin
      row_warnings := array[]::text[];
      row_number := coalesce(item->>'_row','?');
      publisher_name := nullif(btrim(item->>'name'),'');
      clean_cnpj := regexp_replace(coalesce(item->>'cnpj',''),'[^0-9]','','g');
      source_ref_value := nullif(btrim(item->>'source_ref'),'');
      state_value := upper(nullif(btrim(item->>'state'),''));
      country_value := coalesce(nullif(btrim(item->>'country'),''),'Brasil');
      email_value := nullif(lower(btrim(item->>'general_email')),'');
      priority_value := private.crm_import_priority_value(item->>'priority');
      profile_status_value := private.crm_import_profile_status_value(item->>'editorial_profile_status');
      profile_confidence_value := private.crm_import_profile_confidence_value(item->>'editorial_profile_confidence');
      alternate_emails_value := private.crm_import_text_array(item->'alternate_emails');
      market_segments_value := private.crm_import_text_array(item->'market_segments');
      editorial_profile_value := private.crm_import_text_array(item->'editorial_profile');
      source_id := null;
      cnpj_id := null;
      existing_id := null;
      stage_uuid := null;
      source_row_value := case when row_number ~ '^[0-9]+$' then row_number::integer else null end;

      if publisher_name is null then
        raise exception 'Nome da editora é obrigatório';
      end if;

      if clean_cnpj <> '' and length(clean_cnpj) <> 14 then
        raise exception 'CNPJ deve conter 14 dígitos';
      end if;

      if state_value is not null
         and lower(country_value) in ('brasil','brazil')
         and not (state_value = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])) then
        raise exception 'UF inválida para cadastro no Brasil';
      end if;

      if email_value is not null
         and email_value !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
        email_value := null;
        row_warnings := array_append(row_warnings,'E-mail geral inválido; o campo foi ignorado.');
      end if;

      if nullif(btrim(item->>'priority'),'') is not null and priority_value is null then
        row_warnings := array_append(row_warnings,'Prioridade não reconhecida; o campo foi ignorado.');
      end if;

      if nullif(btrim(item->>'editorial_profile_status'),'') is not null and profile_status_value is null then
        row_warnings := array_append(row_warnings,'Status do perfil editorial não reconhecido; o campo foi ignorado.');
      end if;

      if nullif(btrim(item->>'editorial_profile_confidence'),'') is not null and profile_confidence_value is null then
        row_warnings := array_append(row_warnings,'Confiança do perfil editorial não reconhecida; o campo foi ignorado.');
      end if;

      if nullif(btrim(item->>'stage_name'),'') is not null then
        select s.id into stage_uuid
        from public.pipeline_stages s
        where s.organization_id = p_organization_id
          and s.active
          and lower(btrim(s.name)) = lower(btrim(item->>'stage_name'))
        limit 1;

        if stage_uuid is null then
          row_warnings := array_append(row_warnings,'Etapa do pipeline não encontrada; o campo foi ignorado.');
        end if;
      end if;

      if source_ref_value is not null then
        select p.id into source_id
        from public.publishers p
        where p.organization_id = p_organization_id
          and p.source_ref = source_ref_value
        order by p.archived, p.created_at
        limit 1;
      end if;

      if clean_cnpj <> '' then
        select p.id into cnpj_id
        from public.publishers p
        where p.organization_id = p_organization_id
          and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g') = clean_cnpj
        order by p.archived, p.created_at
        limit 1;
      end if;

      if source_id is not null and cnpj_id is not null and source_id <> cnpj_id then
        raise exception 'Referência de origem e CNPJ apontam para editoras diferentes na base';
      end if;

      if source_id is not null then
        existing_id := source_id;
      elsif cnpj_id is not null then
        existing_id := cnpj_id;
      elsif source_ref_value is null and clean_cnpj = '' and state_value is not null then
        select p.id into existing_id
        from public.publishers p
        where p.organization_id = p_organization_id
          and lower(btrim(p.name)) = lower(publisher_name)
          and coalesce(upper(p.state),'') = state_value
        order by p.archived, p.created_at
        limit 1;
      end if;

      if existing_id is not null and p_mode = 'skip' then
        skipped_count := skipped_count + 1;
      elsif existing_id is not null then
        update public.publishers p
        set
          name = publisher_name,
          legal_name = coalesce(nullif(btrim(item->>'legal_name'),''),p.legal_name),
          trade_name = coalesce(nullif(btrim(item->>'trade_name'),''),p.trade_name),
          cnpj = coalesce(nullif(clean_cnpj,''),p.cnpj),
          website = coalesce(nullif(btrim(item->>'website'),''),p.website),
          country = coalesce(nullif(btrim(item->>'country'),''),p.country),
          city = coalesce(nullif(btrim(item->>'city'),''),p.city),
          state = coalesce(state_value,p.state),
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
          tax_regime = coalesce(nullif(btrim(item->>'tax_regime'),''),p.tax_regime),
          share_capital = coalesce(nullif(btrim(item->>'share_capital'),''),p.share_capital),
          estimated_revenue = coalesce(nullif(btrim(item->>'estimated_revenue'),''),p.estimated_revenue),
          employee_range = coalesce(nullif(btrim(item->>'employee_range'),''),p.employee_range),
          owners_names = coalesce(nullif(btrim(item->>'owners_names'),''),p.owners_names),
          age_range = coalesce(nullif(btrim(item->>'age_range'),''),p.age_range),
          catalog_notes = coalesce(nullif(btrim(item->>'catalog_notes'),''),p.catalog_notes),
          market_segments = case when cardinality(market_segments_value)>0 then market_segments_value else p.market_segments end,
          editorial_profile = case when cardinality(editorial_profile_value)>0 then editorial_profile_value else p.editorial_profile end,
          editorial_profile_status = coalesce(profile_status_value,p.editorial_profile_status),
          editorial_profile_confidence = coalesce(profile_confidence_value,p.editorial_profile_confidence),
          editorial_profile_notes = coalesce(nullif(btrim(item->>'editorial_profile_notes'),''),p.editorial_profile_notes),
          priority = coalesce(priority_value,p.priority),
          stage_id = coalesce(stage_uuid,p.stage_id),
          notes = coalesce(nullif(btrim(item->>'notes'),''),p.notes),
          source_ref = coalesce(source_ref_value,p.source_ref),
          source_sheet = coalesce(nullif(btrim(p_source_name),''),p.source_sheet),
          source_row = coalesce(source_row_value,p.source_row),
          imported_at = now(),
          updated_by = auth.uid(),
          updated_at = now()
        where p.id = existing_id;
        updated_count := updated_count + 1;
      else
        insert into public.publishers(
          organization_id,name,legal_name,trade_name,cnpj,website,country,city,state,
          postal_code,address_type,address_street,address_number,address_complement,neighborhood,
          phone,secondary_phone,general_email,alternate_emails,linkedin_url,instagram,ibge_code,
          cnae_primary,cnae_description,cnae_secondary,matrix_branch,registration_status,legal_nature,
          company_size,tax_regime,share_capital,estimated_revenue,employee_range,owners_names,age_range,
          catalog_notes,market_segments,editorial_profile,editorial_profile_status,editorial_profile_confidence,
          editorial_profile_notes,priority,stage_id,notes,source,source_sheet,source_row,source_ref,imported_at,
          created_by,updated_by
        )
        values(
          p_organization_id,publisher_name,nullif(btrim(item->>'legal_name'),''),nullif(btrim(item->>'trade_name'),''),
          nullif(clean_cnpj,''),nullif(btrim(item->>'website'),''),country_value,nullif(btrim(item->>'city'),''),state_value,
          nullif(btrim(item->>'postal_code'),''),nullif(btrim(item->>'address_type'),''),nullif(btrim(item->>'address_street'),''),
          nullif(btrim(item->>'address_number'),''),nullif(btrim(item->>'address_complement'),''),nullif(btrim(item->>'neighborhood'),''),
          nullif(btrim(item->>'phone'),''),nullif(btrim(item->>'secondary_phone'),''),email_value,alternate_emails_value,
          nullif(btrim(item->>'linkedin_url'),''),nullif(btrim(item->>'instagram'),''),nullif(btrim(item->>'ibge_code'),''),
          nullif(btrim(item->>'cnae_primary'),''),nullif(btrim(item->>'cnae_description'),''),nullif(btrim(item->>'cnae_secondary'),''),
          nullif(btrim(item->>'matrix_branch'),''),nullif(btrim(item->>'registration_status'),''),nullif(btrim(item->>'legal_nature'),''),
          nullif(btrim(item->>'company_size'),''),nullif(btrim(item->>'tax_regime'),''),nullif(btrim(item->>'share_capital'),''),
          nullif(btrim(item->>'estimated_revenue'),''),nullif(btrim(item->>'employee_range'),''),nullif(btrim(item->>'owners_names'),''),
          nullif(btrim(item->>'age_range'),''),nullif(btrim(item->>'catalog_notes'),''),market_segments_value,editorial_profile_value,
          coalesce(profile_status_value,'pending'),profile_confidence_value,nullif(btrim(item->>'editorial_profile_notes'),''),
          coalesce(priority_value,'medium'),stage_uuid,nullif(btrim(item->>'notes'),''),'csv_import',nullif(btrim(p_source_name),''),
          source_row_value,source_ref_value,now(),auth.uid(),auth.uid()
        );
        inserted_count := inserted_count + 1;
      end if;

      if cardinality(row_warnings)>0 then
        warning_count := warning_count + 1;
        details := details || jsonb_build_array(jsonb_build_object(
          'row', row_number,
          'name', publisher_name,
          'status', case when existing_id is not null and p_mode='skip' then 'skip' when existing_id is not null then 'update' else 'insert' end,
          'warning', array_to_string(row_warnings,' ')
        ));
      end if;

    exception when others then
      error_count := error_count + 1;
      details := details || jsonb_build_array(jsonb_build_object(
        'row', coalesce(item->>'_row','?'),
        'name', coalesce(item->>'name',''),
        'status', 'error',
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'errors', error_count,
    'warnings', warning_count,
    'details', details
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_preview_import_publishers_v2(p_organization_id uuid, p_rows jsonb, p_mode text DEFAULT 'skip'::text)
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
  source_ref_value text;
  state_value text;
  country_value text;
  email_value text;
  priority_value text;
  profile_status_value text;
  profile_confidence_value text;
  source_id uuid;
  cnpj_id uuid;
  name_state_id uuid;
  existing_id uuid;
  stage_uuid uuid;
  existing_source_cnpj text;
  row_status text;
  matched_by text;
  row_warnings text[];
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  error_count integer := 0;
  warning_count integer := 0;
  details jsonb := '[]'::jsonb;
begin
  if role_name not in ('owner','admin','supervisor') then
    raise exception 'Apenas administradores e supervisores podem validar importações de editoras' using errcode='42501';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato de importação inválido';
  end if;

  if p_mode not in ('skip','update') then
    p_mode := 'skip';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    begin
      row_warnings := array[]::text[];
      row_number := coalesce(item->>'_row','?');
      publisher_name := nullif(btrim(item->>'name'),'');
      clean_cnpj := regexp_replace(coalesce(item->>'cnpj',''),'[^0-9]','','g');
      source_ref_value := nullif(btrim(item->>'source_ref'),'');
      state_value := upper(nullif(btrim(item->>'state'),''));
      country_value := coalesce(nullif(btrim(item->>'country'),''),'Brasil');
      email_value := nullif(lower(btrim(item->>'general_email')),'');
      priority_value := private.crm_import_priority_value(item->>'priority');
      profile_status_value := private.crm_import_profile_status_value(item->>'editorial_profile_status');
      profile_confidence_value := private.crm_import_profile_confidence_value(item->>'editorial_profile_confidence');
      source_id := null;
      cnpj_id := null;
      name_state_id := null;
      existing_id := null;
      stage_uuid := null;
      existing_source_cnpj := null;
      matched_by := null;

      if publisher_name is null then
        raise exception 'Nome da editora é obrigatório';
      end if;

      if clean_cnpj <> '' and length(clean_cnpj) <> 14 then
        raise exception 'CNPJ deve conter 14 dígitos';
      end if;

      if state_value is not null
         and lower(country_value) in ('brasil','brazil')
         and not (state_value = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])) then
        raise exception 'UF inválida para cadastro no Brasil';
      end if;

      if email_value is not null
         and email_value !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
        row_warnings := array_append(row_warnings,'E-mail geral inválido; o campo será ignorado.');
      end if;

      if nullif(btrim(item->>'priority'),'') is not null and priority_value is null then
        row_warnings := array_append(row_warnings,'Prioridade não reconhecida; será preservada no cadastro existente ou ficará Média em um novo cadastro.');
      end if;

      if nullif(btrim(item->>'editorial_profile_status'),'') is not null and profile_status_value is null then
        row_warnings := array_append(row_warnings,'Status do perfil editorial não reconhecido; o campo será ignorado.');
      end if;

      if nullif(btrim(item->>'editorial_profile_confidence'),'') is not null and profile_confidence_value is null then
        row_warnings := array_append(row_warnings,'Confiança do perfil editorial não reconhecida; o campo será ignorado.');
      end if;

      if nullif(btrim(item->>'stage_name'),'') is not null then
        select s.id into stage_uuid
        from public.pipeline_stages s
        where s.organization_id = p_organization_id
          and s.active
          and lower(btrim(s.name)) = lower(btrim(item->>'stage_name'))
        limit 1;

        if stage_uuid is null then
          row_warnings := array_append(row_warnings,'Etapa do pipeline não encontrada; a etapa será ignorada.');
        end if;
      end if;

      if source_ref_value is not null then
        select p.id, p.cnpj
          into source_id, existing_source_cnpj
        from public.publishers p
        where p.organization_id = p_organization_id
          and p.source_ref = source_ref_value
        order by p.archived, p.created_at
        limit 1;
      end if;

      if clean_cnpj <> '' then
        select p.id into cnpj_id
        from public.publishers p
        where p.organization_id = p_organization_id
          and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g') = clean_cnpj
        order by p.archived, p.created_at
        limit 1;
      end if;

      if state_value is not null then
        select p.id into name_state_id
        from public.publishers p
        where p.organization_id = p_organization_id
          and lower(btrim(p.name)) = lower(publisher_name)
          and coalesce(upper(p.state),'') = state_value
        order by p.archived, p.created_at
        limit 1;
      end if;

      if source_id is not null and cnpj_id is not null and source_id <> cnpj_id then
        raise exception 'Referência de origem e CNPJ apontam para editoras diferentes na base';
      end if;

      if source_id is not null then
        existing_id := source_id;
        matched_by := 'Referência de origem';
        if clean_cnpj <> ''
           and nullif(regexp_replace(coalesce(existing_source_cnpj,''),'[^0-9]','','g'),'') is not null
           and regexp_replace(coalesce(existing_source_cnpj,''),'[^0-9]','','g') <> clean_cnpj then
          row_warnings := array_append(row_warnings,'O CNPJ do arquivo difere do cadastro localizado pela referência de origem.');
        end if;
      elsif cnpj_id is not null then
        existing_id := cnpj_id;
        matched_by := 'CNPJ';
      elsif source_ref_value is null and clean_cnpj = '' and name_state_id is not null then
        existing_id := name_state_id;
        matched_by := 'Nome + UF';
      elsif (source_ref_value is not null or clean_cnpj <> '') and name_state_id is not null then
        row_warnings := array_append(row_warnings,'Existe uma editora com o mesmo nome e UF, mas a chave forte informada não corresponde a ela; o registro será tratado como novo.');
      elsif source_ref_value is null and clean_cnpj = '' and state_value is null then
        row_warnings := array_append(row_warnings,'Sem CNPJ, referência de origem e UF: a conferência automática de duplicidade fica limitada.');
      end if;

      if existing_id is not null then
        if p_mode = 'update' then
          row_status := 'update';
          updated_count := updated_count + 1;
        else
          row_status := 'skip';
          skipped_count := skipped_count + 1;
        end if;
      else
        row_status := 'insert';
        inserted_count := inserted_count + 1;
      end if;

      if cardinality(row_warnings) > 0 then
        warning_count := warning_count + 1;
      end if;

      if existing_id is not null or cardinality(row_warnings) > 0 then
        details := details || jsonb_build_array(jsonb_build_object(
          'row', row_number,
          'name', publisher_name,
          'status', row_status,
          'matched_by', matched_by,
          'warning', case when cardinality(row_warnings)>0 then array_to_string(row_warnings,' ') else null end
        ));
      end if;

    exception when others then
      error_count := error_count + 1;
      details := details || jsonb_build_array(jsonb_build_object(
        'row', coalesce(item->>'_row','?'),
        'name', coalesce(item->>'name',''),
        'status', 'error',
        'matched_by', null,
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'errors', error_count,
    'warnings', warning_count,
    'details', details
  );
end;
$function$;

revoke all on function public.crm_preview_import_publishers_v2(uuid,jsonb,text) from public;
revoke all on function public.crm_import_publishers_v2(uuid,jsonb,text,text) from public;
grant execute on function public.crm_preview_import_publishers_v2(uuid,jsonb,text) to authenticated;
grant execute on function public.crm_import_publishers_v2(uuid,jsonb,text,text) to authenticated;
