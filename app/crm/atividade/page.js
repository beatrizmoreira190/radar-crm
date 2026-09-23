'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useCrm } from '@/components/CrmProvider';
import {
  CHANNEL_LABELS,
  COMMERCIAL_FUNCTION_LABELS,
  EDITORIAL_PROFILE_CONFIDENCE_LABELS,
  EDITORIAL_PROFILE_STATUS_LABELS,
  INTEREST_LABELS,
  MATERIAL_STATUS_LABELS,
  MATERIAL_TYPE_LABELS,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_SERVICE_LABELS,
  PRIORITY_LABELS,
  PUBLISHER_ARCHIVE_REASON_LABELS,
  PUBLISHER_COMMERCIAL_PROFILE_LABELS,
  RESULT_LABELS,
  ROLE_LABELS,
  TASK_TYPE_LABELS,
  formatDate,
  timeAgo
} from '@/lib/constants';

const PAGE_SIZE=30;

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

const FIELD_CONFIG={
  stage_id:{label:'Etapa do Pipeline',type:'stage'},
  owner_user_id:{label:'Responsável atual',type:'user'},
  prospector_user_id:{label:'Prospector de origem',type:'user'},
  priority:{label:'Prioridade',type:'priority'},
  next_action_at:{label:'Próxima ação',type:'datetime'},
  notes:{label:'Notas',type:'text'},
  commercial_temperature:{label:'Temperatura comercial',type:'text'},
  archived:{label:'Arquivada',type:'boolean'},
  name:{label:'Nome',type:'text'},
  trade_name:{label:'Nome fantasia oficial',type:'text'},
  commercial_name:{label:'Nome comercial / marca',type:'text'},
  legal_name:{label:'Razão social',type:'text'},
  cnpj:{label:'CNPJ',type:'text'},
  website:{label:'Site',type:'text'},
  country:{label:'País',type:'text'},
  city:{label:'Cidade',type:'text'},
  state:{label:'UF',type:'text'},
  phone:{label:'Telefone',type:'text'},
  secondary_phone:{label:'Telefone secundário',type:'text'},
  general_email:{label:'E-mail geral',type:'text'},
  alternate_emails:{label:'E-mails alternativos',type:'list'},
  instagram:{label:'Instagram',type:'text'},
  linkedin_url:{label:'LinkedIn',type:'text'},
  commercial_profile_code:{label:'Perfil comercial Radar',type:'commercial_profile'},
  commercial_profile_source:{label:'Origem do perfil comercial',type:'commercial_profile_source'},
  commercial_profile_note:{label:'Observação do perfil comercial',type:'text'},
  archive_reason_code:{label:'Motivo do arquivamento',type:'archive_reason'},
  archive_reason_note:{label:'Observação do arquivamento',type:'text'},
  company_size:{label:'Porte',type:'text'},
  book_types:{label:'Tipos de livro',type:'text'},
  market_segments:{label:'Segmentos de atuação',type:'list'},
  editorial_profile:{label:'Perfil editorial',type:'list'},
  editorial_profile_status:{label:'Status do perfil editorial',type:'editorial_status'},
  editorial_profile_confidence:{label:'Confiança do perfil editorial',type:'editorial_confidence'},
  editorial_profile_notes:{label:'Notas do perfil editorial',type:'text'},

  role:{label:'Nível de acesso',type:'role'},
  active:{label:'Status',type:'active'},
  full_name:{label:'Nome de exibição',type:'text'},
  job_title:{label:'Cargo / função',type:'text'},
  email:{label:'E-mail',type:'text'},
  commercial_functions:{label:'Funções comerciais',type:'commercial_functions'},

  title:{label:'Título',type:'text'},
  description:{label:'Descrição',type:'text'},
  status:{label:'Status',type:'status'},
  due_at:{label:'Prazo',type:'datetime'},
  task_type:{label:'Tipo de tarefa',type:'task_type'},
  assigned_to:{label:'Responsável pela tarefa',type:'user'},
  result_code:{label:'Resultado',type:'result'},
  result_note:{label:'Observação do resultado',type:'text'},

  service_key:{label:'Serviço Radar',type:'opportunity_service'},
  service_type:{label:'Outro serviço / projeto',type:'text'},
  radar_opportunities_title_count:{label:'Títulos em divulgação',type:'integer'},
  pnld_notice:{label:'Edital / programa PNLD',type:'text'},
  pnld_category:{label:'Categoria / objeto PNLD',type:'text'},
  pnld_works_count:{label:'Obras no PNLD',type:'integer'},
  licitacoes_scope:{label:'Escopo do Radar de Licitações',type:'text'},
  expected_close_date:{label:'Fechamento previsto',type:'date'},
  next_step:{label:'Próximo passo',type:'text'},
  loss_reason:{label:'Motivo da perda',type:'text'},

  job_title_contact:{label:'Cargo',type:'text'},
  department:{label:'Área',type:'text'},
  mobile:{label:'Celular',type:'text'},
  is_decision_maker:{label:'Decisor(a)',type:'boolean'},

  channel:{label:'Canal',type:'channel'},
  result:{label:'Resultado',type:'result'},
  summary:{label:'Resumo',type:'text'},
  interest_level:{label:'Interesse',type:'interest'},

  meeting_type:{label:'Tipo de reunião',type:'meeting_type'},
  scheduled_start:{label:'Data e horário',type:'datetime'},
  duration_minutes:{label:'Duração',type:'duration'},
  presenter_user_id:{label:'Apresentador',type:'user'},
  scheduled_by:{label:'Agendado por',type:'user'},
  follow_up_at:{label:'Retorno',type:'datetime'},
  outcome_interest:{label:'Interesse após reunião',type:'interest'},
  outcome_notes:{label:'Resultado da reunião',type:'text'},
  calendar_sync_status:{label:'Sincronização com Google Agenda',type:'sync_status'},

  material_type:{label:'Tipo de material',type:'material_type'},
  responsible_user_id:{label:'Responsável pelo material',type:'user'},
  meeting_id:{label:'Reunião vinculada',type:'text'},
  url:{label:'Link',type:'text'},
  purpose:{label:'Finalidade',type:'text'},
  body:{label:'Texto do modelo',type:'text'}
};

