CREATE OR REPLACE FUNCTION public.crm_smart_queue(p_organization_id uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(publisher_id uuid, name text, city text, state text, score integer, priority text, owner_user_id uuid, stage_name text, last_contact_at timestamp with time zone, next_action_at timestamp with time zone, action_code text, action_label text, reason text, rank_score integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  return query
  with base as (
    select
      p.*,
      s.name as sname,
      s.stage_type,
      (select min(t.due_at)
       from public.tasks t
       where t.organization_id=p.organization_id
         and t.publisher_id=p.id
         and t.assigned_to=auth.uid()
         and t.status in ('open','in_progress')) as task_due,
      (select t.title
       from public.tasks t
       where t.organization_id=p.organization_id
         and t.publisher_id=p.id
         and t.assigned_to=auth.uid()
         and t.status in ('open','in_progress')
       order by t.due_at nulls last
       limit 1) as task_title,
      exists(
        select 1 from public.contacts c
        where c.publisher_id=p.id and c.active and c.is_decision_maker
      ) as has_dm,
      (select i.result
       from public.interactions i
       where i.publisher_id=p.id
       order by i.occurred_at desc
       limit 1) as latest_result
    from public.publishers p
    left join public.pipeline_stages s on s.id=p.stage_id
    where p.organization_id=p_organization_id
      and not p.archived
      and coalesce(s.stage_type,'open') not in ('won','lost')
      and (
        p.owner_user_id=auth.uid()
        or (p.owner_user_id is null and coalesce(p.score,0)>=30)
      )
  ),
  ranked as (
    select
      b.*,
      case coalesce(b.priority,'medium')
        when 'urgent' then 300
        when 'high' then 150
        when 'low' then -100
        else 0
      end as priority_bonus,
      case
        when b.task_due is not null and b.task_due<now() then 12000
        when b.next_action_at is not null and b.next_action_at<=now() then 11000
        when b.owner_user_id=auth.uid() and b.latest_result='proposal_requested' then 10000
        when b.owner_user_id=auth.uid()
             and b.latest_result in ('busy','callback_scheduled','follow_up','asked_email')
             and b.next_action_at is null then 9000
        when b.owner_user_id=auth.uid()
             and b.latest_result='qualified'
             and b.next_action_at is null then 8500
        when b.owner_user_id is null and coalesce(b.score,0)>=80 then 8000
        when b.owner_user_id is null and coalesce(b.score,0)>=65 then 7000
        when b.owner_user_id=auth.uid() and b.last_contact_at is null then 6000
        when b.owner_user_id=auth.uid() and b.last_contact_at<now()-interval '14 days' then 5000
        when b.owner_user_id is null then 4000
        else 1000
      end as action_base
    from base b
  )
  select
    r.id,
    r.name,
    r.city,
    r.state,
    r.score,
    r.priority,
    r.owner_user_id,
    r.sname,
    r.last_contact_at,
    r.next_action_at,
    case
      when r.task_due is not null and r.task_due<now() then 'overdue_task'
      when r.next_action_at is not null and r.next_action_at<=now() then 'due_followup'
      when r.owner_user_id=auth.uid() and r.latest_result='proposal_requested' then 'prepare_proposal'
      when r.owner_user_id=auth.uid() and r.latest_result in ('busy','callback_scheduled','follow_up','asked_email') then 'follow_up'
      when r.owner_user_id=auth.uid() and r.latest_result='qualified' then 'advance_opportunity'
      when r.owner_user_id is null then 'claim'
      when r.last_contact_at is null then 'first_contact'
      when not r.has_dm then 'find_decision_maker'
      when r.last_contact_at<now()-interval '14 days' then 'reengage'
      else 'review'
    end,
    case
      when r.task_due is not null and r.task_due<now() then 'Concluir tarefa atrasada'
      when r.next_action_at is not null and r.next_action_at<=now() then 'Executar próximo passo'
      when r.owner_user_id=auth.uid() and r.latest_result='proposal_requested' then 'Preparar proposta'
      when r.owner_user_id=auth.uid() and r.latest_result in ('busy','callback_scheduled','follow_up','asked_email') then 'Fazer follow-up'
      when r.owner_user_id=auth.uid() and r.latest_result='qualified' then 'Avançar oportunidade'
      when r.owner_user_id is null then 'Assumir esta editora'
      when r.last_contact_at is null then 'Fazer primeiro contato'
      when not r.has_dm then 'Pesquisar decisor'
      when r.last_contact_at<now()-interval '14 days' then 'Retomar contato'
      else 'Revisar conta'
    end,
    concat_ws(
      ' · ',
      case
        when r.priority='urgent' then 'Prioridade manual urgente'
        when r.priority='high' then 'Prioridade manual alta'
        when r.priority='low' then 'Prioridade manual baixa'
        else null
      end,
      case
        when r.task_due is not null and r.task_due<now() then coalesce(r.task_title,'Tarefa vencida')
        when r.next_action_at is not null and r.next_action_at<=now() then 'Próxima ação vencida ou para agora'
        when r.owner_user_id=auth.uid() and r.latest_result='proposal_requested' then 'A editora pediu proposta; avance enquanto a conversa está quente'
        when r.owner_user_id=auth.uid() and r.latest_result in ('busy','callback_scheduled','follow_up','asked_email') and r.next_action_at is null then 'O último resultado pede continuidade e ainda não há data de retorno definida'
        when r.owner_user_id=auth.uid() and r.latest_result='qualified' and r.next_action_at is null then 'A oportunidade foi qualificada e ainda não tem próximo passo com data'
        when r.owner_user_id is null and coalesce(r.best_product,'')<>'' then 'Conta sem responsável · melhor fit: '||replace(r.best_product,'_',' ')
        when r.owner_user_id is null then 'Conta sem responsável disponível para assumir'
        when r.last_contact_at is null and coalesce(r.best_product,'')<>'' then 'Primeiro contato · melhor fit: '||replace(r.best_product,'_',' ')
        when r.last_contact_at is null then 'Nenhum contato comercial registrado'
        when r.latest_result in ('busy','callback_scheduled','follow_up','asked_email') and r.next_action_at is not null then 'Follow-up já possui uma data futura registrada'
        when r.latest_result='qualified' and r.next_action_at is not null then 'Oportunidade qualificada com próximo passo já agendado'
        when not r.has_dm then 'Nenhum decisor identificado'
        when r.last_contact_at<now()-interval '14 days' then 'Mais de 14 dias sem interação'
        else 'Revisão de rotina'
      end
    ),
    (r.action_base + r.priority_bonus + coalesce(r.score,0))::integer
  from ranked r
  order by (r.action_base + r.priority_bonus + coalesce(r.score,0)) desc,
           r.score desc nulls last,
           r.name
  limit greatest(1,least(coalesce(p_limit,30),100));
end;
$function$
