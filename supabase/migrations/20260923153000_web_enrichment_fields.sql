-- Estrutura de enriquecimento público/comercial das editoras.
alter table public.publishers
  add column if not exists commercial_name text,
  add column if not exists commercial_name_confidence text
    check (commercial_name_confidence is null or commercial_name_confidence in ('low','medium','high')),
  add column if not exists commercial_name_sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(commercial_name_sources)='array'),
  add column if not exists commercial_name_verified_at timestamptz,
  add column if not exists web_enrichment_status text not null default 'pending'
    check (web_enrichment_status in ('pending','partial','enriched','review','not_found')),
  add column if not exists web_enrichment_sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(web_enrichment_sources)='array'),
  add column if not exists web_enrichment_verified_at timestamptz,
  add column if not exists web_enrichment_notes text;

create index if not exists publishers_web_enrichment_pending_idx
  on public.publishers(organization_id, web_enrichment_status, archived)
  where not archived;
