'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarClock, ExternalLink, FileText, Pencil, Plus, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { MATERIAL_STATUS_LABELS, MATERIAL_TYPE_LABELS, formatDate } from '@/lib/constants';
import PublisherHelp from '@/components/PublisherHelp';
import ModalDialog from '@/components/ModalDialog';

function linkHost(value=''){
  try{return new URL(value).hostname.replace(/^www\./,'')}catch{return 'Link externo'}
}

function statusClass(status){
  if(status==='ready')return 'green';
  if(status==='draft')return 'amber';
  if(status==='sent')return 'blue';
  return '';
}

export default function PublisherMaterialsMount(){
  const {id}=useParams();
  const {supabase,membership,user,team,teamMap,isManager,hasCommercialFunction,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [materials,setMaterials]=useState([]);
  const [meetings,setMeetings]=useState([]);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [editing,setEditing]=useState(null);
  const [showModal,setShowModal]=useState(false);

  const canManage=isManager||hasCommercialFunction('pre_meeting_materials')||hasCommercialFunction('negotiation_materials');
  const activeTeam=useMemo(()=>team.filter(member=>member.active),[team]);
  const meetingMap=useMemo(()=>Object.fromEntries(meetings.map(m=>[m.id,m])),[meetings]);

  async function load(){
    if(!org||!id)return;
    setLoading(true);
    const [mr,meetingsResult]=await Promise.all([
      supabase.from('publisher_materials').select('*').eq('organization_id',org).eq('publisher_id',id).order('created_at',{ascending:false}),
      supabase.from('meetings').select('id,title,scheduled_start,status').eq('organization_id',org).eq('publisher_id',id).order('scheduled_start',{ascending:false}).limit(40)
    ]);
    if(mr.error)setNotice(mr.error.message);else setMaterials(mr.data||[]);
    if(meetingsResult.error)setNotice(meetingsResult.error.message);else setMeetings(meetingsResult.data||[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[org,id,activityVersion]);

  function openNew(){setEditing(null);setShowModal(true)}
  useEffect(()=>{
    function onPublisherAction(event){if(event.detail?.type==='material'&&canManage)openNew()}
    window.addEventListener('radar:publisher-action',onPublisherAction);
    return()=>window.removeEventListener('radar:publisher-action',onPublisherAction);
  },[canManage]);
  function openEdit(material){setEditing(material);setShowModal(true)}
  function close(){setShowModal(false);setEditing(null)}

  return <>
    <section className="card panel publisher-materials-card">
      <div className="section-title">
        <div>
          <div className="help-heading"><h2>Materiais comerciais</h2><PublisherHelp text="Apresentações, projetos, propostas, curadorias e outros materiais preparados para esta editora."/></div>
          <p className="muted">Links de apresentações, projetos, propostas e curadorias preparados para esta editora.</p>
        </div>
        
      </div>
      {notice&&<div className="notice-bar" style={{marginBottom:12}}><span>{notice}</span><button type="button" onClick={()=>setNotice('')}><X size={14}/></button></div>}
      {loading?<div className="table-empty">Carregando materiais…</div>:materials.length?<div className="publisher-material-list">{materials.map(material=>{
        const responsible=teamMap[material.responsible_user_id]?.full_name||teamMap[material.responsible_user_id]?.email||'Equipe';
        const relatedMeeting=meetingMap[material.meeting_id];
        return <article className="publisher-material-row" key={material.id}>
          <div className="publisher-material-icon"><FileText size={18}/></div>
          <div className="publisher-material-main">
            <div className="publisher-material-title"><strong>{material.title}</strong><span className={`badge ${statusClass(material.status)}`}>{MATERIAL_STATUS_LABELS[material.status]||material.status}</span></div>
            <div className="publisher-meta"><span>{MATERIAL_TYPE_LABELS[material.material_type]||material.material_type}</span><span>{responsible}</span><span>{formatDate(material.updated_at||material.created_at)}</span></div>
            {relatedMeeting&&<div className="publisher-meta material-meeting"><span><CalendarClock size={12}/>{relatedMeeting.title} · {formatDate(relatedMeeting.scheduled_start,true)}</span></div>}
            {material.description&&<p>{material.description}</p>}
            <a className="text-link" href={material.url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>{linkHost(material.url)}</a>
          </div>
          {canManage&&<button className="btn secondary small" type="button" onClick={()=>openEdit(material)}><Pencil size={13}/> Editar</button>}
        </article>
      })}</div>:<div className="empty-state"><FileText/><strong>Nenhum material comercial cadastrado.</strong><p>{canManage?'Adicione o link quando houver uma apresentação, projeto, proposta ou curadoria para esta editora.':'Os materiais preparados pela equipe aparecerão aqui.'}</p></div>}
    </section>
    {showModal&&<MaterialModal supabase={supabase} org={org} publisherId={id} user={user} team={activeTeam} meetings={meetings} material={editing} onClose={close} onSaved={async mode=>{close();setNotice(mode==='updated'?'Material atualizado.':'Material adicionado.');await load()}}/>}
    <style jsx>{`
      .publisher-material-list{display:grid;gap:10px}
      .publisher-material-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:start;padding:12px 0;border-top:1px solid #eaecf0}
      .publisher-material-row:first-child{border-top:0;padding-top:2px}
      .publisher-material-icon{width:34px;height:34px;border-radius:9px;background:#f2f4f7;display:grid;place-items:center;color:#475467}
      .publisher-material-main{min-width:0}
      .publisher-material-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .publisher-material-main p{font-size:12px;line-height:1.45;color:#475467;margin:7px 0}.material-meeting span{display:flex;align-items:center;gap:4px}
      @media(max-width:700px){.publisher-material-row{grid-template-columns:34px minmax(0,1fr)}.publisher-material-row>.btn{grid-column:2;justify-self:start}.publisher-material-card :global(.section-title){align-items:flex-start}}
    `}</style>
  </>;
}

function MaterialModal({supabase,org,publisherId,user,team,meetings,material,onClose,onSaved}){
  const editing=Boolean(material?.id);
  const [form,setForm]=useState({
    title:material?.title||'',
    material_type:material?.material_type||'presentation',
    url:material?.url||'',
    status:material?.status||'draft',
    responsible_user_id:material?.responsible_user_id||user?.id||'',
    meeting_id:material?.meeting_id||'',
    description:material?.description||''
  });
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  async function save(event){
    event.preventDefault();
    setError('');
    const title=form.title.trim();
    const url=form.url.trim();
    if(!title){setError('Informe um título para o material.');return}
    try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error()}catch{setError('Informe um link válido começando com http:// ou https://.');return}
    setBusy(true);
    const payload={
      title,
      material_type:form.material_type,
      url,
      status:form.status,
      responsible_user_id:form.responsible_user_id||user?.id||null,
      meeting_id:form.meeting_id||null,
      description:form.description.trim()||null,
      updated_at:new Date().toISOString()
    };
    let result;
    if(editing){
      result=await supabase.from('publisher_materials').update(payload).eq('organization_id',org).eq('publisher_id',publisherId).eq('id',material.id);
    }else{
      result=await supabase.from('publisher_materials').insert({...payload,organization_id:org,publisher_id:publisherId,created_by:user?.id||null});
    }
    setBusy(false);
    if(result.error)setError(result.error.message);else onSaved(editing?'updated':'created');
  }

  return <ModalDialog title={editing?'Editar material comercial':'Adicionar material comercial'} description="O CRM salva apenas o link; o arquivo continua no Drive, Canva, Gamma, Notion ou outra plataforma." onClose={onClose} onSubmit={save} busy={busy}>{error&&<div className="notice error" role="alert">{error}</div>}<div className="form-grid">
    <label className="span-2">Título<input required className="input" value={form.title} onChange={e=>setForm(x=>({...x,title:e.target.value}))} placeholder="Ex.: Projeto de leitura para a Editora X"/></label>
    <label>Tipo<select value={form.material_type} onChange={e=>setForm(x=>({...x,material_type:e.target.value}))}>{Object.entries(MATERIAL_TYPE_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
    <label>Status<select value={form.status} onChange={e=>setForm(x=>({...x,status:e.target.value}))}>{Object.entries(MATERIAL_STATUS_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
    <label className="span-2">Link<input required type="url" className="input" value={form.url} onChange={e=>setForm(x=>({...x,url:e.target.value}))} placeholder="https://..."/></label>
    <label>Responsável<select value={form.responsible_user_id} onChange={e=>setForm(x=>({...x,responsible_user_id:e.target.value}))}>{team.map(member=><option value={member.user_id} key={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select></label>
    <label>Reunião relacionada<select value={form.meeting_id} onChange={e=>setForm(x=>({...x,meeting_id:e.target.value}))}><option value="">Sem reunião vinculada</option>{meetings.map(m=><option value={m.id} key={m.id}>{formatDate(m.scheduled_start,true)} · {m.title}</option>)}</select></label>
    <label className="span-2">Observação<textarea rows={3} value={form.description} onChange={e=>setForm(x=>({...x,description:e.target.value}))} placeholder="Contexto ou orientação para uso deste material"/></label>
  </div><div className="modal-actions"><button className="btn secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn" disabled={busy}>{busy?'Salvando…':editing?'Salvar alterações':'Adicionar material'}</button></div></ModalDialog>;
}
