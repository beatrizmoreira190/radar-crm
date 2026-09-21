'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Target, UserRound, Workflow } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { OPPORTUNITY_SERVICE_LABELS, OPPORTUNITY_STAGE_LABELS, PRIORITY_LABELS, formatDate } from '@/lib/constants';
import PublisherHelp from '@/components/PublisherHelp';

const ACTIVE_OPPORTUNITY_STAGES=new Set(['identified','qualified','proposal','negotiation','on_hold']);

export default function PublisherRecordOverview({publisher,tasks=[],opportunities=[],interactions=[],stages=[],teamMap={}}){
  const {supabase,membership,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [nextMeeting,setNextMeeting]=useState(null);

  useEffect(()=>{
    let cancelled=false;
    async function loadNextMeeting(){
      if(!org||!publisher?.id)return;
      const {data}=await supabase.from('meetings')
        .select('id,title,scheduled_start,status,presenter_user_id')
        .eq('organization_id',org)
        .eq('publisher_id',publisher.id)
        .eq('status','scheduled')
        .gte('scheduled_start',new Date().toISOString())
        .order('scheduled_start',{ascending:true})
        .limit(1)
        .maybeSingle();
      if(!cancelled)setNextMeeting(data||null);
    }
    loadNextMeeting();
    return()=>{cancelled=true};
  },[org,publisher?.id,activityVersion,supabase]);

  const stageMap=useMemo(()=>Object.fromEntries(stages.map(item=>[item.id,item.name])),[stages]);
  const activeOpportunity=useMemo(()=>opportunities.find(item=>ACTIVE_OPPORTUNITY_STAGES.has(item.stage))||null,[opportunities]);
  const openTasks=useMemo(()=>tasks.filter(item=>['open','in_progress'].includes(item.status)).sort((a,b)=>{
    if(!a.due_at&&!b.due_at)return 0;if(!a.due_at)return 1;if(!b.due_at)return-1;return new Date(a.due_at)-new Date(b.due_at);
  }),[tasks]);
  const lastInteraction=interactions[0]||null;
  const ownerName=publisher?.owner_user_id?(teamMap[publisher.owner_user_id]?.full_name||teamMap[publisher.owner_user_id]?.email||'Equipe'):'Sem responsável atual';
  const prospectorName=publisher?.prospector_user_id?(teamMap[publisher.prospector_user_id]?.full_name||teamMap[publisher.prospector_user_id]?.email||'Equipe'):'Ainda não identificado';
  const stageName=stageMap[publisher?.stage_id]||'Sem etapa';

  if(!publisher)return null;

  return <section className="publisher-record-overview card" aria-label="Resumo comercial da editora">
    <div className="publisher-record-overview-head">
      <div>
        <span className="eyebrow">Visão da conta</span>
        <strong>O que você precisa saber antes de agir</strong>
        <p>Principais informações para orientar o próximo passo comercial.</p>
      </div>
      <div className="publisher-record-state">
        <span><Workflow size={13}/>{stageName}<PublisherHelp text="Etapa atual da editora no processo comercial."/></span>
        <span>{PRIORITY_LABELS[publisher.priority]||publisher.priority||'Sem prioridade'}<PublisherHelp text="Prioridade geral da conta para organização da rotina comercial."/></span>
      </div>
    </div>
    <div className="publisher-record-overview-grid">
      <article><div className="publisher-overview-label"><UserRound size={14}/><span>Responsável atual</span><PublisherHelp text="Pessoa que está com a condução do próximo estágio comercial desta editora."/></div><strong>{ownerName}</strong><small>Quem está com a bola agora</small></article><article><div className="publisher-overview-label"><UserRound size={14}/><span>Prospector de origem</span><PublisherHelp text="Pessoa que iniciou a prospecção desta editora. Esse histórico permanece mesmo depois de um handoff."/></div><strong>{prospectorName}</strong><small>Quem originou o relacionamento comercial</small></article>
      <article><div className="publisher-overview-label"><Clock3 size={14}/><span>Próxima ação</span><PublisherHelp text="Próximo retorno ou movimento comercial previsto para esta editora."/></div><strong>{publisher.next_action_at?formatDate(publisher.next_action_at,true):'Sem retorno agendado'}</strong><small>{openTasks[0]?.title||'Nenhuma pendência imediata'}</small></article>
      <article><div className="publisher-overview-label"><Clock3 size={14}/><span>Último contato</span><PublisherHelp text="Interação comercial mais recente registrada no CRM."/></div><strong>{publisher.last_contact_at?formatDate(publisher.last_contact_at,true):'Ainda não registrado'}</strong><small>{lastInteraction?.summary||'Sem resumo recente'}</small></article>
      <article><div className="publisher-overview-label"><Target size={14}/><span>Oportunidade ativa</span><PublisherHelp text="Negócio em andamento que ainda não foi ganho, perdido ou encerrado."/></div><strong>{activeOpportunity?.title||'Nenhuma ativa'}</strong><small>{activeOpportunity?`${OPPORTUNITY_SERVICE_LABELS[activeOpportunity.service_key]||'Outro serviço / projeto'} · ${OPPORTUNITY_STAGE_LABELS[activeOpportunity.stage]||activeOpportunity.stage}${activeOpportunity.next_step?` · ${activeOpportunity.next_step}`:''}`:'Sem negócio aberto no momento'}</small></article>
      <article><div className="publisher-overview-label"><CalendarClock size={14}/><span>Próxima reunião</span><PublisherHelp text="Próxima reunião comercial agendada para esta editora."/></div><strong>{nextMeeting?formatDate(nextMeeting.scheduled_start,true):'Nenhuma agendada'}</strong><small>{nextMeeting?nextMeeting.title:'Sem compromisso futuro registrado'}</small></article>
    </div>
  </section>;
}
