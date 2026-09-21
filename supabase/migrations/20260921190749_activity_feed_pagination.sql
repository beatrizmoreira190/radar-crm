create index if not exists audit_events_org_actor_created_idx
  on public.audit_events (organization_id, actor_user_id, created_at desc);

create or replace function public.crm_activity_feed(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 30,
  p_query text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = 'public', 'pg_temp'
as $$
  with filtered as (
    select a.*
    from public.audit_events a
    left join public.org_members actor
      on actor.organization_id=a.organization_id
     and actor.user_id=a.actor_user_id
    where a.organization_id=p_organization_id
      and (
        btrim(coalesce(p_query,''))=''
        or coalesce(a.label,'') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.entity_type,'') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.entity_id,'') ilike '%'||btrim(p_query)||'%'
        or coalesce(actor.full_name,'') ilike '%'||btrim(p_query)||'%'
        or coalesce(actor.email,'') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.before_data->>'name','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.after_data->>'name','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.before_data->>'title','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.after_data->>'title','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.before_data->>'summary','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.after_data->>'summary','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.before_data->>'full_name','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.after_data->>'full_name','') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.before_data::text,'') ilike '%'||btrim(p_query)||'%'
        or coalesce(a.after_data::text,'') ilike '%'||btrim(p_query)||'%'
        or exists (
          select 1
          from public.pipeline_stages s
          where s.organization_id=p_organization_id
            and (
              s.id::text=coalesce(a.before_data->>'stage_id','')
              or s.id::text=coalesce(a.after_data->>'stage_id','')
            )
            and s.name ilike '%'||btrim(p_query)||'%'
        )
      )
  ),
  paged as (
    select f.*
    from filtered f
    order by f.created_at desc,f.id desc
    offset ((greatest(coalesce(p_page,1),1)-1)*greatest(10,least(coalesce(p_page_size,30),100)))
    limit greatest(10,least(coalesce(p_page_size,30),100))
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'rows',coalesce(
      (select jsonb_agg(to_jsonb(paged) order by created_at desc,id desc) from paged),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.crm_activity_feed(uuid,integer,integer,text) from public;
grant execute on function public.crm_activity_feed(uuid,integer,integer,text) to authenticated;
grant execute on function public.crm_activity_feed(uuid,integer,integer,text) to service_role;
