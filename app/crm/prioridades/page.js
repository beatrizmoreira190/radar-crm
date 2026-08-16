'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Building2, Info, ListChecks, RefreshCw, UserPlus, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PRIORITY_LABELS, formatDate } from '@/lib/constants';

export default function PrioritiesPage(){
  const {supabase,membership,user,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true); const [notice,setNotice]=useState(''); const [guidance,setGuidance]=useState(null); const [selected,setSelected]=useState(null);
  async function load(){if(!org)return;setLoading(true);const {data,error}=await supabase.rpc('crm_smart_queue',{p_organization_id:org,p_limit:60});if(error)setNotice(error.message);setRows(data||[]);setLoading(false)}
  useEffect(()=>{load()},[org,activityVersion]);
  const stats=useMemo(()=>({urgent:rows.filter(r=>['overdue_task','due_followup'].includes(r.action_code)).length,claim:rows.filter(r=>r.action_code==='claim').length,first:rows.filter(r=>r.action_code==='first_contact').length,follow:rows.filter(r=>['follow_up','reengage'].includes(r.action_code)).length}),[rows]);
  async function claim(row){const {error}=await supabase.from('publishers').update({owner_user_id:user.id,updated_by:user.id,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',row.publisher_id).is('owner_user_id',null);if(error)setNotice(error.message);else{setNotice(`Você assumiu ${row.name}.`);load()}}
  async function explain(row){setSelected(row);setGuidance(null);const {data,error}=await supabase.rpc('crm_publisher_guidance',{p_organization_id:org,p_publisher_id:row.publisher_id});if(error)setNotice(error.message);else setGuidance(data)}
  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Execução inteligente</div><h1>Prioridades</h1><p>Veja quais editoras precisam da sua atenção agora e qual é o próximo passo em cada uma.</p></div><button className="btn secondary" onClick={load}><RefreshCw size={16}/> Atualizar fila</button></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <div className="priority-summary-grid">
      <Summary label="Ação vencida" value={stats.urgent} icon={<AlertTriangle/>}/><Summary label="Disponíveis para assumir" value={stats.claim} icon={<UserPlus/>}/><Summary label="Primeiro contato" value={stats.first} icon={<Building2/>}/><Summary label="Follow-up / retomada" value={stats.follow} icon={<RefreshCw/>}/>
    </div>
    <section className="card panel"><div className="panel-head"><div><h2>O que fazer agora</h2><p>Comece pelos itens no topo e abra a editora para executar o próximo passo.</p></div><ListChecks size={21}/></div>
      {loading?<div className="table-empty">Calculando prioridades…</div>:rows.length?<div className="smart-queue">{rows.map((r,i)=><article className="smart-queue-row" key={r.publisher_id}>
        <div className="queue-position">{i+1}</div><div className="queue-main"><div className="queue-title"><Link href={`/app/editoras/${r.publisher_id}`}>{r.name}</Link><span className={`badge ${r.action_code==='overdue_task'||r.action_code==='due_followup'?'red':r.action_code==='claim'?'blue':'amber'}`}>{r.action_label}</span></div><span>{[r.city,r.state].filter(Boolean).join(' / ')||'Sem localização'} · {r.stage_name||'Sem etapa'}</span><small>{r.reason}</small></div>
        <div className="queue-score"><small>Radar Score</small><strong>{r.score??0}</strong><button className="link-btn compact" onClick={()=>explain(r)}><Info size={14}/> Entender</button></div>
        <div className="queue-meta"><span>{PRIORITY_LABELS[r.priority]||r.priority||'—'}</span><small>{r.next_action_at?`Próxima ação ${formatDate(r.next_action_at,true)}`:r.last_contact_at?`Último contato ${formatDate(r.last_contact_at,true)}`:'Nunca contatada'}</small></div>
        <div className="queue-actions">{r.action_code==='claim'?<button className="btn small" onClick={()=>claim(r)}><UserPlus size={14}/> Assumir</button>:<Link className="btn small" href={`/app/editoras/${r.publisher_id}`}>Abrir <ArrowRight size={14}/></Link>}</div>
      </article>)}</div>:<div className="empty-state"><ListChecks/><strong>Nenhuma prioridade encontrada.</strong><p>Sua fila está limpa neste momento.</p></div>}
    </section>
    {selected&&<div className="modal-backdrop"><div className="modal score-modal"><div className="modal-head"><div><h3>Radar Score · {selected.name}</h3><p>Veja os fatores que aumentaram ou reduziram a pontuação desta editora.</p></div><button onClick={()=>{setSelected(null);setGuidance(null)}}><X/></button></div>{!guidance?<div className="table-empty">Carregando explicação…</div>:<><div className="score-explain-head"><div><small>Score atual</small><strong>{guidance.score??0}</strong></div><div><small>Próxima melhor ação</small><strong>{guidance.action_label}</strong><p>{guidance.reason}</p></div></div><div className="score-reasons">{Array.isArray(guidance.score_reason)&&guidance.score_reason.length?guidance.score_reason.map((x,i)=><div className="score-reason" key={`${x.code||'r'}-${i}`}><span>{x.label||x.code}</span><strong className={Number(x.points)<0?'negative':''}>{Number(x.points)>0?'+':''}{x.points}</strong></div>):<p className="muted">O score será detalhado à medida que a conta receber dados e interações.</p>}</div><div className="modal-actions"><Link className="btn" href={`/app/editoras/${selected.publisher_id}`}>Abrir ficha <ArrowRight size={15}/></Link></div></>}</div></div>}
  </div>
}
function Summary({label,value,icon}){return <div className="card priority-summary"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{Number(value||0).toLocaleString('pt-BR')}</strong></div></div>}
