'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { CalendarClock, CheckCircle2, ChevronDown, Clock3, ContactRound, Database, FileText, Gauge, ListPlus, MoreHorizontal, Target, UserPlus } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { OPPORTUNITY_STAGE_LABELS, formatDate } from '@/lib/constants';

const ACTIVE_OPPORTUNITY_STAGES=new Set(['identified','qualified','proposal','negotiation','on_hold']);

function externalButtons(){
  return [...document.querySelectorAll('.page-wrap button')].filter(item=>!item.closest('[data-publisher-ux-overview]')&&!item.closest('[data-publisher-score-shortcut]'));
}
function clickAction(label){
  const button=externalButtons().find(item=>item.textContent?.replace(/\s+/g,' ').trim().toLowerCase().includes(label.toLowerCase()));
  if(button){button.click();return true}
  return false;
}
function clickSelector(selector){
  const item=document.querySelector(selector);
  if(item instanceof HTMLElement){item.click();return true}
  return false;
}
function sectionByHeading(root,label){
  return [...root.children].find(child=>child.querySelector?.('h2')?.textContent?.trim()===label)||null;
}
function closeDetails(event){event.currentTarget.closest('details')?.removeAttribute('open')}

export default function PublisherUxHierarchyMount(){
  const {id}=useParams();
  const {supabase,membership,user,isManager,hasCommercialFunction,teamMap,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [mount,setMount]=useState(null);
  const [headerMount,setHeaderMount]=useState(null);
  const [publisher,setPublisher]=useState(null);
  const [tasks,setTasks]=useState([]);
  const [opportunities,setOpportunities]=useState([]);
  const [meetings,setMeetings]=useState([]);
  const [interactions,setInteractions]=useState([]);
  const [notice,setNotice]=useState('');

  const canWork=Boolean(publisher&&(isManager||publisher.owner_user_id===user?.id));
  const canSchedule=canWork&&(isManager||hasCommercialFunction('meeting_scheduling'));

  async function load(){
    if(!org||!id)return;
    const now=new Date().toISOString();
    const [p,t,o,m,i]=await Promise.all([
      supabase.from('publishers').select('id,name,priority,stage_id,owner_user_id,last_contact_at,next_action_at,commercial_temperature,score,website').eq('organization_id',org).eq('id',id).maybeSingle(),
      supabase.from('tasks').select('id,title,due_at,status,priority,assigned_to').eq('organization_id',org).eq('publisher_id',id).in('status',['open','in_progress']).order('due_at',{ascending:true,nullsFirst:false}).limit(6),
      supabase.from('opportunities').select('id,title,stage,next_step,expected_close_date,estimated_value,probability').eq('organization_id',org).eq('publisher_id',id).order('created_at',{ascending:false}),
      supabase.from('meetings').select('id,title,scheduled_start,duration_minutes,status,presenter_user_id').eq('organization_id',org).eq('publisher_id',id).eq('status','scheduled').gte('scheduled_start',now).order('scheduled_start',{ascending:true}).limit(4),
      supabase.from('interactions').select('id,summary,result,occurred_at,next_step').eq('organization_id',org).eq('publisher_id',id).order('occurred_at',{ascending:false}).limit(1)
    ]);
    if(p.error||t.error||o.error||m.error||i.error)setNotice(p.error?.message||t.error?.message||o.error?.message||m.error?.message||i.error?.message||'Não foi possível carregar a visão comercial.');
    setPublisher(p.data||null);setTasks(t.data||[]);setOpportunities(o.data||[]);setMeetings(m.data||[]);setInteractions(i.data||[]);
  }

  useEffect(()=>{load()},[org,id,activityVersion]);

  useEffect(()=>{
    let node=null;let timer=null;let attempts=0;
    function attach(){
      const grid=document.querySelector('.detail-grid');
      if(!grid){if(attempts++<40)timer=setTimeout(attach,50);return}
      node=document.createElement('div');node.dataset.publisherUxOverview='commercial-overview';
      grid.insertAdjacentElement('beforebegin',node);setMount(node);
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);if(node?.parentNode)node.parentNode.removeChild(node)};
  },[id]);

  useEffect(()=>{
    let node=null;let timer=null;let hiddenScore=null;let attempts=0;
    function attach(){
      const chips=document.querySelector('.page-head .chips');
      if(!chips){if(attempts++<40)timer=setTimeout(attach,50);return}
      hiddenScore=chips.querySelector('.badge.dark');if(hiddenScore)hiddenScore.style.display='none';
      node=document.createElement('span');node.dataset.publisherScoreShortcut='true';chips.prepend(node);setHeaderMount(node);
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);if(hiddenScore)hiddenScore.style.display='';if(node?.parentNode)node.parentNode.removeChild(node)};
  },[id]);

  useEffect(()=>{
    let timer=null;let observer=null;
    function apply(){
      const grid=document.querySelector('.detail-grid');if(!grid)return;
      const stacks=grid.querySelectorAll(':scope > .detail-stack');const main=stacks[0];const aside=stacks[1];if(!main)return;
      const radar=main.querySelector('[data-radar-intelligence="publisher-detail"]');
      const contacts=sectionByHeading(main,'Contatos');
      const history=sectionByHeading(main,'Histórico de contatos');
      const opps=sectionByHeading(main,'Oportunidades');
      const data=sectionByHeading(main,'Dados da editora');
      const meetings=main.querySelector('[data-publisher-meetings="commercial-meetings"]');
      const materials=main.querySelector('[data-publisher-materials="commercial-materials"]');
      const ordered=[[radar,0,'radar-score'],[contacts,10,'relacionamento'],[history,20,'historico'],[opps,30,'oportunidades'],[meetings,40,'reunioes'],[materials,50,'materiais'],[data,60,'dados']];
      ordered.forEach(([el,order,anchor])=>{if(el){el.style.order=String(order);el.id=`publisher-${anchor}`}});
      if(aside){
        [...aside.children].forEach(child=>{
          const title=child.querySelector?.('h3,h2')?.textContent?.trim();
          if(title==='Resumo')child.style.display='none';
          if(title==='Tarefas'){child.classList.add('publisher-compact-tasks');child.id='publisher-tarefas'}
          if(title==='Acompanhamento'){child.classList.add('publisher-tracking-panel');child.id='publisher-acompanhamento'}
        });
      }
    }
    timer=setTimeout(apply,120);
    const grid=document.querySelector('.detail-grid');
    if(grid){observer=new MutationObserver(apply);observer.observe(grid,{childList:true,subtree:true})}
    return()=>{if(timer)clearTimeout(timer);observer?.disconnect()};
  },[id]);

  const activeOpportunity=useMemo(()=>opportunities.find(item=>ACTIVE_OPPORTUNITY_STAGES.has(item.stage))||null,[opportunities]);
  const nextMeeting=meetings[0]||null;
  const nextTasks=tasks.slice(0,2);
  const lastInteraction=interactions[0]||null;
  const ownerName=publisher?.owner_user_id?(teamMap[publisher.owner_user_id]?.full_name||teamMap[publisher.owner_user_id]?.email||'Equipe'):'Sem responsável';

  function scrollTo(anchor){document.getElementById(`publisher-${anchor}`)?.scrollIntoView({behavior:'smooth',block:'start'})}
  function scrollElement(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
  function action(label,fallbackAnchor){if(!clickAction(label)){setNotice(`A ação “${label}” ainda não está disponível nesta ficha.`);if(fallbackAnchor)scrollTo(fallbackAnchor)}}
  function taskAction(){if(!clickSelector('[title="Nova tarefa"]')){scrollElement('publisher-tarefas');setNotice('Use o botão + em Tarefas para criar uma nova pendência.')}}

  if(!mount||!publisher)return null;

  const commandCenter=<section className="publisher-command-center">
    <div className="publisher-action-bar">
      <div className="publisher-action-copy"><span className="eyebrow">Jornada comercial</span><strong>{canWork?'Próximo movimento':'Visão comercial'}</strong></div>
      {canWork?<div className="publisher-primary-actions">
        <button className="btn" type="button" onClick={()=>action('Registrar contato','relacionamento')}><ContactRound size={15}/> Registrar contato</button>
        <button className="btn secondary" type="button" onClick={()=>action('Oportunidade','oportunidades')}><Target size={15}/> Criar oportunidade</button>
        {canSchedule&&<button className="btn secondary" type="button" onClick={()=>action('Agendar reunião','reunioes')}><CalendarClock size={15}/> Agendar reunião</button>}
        <details className="publisher-more"><summary title="Mais ações"><MoreHorizontal size={17}/><span>Mais</span></summary><div className="publisher-more-popover">
          <button type="button" onClick={e=>{action('Contato','relacionamento');closeDetails(e)}}><UserPlus size={14}/> Adicionar contato</button>
          <button type="button" onClick={e=>{taskAction();closeDetails(e)}}><ListPlus size={14}/> Criar tarefa</button>
          <button type="button" onClick={e=>{scrollTo('materiais');closeDetails(e)}}><FileText size={14}/> Materiais comerciais</button>
          <button type="button" onClick={e=>{scrollElement('publisher-acompanhamento');closeDetails(e)}}><Gauge size={14}/> Situação comercial</button>
          <button type="button" onClick={e=>{scrollTo('dados');closeDetails(e)}}><Database size={14}/> Dados da editora</button>
        </div></details>
      </div>:<span className="publisher-readonly-note">Modo leitura · ações permanecem com o responsável da conta</span>}
    </div>
    {notice&&<div className="publisher-ux-notice">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
    <div className="publisher-now-grid">
      <article><small>Próxima ação</small><strong>{publisher.next_action_at?formatDate(publisher.next_action_at,true):'Sem retorno agendado'}</strong><span>{ownerName}</span></article>
      <article><small>Último contato</small><strong>{publisher.last_contact_at?formatDate(publisher.last_contact_at,true):'Ainda não registrado'}</strong><span>{lastInteraction?.summary||'Sem resumo recente'}</span></article>
      <article className="clickable" onClick={()=>scrollTo('oportunidades')}><small>Oportunidade</small><strong>{activeOpportunity?.title||'Nenhuma ativa'}</strong><span>{activeOpportunity?`${OPPORTUNITY_STAGE_LABELS[activeOpportunity.stage]||activeOpportunity.stage}${activeOpportunity.next_step?` · ${activeOpportunity.next_step}`:''}`:'Crie quando houver uma possibilidade concreta'}</span></article>
      <article className="clickable" onClick={()=>scrollTo('reunioes')}><small>Próxima reunião</small><strong>{nextMeeting?formatDate(nextMeeting.scheduled_start,true):'Nenhuma agendada'}</strong><span>{nextMeeting?`${nextMeeting.title} · ${teamMap[nextMeeting.presenter_user_id]?.full_name||teamMap[nextMeeting.presenter_user_id]?.email||'Equipe'}`:'A agenda continua livre'}</span></article>
    </div>
    <div className="publisher-task-strip">
      <div><CheckCircle2 size={15}/><strong>{tasks.length} tarefa{tasks.length===1?'':'s'} aberta{tasks.length===1?'':'s'}</strong></div>
      <div className="publisher-task-items">{nextTasks.length?nextTasks.map(task=><span key={task.id}><Clock3 size={12}/>{task.title}{task.due_at?` · ${formatDate(task.due_at,true)}`:''}</span>):<span>Nenhuma pendência imediata.</span>}</div>
      {tasks.length>0&&<button type="button" className="publisher-task-link" onClick={()=>scrollElement('publisher-tarefas')}>Ver tarefas</button>}
    </div>
    <nav className="publisher-section-nav" aria-label="Seções da ficha">
      <button type="button" onClick={()=>scrollTo('radar-score')}>Radar Score</button>
      <button type="button" onClick={()=>scrollTo('relacionamento')}>Relacionamento</button>
      <button type="button" onClick={()=>scrollTo('oportunidades')}>Oportunidades</button>
      <button type="button" onClick={()=>scrollTo('reunioes')}>Reuniões</button>
      <button type="button" onClick={()=>scrollTo('materiais')}>Materiais</button>
      <button type="button" onClick={()=>scrollTo('dados')}>Dados</button>
    </nav>
    <style jsx>{`
      .publisher-command-center{display:grid;gap:10px;margin:0 0 18px}.publisher-action-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid #e4e7ec;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04)}.publisher-action-copy{display:grid;gap:2px}.publisher-action-copy strong{font-size:15px;color:#101828}.publisher-primary-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center}.publisher-readonly-note{font-size:10px;color:#667085}.publisher-ux-notice{display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-radius:10px;background:#fffaeb;color:#8a6116;font-size:11px}.publisher-ux-notice button{border:0;background:transparent;cursor:pointer;color:inherit}.publisher-now-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #e4e7ec;border-radius:14px;background:#fff;overflow:hidden}.publisher-now-grid article{padding:13px 15px;min-width:0;border-right:1px solid #eaecf0;display:grid;gap:4px}.publisher-now-grid article:last-child{border-right:0}.publisher-now-grid article.clickable{cursor:pointer}.publisher-now-grid article.clickable:hover{background:#f9fafb}.publisher-now-grid small{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#98a2b3;font-weight:800}.publisher-now-grid strong{font-size:12px;color:#101828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.publisher-now-grid span{font-size:10px;color:#667085;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.publisher-task-strip{display:flex;align-items:center;gap:16px;padding:9px 13px;border:1px solid #eaecf0;border-radius:11px;background:#fcfcfd;font-size:10px;color:#667085}.publisher-task-strip>div:first-child{display:flex;align-items:center;gap:6px;white-space:nowrap;color:#344054}.publisher-task-items{display:flex;gap:12px;min-width:0;overflow:hidden;flex:1}.publisher-task-items span{display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.publisher-task-link{border:0;background:transparent;color:#b42318;font-size:10px;font-weight:800;white-space:nowrap}.publisher-section-nav{position:sticky;top:0;z-index:8;display:flex;gap:4px;overflow:auto;padding:5px;border:1px solid #eaecf0;border-radius:11px;background:rgba(255,255,255,.96);backdrop-filter:blur(8px)}.publisher-section-nav button{border:0;background:transparent;border-radius:7px;padding:7px 10px;font-size:10px;font-weight:700;color:#667085;cursor:pointer;white-space:nowrap}.publisher-section-nav button:hover{background:#f2f4f7;color:#101828}.publisher-more{position:relative}.publisher-more summary{list-style:none;min-height:34px;padding:7px 10px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;color:#344054;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;cursor:pointer}.publisher-more summary::-webkit-details-marker{display:none}.publisher-more[open] summary{background:#f9fafb}.publisher-more-popover{position:absolute;right:0;top:39px;z-index:30;width:205px;padding:5px;border:1px solid #e4e7ec;border-radius:10px;background:#fff;box-shadow:0 12px 30px rgba(16,24,40,.14);display:grid}.publisher-more-popover button{border:0;background:transparent;border-radius:7px;padding:9px 10px;display:flex;align-items:center;gap:8px;color:#344054;font-size:11px;text-align:left}.publisher-more-popover button:hover{background:#f2f4f7}
      :global(.detail-grid>.detail-stack:first-child){display:grid!important;align-content:start!important}.publisher-command-center :global(.btn){white-space:nowrap}:global(.detail-grid .detail-stack>.card.panel),:global(.detail-grid .detail-stack>[data-radar-intelligence]),:global(.detail-grid .detail-stack>[data-publisher-meetings]),:global(.detail-grid .detail-stack>[data-publisher-materials]){scroll-margin-top:58px}:global(.detail-grid .detail-stack>.card.panel){box-shadow:0 1px 2px rgba(16,24,40,.03)}:global(.publisher-compact-tasks .task-row:nth-of-type(n+4)){display:none}:global(.publisher-tracking-panel textarea){min-height:72px}:global(#publisher-acompanhamento),:global(#publisher-tarefas){scroll-margin-top:58px}
      @media(max-width:1050px){.publisher-now-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.publisher-now-grid article:nth-child(2){border-right:0}.publisher-now-grid article:nth-child(-n+2){border-bottom:1px solid #eaecf0}.publisher-action-bar{align-items:flex-start;flex-direction:column}.publisher-primary-actions{justify-content:flex-start}}
      @media(max-width:650px){.publisher-now-grid{grid-template-columns:1fr}.publisher-now-grid article{border-right:0!important;border-bottom:1px solid #eaecf0}.publisher-now-grid article:last-child{border-bottom:0}.publisher-primary-actions{display:grid;grid-template-columns:1fr;width:100%}.publisher-primary-actions .publisher-more{width:100%}.publisher-more summary{justify-content:center}.publisher-more-popover{left:0;right:auto;width:100%}.publisher-task-strip{align-items:flex-start;flex-direction:column}.publisher-task-items{display:grid;gap:5px;width:100%}}
    `}</style>
  </section>;

  const scoreShortcut=headerMount?<button type="button" className="publisher-score-shortcut" onClick={()=>scrollTo('radar-score')}><Gauge size={14}/><strong>Radar Score {publisher.score??0}</strong><span>Ver análise</span><ChevronDown size={13}/><style jsx>{`.publisher-score-shortcut{border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:5px 9px;display:inline-flex;align-items:center;gap:5px;color:#344054;font-size:10px;cursor:pointer}.publisher-score-shortcut:hover{background:#f9fafb;border-color:#98a2b3}.publisher-score-shortcut strong{font-size:10px}.publisher-score-shortcut span{color:#667085}@media(max-width:620px){.publisher-score-shortcut span{display:none}}`}</style></button>:null;

  return <>{createPortal(commandCenter,mount)}{headerMount&&createPortal(scoreShortcut,headerMount)}</>;
}
