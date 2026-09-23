-- Oculta automaticamente do CRM as empresas cujo CNPJ esteja BAIXADO.
-- Usamos arquivamento lógico para preservar histórico comercial, auditoria e vínculos.

create or replace function private.crm_archive_baixada_publisher()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
begin
  if upper(btrim(coalesce(new.registration_status,''))) = 'BAIXADA' then
    new.archived := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_archive_baixada_publisher on public.publishers;
create trigger trg_archive_baixada_publisher
before insert or update of registration_status
on public.publishers
for each row
execute function private.crm_archive_baixada_publisher();

-- Aplica a mesma regra aos CNPJs que já foram identificados como baixados
-- na sincronização de 09/2026, sem apagar os registros.
select set_config(
  'app.crm_actor_user_id',
  coalesce((
    select m.user_id::text
    from public.org_members m
    where m.active and m.role in ('owner','admin')
    order by m.created_at
    limit 1
  ),''),
  true
);

update public.publishers
set archived = true,
    updated_by = coalesce(
      (
        select m.user_id
        from public.org_members m
        where m.organization_id = publishers.organization_id
          and m.active
          and m.role in ('owner','admin')
        order by m.created_at
        limit 1
      ),
      updated_by
    ),
    updated_at = now()
where upper(btrim(coalesce(registration_status,''))) = 'BAIXADA'
  and not archived;
