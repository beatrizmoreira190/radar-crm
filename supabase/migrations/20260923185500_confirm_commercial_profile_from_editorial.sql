-- Confirma automaticamente como Editora / empresa editorial os registros cujo
-- perfil editorial já foi confirmado pelo fluxo de enriquecimento.
-- Mantém origem distinta de revisão manual para preservar a rastreabilidade.

alter table public.publishers
  drop constraint if exists publishers_commercial_profile_source_check;

alter table public.publishers
  add constraint publishers_commercial_profile_source_check
  check (commercial_profile_source in ('system_default','editorial_profile','manual'));

update public.publishers
set commercial_profile_code='publisher_company',
    commercial_profile_source='editorial_profile',
    commercial_profile_note=case
      when nullif(btrim(coalesce(commercial_profile_note,'')),'') is null
        then 'Confirmado automaticamente a partir de perfil editorial com status Confirmado.'
      else commercial_profile_note
    end,
    commercial_profile_reviewed_at=coalesce(commercial_profile_reviewed_at,editorial_profile_verified_at,now()),
    commercial_profile_reviewed_by=null
where editorial_profile_status='confirmed'
  and commercial_profile_source='system_default';

comment on column public.publishers.commercial_profile_source is
  'Origem da classificação comercial: system_default, editorial_profile ou manual.';
