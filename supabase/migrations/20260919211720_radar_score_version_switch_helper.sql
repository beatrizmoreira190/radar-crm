create or replace function private.set_radar_score_version(p_version text)
returns text
language plpgsql
security definer
set search_path=private,public,pg_temp
as $$
begin
  if p_version not in ('radar_v2','radar_v3') then
    raise exception 'Versão inválida: %',p_version;
  end if;

  update private.radar_score_config
  set active_version=p_version,changed_at=now()
  where singleton=true;

  return p_version;
end;
$$;

revoke all on function private.set_radar_score_version(text) from public;
