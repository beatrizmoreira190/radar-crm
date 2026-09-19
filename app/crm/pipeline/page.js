'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Target, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import Pagination from '@/components/Pagination';
import { PRIORITY_LABELS } from '@/lib/constants';

const PAGE_SIZE=60;

export default function PipelinePage(){
  const {supabase,membership,user,activityVersion,isManager}=useCrm();
  const org=membership?.organization_id;
  const [stages,setStages]=useState([]);
  const [rows,setRows]=useState([]);
  const [counts,setCounts]=useState({all:0,none:0});
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [active,setActive]=useState('all');
  const [page,setPage]=useState(1);

  function scopedPublishers({head=false}={}){
    let query=supabase.from('publishers')
      .select(head?'id':'id,name,city,state,score,priority,stage_id,last_contact_at,next_action_at',head?{count:'exact',head:true}:undefined)
      .eq('organization_id',org)
      .eq('archived',false);
    if(!isManager)query=query.eq('owner_user_id',user?.id);
    return query;
  }

  async function loadStagesAndCounts(){
    if(!org)return;
    const {data:ss,error:se}=await supabase.from('pipeline_stages')
      .select('id,name,position,stage_type')
      .eq('organization_id',org).eq('active',true).order('position');
    if(se){setNotice(se.message);return}
    const stageRows=ss||[];
    setStages(stageRows);
    const countRequests=[
      scopedPublishers({head:true}),
      scopedPublishers({head:true}).is('stage_id',null),
      ...stageRows.map(stage=>scopedPublishers({head:true}).eq('stage_id',stage.id))
    ];
    const results=await Promise.all(countRequests);
    const firstError=results.find(item=>item.error)?.error;
    if(firstError){setNotice(firstError.message);return}
    const next={all:results[0]?.count||0,none:results[1]?.count||0};
    stageRows.forEach((stage,index)=>{next[stage.id]=results[index+2]?.count||0});
    setCounts(next);
  }

  async function loadRows(){
    if(!org)return;
    setLoading(true);
    let query=scopedPublishers();
    if(active==='none')query=query.is('stage_id',null);
    else if(active!=='all')query=query.eq('stage_id',active);
    const from=(page-1)*PAGE_SIZE;
    const {data,error}=await query
      .order('score',{ascending:false,nullsFirst:false})
      .order('name')
      .range(from,from+PAGE_SIZE-1);
    if(error)setNotice(error.message);
    setRows(data||[]);
    setLoading(false);
  }

  useEffect(()=>{loadStagesAndCounts()},[org,user?.id,isManager,activityVersion]);
  useEffect(()=>{loadRows()},[org,user?.id,isManager,active,page,activityVersion]);
  useEffect(()=>{setPage(1)},[active]);

  const tabs=useMemo(()=>[
    {id:'all',name:'Todas',count:counts.all||0},
    ...stages.map(stage=>({...stage,count:counts[stage.id]||0})),
    {id:'none',name:'Sem etapa',count:counts.none||0}
  ],[stages,counts]);
  const selectedCount=tabs.find(tab=>tab.id===active)?.count||0;
  const totalPages=Math.max(1,Math.ceil(selectedCount/PAGE_SIZE));

  async function move(p,stageId){
    const {data,error}=await supabase.from('publishers')
      .update({stage_id:stageId||null,updated_by:user?.id||null,updated_at:new Date().toISOString()})
      .eq('organization_id',org).eq('id',p.id)
      .select('id').maybeSingle();
    if(error){setNotice(error.message);return}
    if(!data){setNotice('A editora não pôde ser movida. Atualize a tela e tente novamente.');return}
    await Promise.all([loadStagesAndCounts(),loadRows()]);
  }

  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Funil comercial</div><h1>Pipeline</h1><p>{isManager?'Acompanhe a distribuição da equipe e mova as editoras conforme a prospecção avança.':'Acompanhe as editoras da sua carteira e mova cada conta conforme a prospecção avança.'}</p></div></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <div className="pipeline-stage-grid">{tabs.map(t=><button key={t.id} className={`pipeline-stage-card ${active===t.id?'active':''}`} onClick={()=>setActive(t.id)}><span>{t.name}</span><strong>{Number(t.count||0).toLocaleString('pt-BR')}</strong></button>)}</div>
    <section className="card panel">
      <div className="panel-head"><div><h2>{tabs.find(t=>t.id===active)?.name||'Pipeline'}</h2><p>{selectedCount.toLocaleString('pt-BR')} editora{selectedCount===1?'':'s'} nesta visualização</p></div></div>
      {loading?<div className="table-empty">Carregando pipeline…</div>:rows.length?<div className="pipeline-list-grid">{rows.map(p=><article className="pipeline-list-card" key={p.id}>
        <Link href={`/app/editoras/${p.id}`} className="pipeline-list-main"><strong>{p.name}</strong><span>{[p.city,p.state].filter(Boolean).join(' / ')||'Sem localização'}</span></Link>
        <div className="pipeline-list-meta"><span className={`badge ${p.priority==='high'||p.priority==='urgent'?'red':p.priority==='medium'?'amber':''}`}>{PRIORITY_LABELS[p.priority]||p.priority}</span><span className="score-pill">{p.score??0}</span></div>
        <label>Mover para<select value={p.stage_id||''} onChange={e=>move(p,e.target.value)}><option value="">Sem etapa</option>{stages.map(st=><option value={st.id} key={st.id}>{st.name}</option>)}</select></label>
      </article>)}</div>:(!isManager&&(counts.all||0)===0?<div className="empty-state"><Target/><strong>Sua carteira ainda está vazia.</strong><p>Assuma editoras para começar a acompanhar o funil e organizar sua prospecção.</p><Link href="/app/editoras" className="btn small" style={{marginTop:10}}>Ver editoras disponíveis</Link></div>:<div className="empty-state"><Target/><strong>Nenhuma editora nesta etapa.</strong><p>Selecione outro status ou mova uma editora para cá.</p></div>)}
      {selectedCount>PAGE_SIZE&&<Pagination page={page} totalPages={totalPages} onChange={setPage}/>}
    </section>
  </div>;
}
