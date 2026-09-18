alter table public.cadences
  add column if not exists cadence_key text;

create unique index if not exists cadences_org_key_uidx
  on public.cadences(organization_id,cadence_key);

alter table public.cadence_steps
  add column if not exists outreach_template_id uuid references public.outreach_templates(id) on delete set null;

alter table public.tasks
  add column if not exists result_code text,
  add column if not exists result_note text,
  add column if not exists result_at timestamptz,
  add column if not exists outreach_template_id uuid references public.outreach_templates(id) on delete set null;

alter table public.tasks drop constraint if exists tasks_result_code_check;
alter table public.tasks add constraint tasks_result_code_check
  check (result_code is null or result_code in (
    'no_answer','left_message','connected','replied','meeting_scheduled','not_interested',
    'follow_up','wrong_contact','asked_email','callback_scheduled','proposal_requested',
    'qualified','busy','contact_updated','other'
  ));

alter table public.cadence_enrollments
  add column if not exists paused_until timestamptz,
  add column if not exists pause_reason text,
  add column if not exists last_result_code text;

create index if not exists tasks_cadence_status_due_idx
  on public.tasks(cadence_enrollment_id,status,due_at);

update public.cadences
set cadence_key='new_publisher',
    name='Nova editora · Prospecção inicial',
    description='Primeira aproximação com a editora, combinando ligação, apresentação e follow-ups ao longo de duas semanas.',
    updated_at=now()
where cadence_key is null and name='Prospecção padrão · 15 dias';

insert into public.cadences(organization_id,cadence_key,name,description,active)
select o.id,'new_publisher','Nova editora · Prospecção inicial',
       'Primeira aproximação com a editora, combinando ligação, apresentação e follow-ups ao longo de duas semanas.',true
from public.organizations o
where exists(select 1 from public.outreach_templates t where t.organization_id=o.id)
on conflict (organization_id,cadence_key) do update
set name=excluded.name,description=excluded.description,active=true,updated_at=now();

insert into public.cadences(organization_id,cadence_key,name,description,active)
select o.id,'no_response','Sem resposta · Segunda tentativa',
       'Sequência curta para contas que receberam uma primeira abordagem, mas ainda não responderam.',true
from public.organizations o
where exists(select 1 from public.outreach_templates t where t.organization_id=o.id)
on conflict (organization_id,cadence_key) do update
set name=excluded.name,description=excluded.description,active=true,updated_at=now();

insert into public.cadences(organization_id,cadence_key,name,description,active)
select o.id,'post_meeting','Pós-reunião · Próximos passos',
       'Acompanha envio de materiais, confirmação dos encaminhamentos e retomada após uma reunião comercial.',true
from public.organizations o
where exists(select 1 from public.outreach_templates t where t.organization_id=o.id)
on conflict (organization_id,cadence_key) do update
set name=excluded.name,description=excluded.description,active=true,updated_at=now();

insert into public.cadences(organization_id,cadence_key,name,description,active)
select o.id,'future_return','Retomada futura',
       'Retoma uma editora no período combinado, sem gerar contatos desnecessários antes da hora.',true
from public.organizations o
where exists(select 1 from public.outreach_templates t where t.organization_id=o.id)
on conflict (organization_id,cadence_key) do update
set name=excluded.name,description=excluded.description,active=true,updated_at=now();

insert into public.cadences(organization_id,cadence_key,name,description,active)
select o.id,'public_opportunity','Oportunidade em rede pública',
       'Organiza a resposta comercial quando surge uma oportunidade concreta em secretaria, rede ou programa público.',true
from public.organizations o
where exists(select 1 from public.outreach_templates t where t.organization_id=o.id)
on conflict (organization_id,cadence_key) do update
set name=excluded.name,description=excluded.description,active=true,updated_at=now();

delete from public.cadence_steps s
using public.cadences c
where s.cadence_id=c.id
  and c.cadence_key in ('new_publisher','no_response','post_meeting','future_return','public_opportunity');

