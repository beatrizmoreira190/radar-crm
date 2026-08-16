'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Clock3, Flame, PhoneCall, Target, TrendingUp, Users } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import Avatar from '@/components/Avatar';
import { formatDate, PRIORITY_LABELS, timeAgo } from '@/lib/constants';

export default function CrmHome(){
  const {supabase,membership,user,teamMap,activityVersion}=useCrm();
  const [metrics,setMetrics]=useState({publishers:0,contacted:0,opps:0,clients:0});
  const [tasks,setTasks]=useState([]); const [activity,setActivity]=useState([]); const [hot,setHot]=useState([]); const [stages,setStages]=useState([]); const [stageCounts,setStageCounts]=useState({}); const [loading,setLoading]=useState(true);
  const org=membership?.organization_id;
  async function load(){if(!org||!user)return;setLoading(true);
    const now=new Date(); const end=new Date(); end.setHours(23,59,59,999); const start30=new Date(Date.now()-30*86400000).toISOString();
    const [{count:pubs},{count:contacted},{count:opps},{data:stageRows},{data:taskRows},{data:actRows},{data:hotRows}] = await Promise.all([
      supabase.from('publishers').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('archived',false),
      supabase.from('publishers').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('archived',false).not('last_contact_at','is',null),
      supabase.from('opportunities').select('id',{count:'exact',head:true}).eq('organization_id',org).not('stage','in','(won,lost)'),
      supabase.from('pipeline_stages').select('id,name,position,stage_type').eq('organization_id',org).eq('active',true).order('position'),
      supabase.from('tasks').select('id,title,due_at,status,priority,task_type,publisher_id,publishers(name)').eq('organization_id',org).eq('assigned_to',user.id).in('status',['open','in_progress']).lte('due_at',end.toISOString()).order('due_at').limit(12),
      supabase.from('audit_events').select('id,actor_user_id,entity_type,entity_id,action,label,after_data,before_data,created_at').eq('organization_id',org).order('created_at',{ascending:false}).limit(12),
      supabase.from('publishers').select('id,name,city,state,score,priority,stage_id,last_contact_at,next_action_at').eq('organization_id',org).eq('archived',false).order('score',{ascending:false}).order('name').limit(6),
    ]);
    const counts={}; let clients=0; if(stageRows?.length){await Promise.all(stageRows.map(async s=>{const {count}=await supabase.from('publishers').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('archived',false).eq('stage_id',s.id);counts[s.id]=count||0;if(s.stage_type==='won')clients+=count||0;}));}
    setMetrics({publishers:pubs||0,contacted:contacted||0,opps:opps||0,clients});setStages(stageRows||[]);setStageCounts(counts);setTasks(taskRows||[]);setActivity(actRows||[]);setHot(hotRows||[]);setLoading(false);
  }
  useEffect(()=>{load()},[org,user?.id,activityVersion]);
  const overdue=tasks.filter(t=>t.due_at&&new Date(t.due_at)<new Date()).length;
  async function done(id){await supabase.from('tasks').update({status:'done',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);load();}
  function actor(id){return teamMap[id]||{full_name:'Sistema'};}
  function activityPublisher(a){return a.after_data?.name || a.after_data?.title || a.after_data?.summary || a.before_data?.name || '';}
  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Visão geral</div><h1>Bom trabalho{membership?.full_name?`, ${membership.full_name.split(' ')[0]}`:''}.</h1><p>Acompanhe o que precisa de atenção e o que a equipe movimentou recentemente.</p></div><Link href="/app/editoras" className="btn">Abrir editoras <ArrowRight size={17}/></Link></div>
    <div className="metric-grid">
      <div className="metric-card"><div className="metric-icon"><Building2/></div><div><span>Editoras</span><strong>{metrics.publishers.toLocaleString('pt-BR')}</strong><small>base ativa</small></div></div>
      <div className="metric-card"><div className="metric-icon"><PhoneCall/></div><div><span>Já contatadas</span><strong>{metrics.contacted.toLocaleString('pt-BR')}</strong><small>{metrics.publishers?Math.round(metrics.contacted/metrics.publishers*100):0}% da base</small></div></div>
      <div className="metric-card"><div className="metric-icon"><Target/></div><div><span>Oportunidades</span><strong>{metrics.opps.toLocaleString('pt-BR')}</strong><small>abertas</small></div></div>
      <div className="metric-card"><div className="metric-icon"><TrendingUp/></div><div><span>Clientes</span><strong>{metrics.clients.toLocaleString('pt-BR')}</strong><small>convertidos</small></div></div>
    </div>
    <div className="dashboard-grid">
      <section className="card panel span-2"><div className="panel-head"><div><h2>Minha fila de hoje</h2><p>{overdue?`${overdue} tarefa${overdue===1?'':'s'} atrasada${overdue===1?'':'s'}`:'Nenhum atraso 🎉'}</p></div><Link href="/app/tarefas" className="text-link">Ver todas</Link></div>
        {tasks.length? <div className="task-list">{tasks.map(t=>{const late=t.due_at&&new Date(t.due_at)<new Date();return <div className="task-row" key={t.id}><button className="task-check" onClick={()=>done(t.id)} title="Concluir"><CheckCircle2 size={19}/></button><div className="task-main"><strong>{t.title}</strong><span>{t.publishers?.name||'Sem editora vinculada'}</span></div><div className={`task-due ${late?'late':''}`}>{late?<AlertTriangle size={14}/>:<Clock3 size={14}/>} {t.due_at?formatDate(t.due_at,true):'Sem prazo'}</div></div>})}</div> : <div className="empty-state"><CheckCircle2/><strong>Fila limpa por enquanto.</strong><p>Quando você criar follow-ups, eles aparecem aqui.</p></div>}
      </section>
      <section className="card panel"><div className="panel-head"><div><h2>Editoras quentes</h2><p>Prioridade pelo Radar Score</p></div><Flame size={20}/></div><div className="hot-list">{hot.map(p=><Link href={`/app/editoras/${p.id}`} key={p.id} className="hot-row"><div><strong>{p.name}</strong><span>{[p.city,p.state].filter(Boolean).join(' / ')||'—'}</span></div><div className="score-pill">{p.score??0}</div></Link>)}</div></section>
      <section className="card panel span-2"><div className="panel-head"><div><h2>Pipeline</h2><p>Distribuição atual das editoras</p></div><Link href="/app/editoras" className="text-link">Explorar</Link></div><div className="pipeline-mini">{stages.map(s=>{const count=stageCounts[s.id]||0;const max=Math.max(...Object.values(stageCounts),1);return <div className="pipeline-mini-row" key={s.id}><span>{s.name}</span><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(2,count/max*100)}%`}}/></div><strong>{count}</strong></div>})}</div></section>
      <section className="card panel"><div className="panel-head"><div><h2>Atividade da equipe</h2><p>Atualizações recentes</p></div><Users size={20}/></div><div className="activity-list">{activity.length?activity.map(a=><div className="activity-row" key={a.id}><Avatar member={actor(a.actor_user_id)} size={32}/><div><strong>{actor(a.actor_user_id).full_name||actor(a.actor_user_id).email||'Sistema'}</strong><span>{a.label}{activityPublisher(a)?` · ${String(activityPublisher(a)).slice(0,55)}`:''}</span><small>{timeAgo(a.created_at)}</small></div></div>):<p className="muted">Nenhuma atividade recente.</p>}</div><Link href="/app/atividade" className="panel-link">Ver feed completo <ArrowRight size={15}/></Link></section>
    </div>
  </div>;
}
