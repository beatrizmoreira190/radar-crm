'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Activity, Building2, CalendarClock, CheckCircle2, Clock3, GitBranch, ListChecks, MessageSquare, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useCrm } from '@/components/CrmProvider';
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS, ROLE_LABELS, TASK_TYPE_LABELS, formatDate } from '@/lib/constants';

const TABS=[
  ['overview','Visão geral'],
  ['publishers','Editoras'],
  ['pipeline','Pipeline'],
  ['tasks','Tarefas'],
  ['meetings','Reuniões'],
  ['activity','Atividades']
];

function durationLabel(hours){
  if(hours==null||!Number.isFinite(Number(hours)))return 'Sem histórico anterior';
  const totalMinutes=Math.max(0,Math.round(Number(hours)*60));
  if(totalMinutes<60)return `${totalMinutes} min`;
  const totalHours=Math.round(totalMinutes/60);
  if(totalHours<24)return `${totalHours} h`;
  const days=Math.floor(totalHours/24);
  const remHours=totalHours%24;
  if(days<7)return remHours?`${days} d ${remHours} h`:`${days} d`;
  const weeks=Math.floor(days/7);
  const remDays=days%7;
  return remDays?`${weeks} sem ${remDays} d`:`${weeks} sem`;
}

function shortDate(value){
  if(!value)return '—';
  return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(value));
}

function Stat({icon,label,value,sub}){
  return <div className="upd-stat"><span className="upd-stat-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong>{sub&&<em>{sub}</em>}</div></div>;
}