insert into public.cadence_steps(cadence_id,position,delay_days,task_type,title,description,outreach_template_id)
select c.id,1,0,'call','1ª abordagem · Diagnóstico','Entender como a editora atua no mercado público e identificar o contato ou decisor correto.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Primeira ligação — diagnóstico' and t.active limit 1)
from public.cadences c where c.cadence_key='new_publisher'
union all
select c.id,2,1,'email','Enviar apresentação da Radar','Apresentar a atuação da Radar no mercado público e registrar o envio.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Apresentação Radar — mercado público' and t.active limit 1)
from public.cadences c where c.cadence_key='new_publisher'
union all
select c.id,3,4,'whatsapp','Reforçar contato por WhatsApp','Retomar de forma breve e contextualizada após o primeiro contato.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='WhatsApp pós-primeiro contato' and t.active limit 1)
from public.cadences c where c.cadence_key='new_publisher'
union all
select c.id,4,8,'call','Nova tentativa de contato','Retomar por telefone considerando o histórico das tentativas anteriores.',null
from public.cadences c where c.cadence_key='new_publisher'
union all
select c.id,5,14,'follow_up','Revisar resposta e próximo passo','Avaliar o histórico e decidir se a conta avança, pausa ou entra em uma nova cadência.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Follow-up — apresentação enviada' and t.active limit 1)
from public.cadences c where c.cadence_key='new_publisher';

insert into public.cadence_steps(cadence_id,position,delay_days,task_type,title,description,outreach_template_id)
select c.id,1,0,'email','Follow-up após ausência de resposta','Retomar a apresentação com uma mensagem curta e orientada ao potencial da editora.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Follow-up — apresentação enviada' and t.active limit 1)
from public.cadences c where c.cadence_key='no_response'
union all
select c.id,2,3,'whatsapp','Retomar por WhatsApp','Fazer uma tentativa curta por outro canal antes de uma nova ligação.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Convite para reunião curta' and t.active limit 1)
from public.cadences c where c.cadence_key='no_response'
union all
select c.id,3,7,'call','Última tentativa desta sequência','Fazer uma nova ligação e decidir se a conta deve ser pausada ou retomada em outro momento.',null
from public.cadences c where c.cadence_key='no_response';

insert into public.cadence_steps(cadence_id,position,delay_days,task_type,title,description,outreach_template_id)
select c.id,1,0,'email','Enviar resumo e próximos passos','Registrar os encaminhamentos combinados e confirmar o que será preparado pela Radar.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Pós-reunião — próximos passos' and t.active limit 1)
from public.cadences c where c.cadence_key='post_meeting'
union all
select c.id,2,3,'follow_up','Confirmar recebimento de materiais','Verificar se a editora recebeu e conseguiu avaliar o material combinado.',null
from public.cadences c where c.cadence_key='post_meeting'
union all
select c.id,3,7,'call','Retomar encaminhamentos da reunião','Retomar a conversa e definir o próximo passo comercial.',null
from public.cadences c where c.cadence_key='post_meeting';

insert into public.cadence_steps(cadence_id,position,delay_days,task_type,title,description,outreach_template_id)
select c.id,1,0,'email','Retomar no período combinado','Reabrir a conversa considerando o que foi combinado no contato anterior.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Retomada no momento combinado' and t.active limit 1)
from public.cadences c where c.cadence_key='future_return'
union all
select c.id,2,3,'call','Confirmar cenário atual','Entender se houve mudança de planejamento, catálogo, orçamento ou prioridade.',null
from public.cadences c where c.cadence_key='future_return';

insert into public.cadence_steps(cadence_id,position,delay_days,task_type,title,description,outreach_template_id)
select c.id,1,0,'whatsapp','Apresentar oportunidade identificada','Contextualizar a oportunidade pública e solicitar os títulos ou materiais mais aderentes.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Oportunidade identificada em rede pública' and t.active limit 1)
from public.cadences c where c.cadence_key='public_opportunity'
union all
select c.id,2,1,'email','Solicitar catálogo e materiais aderentes','Reunir títulos, projetos pedagógicos e informações necessárias para a apresentação à rede.',
       (select t.id from public.outreach_templates t where t.organization_id=c.organization_id and t.name='Catálogo com potencial para redes públicas' and t.active limit 1)
from public.cadences c where c.cadence_key='public_opportunity'
union all
select c.id,3,3,'call','Alinhar encaminhamento da oportunidade','Confirmar materiais, condições e próximos passos para a oportunidade pública.',null
from public.cadences c where c.cadence_key='public_opportunity';

create or replace function private.set_publisher_stage_by_name(p_organization_id uuid,p_publisher_id uuid,p_stage_name text,p_allow_backward boolean default false)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare target_id uuid; target_pos integer; current_pos integer;
begin
  select id,position into target_id,target_pos from public.pipeline_stages
  where organization_id=p_organization_id and name=p_stage_name and active=true order by position limit 1;
  if target_id is null then return; end if;
  select s.position into current_pos from public.publishers p left join public.pipeline_stages s on s.id=p.stage_id
  where p.id=p_publisher_id and p.organization_id=p_organization_id;
  if p_allow_backward or current_pos is null or current_pos < target_pos then
    update public.publishers set stage_id=target_id,updated_by=auth.uid(),updated_at=now()
    where id=p_publisher_id and organization_id=p_organization_id;
  end if;
