drop policy if exists google_calendar_connections_insert on public.google_calendar_connections;
create policy google_calendar_connections_insert on public.google_calendar_connections
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and (
    (
      user_id = (select auth.uid())
      and (
        private.org_role(organization_id) in ('owner','admin','supervisor')
        or private.has_commercial_function(organization_id,'commercial_presentation')
      )
    )
    or private.org_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists google_calendar_connections_update on public.google_calendar_connections;
create policy google_calendar_connections_update on public.google_calendar_connections
for update to authenticated
using (
  private.is_org_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('owner','admin')
  )
)
with check (
  private.is_org_member(organization_id)
  and (
    (
      user_id = (select auth.uid())
      and (
        private.org_role(organization_id) in ('owner','admin','supervisor')
        or private.has_commercial_function(organization_id,'commercial_presentation')
      )
    )
    or private.org_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists google_calendar_connections_delete on public.google_calendar_connections;
create policy google_calendar_connections_delete on public.google_calendar_connections
for delete to authenticated
using (
  private.is_org_member(organization_id)
  and (
    user_id = (select auth.uid())
    or private.org_role(organization_id) in ('owner','admin')
  )
);
