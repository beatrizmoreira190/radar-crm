-- Cadastro manual de editoras no CRM.
-- Permite a qualquer membro ativo da organizacao criar uma nova conta
-- sem ampliar a permissao generica de INSERT da tabela publishers.

create or replace function public.crm_create_publisher_manual(
  p_organization_id uuid,
  p_name text,
  p_legal_name text default null,
  p_trade_name text default null,
  p_cnpj text default null,
  p_city text default null,
  p_state text default null,
  p_website text default null,
  p_general_email text default null,
  p_phone text default null,
  p_priority text default 'medium',
  p_stage_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  clean_name text := nullif(btrim(coalesce(p_name,'')),'');
  clean_cnpj text := regexp_replace(coalesce(p_cnpj,''),'[^0-9]','','g');
  clean_state text := upper(nullif(btrim(coalesce(p_state,'')),''));
  clean_email text := nullif(lower(btrim(coalesce(p_general_email,''))),'');
  clean_priority text := lower(nullif(btrim(coalesce(p_priority,'')),''));
  duplicate_id uuid;
  duplicate_name text;
  duplicate_archived boolean;
  new_id uuid;
begin
  if uid is null or not private.is_org_member(p_organization_id) then
    raise exception 'Acesso nao autorizado' using errcode='42501';
  end if;

  if clean_name is null then
    raise exception 'Nome da editora e obrigatorio';
  end if;

  if clean_cnpj <> '' and length(clean_cnpj) <> 14 then
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

  if clean_priority is null then
    clean_priority := 'medium';
  end if;

  if clean_priority not in ('low','medium','high','urgent') then
    raise exception 'Prioridade invalida';
  end if;

  if p_stage_id is not null and not exists (
    select 1
    from public.pipeline_stages s
    where s.id = p_stage_id
      and s.organization_id = p_organization_id
      and s.active
  ) then
    raise exception 'Etapa do pipeline invalida';
  end if;

  if clean_cnpj <> '' then
    select p.id,
           coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),''),'Editora existente'),
           p.archived
      into duplicate_id, duplicate_name, duplicate_archived
    from public.publishers p
    where p.organization_id = p_organization_id
      and regexp_replace(coalesce(p.cnpj,''),'[^0-9]','','g') = clean_cnpj
    order by p.archived, p.created_at
    limit 1;
  else
    select p.id,
           coalesce(nullif(btrim(p.commercial_name),''),nullif(btrim(p.trade_name),''),nullif(btrim(p.name),''),nullif(btrim(p.legal_name),''),'Editora existente'),
           p.archived
      into duplicate_id, duplicate_name, duplicate_archived
    from public.publishers p
    where p.organization_id = p_organization_id
      and (
        lower(btrim(coalesce(p.name,''))) = lower(clean_name)
        or lower(btrim(coalesce(p.trade_name,''))) = lower(clean_name)
        or lower(btrim(coalesce(p.commercial_name,''))) = lower(clean_name)
      )
      and coalesce(upper(nullif(btrim(p.state),'')),'') = coalesce(clean_state,'')
    order by p.archived, p.created_at
    limit 1;
  end if;

  if duplicate_id is not null then
    if duplicate_archived then
      raise exception 'Ja existe um cadastro arquivado para esta editora: %', duplicate_name using errcode='23505';
    end if;
    raise exception 'Esta editora ja esta cadastrada: %', duplicate_name using errcode='23505';
  end if;

  insert into public.publishers(
    organization_id,
    name,
    legal_name,
    trade_name,
    cnpj,
    website,
    country,
    city,
    state,
    phone,
    general_email,
    priority,
    stage_id,
    source,
    prospector_user_id,
    genres,
    alternate_emails,
    archived,
    created_by,
    updated_by
  )
  values(
    p_organization_id,
    clean_name,
    nullif(btrim(coalesce(p_legal_name,'')),''),
    nullif(btrim(coalesce(p_trade_name,'')),''),
    nullif(clean_cnpj,''),
    nullif(btrim(coalesce(p_website,'')),''),
    'Brasil',
    nullif(btrim(coalesce(p_city,'')),''),
    clean_state,
    nullif(btrim(coalesce(p_phone,'')),''),
    clean_email,
    clean_priority,
    p_stage_id,
    'manual_crm',
    uid,
    array[]::text[],
    array[]::text[],
    false,
    uid,
    uid
  )
  returning id into new_id;

  return jsonb_build_object(
    'ok', true,
    'publisher_id', new_id,
    'source', 'manual_crm'
  );
end;
$function$;

revoke all on function public.crm_create_publisher_manual(uuid,text,text,text,text,text,text,text,text,text,text,uuid) from public;
grant execute on function public.crm_create_publisher_manual(uuid,text,text,text,text,text,text,text,text,text,text,uuid) to authenticated;
