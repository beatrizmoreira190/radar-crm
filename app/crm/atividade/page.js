'use client';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Search, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useCrm } from '@/components/CrmProvider';
import { PRIORITY_LABELS, timeAgo } from '@/lib/constants';

const ENTITY_LABELS={
  publishers:'Editora',
  org_members:'Equipe',
  opportunities:'Oportunidade',
  tasks:'Tarefa',
  contacts:'Pessoa de contato',
  interactions:'Interação',
  meetings:'Reunião',
  publisher_materials:'Material',
  cadences:'Cadência',
  outreach_templates:'Modelo'
};
const ROLE_LABELS={owner:'Proprietário',admin:'Administrador',supervisor:'Supervisor',member:'Prospectador'};
const FIELD_LABELS={
  stage_id:'a etapa',
  owner_user_id:'o responsável',
  priority:'a prioridade',
  role:'o perfil de acesso',
  active:'o status',
  full_name:'o nome',
  job_title:'a função',
  email:'o e-mail',
  status:'o status',
  name:'o nome',
  title:'o título',
  due_at:'o prazo',
  next_action_at:'a próxima ação'
};
const IMPORTANT_FIELDS=Object.keys(FIELD_LABELS);

export default function ActivityPage(){
  const {supabase,membership,teamMap,activityVersion,isManager,user}=useCrm();
  const org=membership?.organization_id;
  const [rows,setRows]=useState([]);
  const [stageMap,setStageMap]=useState({});
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');

  async function load(){
    if(!org)return;
    setLoading(true);
    let query=supabase.from('audit_events')
      .select('id,actor_user_id,entity_type,entity_id,action,label,before_data,after_data,created_at')
      .eq('organization_id',org);
    if(!isManager)query=query.eq('actor_user_id',user?.id);
    const [{data,error},{data:stageRows,error:stageError}]=await Promise.all([
      query.order('created_at',{ascending:false}).limit(250),
      supabase.from('pipeline_stages').select('id,name').eq('organization_id',org)
    ]);
    if(error)setNotice(error.message);
    else if(stageError)setNotice(stageError.message);
    setRows(data||[]);
    setStageMap(Object.fromEntries((stageRows||[]).map(stage=>[stage.id,stage.name])));
    setLoading(false);
  }

  useEffect(()=>{load()},[org,user?.id,isManager,activityVersion]);

  function actor(id){return teamMap[id]||{full_name:'Sistema'}}

  function entityLabel(type){
    if(!type)return 'Registro';
    return ENTITY_LABELS[type]||String(type).replaceAll('_',' ');
  }

  function humanValue(field,value){
    if(value==null||value==='')return 'Não informado';
    if(field==='stage_id')return stageMap[value]||'Sem etapa';
    if(field==='owner_user_id')return teamMap[value]?.full_name||teamMap[value]?.email||'Sem responsável';
    if(field==='priority')return PRIORITY_LABELS[value]||value;
    if(field==='role')return ROLE_LABELS[value]||value;
    if(field==='active')return value?'Ativo':'Inativo';
    if(field==='due_at'||field==='next_action_at'){
      const date=new Date(value);
      return Number.isNaN(date.getTime())?String(value):date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
    }
    if(Array.isArray(value))return value.join(', ')||'Nenhum';
    if(typeof value==='object')return 'Dados atualizados';
    return String(value);
  }

  function context(a){
    return a.after_data?.name||a.after_data?.title||a.after_data?.summary||a.before_data?.name||a.before_data?.title||'';
  }

  function describe(a){
    const before=a.before_data||{};
    const after=a.after_data||{};
    const changed=IMPORTANT_FIELDS.find(field=>JSON.stringify(before[field])!==JSON.stringify(after[field])&&(field in before||field in after));
    if(changed){
      return {
        title:`Alterou ${FIELD_LABELS[changed]}`,
        detail:`${humanValue(changed,before[changed])} → ${humanValue(changed,after[changed])}`
      };
    }
    const entity=entityLabel(a.entity_type).toLowerCase();
    const ctx=context(a);
    if(a.action==='insert'||a.action==='create')return {title:`Criou ${entity}`,detail:ctx};
    if(a.action==='delete')return {title:`Removeu ${entity}`,detail:ctx};
    return {title:a.label||`Atualizou ${entity}`,detail:ctx};
  }

  const enriched=useMemo(()=>rows.map(row=>({...row,_description:describe(row)})),[rows,stageMap,teamMap]);
  const filtered=useMemo(()=>{
    const n=q.trim().toLowerCase();
    if(!n)return enriched;
    return enriched.filter(r=>[
      r._description.title,
      r._description.detail,
      entityLabel(r.entity_type),
      actor(r.actor_user_id).full_name,
      actor(r.actor_user_id).email
    ].filter(Boolean).join(' ').toLowerCase().includes(n));
  },[enriched,q,teamMap]);

  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Histórico</div><h1>Atividade</h1><p>{isManager?'Acompanhe as principais alterações registradas pela equipe no CRM.':'Revise as alterações e ações que você registrou no CRM.'}</p></div></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <div className="toolbar"><div className="search-box"><Search size={17}/><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar no histórico"/></div></div>
    <section className="card panel">{loading?<div className="table-empty">Carregando atividade…</div>:filtered.length?<div className="activity-list">{filtered.map(a=><div className="activity-row" key={a.id}><Avatar member={actor(a.actor_user_id)} size={36}/><div><strong>{actor(a.actor_user_id).full_name||actor(a.actor_user_id).email||'Sistema'}</strong><span>{a._description.title}{a._description.detail?` · ${String(a._description.detail).slice(0,120)}`:''}</span><small>{timeAgo(a.created_at)} · {entityLabel(a.entity_type)}</small></div></div>)}</div>:<div className="empty-state"><Activity/><strong>Nenhuma atividade encontrada.</strong><p>{q?'Tente buscar outro termo.':isManager?'As movimentações da equipe aparecerão aqui.':'Suas movimentações aparecerão aqui.'}</p></div>}</section>
  </div>;
}