export default function UserPerformanceDrawer({userId,onClose}){
  const router=useRouter();
  const {supabase,membership,teamMap,isManager}=useCrm();
  const org=membership?.organization_id;
  const [days,setDays]=useState(30);
  const [tab,setTab]=useState('overview');
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [mounted,setMounted]=useState(false);

  useEffect(()=>{
    if(!userId||!org||!isManager)return;
    let cancelled=false;
    async function load(){
      setLoading(true);setError('');
      const {data:result,error:rpcError}=await supabase.rpc('crm_user_performance_detail',{
        p_organization_id:org,p_user_id:userId,p_days:days
      });
      if(cancelled)return;
      if(rpcError){setError(rpcError.message||'Não foi possível carregar o desempenho individual.');setData(null)}
      else setData(result||null);
      setLoading(false);
    }
    load();
    return()=>{cancelled=true};
  },[userId,org,days,isManager,supabase]);

  useEffect(()=>{setMounted(true)},[]);

  useEffect(()=>{if(userId)setTab('overview')},[userId]);

  useEffect(()=>{
    if(!mounted||!userId||!isManager)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous};
  },[mounted,userId,isManager]);

  useEffect(()=>{
    if(!mounted||!userId||!isManager)return;
    function onKeyDown(event){
      if(event.key==='Escape')onClose?.();
    }
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[mounted,userId,isManager,onClose]);

  const member=data?.member||teamMap[userId]||{};
  const summary=data?.summary||{};
  const avgTask=durationLabel(summary.avg_task_completion_hours);
  const medianTask=durationLabel(summary.median_task_completion_hours);
  const avgStage=durationLabel(summary.avg_stage_duration_hours);
  const historyDate=data?.history_available_since?shortDate(data.history_available_since):null;
  const dayMax=useMemo(()=>Math.max(1,...(data?.daily_activity||[]).map(x=>Number(x.actions)||0)),[data]);

  if(!mounted||!userId||!isManager)return null;

  function openPublisher(id){
    if(!id)return;
    onClose?.();
    router.push(`/app/editoras/${id}`);
  }

  return createPortal(<div className="upd-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
    <aside className="upd-drawer" role="dialog" aria-modal="true" aria-label="Desempenho individual">
      <header className="upd-head">
        <div className="upd-person">
          <Avatar member={member} size={48}/>
          <div><small>Desempenho individual</small><h2>{member.full_name||member.email||'Pessoa da equipe'}</h2><span>{member.job_title||ROLE_LABELS[member.role]||member.role||'Equipe'}</span></div>
        </div>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar painel"><X size={18}/></button>
      </header>

      <div className="upd-toolbar">
        <span>Período</span>
        {[7,30,60,90].map(value=><button type="button" key={value} className={days===value?'active':''} onClick={()=>setDays(value)}>{value} dias</button>)}
      </div>

      <nav className="upd-tabs" aria-label="Seções do desempenho">
        {TABS.map(([key,label])=><button type="button" key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}
      </nav>

      <div className="upd-content">
        {error&&<div className="notice error">{error}</div>}
        {loading?<div className="upd-loading">Calculando desempenho individual…</div>:data?<>
          {historyDate&&<div className="upd-history-note">Histórico detalhado disponível no CRM desde <strong>{historyDate}</strong>. Métricas de tempo usam somente eventos efetivamente registrados.</div>}

          {tab==='overview'&&<>
            <section className="upd-stats">
              <Stat icon={<Building2/>} label="Editoras trabalhadas" value={Number(summary.publishers_touched||0).toLocaleString('pt-BR')} sub="com atividade no período"/>
              <Stat icon={<Activity/>} label="Ações registradas" value={Number(summary.activities||0).toLocaleString('pt-BR')} sub={`${summary.active_days||0} dia(s) com atividade`}/>
              <Stat icon={<MessageSquare/>} label="Interações" value={Number(summary.interactions||0).toLocaleString('pt-BR')} sub={`${summary.publishers_contacted||0} editora(s) contatada(s)`}/>
              <Stat icon={<ListChecks/>} label="Tarefas concluídas" value={Number(summary.tasks_done||0).toLocaleString('pt-BR')} sub={`${summary.tasks_overdue_now||0} atrasada(s) agora`}/>
              <Stat icon={<CalendarClock/>} label="Reuniões agendadas" value={Number(summary.meetings_scheduled||0).toLocaleString('pt-BR')} sub={`${summary.meetings_presented||0} realizada(s) como apresentador`}/>
              <Stat icon={<GitBranch/>} label="Mudanças de pipeline" value={Number(summary.stage_moves||0).toLocaleString('pt-BR')} sub="movimentações feitas pela pessoa"/>
            </section>

            <section className="upd-section">
              <div className="upd-section-head"><div><h3>Velocidade de execução</h3><p>Tempos calculados somente quando há início e fim registrados.</p></div><Clock3 size={18}/></div>
              <div className="upd-speed-grid">
                <div><small>Média para concluir tarefa</small><strong>{avgTask}</strong></div>
                <div><small>Mediana para concluir tarefa</small><strong>{medianTask}</strong></div>
                <div><small>Tempo médio na etapa anterior</small><strong>{avgStage}</strong></div>
              </div>
            </section>

            <section className="upd-section">
              <div className="upd-section-head"><div><h3>Atividade por dia</h3><p>Dias com ações efetivamente registradas no CRM; não representa horas trabalhadas.</p></div></div>
              {(data.daily_activity||[]).length?<div className="upd-days">{data.daily_activity.map(item=><div key={item.date} className="upd-day"><span>{shortDate(item.date)}</span><div><i style={{width:`${Math.max(4,(Number(item.actions)||0)/dayMax*100)}%`}}/></div><strong>{item.actions}</strong></div>)}</div>:<p className="muted">Sem atividade registrada no período.</p>}
            </section>

            <section className="upd-section">
              <div className="upd-section-head"><div><h3>Responsabilidade comercial</h3><p>Visão atual da carteira, independente do período selecionado.</p></div></div>
              <div className="upd-speed-grid">
                <div><small>Contas originadas</small><strong>{summary.originated_publishers||0}</strong></div>
                <div><small>Responsabilidade atual</small><strong>{summary.current_responsibility||0}</strong></div>
                <div><small>Não comparecimentos</small><strong>{summary.meeting_no_shows||0}</strong></div>
              </div>
            </section>
          </>}

          {tab==='publishers'&&<section className="upd-list-section">
            <div className="upd-section-head"><div><h3>Editoras trabalhadas</h3><p>Primeira e última ação da pessoa no período.</p></div></div>
            {(data.publishers||[]).length?<div className="upd-record-list">{data.publishers.map(item=><button type="button" className="upd-record clickable" key={item.publisher_id} onClick={()=>openPublisher(item.publisher_id)}>
              <div><strong>{item.publisher_name}</strong><span>{item.current_stage||'Sem etapa atual'}</span></div>
              <div className="upd-record-meta"><span>{item.activity_count} ação(ões)</span><span>{item.stage_moves} mudança(s) de etapa</span><span>{shortDate(item.first_activity_at)} → {shortDate(item.last_activity_at)}</span></div>
            </button>)}</div>:<div className="upd-empty">Nenhuma editora trabalhada no período.</div>}
          </section>}

          {tab==='pipeline'&&<section className="upd-list-section">
            <div className="upd-section-head"><div><h3>Movimentações de pipeline</h3><p>O tempo indica quanto a editora ficou desde a mudança de etapa anterior registrada.</p></div></div>
            {(data.stage_moves||[]).length?<div className="upd-record-list">{data.stage_moves.map(item=><button type="button" className="upd-record clickable" key={item.event_id} onClick={()=>openPublisher(item.publisher_id)}>
              <div><strong>{item.publisher_name}</strong><span>{item.from_stage||'Sem etapa'} → {item.to_stage||'Sem etapa'}</span></div>
              <div className="upd-record-meta"><span>{formatDate(item.moved_at,true)}</span><span className="upd-time">{durationLabel(item.hours_in_previous_stage)}</span></div>
            </button>)}</div>:<div className="upd-empty">Nenhuma mudança de pipeline registrada no período.</div>}
          </section>}

          {tab==='tasks'&&<section className="upd-list-section">
            <div className="upd-section-head"><div><h3>Tarefas concluídas</h3><p>Tempo entre criação e conclusão da tarefa.</p></div></div>
            {(data.tasks||[]).length?<div className="upd-record-list">{data.tasks.map(item=><article className="upd-record" key={item.id}>
              <div><strong>{item.title}</strong><span>{item.publisher_name} · {TASK_TYPE_LABELS[item.task_type]||item.task_type||'Tarefa'}</span></div>
              <div className="upd-record-meta"><span>Concluída em {durationLabel(item.completion_hours)}</span><span>{formatDate(item.completed_at,true)}</span>{item.completed_after_due&&<span className="danger-text">Após o prazo</span>}</div>
              {item.result_note&&<p>{item.result_note}</p>}
            </article>)}</div>:<div className="upd-empty">Nenhuma tarefa concluída no período.</div>}
          </section>}

          {tab==='meetings'&&<section className="upd-list-section">
            <div className="upd-section-head"><div><h3>Reuniões relacionadas</h3><p>Reuniões agendadas ou apresentadas por esta pessoa.</p></div></div>
            {(data.meetings||[]).length?<div className="upd-record-list">{data.meetings.map(item=><button type="button" className="upd-record clickable" key={item.id} onClick={()=>openPublisher(item.publisher_id)}>
              <div><strong>{item.publisher_name}</strong><span>{item.title} · {MEETING_TYPE_LABELS[item.meeting_type]||item.meeting_type}</span></div>
              <div className="upd-record-meta"><span>{formatDate(item.scheduled_start,true)}</span><span>{MEETING_STATUS_LABELS[item.status]||item.status}</span>{item.scheduled_by_user&&<span>Agendada pela pessoa</span>}{item.presented_by_user&&<span>Apresentação atribuída</span>}</div>
            </button>)}</div>:<div className="upd-empty">Nenhuma reunião relacionada no período.</div>}
          </section>}

          {tab==='activity'&&<section className="upd-list-section">
            <div className="upd-section-head"><div><h3>Linha do tempo</h3><p>Últimas ações humanas registradas no CRM dentro do período.</p></div></div>
            {(data.timeline||[]).length?<div className="upd-timeline">{data.timeline.map(item=><article key={item.id}>
              <span className="upd-dot"/>
              <div><strong>{item.label||'Atividade registrada'}</strong><small>{formatDate(item.created_at,true)} · {item.entity_type}</small>{item.publisher_name&&<button type="button" onClick={()=>openPublisher(item.publisher_id)}>{item.publisher_name}</button>}</div>
            </article>)}</div>:<div className="upd-empty">Nenhuma atividade registrada no período.</div>}
          </section>}
        </>:!error&&<div className="upd-empty">Sem dados para esta pessoa.</div>}
      </div>

      <style jsx global>{`
        .upd-backdrop{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;background:rgba(16,24,40,.46);z-index:2147483000!important;display:flex!important;justify-content:flex-end!important;align-items:stretch!important;margin:0!important;padding:0!important}
        .upd-drawer{position:relative!important;width:min(880px,94vw)!important;max-width:94vw!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;background:#f8fafc;box-shadow:-18px 0 45px rgba(16,24,40,.22);display:flex!important;flex-direction:column!important;overflow:hidden!important}
        .upd-head{background:#fff;border-bottom:1px solid #eaecf0;padding:18px 20px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
        .upd-person{display:flex;gap:12px;align-items:center}.upd-person>div{display:grid}.upd-person small{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#667085;font-weight:700}.upd-person h2{font-size:20px;margin:2px 0;color:#101828}.upd-person span{font-size:11px;color:#667085}
        .upd-toolbar{background:#fff;padding:9px 20px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #eaecf0}.upd-toolbar>span{font-size:10px;font-weight:700;color:#667085;margin-right:3px}.upd-toolbar button,.upd-tabs button{border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:700;color:#475467;cursor:pointer}.upd-toolbar button.active,.upd-tabs button.active{background:#344054;color:#fff;border-color:#344054}
        .upd-tabs{background:#fff;padding:0 20px 10px;display:flex;gap:5px;overflow:auto;border-bottom:1px solid #eaecf0}.upd-tabs button{white-space:nowrap;border-radius:7px}
        .upd-content{flex:1 1 auto!important;min-height:0!important;padding:16px 20px 28px;overflow:auto!important;display:grid!important;align-content:start!important;gap:14px}.upd-loading,.upd-empty{padding:34px;text-align:center;color:#667085;background:#fff;border:1px solid #eaecf0;border-radius:12px}.upd-history-note{font-size:10px;line-height:1.5;color:#667085;background:#fffaeb;border:1px solid #fedf89;border-radius:9px;padding:8px 10px}
        .upd-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.upd-stat{background:#fff;border:1px solid #eaecf0;border-radius:11px;padding:11px;display:grid!important;grid-template-columns:32px minmax(0,1fr)!important;gap:8px;align-items:start}.upd-stat-icon{width:30px;height:30px;border-radius:8px;background:#f2f4f7;display:grid;place-items:center;color:#475467}.upd-stat :global(svg){width:15px}.upd-stat>div{display:grid!important;min-width:0!important;gap:1px!important}.upd-stat small{display:block!important;font-size:9px;color:#667085;line-height:1.25}.upd-stat strong{display:block!important;font-size:19px;color:#101828;margin:1px 0;line-height:1.1}.upd-stat em{display:block!important;font-style:normal;font-size:9px;color:#667085;line-height:1.3}
        .upd-section,.upd-list-section{background:#fff;border:1px solid #eaecf0;border-radius:12px;padding:14px;display:grid;gap:10px}.upd-section-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.upd-section-head h3{font-size:13px;margin:0;color:#101828}.upd-section-head p{font-size:10px;color:#667085;margin:3px 0 0;line-height:1.4}
        .upd-speed-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.upd-speed-grid>div{background:#f9fafb;border:1px solid #f2f4f7;border-radius:9px;padding:10px;display:grid}.upd-speed-grid small{font-size:9px;color:#667085}.upd-speed-grid strong{font-size:14px;margin-top:3px;color:#344054}
        .upd-days{display:grid;gap:6px}.upd-day{display:grid;grid-template-columns:68px minmax(0,1fr) 28px;gap:8px;align-items:center;font-size:9px;color:#667085}.upd-day>div{height:7px;border-radius:999px;background:#f2f4f7;overflow:hidden}.upd-day i{display:block;height:100%;background:#475467;border-radius:999px}.upd-day strong{text-align:right;color:#344054}
        .upd-record-list{display:grid;gap:7px}.upd-record{border:1px solid #eaecf0;border-radius:9px;background:#fff;padding:10px;text-align:left;display:grid;gap:6px;color:inherit}.upd-record.clickable{cursor:pointer;width:100%}.upd-record.clickable:hover{border-color:#98a2b3;background:#fcfcfd}.upd-record>div:first-child{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.upd-record strong{font-size:11px;color:#344054}.upd-record span{font-size:9px;color:#667085}.upd-record p{font-size:10px;color:#475467;margin:0}.upd-record-meta{display:flex;gap:6px 12px;flex-wrap:wrap}.upd-record-meta .upd-time{font-weight:700;color:#344054}
        .upd-timeline{display:grid}.upd-timeline article{position:relative;display:grid;grid-template-columns:18px 1fr;gap:7px;padding:0 0 12px}.upd-timeline article:before{content:'';position:absolute;left:5px;top:10px;bottom:-2px;width:1px;background:#eaecf0}.upd-timeline article:last-child:before{display:none}.upd-dot{width:11px;height:11px;border:3px solid #fff;border-radius:50%;background:#667085;box-shadow:0 0 0 1px #d0d5dd;margin-top:2px;z-index:1}.upd-timeline article>div{display:grid;gap:2px}.upd-timeline strong{font-size:10px;color:#344054}.upd-timeline small{font-size:9px;color:#98a2b3}.upd-timeline button{width:max-content;padding:0;border:0;background:none;color:#175cd3;font-size:9px;font-weight:700;cursor:pointer}
        @media(max-width:720px){.upd-stats,.upd-speed-grid{grid-template-columns:1fr 1fr}.upd-drawer{width:100vw!important;max-width:100vw!important}.upd-head,.upd-toolbar,.upd-tabs,.upd-content{padding-left:12px;padding-right:12px}.upd-record>div:first-child{display:grid}}
        @media(max-width:460px){.upd-stats,.upd-speed-grid{grid-template-columns:1fr}}
      `}</style>
    </aside>
  </div>,document.body);
}
