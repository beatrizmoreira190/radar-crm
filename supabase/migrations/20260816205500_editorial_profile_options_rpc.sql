create or replace function public.get_editorial_profile_options(p_organization_id uuid)
returns table(value text, publisher_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select u.profile_value as value, count(*)::bigint as publisher_count
  from public.publishers p
  cross join lateral unnest(coalesce(p.editorial_profile, '{}'::text[])) as u(profile_value)
  where p.organization_id = p_organization_id
    and p.archived = false
    and nullif(btrim(u.profile_value), '') is not null
  group by u.profile_value
  order by lower(u.profile_value), u.profile_value;
$$;

revoke all on function public.get_editorial_profile_options(uuid) from public;
grant execute on function public.get_editorial_profile_options(uuid) to authenticated;
