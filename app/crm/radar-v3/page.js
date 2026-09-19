'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Beaker, ChevronLeft, ChevronRight, Equal, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { RADAR_PRODUCT_LABELS, formatDate } from '@/lib/constants';

const PAGE_SIZE=50;

function scoreTone(delta){
  if(delta>=10)return'green';
  if(delta<=-10)return'red';
  return'';
}
function Delta({value}){
  const n=Number(value||0);
  return <span className={`badge ${scoreTone(n)}`} style={{display:'inline-flex',alignItems:'center',gap:4}}>
    {n>0?<ArrowUpRight size={12}/>:n<0?<ArrowDownRight size={12}/>:<Equal size={12}/>}
    {n>0?'+':''}{n}
  </span>;
}
function productLabel(value){return RADAR_PRODUCT_LABELS[value]||value||'—'}

export default function RadarV3LabPage(){
  const {supabase,membership,isManager}=useCrm();
  const org=membership?.organization_id;
  const [summary,setSummary]=useState(null);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [notice,setNotice]=useState('');
  const [sort,setSort]=useState('abs');
  const [status,setStatus]=useState('confirmed');
  const [search,setSearch]=useState('');
  const [draftSearch,setDraftSearch]=useState('');
  const [page,setPage]=useState(1);

  async function load(){
    if(!org||!isManager)return;
    setLoading(true);
    const [{data:summaryData,error:summaryError},{data:rowData,error:rowsError}]=await Promise.all([
      supabase.rpc('crm_radar_v3_lab_summary',{p_organization_id:org}),
      supabase.rpc('crm_radar_v3_lab_rows',{
        p_organization_id:org,
        p_limit:PAGE_SIZE,
        p_offset:(page-1)*PAGE_SIZE,
        p_sort:sort,
        p_search:search||null,
        p_status:status||null
      })
    ]);
    if(summaryError||rowsError)setNotice(summaryError?.message||rowsError?.message);
    setSummary(summaryData||null);
    setRows(rowData||[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[org,isManager,page,sort,status,search]);

  async function refreshLab(){
    if(!org)return;
    setRefreshing(true);setNotice('');
    const {data,error}=await supabase.rpc('crm_radar_v3_lab_refresh',{p_organization_id:org});
    if(error)setNotice(error.message);
    else setNotice(`Laboratório recalculado para ${Number(data||0).toLocaleString('pt-BR')} editoras com perfil editorial.`);
    setRefreshing(false);
    if(!error){setPage(1);await load()}
  }

  function submitSearch(e){
    e.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  const bestProducts=Array.isArray(summary?.best_products)?summary.best_products:[];
  const lastRefreshed=summary?.last_refreshed?formatDate(summary.last_refreshed,true):'—';
  const changed=Number(summary?.up_10_plus||0)+Number(summary?.down_10_plus||0);
  const stable=Number(summary?.within_5||0);
  const canNext=rows.length===PAGE_SIZE;

  if(!isManager)return <div className="page-wrap"><div className="card panel"><h1>Radar v3</h1><p className="muted">Este laboratório é restrito à gestão da Radar.</p></div></div>;

  return <div className="page-wrap">
    <div className="page-head">
      <div>
        <div className="eyebrow">Laboratório comercial</div>
        <h1>Radar Score v3</h1>
        <p>Compare o score atual com o candidato v3 sem alterar Prioridades, Pipeline ou o score oficial das editoras.</p>
      </div>
      <button className="btn secondary" onClick={refreshLab} disabled={refreshing}>
        <RefreshCw size={16}/>{refreshing?'Recalculando…':'Recalcular laboratório'}
      </button>
    </div>

    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="card panel" style={{borderColor:'#b2ddff',background:'#f5fbff'}}>
      <div className="panel-head"><div><h2>O v3 ainda não está valendo</h2><p>O Radar Score oficial continua sendo o <strong>radar_v2</strong>. Esta tela é somente comparativa.</p></div><ShieldCheck size={22}/></div>
      <div className="info-grid">
        <div className="info-item"><small>Fórmula final</small><span>70% aderência + 20% potencial + 10% prospectabilidade</span></div>
        <div className="info-item"><small>Aderência do produto</small><span>85% maior sinal + 10% segundo + 5% terceiro, ajustados pela cobertura do catálogo</span></div>
        <div className="info-item"><small>Perfis confessionais</small><span>Sem teto global; cada linha é avaliada pelo próprio fit e pela cobertura do catálogo</span></div>
        <div className="info-item"><small>Radar de Oportunidades</small><span>Pesos experimentais 15 pontos abaixo do v2 antes da combinação</span></div>
      </div>
    </section>

    <div className="metric-grid">
      <div className="metric-card"><span>Confirmadas analisadas</span><strong>{Number(summary?.total||0).toLocaleString('pt-BR')}</strong><small>Atualizado {lastRefreshed}</small></div>
      <div className="metric-card"><span>Score médio</span><strong>{summary?.v2_avg??'—'} → {summary?.v3_avg??'—'}</strong><small>Mediana {summary?.v2_median??'—'} → {summary?.v3_median??'—'}</small></div>
      <div className="metric-card"><span>Aderência 100</span><strong>{Number(summary?.v2_fit_100||0).toLocaleString('pt-BR')} → {Number(summary?.v3_fit_100||0).toLocaleString('pt-BR')}</strong><small>Redução de saturação</small></div>
      <div className="metric-card"><span>Score 90+</span><strong>{Number(summary?.v2_90_plus||0).toLocaleString('pt-BR')} → {Number(summary?.v3_90_plus||0).toLocaleString('pt-BR')}</strong><small>Faixa de prioridade máxima</small></div>
      <div className="metric-card"><span>Mudança ≥10 pontos</span><strong>{changed.toLocaleString('pt-BR')}</strong><small>{summary?.up_10_plus||0} sobem · {summary?.down_10_plus||0} descem</small></div>
      <div className="metric-card"><span>Praticamente estáveis</span><strong>{stable.toLocaleString('pt-BR')}</strong><small>Diferença de até 5 pontos</small></div>
    </div>

    <section className="card panel">
      <div className="panel-head"><div><h2>Distribuição da melhor abordagem no v3</h2><p>O produto exibido é a recomendação de abertura; empates continuam registrados separadamente.</p></div><Beaker size={21}/></div>
      <div className="chips">{bestProducts.map(item=><span className="badge blue" key={item.product}>{productLabel(item.product)} · {Number(item.n||0).toLocaleString('pt-BR')}</span>)}</div>
      <div className="publisher-meta" style={{marginTop:12}}>
        <span>Empates em 2+ produtos: {Number(summary?.ties||0).toLocaleString('pt-BR')}</span>
        <span>Empates em 3+ produtos: {Number(summary?.three_plus_ties||0).toLocaleString('pt-BR')}</span>
        <span>Perfis ainda sem normalização: {Number(summary?.unknown_profiles||0).toLocaleString('pt-BR')}</span>
      </div>
    </section>

    <section className="card panel">
      <div className="panel-head" style={{alignItems:'flex-end'}}>
        <div><h2>Comparação editora por editora</h2><p>Abra os maiores desvios primeiro e valide se a mudança faz sentido comercialmente.</p></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
          <select value={status} onChange={e=>{setPage(1);setStatus(e.target.value)}}>
            <option value="confirmed">Perfil confirmado</option>
            <option value="partial">Perfil parcial</option>
            <option value="review">Revisar cadastro</option>
            <option value="">Todos com perfil</option>
          </select>
          <select value={sort} onChange={e=>{setPage(1);setSort(e.target.value)}}>
            <option value="abs">Maiores mudanças</option>
            <option value="up">Maiores altas</option>
            <option value="down">Maiores quedas</option>
            <option value="v3">Maior score v3</option>
            <option value="name">Nome</option>
          </select>
          <form onSubmit={submitSearch} className="search-box"><Search size={15}/><input value={draftSearch} onChange={e=>setDraftSearch(e.target.value)} placeholder="Buscar editora"/><button className="link-btn compact">Buscar</button></form>
        </div>
      </div>

      {loading?<div className="table-empty">Carregando comparação…</div>:rows.length?<div className="table-wrap"><table className="data-table">
        <thead><tr><th>Editora</th><th>Score</th><th>Δ</th><th>Aderência</th><th>Abordagem v3</th><th>Perfis</th></tr></thead>
        <tbody>{rows.map(row=>{
          const profiles=Array.isArray(row.editorial_profile)?row.editorial_profile:[];
          const top=Array.isArray(row.top_products)?row.top_products:[];
          const unknown=Array.isArray(row.unknown_profiles)?row.unknown_profiles:[];
          return <tr key={row.publisher_id}>
            <td><Link className="table-title" href={`/app/editoras/${row.publisher_id}`}>{row.publisher_name}</Link><small>{row.editorial_profile_status||'—'} · confiança {row.editorial_profile_confidence||'—'}</small></td>
            <td><strong>{row.v2_score??0} → {row.v3_score??0}</strong></td>
            <td><Delta value={row.delta}/></td>
            <td><strong>{row.v2_fit??0} → {row.v3_fit??0}</strong></td>
            <td><strong>{productLabel(row.v3_best_product)}</strong>{top.length>1&&<small>Empate: {top.map(productLabel).join(' · ')}</small>}</td>
            <td><div className="chips">{profiles.slice(0,4).map(p=><span className="badge" key={p}>{p}</span>)}{profiles.length>4&&<span className="badge">+{profiles.length-4}</span>}{unknown.length>0&&<span className="badge red">Sem mapa: {unknown.join(', ')}</span>}</div></td>
          </tr>
        })}</tbody>
      </table></div>:<div className="empty-state"><Beaker/><strong>Nenhuma editora encontrada.</strong><p>Ajuste os filtros ou recalcule o laboratório.</p></div>}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14}}>
        <button className="btn secondary small" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={14}/> Anterior</button>
        <span className="muted" style={{fontSize:11}}>Página {page}</span>
        <button className="btn secondary small" disabled={!canNext} onClick={()=>setPage(p=>p+1)}>Próxima <ChevronRight size={14}/></button>
      </div>
    </section>
  </div>;
}
