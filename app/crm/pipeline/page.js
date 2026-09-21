'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Search, Target, Undo2, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import Pagination from '@/components/Pagination';
import { PRIORITY_LABELS } from '@/lib/constants';

const PAGE_SIZE=60;

export default function PipelinePage(){
  const {supabase,membership,user,team,activityVersion,isManager}=useCrm();
  const org=membership?.organization_id;
  const [stages,setStages]=useState([]);
  const [rows,setRows]=useState([]);
  const [counts,setCounts]=useState(null);
  const [countsLoading,setCountsLoading]=useState(true);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [active,setActive]=useState('all');
  const [page,setPage]=useState(1);
  const [movingId,setMovingId]=useState('');
  const [moveToast,setMoveToast]=useState(null);
  const [q,setQ]=useState('');
  const [owner,setOwner]=useState('');
  const [priority,setPriority]=useState('');
  const [scoreMin,setScoreMin]=useState('');

  function applySharedFilters(query){
    const safe=q.trim().replace(/[,%()]/g,' ');
    if(safe)query=query.or(`name.ilike.%${safe}%,trade_name.ilike.%${safe}%,cnpj.ilike.%${safe}%`);
    if(priority)query=query.eq('priority',priority);
    if(scoreMin!=='')query=query.gte('score',Number(scoreMin)||0);
    if(isManager&&owner==='unassigned')query=query.is('owner_user_id',null);
    else if(isManager&&owner)query=query.eq('owner_user_id',owner);
    return query;
  }

  function scopedPublishers({head=false}={}){
    let query=supabase.from('publishers')
      .select(head?'id':'id,name,trade_name,cnpj,city,state,score,priority,stage_id,owner_user_id,last_contact_at,next_action_at',head?{count:'exact',head:true}:undefined)
      .eq('organization_id',org)
      .eq('archived',false);
    if(!isManager)query=query.eq('owner_user_id',user?.id);
    return applySharedFilters(query);
  }

  async function loadStagesAndCounts(){
    if(!org)return;
    setCountsLoading(true);
    const {data:ss,error:se}=await supabase.from('pipeline_stages')
      .select('id,name,position,stage_type')
      .eq('organization_id',org).eq('active',true).order('position');
    if(se){setNotice(se.message);setCountsLoading(false);return}
    const stageRows=ss||[];
    setStages(stageRows);
    const countRequests=[
      scopedPublishers({head:true}),
      scopedPublishers({head:true}).is('stage_id',null),
      ...stageRows.map(stage=>scopedPublishers({head:true}).eq('stage_id',stage.id))
    ];
    const results=await Promise.all(countRequests);
    const firstError=results.find(item=>item.error)?.error;
    if(firstError){setNotice(firstError.message);setCountsLoading(false);return}
    const next={all:results[0]?.count??0,none:results[1]?.count??0};
    stageRows.forEach((stage,index)=>{next[stage.id]=results[index+2]?.count??0});
    setCounts(next);
    setCountsLoading(false);
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

  useEffect(()=>{
    const timer=setTimeout(()=>loadStagesAndCounts(),q?300:0);
    return()=>clearTimeout(timer);
  },[org,user?.id,isManager,activityVersion,q,owner,priority,scoreMin]);
  useEffect(()=>{
    const timer=setTimeout(()=>loadRows(),q?300:0);
    return()=>clearTimeout(timer);
  },[org,user?.id,isManager,active,page,activityVersion,q,owner,priority,scoreMin]);
  useEffect(()=>{setPage(1)},[active,q,owner,priority,scoreMin]);

  const tabs=useMemo(()=>[
    {id:'all',name:'Todas',count:counts?.all??null},
    ...stages.map(stage=>({...stage,count:counts?.[stage.id]??null})),
    {id:'none',name:'Sem etapa',count:counts?.none??null}
  ],[stages,counts]);
  const selectedCount=tabs.find(tab=>tab.id===active)?.count??null;
  const totalPages=selectedCount==null?1:Math.max(1,Math.ceil(selectedCount/PAGE_SIZE));
  const hasFilters=Boolean(q||owner||priority||scoreMin!=='');

  async function persistStage(publisherId,stageId){
    return supabase.from('publishers')
      .update({stage_id:stageId||null,updated_by:user?.id||null,updated_at:new Date().toISOString()})
      .eq('organization_id',org).eq('id',publisherId)
      .select('id').maybeSingle();
  }

  async function move(p,stageId){
    const previousStageId=p.stage_id||'';
    const nextStageId=stageId||'';
    if(previousStageId===nextStageId||movingId===p.id)return;
    const nextStage=stages.find(stage=>stage.id===nextStageId);
    if(nextStage?.stage_type==='lost'){
      const confirmed=window.confirm(`Mover ${p.name} para “${nextStage.name}”? Essa etapa indica encerramento/perda da oportunidade comercial.`);
      if(!confirmed)return;
    }
    setMovingId(p.id);
    setNotice('');
    const {data,error}=await persistStage(p.id,nextStageId);
    if(error||!data){
      setNotice(error?.message||'A editora não pôde ser movida. Atualize a tela e tente novamente.');
      setMovingId('');
      await loadRows();
      return;
    }
    const destination=nextStageId?nextStage?.name||'nova etapa':'Sem etapa';
    setMoveToast({publisherId:p.id,publisherName:p.name,previousStageId,destination});
    await Promise.all([loadStagesAndCounts(),loadRows()]);
    setMovingId('');
  }

  async function undoMove(){
    if(!moveToast||movingId)return;
    setMovingId(moveToast.publisherId);
    setNotice('');
    const {data,error}=await persistStage(moveToast.publisherId,moveToast.previousStageId);
    if(error||!data){
      setNotice(error?.message||'Não foi possível desfazer a movimentação.');
      setMovingId('');
      return;
    }
    setMoveToast(null);
    setNotice('Movimentação desfeita.');
    await Promise.all([loadStagesAndCounts(),loadRows()]);
    setMovingId('');
  }

  function clearFilters(){
    setQ('');
    setOwner('');
    setPriority('');
    setScoreMin('');
  }

  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Funil comercial</div><h1>Pipeline</h1><p>{isManager?'Acompanhe a distribuição da equipe e mova as editoras conforme a prospecção avança.':'Acompanhe as editoras sob sua responsabilidade atual e mova cada conta conforme o processo comercial avança.'}</p></div></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {moveToast&&<div className="notice-bar pipeline-undo-toast" role="status"><span><strong>{moveToast.publisherName}</strong> movida para <strong>{moveToast.destination}</strong>.</span><div className="pipeline-undo-actions"><button type="button" disabled={Boolean(movingId)} onClick={undoMove}><Undo2 size={14}/> Desfazer</button><button type="button" aria-label="Fechar confirmação" disabled={Boolean(movingId)} onClick={()=>setMoveToast(null)}><X size={15}/></button></div></div>}

    <div className="toolbar pipeline-toolbar">
      <div className="search-box"><Search size={17}/><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar editora ou CNPJ…"/></div>
      {isManager&&<select className="filter-select" value={owner} onChange={e=>setOwner(e.target.value)}><option value="">Todos os responsáveis atuais</option><option value="unassigned">Sem responsável atual</option>{team.filter(member=>member.active).map(member=><option key={member.user_id} value={member.user_id}>{member.full_name||member.email}</option>)}</select>}
      <select className="filter-select" value={priority} onChange={e=>setPriority(e.target.value)}><option value="">Todas as prioridades</option>{Object.entries(PRIORITY_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <input className="input pipeline-score-filter" type="number" min="0" max="100" value={scoreMin} onChange={e=>setScoreMin(e.target.value)} placeholder="Score mín." aria-label="Radar Score mínimo"/>
      {hasFilters&&<button className="btn secondary" type="button" onClick={clearFilters}>Limpar filtros</button>}
    </div>

    <div className="pipeline-stage-grid">{tabs.map(t=><button key={t.id} className={`pipeline-stage-card ${active===t.id?'active':''}`} onClick={()=>setActive(t.id)}><span>{t.name}</span><strong>{t.count==null?'—':Number(t.count).toLocaleString('pt-BR')}</strong></button>)}</div>
    <section className="card panel" aria-busy={loading||countsLoading}>
      <div className="panel-head"><div><h2>{tabs.find(t=>t.id===active)?.name||'Pipeline'}</h2><p>{selectedCount==null?'Atualizando contagem…':`${selectedCount.toLocaleString('pt-BR')} editora${selectedCount===1?'':'s'} nesta visualização`}</p></div></div>
      {loading?<div className="table-empty">Carregando pipeline…</div>:rows.length?<div className="pipeline-list-grid">{rows.map(p=><article className="pipeline-list-card" key={p.id}>
        <Link href={`/app/editoras/${p.id}`} className="pipeline-list-main"><strong>{p.name}</strong><span>{[p.city,p.state].filter(Boolean).join(' / ')||'Sem localização'}</span></Link>
        <div className="pipeline-list-meta"><span className={`badge ${p.priority==='high'||p.priority==='urgent'?'red':p.priority==='medium'?'amber':''}`}>{PRIORITY_LABELS[p.priority]||p.priority}</span><span className="score-pill">{p.score??0}</span></div>
        <label>Mover para<select disabled={movingId===p.id} value={p.stage_id||''} onChange={e=>move(p,e.target.value)}><option value="">Sem etapa</option>{stages.map(st=><option value={st.id} key={st.id}>{st.name}</option>)}</select></label>
      </article>)}</div>:(!isManager&&(counts?.all||0)===0?<div className="empty-state"><Target/><strong>Você ainda não tem editoras sob sua responsabilidade atual.</strong><p>Assuma uma editora quando você for conduzir o próximo estágio comercial.</p><Link href="/app/editoras" className="btn small" style={{marginTop:10}}>Ver editoras disponíveis</Link></div>:<div className="empty-state"><Target/><strong>Nenhuma editora nesta visualização.</strong><p>{hasFilters?'Tente remover alguns filtros ou buscar outro termo.':'Selecione outro status ou mova uma editora para cá.'}</p></div>)}
      {selectedCount!=null&&selectedCount>PAGE_SIZE&&<Pagination page={page} totalPages={totalPages} onChange={setPage}/>}
    </section>
  </div>;
}