const FIELD_ORDER=Object.keys(FIELD_CONFIG);

const OPPORTUNITY_FIELDS=new Set(['stage','service_key','service_type','radar_opportunities_title_count','pnld_notice','pnld_category','pnld_works_count','licitacoes_scope','expected_close_date','loss_reason']);
const CONTACT_FIELDS=new Set(['department','mobile','is_decision_maker']);
const MEETING_FIELDS=new Set(['meeting_type','scheduled_start','duration_minutes','presenter_user_id','scheduled_by','follow_up_at','outcome_interest','outcome_notes','calendar_sync_status']);
const MATERIAL_FIELDS=new Set(['material_type','responsible_user_id','meeting_id','url']);
const TASK_FIELDS=new Set(['task_type','assigned_to','result_code','result_note','due_at']);
const INTERACTION_FIELDS=new Set(['channel','result','summary','interest_level']);
const TEMPLATE_FIELDS=new Set(['purpose','body']);

function entityLabel(type){
  if(!type)return 'Registro';
  return ENTITY_LABELS[type]||String(type).replaceAll('_',' ');
}

function context(row){
  const after=row.after_data||{};
  const before=row.before_data||{};
  return after.name||after.title||after.full_name||after.summary||before.name||before.title||before.full_name||before.summary||'';
}

function configFor(entityType,field){
  if(field==='job_title'&&entityType==='contacts')return {label:'Cargo',type:'text'};
  if(field==='stage'&&entityType==='opportunities')return {label:'Etapa da oportunidade',type:'opportunity_stage'};
  if(field==='status'){
    if(entityType==='meetings')return {label:'Status da reunião',type:'meeting_status'};
    if(entityType==='publisher_materials')return {label:'Status do material',type:'material_status'};
    return {label:'Status',type:'status'};
  }
  return FIELD_CONFIG[field]||null;
}

