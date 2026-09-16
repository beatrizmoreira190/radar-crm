create index if not exists meetings_org_start_idx
  on public.meetings (organization_id, scheduled_start);
