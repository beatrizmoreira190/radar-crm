drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    assigned_to=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
)
with check (
  private.is_org_member(organization_id)
  and (publisher_id is null or private.can_collaborate_publisher(organization_id,publisher_id))
  and (
    assigned_to=auth.uid()
    or private.org_role(organization_id) in ('owner','admin','supervisor')
  )
);

drop policy if exists opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and private.can_collaborate_publisher(organization_id,publisher_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or (
      coalesce(created_by,auth.uid())=auth.uid()
      and (
        owner_user_id is null
        or owner_user_id=auth.uid()
        or owner_user_id=(
          select p.owner_user_id from public.publishers p
          where p.id=opportunities.publisher_id
            and p.organization_id=opportunities.organization_id
        )
      )
    )
  )
);

drop policy if exists publisher_materials_insert on public.publisher_materials;
create policy publisher_materials_insert on public.publisher_materials
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by=auth.uid()
  and exists (
    select 1 from public.publishers p
    where p.id=publisher_materials.publisher_id
      and p.organization_id=publisher_materials.organization_id
      and not p.archived
  )
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);

drop policy if exists publisher_materials_update on public.publisher_materials;
create policy publisher_materials_update on public.publisher_materials
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
)
with check (
  private.is_org_member(organization_id)
  and exists (
    select 1 from public.publishers p
    where p.id=publisher_materials.publisher_id
      and p.organization_id=publisher_materials.organization_id
      and not p.archived
  )
  and (
    private.org_role(organization_id) in ('owner','admin','supervisor')
    or private.has_commercial_function(organization_id,'pre_meeting_materials')
    or private.has_commercial_function(organization_id,'negotiation_materials')
  )
);