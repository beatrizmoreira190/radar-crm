create index if not exists publisher_materials_publisher_id_idx
  on public.publisher_materials (publisher_id);
create index if not exists publisher_materials_responsible_user_id_idx
  on public.publisher_materials (responsible_user_id);
create index if not exists publisher_materials_created_by_idx
  on public.publisher_materials (created_by);

drop policy if exists publisher_materials_insert on public.publisher_materials;
create policy publisher_materials_insert
on public.publisher_materials
for insert
to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.publishers p
    where p.id = publisher_id and p.organization_id = organization_id
  )
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);

revoke all on function private.protect_publisher_material_update() from public;
