alter table public.opportunities
  drop constraint if exists opportunities_no_sensitive_financial_data_chk,
  add constraint opportunities_no_sensitive_financial_data_chk
    check (estimated_value is null and probability is null);