function fieldAllowed(entityType,field){
  if(FIELD_CONFIG[field])return true;
  if(entityType==='opportunities'&&OPPORTUNITY_FIELDS.has(field))return true;
  if(entityType==='contacts'&&CONTACT_FIELDS.has(field))return true;
  if(entityType==='meetings'&&MEETING_FIELDS.has(field))return true;
  if(entityType==='publisher_materials'&&MATERIAL_FIELDS.has(field))return true;
  if(entityType==='tasks'&&TASK_FIELDS.has(field))return true;
  if(entityType==='interactions'&&INTERACTION_FIELDS.has(field))return true;
  if(entityType==='outreach_templates'&&TEMPLATE_FIELDS.has(field))return true;
  return false;
}

function pageItems(page,totalPages){
  if(totalPages<=7)return Array.from({length:totalPages},(_,i)=>i+1);
  const values=new Set([1,totalPages,page-2,page-1,page,page+1,page+2].filter(n=>n>=1&&n<=totalPages));
  const sorted=[...values].sort((a,b)=>a-b);
  const out=[];
  sorted.forEach((n,i)=>{
    if(i&&n-sorted[i-1]>1)out.push('…'+i);
    out.push(n);
  });
  return out;
}

export default function ActivityPage(){
  const {supabase,membership,teamMap,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [rows,setRows]=useState([]);
  const [stageMap,setStageMap]=useState({});
  const [q,setQ]=useState('');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    const timer=setTimeout(()=>{
      setSearch(q.trim());
      setPage(1);
    },300);
    return()=>clearTimeout(timer);
  },[q]);

  useEffect(()=>{
    if(!org)return;
    let cancelled=false;
    async function loadStages(){
      const {data,error}=await supabase.from('pipeline_stages').select('id,name').eq('organization_id',org);
      if(cancelled)return;
      if(error)setNotice(error.message);
      else setStageMap(Object.fromEntries((data||[]).map(stage=>[stage.id,stage.name])));
    }
    loadStages();
    return()=>{cancelled=true};
  },[org,supabase]);

  useEffect(()=>{
    if(!org)return;
    let cancelled=false;
    async function loadFeed(){
      setLoading(true);
      setNotice('');
      const {data,error}=await supabase.rpc('crm_activity_feed',{
        p_organization_id:org,
        p_page:page,
        p_page_size:PAGE_SIZE,
        p_query:search||null
      });
      if(cancelled)return;
      if(error){
        setNotice(error.message);
        setRows([]);
        setTotal(0);
      }else{
        const nextRows=Array.isArray(data?.rows)?data.rows:[];
        const nextTotal=Number(data?.total||0);
        const nextTotalPages=Math.max(1,Math.ceil(nextTotal/PAGE_SIZE));
        if(page>nextTotalPages){
          setPage(nextTotalPages);
          setLoading(false);
          return;
        }
        setRows(nextRows);
        setTotal(nextTotal);
      }
      setLoading(false);
    }
    loadFeed();
    return()=>{cancelled=true};
  },[org,page,search,activityVersion,supabase]);

  function actor(id){return teamMap[id]||{full_name:'Sistema'}}

  function humanValue(field,value,entityType){
    if(value==null||value==='')return 'Não informado';
    const cfg=configFor(entityType,field)||{type:'text'};
    if(cfg.type==='stage')return stageMap[value]||'Sem etapa';
    if(cfg.type==='user')return teamMap[value]?.full_name||teamMap[value]?.email||'Sem responsável';
    if(cfg.type==='priority')return PRIORITY_LABELS[value]||value;
    if(cfg.type==='role')return ROLE_LABELS[value]||value;
    if(cfg.type==='active')return value?'Ativo':'Inativo';
    if(cfg.type==='boolean'){
      if(field==='archived')return value?'Sim':'Não';
      if(field==='is_decision_maker')return value?'Sim':'Não';
      return value?'Sim':'Não';
    }
    if(cfg.type==='datetime')return formatDate(value,true);
    if(cfg.type==='date'){const match=String(value).match(/^(\\d{4})-(\\d{2})-(\\d{2})/);return match?`${match[3]}/${match[2]}/${match[1]}`:formatDate(value);}
    if(cfg.type==='integer')return value==null?'Não informado':Number(value).toLocaleString('pt-BR');
    if(cfg.type==='opportunity_service')return OPPORTUNITY_SERVICE_LABELS[value]||value;
    if(cfg.type==='duration')return Number(value).toLocaleString('pt-BR')+' min';
    if(cfg.type==='list')return Array.isArray(value)?(value.join(', ')||'Nenhum'):String(value);
    if(cfg.type==='commercial_functions')return Array.isArray(value)?(value.map(v=>COMMERCIAL_FUNCTION_LABELS[v]||v).join(', ')||'Nenhuma'):String(value);
    if(cfg.type==='commercial_profile')return PUBLISHER_COMMERCIAL_PROFILE_LABELS[value]||value;
    if(cfg.type==='commercial_profile_source')return ({manual:'Confirmado manualmente',editorial_profile:'Confirmado pelo perfil editorial',system_default:'Padrão do sistema'})[value]||value;
    if(cfg.type==='archive_reason')return PUBLISHER_ARCHIVE_REASON_LABELS[value]||value;
    if(cfg.type==='editorial_status')return EDITORIAL_PROFILE_STATUS_LABELS[value]||value;
    if(cfg.type==='editorial_confidence')return EDITORIAL_PROFILE_CONFIDENCE_LABELS[value]||value;
    if(cfg.type==='opportunity_stage')return OPPORTUNITY_STAGE_LABELS[value]||value;
    if(cfg.type==='task_type')return TASK_TYPE_LABELS[value]||value;
    if(cfg.type==='result')return RESULT_LABELS[value]||value;
    if(cfg.type==='channel')return CHANNEL_LABELS[value]||value;
    if(cfg.type==='interest')return INTEREST_LABELS[value]||value;
    if(cfg.type==='meeting_type')return MEETING_TYPE_LABELS[value]||value;
    if(cfg.type==='meeting_status')return MEETING_STATUS_LABELS[value]||value;
    if(cfg.type==='material_type')return MATERIAL_TYPE_LABELS[value]||value;
    if(cfg.type==='material_status')return MATERIAL_STATUS_LABELS[value]||value;
    if(cfg.type==='status'&&entityType==='tasks')return ({open:'Aberta',in_progress:'Em andamento',done:'Concluída',cancelled:'Cancelada'})[value]||value;
    if(cfg.type==='status'&&entityType==='cadences')return ({active:'Ativa',paused:'Pausada',completed:'Concluída',cancelled:'Encerrada'})[value]||value;
    if(cfg.type==='sync_status')return ({synced:'Sincronizado',pending:'Pendente',not_synced:'Não sincronizado',error:'Erro'})[value]||value;
    if(Array.isArray(value))return value.join(', ')||'Nenhum';
    if(typeof value==='object')return 'Dados estruturados atualizados';
    const text=String(value);
    return text.length>220?text.slice(0,217)+'…':text;
  }

  function changes(row){
    if(row.action!=='update')return [];
    const before=row.before_data||{};
    const after=row.after_data||{};
    const keys=[...new Set([...FIELD_ORDER,...Object.keys(before),...Object.keys(after)])];
    return keys
      .filter(field=>fieldAllowed(row.entity_type,field))
      .filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field])&&(field in before||field in after))
      .map(field=>{
        const cfg=configFor(row.entity_type,field)||{label:field.replaceAll('_',' '),type:'text'};
        return {
          field,
          label:cfg.label,
          before:humanValue(field,before[field],row.entity_type),
          after:humanValue(field,after[field],row.entity_type)
        };
      });
  }

  function describe(row){
    const entity=entityLabel(row.entity_type);
    const ctx=context(row);
    const changeList=changes(row);
    const explicitLabel=String(row.label||'').trim();
    if(row.action==='update'){
      return {
        title:explicitLabel||('Atualizou '+entity.toLowerCase()+(ctx?' · '+ctx:'')),
        changes:changeList,
        detail:changeList.length?'':'Atualização registrada'
      };
    }
    if(row.action==='insert'||row.action==='create')return {title:explicitLabel||('Criou '+entity.toLowerCase()+(ctx?' · '+ctx:'')),changes:[],detail:''};
    if(row.action==='delete')return {title:explicitLabel||('Removeu '+entity.toLowerCase()+(ctx?' · '+ctx:'')),changes:[],detail:''};
    return {title:explicitLabel||('Atualizou '+entity.toLowerCase()),changes:changeList,detail:ctx};
  }

  const enriched=useMemo(()=>rows.map(row=>({...row,_description:describe(row)})),[rows,stageMap,teamMap]);
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const firstRecord=total?((page-1)*PAGE_SIZE)+1:0;
  const lastRecord=Math.min(page*PAGE_SIZE,total);

  return <div className="page-wrap">
    <div className="page-head">
      <div>
        <div className="eyebrow">Histórico</div>
        <h1>Atividade</h1>
        <p>Histórico das ações humanas realizadas diretamente no CRM, com a editora ou registro identificado e os valores alterados.</p>
      </div>
    </div>

    {notice&&<div className="notice-bar"><span>{notice}</span><button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <div className="toolbar activity-toolbar">
      <div className="search-box"><Search size={17}/><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar em todo o histórico"/></div>
      <span className="activity-count">{total.toLocaleString('pt-BR')} registro{total===1?'':'s'}</span>
    </div>

    <section className="card panel activity-feed-panel" aria-busy={loading}>
      {loading?<div className="table-empty">Carregando atividade…</div>:enriched.length?<div className="activity-detailed-list">
        {enriched.map(row=>{
          const description=row._description;
          const person=actor(row.actor_user_id);
          return <article className="activity-detailed-row" key={row.id}>
            <Avatar member={person} size={38}/>
            <div className="activity-detailed-main">
              <div className="activity-detailed-head">
                <div><strong>{person.full_name||person.email||'Sistema'}</strong><span className="badge">{entityLabel(row.entity_type)}</span></div>
                <small title={new Date(row.created_at).toLocaleString('pt-BR')}>{timeAgo(row.created_at)} · {formatDate(row.created_at,true)}</small>
              </div>
              <div className="activity-detailed-title">{description.title}</div>
              {description.detail&&<p className="activity-detailed-detail">{description.detail}</p>}
              {description.changes.length>0&&<div className="activity-change-list">
                {description.changes.map(change=><div className="activity-change-row" key={change.field}>
                  <b>{change.label}</b>
                  <span className="activity-change-value before">{change.before}</span>
                  <ArrowRight size={13}/>
                  <span className="activity-change-value after">{change.after}</span>
                </div>)}
              </div>}
            </div>
          </article>;
        })}
      </div>:<div className="empty-state"><Activity/><strong>Nenhuma atividade encontrada.</strong><p>{search?'Tente buscar outro termo.':'As movimentações aparecerão aqui conforme o CRM for utilizado.'}</p></div>}

      {!loading&&total>0&&<div className="activity-pagination">
        <div><strong>{firstRecord.toLocaleString('pt-BR')}–{lastRecord.toLocaleString('pt-BR')}</strong> de {total.toLocaleString('pt-BR')} registros</div>
        <div className="activity-page-buttons">
          <button type="button" className="icon-btn" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} aria-label="Página anterior"><ChevronLeft size={16}/></button>
          {pageItems(page,totalPages).map(item=>typeof item==='number'
            ?<button type="button" key={item} className={'activity-page-number '+(item===page?'active':'')} onClick={()=>setPage(item)} aria-current={item===page?'page':undefined}>{item}</button>
            :<span key={item} className="activity-page-ellipsis">…</span>
          )}
          <button type="button" className="icon-btn" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} aria-label="Próxima página"><ChevronRight size={16}/></button>
        </div>
        <small>Página {page} de {totalPages}</small>
      </div>}
    </section>
  </div>;
}
