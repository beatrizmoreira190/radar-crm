'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertCircle, Building2, DatabaseZap, Mail, Phone, RefreshCw, SearchX, UserRound, Users, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';

export default function DataHealthPage(){
  const {supabase,membership,isManager}=useCrm(); const org=membership?.organization_id;
  const [summary,setSummary]=useState(null);
  const [queue,setQueue]=useState([]);
  const [duplicates,setDuplicates]=useState([]);
  const [loading,setLoading]=useState(true);
  const [baseCount,setBaseCount]=useState(null);
  const [lastUpdated,setLastUpdated]=useState(null);
  const [notice,setNotice]=useState('');

  async function load(){
    if(!org||!isManager)return;
    setLoading(true);
    setNotice('');
    const countPromise=supabase.from('publishers')
      .select('id',{count:'exact',head:true})
      .eq('organization_id',org)
      .eq('archived',false);
    countPromise.then(({count})=>{if(count!=null)setBaseCount(count)});
    const [s,q,d]=await Promise.all([
      supabase.rpc('crm_data_health_summary',{p_organization_id:org}),
      supabase.rpc('crm_data_health_queue',{p_organization_id:org,p_limit:80}),
      supabase.rpc('crm_duplicate_groups',{p_organization_id:org,p_limit:40})
    ]);
    const err=s.error||q.error||d.error;
    if(err){
      setNotice(`Não foi possível concluir a análise da base: ${err.message}`);
      setLoading(false);
      return;
    }
    setSummary(s.data||{});
    setQueue(q.data||[]);
    setDuplicates(d.data||[]);
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(()=>{load()},[org,isManager]);
  if(!isManager)return <div className="page-wrap"><div className="card panel"><h2>Acesso restrito</h2><p className="muted">Qualidade da base é uma visão de supervisão e administração.</p></div></div>;

  const hasData=summary!==null;
  const loadingCopy=baseCount==null?'Analisando a base…':`Analisando ${baseCount.toLocaleString('pt-BR')} editoras…`;

  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Data Health</div><h1>Qualidade da base</h1><p>Identifique editoras com dados faltantes e possíveis duplicidades para priorizar a revisão da base.</p>{lastUpdated&&<small className="muted">Última análise: {lastUpdated.toLocaleString('pt-BR')}</small>}</div><button className="btn secondary" disabled={loading} onClick={load}><RefreshCw size={16}/>{loading?' Atualizando…':' Recalcular'}</button></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {loading&&!hasData?<div className="card table-empty data-health-loading" role="status"><div className="spinner"/><strong>{loadingCopy}</strong><span>Estamos verificando dados cadastrais, contatos e possíveis duplicidades. Esta análise pode levar alguns segundos.</span></div>:<>
      {loading&&<div className="notice-bar data-health-refreshing" role="status"><span><RefreshCw size={14}/> {loadingCopy} Os últimos resultados continuam visíveis enquanto a atualização é concluída.</span></div>}
      <div className="health-grid"><Health label="Sem e-mail" value={summary?.missing_email} icon={<Mail/>}/><Health label="Sem telefone" value={summary?.missing_phone} icon={<Phone/>}/><Health label="Sem site" value={summary?.missing_website} icon={<Building2/>}/><Health label="Sem CNPJ" value={summary?.missing_cnpj} icon={<DatabaseZap/>}/><Health label="Sem decisor" value={summary?.no_decision_maker} icon={<UserRound/>}/><Health label="Sem responsável" value={summary?.unassigned} icon={<Users/>}/><Health label="Nunca contatadas" value={summary?.never_contacted} icon={<AlertCircle/>}/><Health label="Grupos duplicados" value={summary?.duplicate_groups} icon={<SearchX/>}/></div>
      <div className="quality-layout"><section className="card panel"><div className="panel-head"><div><h2>Contas para enriquecer</h2><p>Comece pelas editoras com mais informações importantes faltando.</p></div></div><div className="quality-list">{queue.length?queue.map(p=><Link href={`/app/editoras/${p.publisher_id}`} className="quality-row" key={p.publisher_id}><div><strong>{p.name}</strong><span>{[p.city,p.state].filter(Boolean).join(' / ')||'Sem localização'} · Score {p.score??0}</span></div><div className="chips">{(p.issues||[]).slice(0,4).map(x=><span className="badge" key={x}>{x}</span>)}{p.issue_count>4&&<span className="badge dark">+{p.issue_count-4}</span>}</div></Link>):<div className="empty-state"><SearchX/><strong>Nenhuma conta pendente de enriquecimento.</strong></div>}</div></section>
      <section className="card panel"><div className="panel-head"><div><h2>Possíveis duplicidades</h2><p>Revise registros que podem representar a mesma editora antes de decidir o que fazer.</p></div></div>{duplicates.length?<div className="duplicate-list">{duplicates.map((g,i)=><div className="duplicate-group" key={`${g.match_type}-${g.match_value}-${i}`}><div className="duplicate-head"><strong>{g.match_type}</strong><span>{g.total} registros</span></div><div>{(g.publishers||[]).map(p=><Link href={`/app/editoras/${p.id}`} key={p.id}><strong>{p.name}</strong><span>{[p.city,p.state,p.cnpj].filter(Boolean).join(' · ')||'—'}</span></Link>)}</div></div>)}</div>:<div className="empty-state"><SearchX/><strong>Nenhuma duplicidade óbvia encontrada.</strong></div>}</section></div>
    </>}
  </div>
}
function Health({label,value,icon}){return <div className="card health-card"><div className="health-icon">{icon}</div><div><span>{label}</span><strong>{value==null?'—':Number(value).toLocaleString('pt-BR')}</strong></div></div>}
