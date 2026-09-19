'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Beaker, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Equal, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { RADAR_PRODUCT_LABELS, formatDate } from '@/lib/constants';

const PAGE_SIZE=50;

const REVIEW_LABELS={
  pending:'Pendente',
  validated:'Faz sentido',
  needs_adjustment:'Precisa ajuste',
  later:'Revisar depois'
};

const FLAG_META={
  large_up:{label:'Alta forte',tone:'green'},
  large_down:{label:'Queda forte',tone:'red'},
  v2_cap_removed:{label:'Teto do v2 removido',tone:'amber'},
  product_changed:{label:'Produto mudou',tone:'blue'},
  multi_product_tie:{label:'Empate de produtos',tone:''},
  unknown_taxonomy:{label:'Perfil sem mapa',tone:'red'},
  specialized_catalog:{label:'Catálogo especializado',tone:''},
  opportunities_recalibrated:{label:'Oportunidades recalibrado',tone:'amber'},
  v2_fit_saturation_reduced:{label:'Saturação do v2 reduzida',tone:'blue'},
  taxonomy_normalized:{label:'Taxonomia normalizada',tone:'green'},
  secondary_line_drives_score:{label:'Linha secundária puxa o score',tone:'amber'}
};

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
function ReviewBadge({status}){
  const value=status||'pending';
  const tone=value==='validated'?'green':value==='needs_adjustment'?'red':value==='later'?'amber':'';
  return <span className={`badge ${tone}`}>{REVIEW_LABELS[value]||value}</span>;
}
function FlagBadges({flags=[]}){
  const rows=Array.isArray(flags)?flags:[];
  if(!rows.length)return <span className="muted" style={{fontSize:10}}>Sem alerta especial</span>;
  return <div className="chips">{rows.slice(0,4).map(flag=>{
    const meta=FLAG_META[flag]||{label:flag,tone:''};
    return <span className={`badge ${meta.tone}`} key={flag}>{meta.label}</span>;
  })}{rows.length>4&&<span className="badge">+{rows.length-4}</span>}</div>;
}

