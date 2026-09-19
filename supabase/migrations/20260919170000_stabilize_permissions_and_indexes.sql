-- Stabilization pass before internal pilot.
-- Aligns supervisor UI permissions with RLS, closes anonymous RPC execution,
-- and adds the two missing foreign-key indexes reported by the database advisor.

drop policy if exists publishers_insert_admin on public.publishers;
drop policy if exists publishers_insert_manager on public.publishers;

create policy publishers_insert_manager
on public.publishers
for insert
to authenticated
with check (
  private.org_role(organization_id) = any (array['owner'::text,'admin'::text,'supervisor'::text])
);

revoke execute on function public.crm_complete_cadence_task(uuid,uuid,text,text,timestamptz) from public, anon;
grant execute on function public.crm_complete_cadence_task(uuid,uuid,text,text,timestamptz) to authenticated;

revoke execute on function public.crm_refresh_cadences(uuid) from public, anon;
grant execute on function public.crm_refresh_cadences(uuid) to authenticated;

revoke execute on function public.crm_report_dashboard(uuid,integer) from public, anon;
grant execute on function public.crm_report_dashboard(uuid,integer) to authenticated;

create index if not exists cadence_steps_outreach_template_id_idx
  on public.cadence_steps(outreach_template_id);

create index if not exists tasks_outreach_template_id_idx
  on public.tasks(outreach_template_id);
