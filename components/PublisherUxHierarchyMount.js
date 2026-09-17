'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { CalendarClock, Clock3, Target, UserRound, Workflow } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { OPPORTUNITY_STAGE_LABELS, PRIORITY_LABELS, formatDate } from '@/lib/constants';
import PublisherHelp from '@/components/PublisherHelp';

const ACTIVE_OPPORTUNITY_STAGES=new Set(['identified','qualified','proposal','negotiation','on_hold']);

function sectionByHeading(root,label){
  return [...root.children].find(child=>child.querySelector?.('h2')?.textContent?.replace(/\?/g,'').trim()===label)||null;
}

export default function PublisherUxHierarchyMount(){
  const {id}=useParams();
  const {supabase,membership,teamMap,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [mount,setMount]=useState(null);
  const [publisher,setPublisher]=useState(null);
  const [tasks,setTasks]=useState([]);
  const [opportunities,setOpportunities]=useState([]);
  const [meetings,setMeetings]=useState([]);
  const [interactions,setInteractions]=useState([]);
  const [stages,setStages]=useState([]);

  async function load(){
    if(!org||!id)return;
    const now=new Date().toISOString();
    const [p,t,o,m,i,s]=await Promise.all([
      supabase.from('publishers').select('id,name,priority,stage_id,owner_user_id,last_contact_at,next_action_at,score').eq('organization_id',org).eq('id',id).maybeSingle(),
      supabase.from('tasks').select('id,title,due_at,status').eq('organization_id',org).eq('publisher_id',id).in('status',['open','in_progress']).order('due_at',{ascending:true,nullsFirst:false}).limit(6),
      supabase.from('opportunities').select('id,title,stage,next_step').eq('organization_id',org).eq('publisher_id',id).order('created_at',{ascending:false}),
      supabase.from('meetings').select('id,title,scheduled_start,status,presenter_user_id').eq('organization_id',org).eq('publisher_id',id).eq('status','scheduled').gte('scheduled_start',now).order('scheduled_start',{ascending:true}).limit(4),
      supabase.from('interactions').select('id,summary,occurred_at').eq('organization_id',org).eq('publisher_id',id).order('occurred_at',{ascending:false}).limit(1),
      supabase.from('pipeline_stages').select('id,name').eq('organization_id',org).eq('active',true)
    ]);
    setPublisher(p.data||null);setTasks(t.data||[]);setOpportunities(o.data||[]);setMeetings(m.data||[]);setInteractions(i.data||[]);setStages(s.data||[]);
  }

  useEffect(()=>{load()},[org,id,activityVersion]);

  useEffect(()=>{
    let node=null;let timer=null;let attempts=0;
    function attach(){
      const grid=document.querySelector('.detail-grid');
      if(!grid){if(attempts++<40)timer=setTimeout(attach,60);return}
      node=document.createElement('div');node.dataset.publisherRecordOverview='true';
      grid.insertAdjacentElement('beforebegin',node);setMount(node);
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);if(node?.parentNode)node.parentNode.removeChild(node)};
  },[id]);

  useEffect(()=>{
    let observer=null;let timer=null;
    function apply(){
      const grid=document.querySelector('.detail-grid');if(!grid)return;
      grid.classList.add('publisher-record-grid');
      const stacks=grid.querySelectorAll(':scope > .detail-stack');const main=stacks[0];const aside=stacks[1];if(!main)return;
      main.classList.add('publisher-record-main');
      if(aside)aside.classList.add('publisher-record-aside');
      const data=sectionByHeading(main,'Dados da editora');
      const radar=main.querySelector('[data-radar-intelligence="publisher-detail"]');
      const contacts=sectionByHeading(main,'Contatos');
      const history=sectionByHeading(main,'Histórico de contatos');
      const opps=sectionByHeading(main,'Oportunidades');
      const meetingsNode=main.querySelector('[data-publisher-meetings="commercial-meetings"]');
      const materials=main.querySelector('[data-publisher-materials="commercial-materials"]');
      [[data,0,'publisher-data-card'],[radar,10,'publisher-score-card'],[contacts,20,'publisher-contacts-card'],[history,30,'publisher-history-card'],[opps,40,'publisher-opportunities-card'],[meetingsNode,50,'publisher-meetings-section'],[materials,60,'publisher-materials-section']].forEach(([el,order,className])=>{if(el){el.style.order=String(order);el.classList.add(className)}});
      if(aside){
        [...aside.children].forEach(child=>{
          const title=child.querySelector?.('h3,h2')?.textContent?.replace(/\?/g,'').trim();
          if(title==='Resumo')child.style.display='none';
          if(title==='Tarefas')child.classList.add('publisher-sidebar-tasks');
          if(title==='Acompanhamento')child.classList.add('publisher-sidebar-tracking');
        });
      }
    }
    timer=setTimeout(apply,120);
    const grid=document.querySelector('.detail-grid');if(grid){observer=new MutationObserver(apply);observer.observe(grid,{childList:true,subtree:true})}
    return()=>{if(timer)clearTimeout(timer);observer?.disconnect()};
  },[id]);

  const stageMap=useMemo(()=>Object.fromEntries(stages.map(item=>[item.id,item.name])),[stages]);
  const activeOpportunity=useMemo(()=>opportunities.find(item=>ACTIVE_OPPORTUNITY_STAGES.has(item.stage))||null,[opportunities]);
  const nextMeeting=meetings[0]||null;
  const lastInteraction=interactions[0]||null;
  const ownerName=publisher?.owner_user_id?(teamMap[publisher.owner_user_id]?.full_name||teamMap[publisher.owner_user_id]?.email||'Equipe'):'Sem responsável';
  const stageName=stageMap[publisher?.stage_id]||'Sem etapa';

  if(!mount||!publisher)return null;

  return createPortal(
    <section className="publisher-record-overview card" aria-label="Resumo comercial da editora">
      <div className="publisher-record-overview-head">
        <div>
          <span className="eyebrow">Visão da conta</span>
          <strong>O que você precisa saber antes de agir</strong>
          <p>Contexto comercial essencial, sem esconder os dados completos da ficha.</p>
        </div>
        <div className="publisher-record-state">
          <span><Workflow size={13}/>{stageName}<PublisherHelp text="Etapa atual da editora no processo de prospecção."/></span>
          <span>{PRIORITY_LABELS[publisher.priority]||publisher.priority||'Sem prioridade'}<PublisherHelp text="Prioridade geral da conta para organização da rotina comercial."/></span>
        </div>
      </div>
      <div className="publisher-record-overview-grid">
        <article><div className="publisher-overview-label"><UserRound size={14}/><span>Responsável</span><PublisherHelp text="Pessoa responsável por conduzir a prospecção desta editora."/></div><strong>{ownerName}</strong><small>Quem conduz a conta hoje</small></article>
        <article><div className="publisher-overview-label"><Clock3 size={14}/><span>Próxima ação</span><PublisherHelp text="Próximo retorno ou movimento comercial previsto para esta editora."/></div><strong>{publisher.next_action_at?formatDate(publisher.next_action_at,true):'Sem retorno agendado'}</strong><small>{tasks[0]?.title||'Nenhuma pendência imediata'}</small></article>
        <article><div className="publisher-overview-label"><Clock3 size={14}/><span>Último contato</span><PublisherHelp text="Interação comercial mais recente registrada no CRM."/></div><strong>{publisher.last_contact_at?formatDate(publisher.last_contact_at,true):'Ainda não registrado'}</strong><small>{lastInteraction?.summary||'Sem resumo recente'}</small></article>
        <article><div className="publisher-overview-label"><Target size={14}/><span>Oportunidade ativa</span><PublisherHelp text="Negócio em andamento que ainda não foi ganho, perdido ou encerrado."/></div><strong>{activeOpportunity?.title||'Nenhuma ativa'}</strong><small>{activeOpportunity?`${OPPORTUNITY_STAGE_LABELS[activeOpportunity.stage]||activeOpportunity.stage}${activeOpportunity.next_step?` · ${activeOpportunity.next_step}`:''}`:'Sem negócio aberto no momento'}</small></article>
        <article><div className="publisher-overview-label"><CalendarClock size={14}/><span>Próxima reunião</span><PublisherHelp text="Próxima reunião comercial agendada com esta editora."/></div><strong>{nextMeeting?formatDate(nextMeeting.scheduled_start,true):'Nenhuma agendada'}</strong><small>{nextMeeting?nextMeeting.title:'Sem compromisso futuro registrado'}</small></article>
      </div>
    </section>,mount
  );
}
