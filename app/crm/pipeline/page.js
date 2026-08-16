'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Target, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PRIORITY_LABELS } from '@/lib/constants';

export default function PipelinePage(){
  const {supabase,membership,user,activityVersion}=useCrm(); const org=membership?.organization_id;
  const [stages,setStages]=useState([]); const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true); const [notice,setNotice]=useState(''); const [active,setActive]=useState('all');
  async function load(){if(!org)return;setLoading(true);const [{data:ss,error:se},{data:ps,error:pe}]=await Promise.all([supabase.from('pipeline_stages').select('id,name,position,stage_type').eq('organization_id',org).eq('active',true).order('position'),supabase.from('publishers').select('id,name,city,state,score,priority,stage_id,last_contact_at,next_action_at').eq('organization_id',org).eq('archived',false).order('score',{ascending:false,nullsFirst:false}).limit(1000)]);if(se||pe)setNotice(se?.message||pe?.message);setStages(ss||[]);setRows(ps||[]);setLoading(false)}
  useEffect(()=>{load()},[org,activityVersion]);
  const groups=useMemo(()=>{const m={none:[]};stages.forEach(s=>m[s.id]=[]);rows.forEach(p=>(m[p.stage_id]||m.none).push(p));return m},[rows,stages]);
  const tabs=useMemo(()=>[{id:'all',name:'Todas',count:rows.length},...stages.map(s=>({...s,count:groups[s.id]?.length||0})),{id:'none',name:'Sem etapa',count:groups.none?.length||0}], [stages,groups,rows.length]);
  const visible=active==='all'?rows:(groups[active]||[]);
  async function move(p,stageId){const {error}=await supabase.from('publishers').update({stage_id:stageId||null,updated_by:user?.id||null,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',p.id);if(error)setNotice(error.message);else load()}
  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Funil comercial</div><h1>Pipeline</h1><p>Acompanhe em que etapa cada editora está e mova as contas conforme a prospecção avança.</p></div></div>{notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {loading?<div className="card table-empty">Carregando pipeline…</div>:<><div className="pipeline-stage-grid">{tabs.map(t=><button key={t.id} className={`pipeline-stage-card ${active===t.id?'active':''}`} onClick={()=>setActive(t.id)}><span>{t.name}</span><strong>{t.count.toLocaleString('pt-BR')}</strong></button>)}</div><section className="card panel"><div className="panel-head"><div><h2>{tabs.find(t=>t.id===active)?.name||'Pipeline'}</h2><p>{visible.length} editora{visible.length===1?'':'s'} nesta visualização</p></div></div>{visible.length?<div className="pipeline-list-grid">{visible.map(p=><article className="pipeline-list-card" key={p.id}><Link href={`/app/editoras/${p.id}`} className="pipeline-list-main"><strong>{p.name}</strong><span>{[p.city,p.state].filter(Boolean).join(' / ')||'Sem localização'}</span></Link><div className="pipeline-list-meta"><span className={`badge ${p.priority==='high'||p.priority==='urgent'?'red':p.priority==='medium'?'amber':''}`}>{PRIORITY_LABELS[p.priority]||p.priority}</span><span className="score-pill">{p.score??0}</span></div><label>Mover para<select value={p.stage_id||''} onChange={e=>move(p,e.target.value)}><option value="">Sem etapa</option>{stages.map(st=><option value={st.id} key={st.id}>{st.name}</option>)}</select></label></article>)}</div>:<div className="empty-state"><Target/><strong>Nenhuma editora nesta etapa.</strong><p>Selecione outro status ou mova uma editora para cá.</p></div>}</section></>}
  </div>;
}
