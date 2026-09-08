create or replace function public.crm_publisher_fit_signals(
  p_organization_id uuid,
  p_publisher_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  p public.publishers%rowtype;
  v_signals jsonb := '[]'::jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  select * into p
  from public.publishers
  where id=p_publisher_id
    and organization_id=p_organization_id
    and not archived;

  if not found then return null; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile',ep.profile,
        'pnld_literario',coalesce(w.pnld_literario,0),
        'pnld_didatico',coalesce(w.pnld_didatico,0),
        'pnld_tecnico_metodologico',coalesce(w.pnld_tecnico_metodologico,0),
        'radar_licitacoes',coalesce(w.radar_licitacoes,0),
        'radar_oportunidades',coalesce(w.radar_oportunidades,0),
        'religious_core',coalesce(w.religious_core,false)
      ) order by ep.ord
    ),
    '[]'::jsonb
  ) into v_signals
  from unnest(coalesce(p.editorial_profile,array[]::text[])) with ordinality ep(profile,ord)
  left join private.radar_profile_weights w on w.profile=ep.profile;

  return jsonb_build_object(
    'publisher_id',p.id,
    'profile_status',p.editorial_profile_status,
    'profile_confidence',p.editorial_profile_confidence,
    'profile_fit_signals',v_signals
  );
end;
$function$;

revoke all on function public.crm_publisher_fit_signals(uuid,uuid) from public;
revoke all on function public.crm_publisher_fit_signals(uuid,uuid) from anon;
grant execute on function public.crm_publisher_fit_signals(uuid,uuid) to authenticated;
grant execute on function public.crm_publisher_fit_signals(uuid,uuid) to service_role;