export default function RadarV3LabPage(){
  const {supabase,membership,isManager,user}=useCrm();
  const org=membership?.organization_id;
  const [summary,setSummary]=useState(null);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [sort,setSort]=useState('abs');
  const [status,setStatus]=useState('confirmed');
  const [reviewFilter,setReviewFilter]=useState('pending');
  const [flagFilter,setFlagFilter]=useState('');
  const [suggestionFilter,setSuggestionFilter]=useState('__any__');
  const [search,setSearch]=useState('');
  const [draftSearch,setDraftSearch]=useState('');
  const [page,setPage]=useState(1);
  const [reviewRow,setReviewRow]=useState(null);
  const [reviewStatus,setReviewStatus]=useState('pending');
  const [reviewNote,setReviewNote]=useState('');
  const [savingReview,setSavingReview]=useState(false);

  async function load(){
    if(!org||!isManager)return;
    setLoading(true);
    const [{data:summaryData,error:summaryError},{data:rowData,error:rowsError}]=await Promise.all([
      supabase.rpc('crm_radar_v3_lab_summary',{p_organization_id:org}),
      supabase.rpc('crm_radar_v3_lab_rows_review',{
        p_organization_id:org,
        p_limit:PAGE_SIZE,
        p_offset:(page-1)*PAGE_SIZE,
        p_sort:sort,
        p_search:search||null,
        p_status:status||null,
        p_review_status:reviewFilter||null,
        p_audit_flag:flagFilter||null,
        p_suggestion_status:suggestionFilter||null
      })
    ]);
    if(summaryError||rowsError)setNotice(summaryError?.message||rowsError?.message);
    setSummary(summaryData||null);
    setRows(rowData||[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[org,isManager,page,sort,status,reviewFilter,flagFilter,suggestionFilter,search]);

  function submitSearch(e){
    e.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  function openReview(row){
    setReviewRow(row);
    setReviewStatus(row.review_status||'pending');
    setReviewNote(row.review_note||'');
  }

  async function saveReview(e){
    e.preventDefault();
    if(!org||!reviewRow||!user?.id)return;
    setSavingReview(true);
    const now=new Date().toISOString();
    const {error}=await supabase.from('radar_v3_reviews').upsert({
      organization_id:org,
      publisher_id:reviewRow.publisher_id,
      review_status:reviewStatus,
      review_note:reviewNote.trim()||null,
      reviewed_by:user.id,
      reviewed_at:now,
      updated_at:now
    },{onConflict:'organization_id,publisher_id'});
    setSavingReview(false);
    if(error){setNotice(error.message);return}
    setReviewRow(null);
    setNotice(`${reviewRow.publisher_name}: revisão registrada como “${REVIEW_LABELS[reviewStatus]}”.`);
    if(reviewFilter==='pending'&&reviewStatus!=='pending')setPage(1);
    await load();
  }

  const bestProducts=Array.isArray(summary?.best_products)?summary.best_products:[];
  const lastRefreshed=summary?.last_refreshed?formatDate(summary.last_refreshed,true):'—';
  const changed=Number(summary?.up_10_plus||0)+Number(summary?.down_10_plus||0);
  const stable=Number(summary?.within_5||0);
  const canNext=rows.length===PAGE_SIZE;

  if(!isManager)return <div className="page-wrap"><div className="card panel"><h1>Auditoria Radar</h1><p className="muted">Esta área é restrita à gestão da Radar.</p></div></div>;

  return <div className="page-wrap">
    <div className="page-head">
      <div>
        <div className="eyebrow">Gestão do modelo</div>
        <h1>Auditoria Radar Score</h1>
        <p>O Radar Score v3 já é o modelo oficial. Esta área preserva a comparação histórica com o v2 e os casos que merecem acompanhamento.</p>
      </div>
    </div>

    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="card panel" style={{borderColor:'#b2ddff',background:'#f5fbff'}}>
      <div className="panel-head"><div><h2>Radar v3 em produção</h2><p>Ficha da editora, Prioridades e demais leituras comerciais já usam <strong>radar_v3</strong>. A comparação abaixo mantém o antigo v2 apenas como referência histórica.</p></div><ShieldCheck size={22}/></div>
      <div className="info-grid">
        <div className="info-item"><small>Fórmula oficial</small><span>70% aderência + 20% potencial + 10% prospectabilidade</span></div>
        <div className="info-item"><small>Aderência do produto</small><span>1 perfil usa 100% do sinal; 2 perfis reescalam 85/10; 3+ usam 85/10/5 com cobertura do catálogo</span></div>
        <div className="info-item"><small>Perfis confessionais</small><span>Não existe teto global. Cada perfil contribui conforme sua aderência real aos produtos da Radar.</span></div>
        <div className="info-item"><small>Radar de Oportunidades</small><span>Pesos recalibrados em 15 pontos antes da combinação para reduzir a inflação do antigo v2.</span></div>
      </div>
    </section>

    <div className="metric-grid">
      <div className="metric-card"><span>Confirmadas analisadas</span><strong>{Number(summary?.total||0).toLocaleString('pt-BR')}</strong><small>Atualizado {lastRefreshed}</small></div>
      <div className="metric-card"><span>Score médio</span><strong>{summary?.v2_avg??'—'} → {summary?.v3_avg??'—'}</strong><small>Mediana {summary?.v2_median??'—'} → {summary?.v3_median??'—'}</small></div>
      <div className="metric-card"><span>Aderência 100</span><strong>{Number(summary?.v2_fit_100||0).toLocaleString('pt-BR')} → {Number(summary?.v3_fit_100||0).toLocaleString('pt-BR')}</strong><small>Redução de saturação</small></div>
      <div className="metric-card"><span>Score 90+</span><strong>{Number(summary?.v2_90_plus||0).toLocaleString('pt-BR')} → {Number(summary?.v3_90_plus||0).toLocaleString('pt-BR')}</strong><small>Faixa de prioridade máxima</small></div>
      <div className="metric-card"><span>Mudança ≥10 pontos</span><strong>{changed.toLocaleString('pt-BR')}</strong><small>{summary?.up_10_plus||0} sobem · {summary?.down_10_plus||0} descem</small></div>
      <div className="metric-card"><span>Praticamente estáveis</span><strong>{stable.toLocaleString('pt-BR')}</strong><small>Diferença de até 5 pontos</small></div>
      <div className="metric-card"><span>Auditoria humana</span><strong>{Number(summary?.review_validated||0).toLocaleString('pt-BR')} validadas</strong><small>{Number(summary?.review_pending||0).toLocaleString('pt-BR')} pendentes · {Number(summary?.review_later||0).toLocaleString('pt-BR')} depois</small></div>
      <div className="metric-card"><span>Regra precisa ajuste</span><strong>{Number(summary?.review_needs_adjustment||0).toLocaleString('pt-BR')}</strong><small>Casos que indicam mudança no algoritmo</small></div>
      <div className="metric-card"><span>Sugestões do assistente</span><strong>{Number(summary?.suggestions_total||0).toLocaleString('pt-BR')}</strong><small>{Number(summary?.suggestions_validated||0).toLocaleString('pt-BR')} fazem sentido · {Number(summary?.suggestions_needs_adjustment||0).toLocaleString('pt-BR')} pedem ajuste · {Number(summary?.suggestions_later||0).toLocaleString('pt-BR')} depois</small></div>
    </div>

    <section className="card panel">
      <div className="panel-head"><div><h2>Distribuição da melhor abordagem no Radar v3</h2><p>O produto exibido é a recomendação de abertura; empates continuam registrados separadamente.</p></div><Beaker size={21}/></div>
      <div className="chips">{bestProducts.map(item=><span className="badge blue" key={item.product}>{productLabel(item.product)} · {Number(item.n||0).toLocaleString('pt-BR')}</span>)}</div>
      <div className="publisher-meta" style={{marginTop:12}}>
        <span>Empates em 2+ produtos: {Number(summary?.ties||0).toLocaleString('pt-BR')}</span>
        <span>Empates em 3+ produtos: {Number(summary?.three_plus_ties||0).toLocaleString('pt-BR')}</span>
        <span>Perfis ainda sem normalização: {Number(summary?.unknown_profiles||0).toLocaleString('pt-BR')}</span>
      </div>
    </section>

    <section className="card panel">
      <div className="panel-head" style={{alignItems:'flex-end'}}>
        <div><h2>Fila de auditoria</h2><p>Comece pelos maiores desvios e registre se a mudança faz sentido comercialmente.</p></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
          <select value={reviewFilter} onChange={e=>{setPage(1);setReviewFilter(e.target.value)}}>
            <option value="pending">Revisão: pendentes</option>
            <option value="validated">Revisão: faz sentido</option>
            <option value="needs_adjustment">Revisão: precisa ajuste</option>
            <option value="later">Revisão: depois</option>
            <option value="">Todas as revisões</option>
          </select>
          <select value={suggestionFilter} onChange={e=>{setPage(1);setSuggestionFilter(e.target.value)}}>
            <option value="__any__">Com sugestão do assistente</option>
            <option value="validated">Sugestão: faz sentido</option>
            <option value="needs_adjustment">Sugestão: precisa ajuste</option>
            <option value="later">Sugestão: revisar depois</option>
            <option value="__none__">Sem sugestão</option>
            <option value="">Todas as editoras</option>
          </select>
          <select value={flagFilter} onChange={e=>{setPage(1);setFlagFilter(e.target.value)}}>
            <option value="">Todos os sinais</option>
            <option value="secondary_line_drives_score">Linha secundária puxa o score</option>
            <option value="v2_cap_removed">Teto v2 removido</option>
            <option value="opportunities_recalibrated">Radar de Oportunidades recalibrado</option>
            <option value="product_changed">Produto recomendado mudou</option>
            <option value="large_up">Alta forte</option>
            <option value="large_down">Queda forte</option>
            <option value="v2_fit_saturation_reduced">Saturação do v2 reduzida</option>
            <option value="taxonomy_normalized">Taxonomia normalizada</option>
            <option value="unknown_taxonomy">Perfil sem mapa</option>
          </select>
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

      {loading?<div className="table-empty">Carregando auditoria…</div>:rows.length?<div className="table-wrap"><table className="data-table">
        <thead><tr><th>Editora</th><th>Score</th><th>Δ</th><th>Aderência</th><th>Abordagem v3</th><th>Sinais</th><th>Revisão</th></tr></thead>
        <tbody>{rows.map(row=>{
          const profiles=Array.isArray(row.editorial_profile)?row.editorial_profile:[];
          const top=Array.isArray(row.top_products)?row.top_products:[];
          const unknown=Array.isArray(row.unknown_profiles)?row.unknown_profiles:[];
          const flags=Array.isArray(row.audit_flags)?row.audit_flags:[];
          const suggestionStale=Boolean(row.suggestion_generated_at&&row.calculated_at&&new Date(row.suggestion_generated_at)<new Date(row.calculated_at));
          return <tr key={row.publisher_id}>
            <td><Link className="table-title" href={`/app/editoras/${row.publisher_id}`}>{row.publisher_name}</Link><small>{row.editorial_profile_status||'—'} · confiança {row.editorial_profile_confidence||'—'}</small><div className="chips" style={{marginTop:5}}>{profiles.slice(0,3).map(p=><span className="badge" key={p}>{p}</span>)}{profiles.length>3&&<span className="badge">+{profiles.length-3}</span>}{unknown.length>0&&<span className="badge red">Sem mapa: {unknown.join(', ')}</span>}</div></td>
            <td><strong>{row.v2_score??0} → {row.v3_score??0}</strong></td>
            <td><Delta value={row.delta}/></td>
            <td><strong>{row.v2_fit??0} → {row.v3_fit??0}</strong></td>
            <td><strong>{productLabel(row.v3_best_product)}</strong>{top.length>1&&<small>Empate: {top.map(productLabel).join(' · ')}</small>}</td>
            <td><FlagBadges flags={flags}/></td>
            <td><div style={{display:'grid',gap:6,justifyItems:'start'}}><ReviewBadge status={row.review_status}/>{row.suggestion_status&&<span className="muted" style={{fontSize:9}}>Sugestão: {REVIEW_LABELS[row.suggestion_status]||row.suggestion_status}{suggestionStale?' · anterior ao último recálculo':''}</span>}<button className="link-btn compact" onClick={()=>openReview(row)}><SlidersHorizontal size={13}/> Revisar</button></div></td>
          </tr>
        })}</tbody>
      </table></div>:<div className="empty-state"><CheckCircle2/><strong>Nenhum caso neste filtro.</strong><p>Altere o filtro de revisão ou passe para a próxima etapa da auditoria.</p></div>}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14}}>
        <button className="btn secondary small" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={14}/> Anterior</button>
        <span className="muted" style={{fontSize:11}}>Página {page}</span>
        <button className="btn secondary small" disabled={!canNext} onClick={()=>setPage(p=>p+1)}>Próxima <ChevronRight size={14}/></button>
      </div>
    </section>

    {reviewRow&&<div className="modal-backdrop"><form className="modal" onSubmit={saveReview}>
      <div className="modal-head"><div><h3>Auditar · {reviewRow.publisher_name}</h3><p>Registre se a mudança do v3 representa melhor a oportunidade comercial.</p></div><button type="button" onClick={()=>setReviewRow(null)}><X/></button></div>
      <div className="info-grid" style={{marginBottom:14}}>
        <div className="info-item"><small>Radar Score</small><span>{reviewRow.v2_score??0} → <strong>{reviewRow.v3_score??0}</strong> · Δ {reviewRow.delta>0?'+':''}{reviewRow.delta}</span></div>
        <div className="info-item"><small>Aderência</small><span>{reviewRow.v2_fit??0} → <strong>{reviewRow.v3_fit??0}</strong></span></div>
        <div className="info-item"><small>Produto v2</small><span>{productLabel(reviewRow.v2_best_product)}</span></div>
        <div className="info-item"><small>Produto v3</small><span>{productLabel(reviewRow.v3_best_product)}</span></div>
      </div>
      <div style={{marginBottom:14}}><small className="muted">Sinais da auditoria</small><div style={{marginTop:6}}><FlagBadges flags={reviewRow.audit_flags}/></div></div>
      {(reviewRow.audit_flags||[]).includes('secondary_line_drives_score')&&<div className="notice" style={{marginBottom:14}}>
        <AlertCircle size={16}/>
        <div>
          <strong>Linha secundária está sustentando a recomendação.</strong>
          <p style={{margin:'4px 0 0'}}>Nos três primeiros perfis editoriais, o maior peso bruto para {productLabel(reviewRow.v3_best_product)} é <strong>{reviewRow.audit_meta?.primary_product_support?.primary_raw_max??0}</strong>. Considerando todo o catálogo, existe um perfil com peso <strong>{reviewRow.audit_meta?.primary_product_support?.all_raw_max??0}</strong>. Isso não reduz automaticamente a nota; é um sinal para validar se essa linha realmente tem presença comercial relevante.</p>
        </div>
      </div>}
      {reviewRow.suggestion_status&&<div style={{marginBottom:14,padding:12,border:'1px solid #d0d5dd',borderRadius:10,background:'#f9fafb'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div><small className="muted">Sugestão do assistente · não conta como revisão humana</small><div style={{marginTop:5}}><ReviewBadge status={reviewRow.suggestion_status}/></div></div>
          <button type="button" className="btn secondary small" onClick={()=>{setReviewStatus(reviewRow.suggestion_status);setReviewNote(reviewRow.suggestion_note||'')}}>Usar como rascunho</button>
        </div>
        {reviewRow.suggestion_generated_at&&reviewRow.calculated_at&&new Date(reviewRow.suggestion_generated_at)<new Date(reviewRow.calculated_at)&&<div className="notice" style={{marginTop:10}}><Clock3 size={14}/><span>Esta sugestão foi produzida antes do último recálculo do laboratório. Use-a como contexto, mas confira os números atuais antes de salvar a revisão.</span></div>}
        <p style={{fontSize:11,lineHeight:1.55,color:'#475467',margin:'10px 0 0'}}>{reviewRow.suggestion_note}</p>
      </div>}
      <div style={{marginBottom:14}}><small className="muted">Perfis editoriais</small><div className="chips" style={{marginTop:6}}>{(reviewRow.editorial_profile||[]).map(profile=><span className="badge" key={profile}>{profile}</span>)}</div></div>
      <div className="form-grid">
        <label className="span-2">Conclusão<select value={reviewStatus} onChange={e=>setReviewStatus(e.target.value)}>
          <option value="pending">Pendente</option>
          <option value="validated">Faz sentido</option>
          <option value="needs_adjustment">Precisa ajuste na regra</option>
          <option value="later">Revisar depois</option>
        </select></label>
        <label className="span-2">Nota da auditoria<textarea rows={5} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Ex.: a queda parece correta porque o v2 supervalorizava Radar de Oportunidades; ou a alta ainda parece excessiva porque a linha aderente é secundária."/></label>
      </div>
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setReviewRow(null)}>Cancelar</button><button className="btn" disabled={savingReview}>{savingReview?'Salvando…':'Salvar revisão'}</button></div>
    </form></div>}
  </div>;
}
