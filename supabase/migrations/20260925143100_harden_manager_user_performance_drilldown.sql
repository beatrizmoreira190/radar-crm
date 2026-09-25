alter function public.crm_user_performance_detail(uuid,uuid,integer) security invoker;

revoke all on function public.crm_user_performance_detail(uuid,uuid,integer) from public;
revoke all on function public.crm_user_performance_detail(uuid,uuid,integer) from anon;
grant execute on function public.crm_user_performance_detail(uuid,uuid,integer) to authenticated;