end; $$;
revoke all on function private.set_publisher_stage_by_name(uuid,uuid,text,boolean) from public;

create or replace function public.crm_start_cadence(p_organization_id uuid,p_cadence_id uuid,p_publisher_id uuid,p_user_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare target_user uuid:=coalesce(p_user_id,auth.uid()); enrollment_id uuid; r text; p_name text; step record; cadence_key_value text;
begin
  if not private.is_org_member(p_organization_id) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  r:=private.org_role(p_organization_id);
  if target_user<>auth.uid() and r not in ('owner','admin','supervisor') then raise exception 'Você só pode iniciar cadências para si mesmo' using errcode='42501'; end if;
  if not exists(select 1 from public.org_members m where m.organization_id=p_organization_id and m.user_id=target_user and m.active) then raise exception 'Usuário não pertence à equipe'; end if;
  select name into p_name from public.publishers where id=p_publisher_id and organization_id=p_organization_id and not archived;
  if p_name is null then raise exception 'Editora não encontrada'; end if;
  select cadence_key into cadence_key_value from public.cadences where id=p_cadence_id and organization_id=p_organization_id and active;
  if not found then raise exception 'Cadência não encontrada'; end if;
  if r='member' then
    update public.publishers set owner_user_id=auth.uid(),updated_by=auth.uid(),updated_at=now()
    where id=p_publisher_id and organization_id=p_organization_id and (owner_user_id is null or owner_user_id=auth.uid());
    if not exists(select 1 from public.publishers where id=p_publisher_id and organization_id=p_organization_id and owner_user_id=auth.uid()) then raise exception 'Esta editora está sob responsabilidade de outra pessoa'; end if;
  end if;
  if exists(select 1 from public.cadence_enrollments e where e.organization_id=p_organization_id and e.publisher_id=p_publisher_id and e.status in ('active','paused')) then raise exception 'A editora já possui uma cadência em andamento'; end if;
  insert into public.cadence_enrollments(organization_id,cadence_id,publisher_id,user_id,status)
  values(p_organization_id,p_cadence_id,p_publisher_id,target_user,'active') returning id into enrollment_id;
  for step in select * from public.cadence_steps where cadence_id=p_cadence_id order by position loop
    insert into public.tasks(organization_id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,cadence_enrollment_id,cadence_step_id,outreach_template_id)
    values(p_organization_id,p_publisher_id,target_user,auth.uid(),step.title||' · '||p_name,step.description,step.task_type,now()+make_interval(days=>step.delay_days),'open','medium',enrollment_id,step.id,step.outreach_template_id);
  end loop;
  if cadence_key_value in ('new_publisher','no_response') then perform private.set_publisher_stage_by_name(p_organization_id,p_publisher_id,'Tentativa de contato',false);
  elsif cadence_key_value='post_meeting' then perform private.set_publisher_stage_by_name(p_organization_id,p_publisher_id,'Conversando',false);
  elsif cadence_key_value='future_return' then perform private.set_publisher_stage_by_name(p_organization_id,p_publisher_id,'Retomar depois',true);
  elsif cadence_key_value='public_opportunity' then perform private.set_publisher_stage_by_name(p_organization_id,p_publisher_id,'Oportunidade identificada',false);
  end if;
  return enrollment_id;
end; $$;
grant execute on function public.crm_start_cadence(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.crm_refresh_cadences(p_organization_id uuid)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
declare changed integer:=0; resumed integer:=0; completed integer:=0;
begin
  if not private.is_org_member(p_organization_id) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  update public.cadence_enrollments set status='active',paused_until=null,pause_reason=null
  where organization_id=p_organization_id and status='paused' and paused_until is not null and paused_until<=now();
  get diagnostics resumed=row_count;
  update public.cadence_enrollments e set status='completed',completed_at=coalesce(completed_at,now())
  where e.organization_id=p_organization_id and e.status='active'
    and not exists(select 1 from public.tasks t where t.cadence_enrollment_id=e.id and t.status in ('open','in_progress'));
  get diagnostics completed=row_count;
  changed:=resumed+completed; return changed;
end; $$;
grant execute on function public.crm_refresh_cadences(uuid) to authenticated;

create or replace function public.crm_complete_cadence_task(p_organization_id uuid,p_task_id uuid,p_result_code text,p_result_note text default null,p_resume_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare t public.tasks%rowtype; e public.cadence_enrollments%rowtype; r text; p_name text; template_id uuid; open_count integer; final_status text; action_label text:='Cadência mantida';
begin
  if not private.is_org_member(p_organization_id) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  select * into t from public.tasks where id=p_task_id and organization_id=p_organization_id for update;
  if not found or t.cadence_enrollment_id is null then raise exception 'Tarefa de cadência não encontrada'; end if;
  select * into e from public.cadence_enrollments where id=t.cadence_enrollment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Cadência não encontrada'; end if;
  r:=private.org_role(p_organization_id);
  if t.assigned_to<>auth.uid() and r not in ('owner','admin','supervisor') then raise exception 'Você não pode concluir esta tarefa' using errcode='42501'; end if;
  if p_result_code not in ('no_answer','left_message','connected','replied','meeting_scheduled','not_interested','follow_up','wrong_contact','asked_email','callback_scheduled','proposal_requested','qualified','busy','contact_updated','other') then raise exception 'Resultado comercial inválido'; end if;
  select name into p_name from public.publishers where id=t.publisher_id and organization_id=p_organization_id;
  p_name:=coalesce(nullif(btrim(p_name),''),'Editora');
  update public.tasks set status='done',completed_at=coalesce(completed_at,now()),result_code=p_result_code,result_note=nullif(btrim(coalesce(p_result_note,'')),''),result_at=now(),updated_at=now() where id=t.id;
  update public.cadence_enrollments set last_result_code=p_result_code where id=e.id;

  if p_result_code in ('no_answer','left_message') then
    perform private.set_publisher_stage_by_name(p_organization_id,e.publisher_id,'Tentativa de contato',false); action_label:='Próximas tentativas mantidas';
  elsif p_result_code in ('connected','replied','contact_updated') then
    perform private.set_publisher_stage_by_name(p_organization_id,e.publisher_id,'Contato realizado',false);
    update public.tasks set status='cancelled',updated_at=now() where cadence_enrollment_id=e.id and id<>t.id and status in ('open','in_progress');
    select id into template_id from public.outreach_templates where organization_id=p_organization_id and name='Follow-up — apresentação enviada' and active limit 1;
    insert into public.tasks(organization_id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,cadence_enrollment_id,outreach_template_id)
    values(p_organization_id,e.publisher_id,e.user_id,auth.uid(),'Follow-up após contato · '||p_name,'Retomar a conversa considerando o que foi discutido no contato anterior.','follow_up',now()+interval '3 days','open','medium',e.id,template_id);
    action_label:='Próximo passo ajustado para follow-up';
  elsif p_result_code='asked_email' then
    perform private.set_publisher_stage_by_name(p_organization_id,e.publisher_id,'Contato realizado',false);
    update public.tasks set status='cancelled',updated_at=now() where cadence_enrollment_id=e.id and id<>t.id and status in ('open','in_progress');
    select id into template_id from public.outreach_templates where organization_id=p_organization_id and name='Apresentação Radar — mercado público' and active limit 1;
    insert into public.tasks(organization_id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,cadence_enrollment_id,outreach_template_id)
    values(p_organization_id,e.publisher_id,e.user_id,auth.uid(),'Enviar apresentação solicitada · '||p_name,'Enviar a apresentação da Radar conforme solicitado no contato.','email',now(),'open','high',e.id,template_id);
    select id into template_id from public.outreach_templates where organization_id=p_organization_id and name='Follow-up — apresentação enviada' and active limit 1;
    insert into public.tasks(organization_id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,cadence_enrollment_id,outreach_template_id)
    values(p_organization_id,e.publisher_id,e.user_id,auth.uid(),'Confirmar avaliação da apresentação · '||p_name,'Retomar após o envio e verificar se a editora conseguiu avaliar a apresentação.','follow_up',now()+interval '3 days','open','medium',e.id,template_id);
    action_label:='Envio e follow-up adicionados à fila';
  elsif p_result_code='wrong_contact' then
    insert into public.tasks(organization_id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,cadence_enrollment_id)
    values(p_organization_id,e.publisher_id,e.user_id,auth.uid(),'Localizar contato correto · '||p_name,'Pesquisar o decisor ou contato adequado antes da próxima tentativa.','research',now(),'open','high',e.id);
    action_label:='Pesquisa de contato adicionada';
  elsif p_result_code in ('follow_up','callback_scheduled','busy') then
    if p_resume_at is null or p_resume_at<=now() then raise exception 'Informe uma data futura para retomar o contato'; end if;
    update public.tasks set status='cancelled',updated_at=now() where cadence_enrollment_id=e.id and id<>t.id and status in ('open','in_progress');
    select id into template_id from public.outreach_templates where organization_id=p_organization_id and name='Retomada no momento combinado' and active limit 1;
    insert into public.tasks(organization_id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,cadence_enrollment_id,outreach_template_id)
    values(p_organization_id,e.publisher_id,e.user_id,auth.uid(),'Retomar contato · '||p_name,coalesce(nullif(btrim(coalesce(p_result_note,'')),''),'Retomar o contato na data combinada.'),'follow_up',p_resume_at,'open','medium',e.id,template_id);
    update public.cadence_enrollments set status='paused',paused_until=p_resume_at,pause_reason=coalesce(nullif(btrim(coalesce(p_result_note,'')),''),'Retomar depois'),completed_at=null where id=e.id;
    perform private.set_publisher_stage_by_name(p_organization_id,e.publisher_id,'Retomar depois',true); action_label:='Cadência pausada até a data informada';
  elsif p_result_code='meeting_scheduled' then
    update public.tasks set status='cancelled',updated_at=now() where cadence_enrollment_id=e.id and id<>t.id and status in ('open','in_progress');
    update public.cadence_enrollments set status='completed',completed_at=now(),paused_until=null,pause_reason=null where id=e.id;
    perform private.set_publisher_stage_by_name(p_organization_id,e.publisher_id,'Conversando',false); action_label:='Cadência concluída: reunião marcada';
  elsif p_result_code='not_interested' then
    update public.tasks set status='cancelled',updated_at=now() where cadence_enrollment_id=e.id and id<>t.id and status in ('open','in_progress');
    update public.cadence_enrollments set status='completed',completed_at=now(),paused_until=null,pause_reason=null where id=e.id;
    perform private.set_publisher_stage_by_name(p_organization_id,e.publisher_id,'Sem interesse',true); action_label:='Cadência encerrada: sem interesse';
  elsif p_result_code in ('proposal_requested','qualified') then
    update public.tasks set status='cancelled',updated_at=now() where cadence_enrollment_id=e.id and id<>t.id and status in ('open','in_progress');
    update public.cadence_enrollments set status='completed',completed_at=now(),paused_until=null,pause_reason=null where id=e.id;
    perform private.set_publisher_stage_by_name(p_organization_id,e.publisher_id,'Oportunidade identificada',false);
    insert into public.tasks(organization_id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority)
    values(p_organization_id,e.publisher_id,e.user_id,auth.uid(),case when p_result_code='proposal_requested' then 'Preparar proposta ou curadoria · '||p_name else 'Definir próximo passo da oportunidade · '||p_name end,case when p_result_code='proposal_requested' then 'Organizar proposta, curadoria ou material solicitado pela editora.' else 'Registrar a oportunidade e definir o encaminhamento comercial.' end,case when p_result_code='proposal_requested' then 'proposal' else 'follow_up' end,now()+interval '1 day','open','high');
    action_label:='Oportunidade identificada e próximo passo criado';
  else action_label:='Resultado registrado';
  end if;

  select status into final_status from public.cadence_enrollments where id=e.id;
  if final_status='active' then
    select count(*) into open_count from public.tasks where cadence_enrollment_id=e.id and status in ('open','in_progress');
    if open_count=0 then
      update public.cadence_enrollments set status='completed',completed_at=now() where id=e.id;
      final_status:='completed'; action_label:=action_label||' · cadência concluída';
    end if;
  end if;
  return jsonb_build_object('ok',true,'enrollmentStatus',coalesce(final_status,'active'),'action',action_label);
end; $$;
grant execute on function public.crm_complete_cadence_task(uuid,uuid,text,text,timestamptz) to authenticated;

create or replace function private.close_cadence_when_meeting_scheduled()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if new.status='scheduled' and (tg_op='INSERT' or old.status is distinct from new.status) then
    update public.tasks set status='cancelled',updated_at=now()
    where cadence_enrollment_id in (select id from public.cadence_enrollments where organization_id=new.organization_id and publisher_id=new.publisher_id and status in ('active','paused'))
      and status in ('open','in_progress');
    update public.cadence_enrollments set status='completed',completed_at=now(),paused_until=null,pause_reason=null,last_result_code='meeting_scheduled'
    where organization_id=new.organization_id and publisher_id=new.publisher_id and status in ('active','paused');
    perform private.set_publisher_stage_by_name(new.organization_id,new.publisher_id,'Conversando',false);
  end if; return new;
end; $$;
revoke all on function private.close_cadence_when_meeting_scheduled() from public;
drop trigger if exists trg_close_cadence_when_meeting_scheduled on public.meetings;
create trigger trg_close_cadence_when_meeting_scheduled after insert or update of status on public.meetings
for each row execute function private.close_cadence_when_meeting_scheduled();
