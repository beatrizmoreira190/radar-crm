'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Building2, Filter, Plus, Search, UserCheck, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import Pagination from '@/components/Pagination';
import { BRAZIL_STATES, EDITORIAL_PROFILE_OPTIONS, EDITORIAL_PROFILE_STATUS_LABELS, PRIORITY_LABELS, formatDate } from '@/lib/constants';

const PAGE_SIZE = 40;
const EMPTY_FILTERS = {q:'',stage:'',priority:'',state:'',owner:'',contact:'',scoreMin:'',editorialProfile:'',enrichment:''};

export default function PublishersPage(){
  const {supabase,membership,user,team,teamMap,isManager}=useCrm();
  const org=membership?.organization_id;
  const [rows,setRows]=useState([]); const [stages,setStages]=useState([]); const [count,setCount]=useState(0);
  const [page,setPage]=useState(1); const [filters,setFilters]=useState(EMPTY_FILTERS); const [moreFilters,setMoreFilters]=useState(false);
  const [savedViews,setSavedViews]=useState([]); const [activeView,setActiveView]=useState(''); const [showSaveView,setShowSaveView]=useState(false); const defaultApplied=useRef(false);
  const [loading,setLoading]=useState(true); const [showNew,setShowNew]=useState(false); const [notice,setNotice]=useState('');
  const [editorialProfileOptions,setEditorialProfileOptions]=useState(EDITORIAL_PROFILE_OPTIONS.map(value=>({value,publisher_count:null})));
  const setF=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(1);setActiveView('')};

  async function loadViews(){
    if(!org||!user?.id)return;
    const {data,error}=await supabase.from('saved_views').select('id,name,filters,is_default,created_at').eq('organization_id',org).eq('user_id',user.id).eq('entity_type','publishers').order('is_default',{ascending:false}).order('name');
    if(error)setNotice(error.message); else {const list=data||[];setSavedViews(list);if(!defaultApplied.current){defaultApplied.current=true;const d=list.find(v=>v.is_default);if(d){setFilters({...EMPTY_FILTERS,...(d.filters||{})});setActiveView(d.id);setPage(1)}}}
  }

  async function loadEditorialProfileOptions(){
    if(!org)return;
    const {data,error}=await supabase.rpc('get_editorial_profile_options',{p_organization_id:org});
    if(error)return;
    const dynamic=(data||[]).filter(item=>item?.value);
    if(dynamic.length)setEditorialProfileOptions(dynamic);
  }

  async function load(){
    if(!org)return;setLoading(true);
    let query=supabase.from('publishers').select('id,name,trade_name,cnpj,city,state,priority,score,stage_id,owner_user_id,last_contact_at,next_action_at,commercial_temperature,editorial_profile,editorial_profile_status',{count:'exact'}).eq('organization_id',org).eq('archived',false);
    const q=filters.q.trim().replace(/[,%()]/g,' ');
    if(q)query=query.or(`name.ilike.%${q}%,trade_name.ilike.%${q}%,cnpj.ilike.%${q}%`);
    if(filters.stage==='__none__')query=query.is('stage_id',null); else if(filters.stage)query=query.eq('stage_id',filters.stage);
    if(filters.priority)query=query.eq('priority',filters.priority);
    if(filters.state)query=query.eq('state',filters.state);
    if(filters.owner==='mine')query=query.eq('owner_user_id',user?.id); else if(filters.owner==='unassigned')query=query.is('owner_user_id',null); else if(filters.owner)query=query.eq('owner_user_id',filters.owner);
    if(filters.contact==='contacted')query=query.not('last_contact_at','is',null); else if(filters.contact==='never')query=query.is('last_contact_at',null);
    if(filters.scoreMin!=='')query=query.gte('score',Number(filters.scoreMin)||0);
    if(filters.editorialProfile)query=query.contains('editorial_profile',[filters.editorialProfile]);
    if(filters.enrichment)query=query.eq('editorial_profile_status',filters.enrichment);
    query=query.order('score',{ascending:false,nullsFirst:false}).order('name').range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1);
    const [{data,error,count:total},{data:stageRows}]=await Promise.all([query,supabase.from('pipeline_stages').select('id,name,position,stage_type').eq('organization_id',org).eq('active',true).order('position')]);
    if(error)setNotice(error.message);setRows(data||[]);setCount(total||0);setStages(stageRows||[]);setLoading(false);
  }

  useEffect(()=>{loadViews()},[org,user?.id]);
  useEffect(()=>{loadEditorialProfileOptions()},[org]);
  useEffect(()=>{const t=setTimeout(()=>load(),filters.q?250:0);return()=>clearTimeout(t)},[org,page,filters,user?.id]);
  const stageMap=useMemo(()=>Object.fromEntries(stages.map(s=>[s.id,s])),[stages]);
  const totalPages=Math.max(1,Math.ceil(count/PAGE_SIZE));
  const hasFilters=Object.values(filters).some(Boolean);
  function reset(){setFilters(EMPTY_FILTERS);setPage(1);setActiveView('')}
  function applyView(view){setFilters({...EMPTY_FILTERS,...(view.filters||{})});setPage(1);setActiveView(view.id)}

  async function saveView(name,isDefault){
    if(!name.trim())return;
    if(isDefault)await supabase.from('saved_views').update({is_default:false}).eq('organization_id',org).eq('user_id',user.id).eq('entity_type','publishers');
    const {error}=await supabase.from('saved_views').insert({organization_id:org,user_id:user.id,name:name.trim(),entity_type:'publishers',filters,is_default:isDefault});
    if(error)setNotice(error.message);else{setNotice('Visão salva.');setShowSaveView(false);loadViews()}
  }
  async function deleteView(){if(!activeView)return;const {error}=await supabase.from('saved_views').delete().eq('id',activeView);if(error)setNotice(error.message);else{setNotice('Visão excluída.');setActiveView('');loadViews()}}
  async function claim(p){const {error}=await supabase.from('publishers').update({owner_user_id:user.id,updated_by:user.id,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',p.id);if(error)setNotice(error.message);else{setNotice(`Você agora é responsável por ${p.name}.`);load()}}

  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Base comercial</div><h1>Editoras</h1><p>Encontre contas por perfil editorial, etapa, localização e responsável para organizar sua prospecção.</p></div>{isManager&&<button className="btn" onClick={()=>setShowNew(true)}><Plus size={16}/> Nova editora</button>}</div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <div className="card panel" style={{marginBottom:14,paddingBottom:14}}>
      <div className="section-title" style={{marginBottom:10}}><div><h3>Visões salvas</h3><p className="muted">Salve filtros que você usa com frequência, como “Infantil · SP” ou “Sem contato · score 80+”.</p></div><button className="btn secondary small" onClick={()=>setShowSaveView(true)}><Bookmark size={14}/> Salvar visão</button></div>
      <div className="chips"><button className={`chip ${!activeView&&!hasFilters?'active':''}`} onClick={reset}>Todas</button>{savedViews.map(v=><button key={v.id} className={`chip ${activeView===v.id?'active':''}`} onClick={()=>applyView(v)}>{v.name}{v.is_default?' · padrão':''}</button>)}{activeView&&<button className="chip" onClick={deleteView}>Excluir visão</button>}</div>
    </div>

    <div className="toolbar"><div className="search-box"><Search size={17}/><input className="input" value={filters.q} onChange={e=>setF('q',e.target.value)} placeholder="Nome, nome fantasia ou CNPJ"/></div><select className="filter-select" value={filters.stage} onChange={e=>setF('stage',e.target.value)}><option value="">Todas as etapas</option><option value="__none__">Sem etapa</option>{stages.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select><select className="filter-select" value={filters.priority} onChange={e=>setF('priority',e.target.value)}><option value="">Todas as prioridades</option>{Object.entries(PRIORITY_LABELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><button className="btn secondary" onClick={()=>setMoreFilters(v=>!v)}><Filter size={15}/> Mais filtros</button>{hasFilters&&<button className="btn secondary" onClick={reset}>Limpar</button>}</div>

    {moreFilters&&<div className="card panel" style={{marginBottom:16}}><div className="form-grid"><label>UF<select value={filters.state} onChange={e=>setF('state',e.target.value)}><option value="">Todos os estados</option>{BRAZIL_STATES.map(uf=><option key={uf}>{uf}</option>)}</select></label><label>Perfil editorial<select value={filters.editorialProfile} onChange={e=>setF('editorialProfile',e.target.value)}><option value="">Todos os perfis</option>{editorialProfileOptions.map(item=><option value={item.value} key={item.value}>{item.value}{item.publisher_count===null?'':` (${item.publisher_count})`}</option>)}</select></label><label>Responsável<select value={filters.owner} onChange={e=>setF('owner',e.target.value)}><option value="">Qualquer responsável</option><option value="mine">Minhas editoras</option><option value="unassigned">Sem responsável</option>{team.filter(m=>m.active).map(m=><option key={m.user_id} value={m.user_id}>{m.full_name||m.email}</option>)}</select></label><label>Contato<select value={filters.contact} onChange={e=>setF('contact',e.target.value)}><option value="">Qualquer situação</option><option value="never">Nunca contatada</option><option value="contacted">Já contatada</option></select></label><label>Enriquecimento<select value={filters.enrichment} onChange={e=>setF('enrichment',e.target.value)}><option value="">Qualquer status</option>{Object.entries(EDITORIAL_PROFILE_STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Score mínimo<input className="input" type="number" min="0" max="100" value={filters.scoreMin} onChange={e=>setF('scoreMin',e.target.value)} placeholder="Ex.: 80"/></label></div></div>}

    <div className="chips" style={{marginBottom:12}}><button className={`chip ${filters.owner==='mine'?'active':''}`} onClick={()=>setF('owner',filters.owner==='mine'?'':'mine')}>Minha carteira</button><button className={`chip ${filters.owner==='unassigned'?'active':''}`} onClick={()=>setF('owner',filters.owner==='unassigned'?'':'unassigned')}>Sem responsável</button><button className={`chip ${filters.contact==='never'?'active':''}`} onClick={()=>setF('contact',filters.contact==='never'?'':'never')}>Nunca contatadas</button><span className="badge">{count.toLocaleString('pt-BR')} resultado{count===1?'':'s'}</span></div>

    <section className="card table-card"><table className="data-table"><thead><tr><th>Editora</th><th>Local</th><th>Perfil editorial</th><th>Etapa</th><th>Prioridade</th><th>Score</th><th>Responsável</th><th>Último contato</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><div className="cell-main"><Link className="row-link" href={`/app/editoras/${p.id}`}>{p.name}</Link><span>{p.trade_name||p.cnpj||'—'}</span></div></td><td>{[p.city,p.state].filter(Boolean).join(' / ')||'—'}</td><td>{p.editorial_profile?.length?<div className="cell-main"><strong>{p.editorial_profile.slice(0,2).join(' · ')}</strong>{p.editorial_profile.length>2&&<span>+{p.editorial_profile.length-2} perfil{p.editorial_profile.length-2===1?'':'s'}</span>}</div>:p.editorial_profile_status==='review'?<span className="badge amber">Revisar</span>:<span className="muted">—</span>}</td><td><span className="badge">{stageMap[p.stage_id]?.name||'Sem etapa'}</span></td><td><span className={`badge ${p.priority==='urgent'||p.priority==='high'?'red':p.priority==='medium'?'amber':''}`}>{PRIORITY_LABELS[p.priority]||p.priority||'—'}</span></td><td><strong>{p.score??0}</strong></td><td>{p.owner_user_id===user?.id?<span className="badge green">Você</span>:p.owner_user_id?(teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'Equipe'):<button className="btn secondary small" onClick={()=>claim(p)}><UserCheck size={13}/> Assumir</button>}</td><td>{formatDate(p.last_contact_at,true)}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<div className="table-empty"><Building2 size={30}/><p>Nenhuma editora encontrada com esses filtros.</p></div>}{loading&&<div className="table-empty">Carregando editoras…</div>}<Pagination page={page} totalPages={totalPages} onChange={setPage}/></section>
    {showNew&&<NewPublisherModal supabase={supabase} org={org} user={user} stages={stages} onClose={()=>setShowNew(false)} onSaved={()=>{setShowNew(false);setNotice('Editora criada.');setPage(1);load()}}/>}
    {showSaveView&&<SaveViewModal onClose={()=>setShowSaveView(false)} onSave={saveView}/>} 
  </div>;
}

function SaveViewModal({onClose,onSave}){const [name,setName]=useState('');const [isDefault,setIsDefault]=useState(false);return <div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault();onSave(name,isDefault)}}><div className="modal-head"><div><h3>Salvar visão</h3><p>Guarda a combinação atual de busca e filtros somente para você.</p></div><button type="button" onClick={onClose}><X/></button></div><div className="form-grid"><label className="span-2">Nome da visão<input className="input" autoFocus required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Minhas editoras de SP"/></label><label className="span-2"><span><input type="checkbox" checked={isDefault} onChange={e=>setIsDefault(e.target.checked)}/> Marcar como visão padrão</span></label></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn">Salvar visão</button></div></form></div>}

function NewPublisherModal({supabase,org,user,stages,onClose,onSaved}){const [f,setF]=useState({name:'',trade_name:'',cnpj:'',city:'',state:'',website:'',general_email:'',phone:'',priority:'medium',stage_id:''});const [busy,setBusy]=useState(false);const [err,setErr]=useState('');function s(k,v){setF(x=>({...x,[k]:v}))}async function save(e){e.preventDefault();setBusy(true);setErr('');const payload={organization_id:org,name:f.name.trim(),trade_name:f.trade_name||null,cnpj:f.cnpj||null,city:f.city||null,state:f.state||null,website:f.website||null,general_email:f.general_email||null,phone:f.phone||null,priority:f.priority,stage_id:f.stage_id||null,genres:[],alternate_emails:[],archived:false,created_by:user?.id||null,updated_by:user?.id||null};const {error}=await supabase.from('publishers').insert(payload);if(error){setErr(error.message);setBusy(false)}else onSaved()}return <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h3>Nova editora</h3><p>Cadastre o essencial; os demais dados podem ser completados depois.</p></div><button type="button" onClick={onClose}><X/></button></div>{err&&<div className="notice error">{err}</div>}<div className="form-grid"><label className="span-2">Nome<input className="input" required value={f.name} onChange={e=>s('name',e.target.value)}/></label><label>Nome fantasia<input className="input" value={f.trade_name} onChange={e=>s('trade_name',e.target.value)}/></label><label>CNPJ<input className="input" value={f.cnpj} onChange={e=>s('cnpj',e.target.value)}/></label><label>Cidade<input className="input" value={f.city} onChange={e=>s('city',e.target.value)}/></label><label>UF<input className="input" maxLength={2} value={f.state} onChange={e=>s('state',e.target.value.toUpperCase())}/></label><label>Site<input className="input" value={f.website} onChange={e=>s('website',e.target.value)}/></label><label>E-mail geral<input className="input" type="email" value={f.general_email} onChange={e=>s('general_email',e.target.value)}/></label><label>Telefone<input className="input" value={f.phone} onChange={e=>s('phone',e.target.value)}/></label><label>Prioridade<select value={f.priority} onChange={e=>s('priority',e.target.value)}>{Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Etapa<select value={f.stage_id} onChange={e=>s('stage_id',e.target.value)}><option value="">Sem etapa</option>{stages.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy}>{busy?'Salvando…':'Criar editora'}</button></div></form></div>}
