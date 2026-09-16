'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { CalendarClock, Clock3, Pencil, Plus, UserRound, UserRoundPlus, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS, formatDate } from '@/lib/constants';

function localInput(value){
  if(!value)return'';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return'';
  const z=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function statusClass(status){
  if(status==='completed')return 'green';
  if(status==='cancelled'||status==='no_show')return 'red';
  return 'blue';
}

function personLabel(member){return member?.full_name||member?.email||'Equipe'}

export default function PublisherMeetingsMount(){
  const {id}=useParams();
  const {supabase,membership,user,team,teamMap,isManager,hasCommercialFunction,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [mount,setMount]=useState(null);
  const [meetings,setMeetings]=useState([]);
  const [participants,setParticipants]=useState([]);
  const [contacts,setContacts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [editing,setEditing]=useState(null);
  const [showModal,setShowModal]=useState(false);

  const canSchedule=isManager||hasCommercialFunction('meeting_scheduling');
  const presenters=useMemo(()=>team.filter(m=>m.active&&(m.commercial_functions||[]).includes('commercial_presentation')),[team]);
  const participantMap=useMemo(()=>{
    const map={};
    for(const p of participants){(map[p.meeting_id]||(map[p.meeting_id]=[])).push(p)}
    return map;
  },[participants]);
  const ordered=useMemo(()=>{
    const now=Date.now();
    return [...meetings].sort((a,b)=>{
      const af=a.status==='scheduled'&&new Date(a.scheduled_start).getTime()>=now;
      const bf=b.status==='scheduled'&&new Date(b.scheduled_start).getTime()>=now;
      if(af!==bf)return af?-1:1;
      return af?new Date(a.scheduled_start)-new Date(b.scheduled_start):new Date(b.scheduled_start)-new Date(a.scheduled_start);
    });
  },[meetings]);

  async function load(){
    if(!org||!id)return;
    setLoading(true);
    const [mr,cr]=await Promise.all([
      supabase.from('meetings').select('*').eq('organization_id',org).eq('publisher_id',id).order('scheduled_start',{ascending:false}).limit(40),
      supabase.from('contacts').select('id,full_name,email,job_title,department,active').eq('organization_id',org).eq('publisher_id',id).eq('active',true).order('full_name')
    ]);
    if(mr.error)setNotice(mr.error.message);
    if(cr.error)setNotice(cr.error.message);
    const rows=mr.data||[];
    setMeetings(rows);setContacts(cr.data||[]);
    if(rows.length){
      const pr=await supabase.from('meeting_participants').select('*').eq('organization_id',org).in('meeting_id',rows.map(m=>m.id)).order('created_at');
      if(pr.error)setNotice(pr.error.message);else setParticipants(pr.data||[]);
    }else setParticipants([]);
    setLoading(false);
  }

  useEffect(()=>{load()},[org,id,activityVersion]);

  useEffect(()=>{
    let node=null;let timer=null;let attempts=0;
    function attach(){
      const stack=document.querySelector('.detail-grid > .detail-stack');
      if(!stack){if(attempts++<30)timer=setTimeout(attach,50);return;}
      const contactSection=Array.from(stack.children).find(child=>child.querySelector?.('h2')?.textContent?.trim()==='Contatos');
      if(!contactSection){if(attempts++<30)timer=setTimeout(attach,50);return;}
      node=document.createElement('div');
      node.dataset.publisherMeetings='commercial-meetings';
      contactSection.insertAdjacentElement('afterend',node);
      setMount(node);
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);if(node?.parentNode)node.parentNode.removeChild(node)};
  },[id]);

  function openNew(){
    if(!presenters.length){setNotice('Nenhum usuário está configurado com a função Apresentação comercial. Defina essa função na área Equipe antes de agendar.');return}
    setEditing(null);setShowModal(true);
  }
  function openEdit(meeting){setEditing(meeting);setShowModal(true)}
  function close(){setShowModal(false);setEditing(null)}

  if(!mount)return null;

  return createPortal(<>
    <section className="card panel publisher-meetings-card">
      <div className="section-title">
        <div><h2>Reuniões</h2><p className="muted">Apresentações e reuniões comerciais vinculadas a esta editora.</p></div>
        {canSchedule&&<button className="btn small" type="button" onClick={openNew}><Plus size={14}/> Agendar reunião</button>}
      </div>
      {notice&&<div className="notice-bar" style={{marginBottom:12}}><span>{notice}</span><button type="button" onClick={()=>setNotice('')}><X size={14}/></button></div>}
      {loading?<div className="table-empty">Carregando reuniões…</div>:ordered.length?<div className="meeting-list">{ordered.map(meeting=>{
        const external=participantMap[meeting.id]||[];
        const presenter=personLabel(teamMap[meeting.presenter_user_id]);
        const scheduler=personLabel(teamMap[meeting.scheduled_by]);
        const canEdit=isManager||meeting.scheduled_by===user?.id||meeting.presenter_user_id===user?.id;
        return <article className="meeting-row" key={meeting.id}>
          <div className="meeting-icon"><CalendarClock size={19}/></div>
          <div className="meeting-main">
            <div className="meeting-title"><strong>{meeting.title}</strong><span className={`badge ${statusClass(meeting.status)}`}>{MEETING_STATUS_LABELS[meeting.status]||meeting.status}</span></div>
            <div className="meeting-meta"><span><Clock3 size={12}/>{formatDate(meeting.scheduled_start,true)} · {meeting.duration_minutes} min</span><span>{MEETING_TYPE_LABELS[meeting.meeting_type]||meeting.meeting_type}</span></div>
            <div className="meeting-people"><span><b>Apresentação:</b> {presenter}</span><span><b>Agendada por:</b> {scheduler}</span></div>
            {external.length>0&&<div className="participant-chips">{external.map(p=><span className="badge" key={p.id}>{p.full_name}{p.email?` · ${p.email}`:''}</span>)}</div>}
            {meeting.notes&&<p>{meeting.notes}</p>}
            {meeting.outcome_notes&&<p className="meeting-outcome"><b>Resultado:</b> {meeting.outcome_notes}</p>}
          </div>
          {canEdit&&<button className="btn secondary small" type="button" onClick={()=>openEdit(meeting)}><Pencil size={13}/> Editar</button>}
        </article>
      })}</div>:<div className="empty-state"><CalendarClock/><strong>Nenhuma reunião cadastrada.</strong><p>{canSchedule?'Agende a apresentação quando a editora avançar para uma conversa por Meet.':'As reuniões comerciais desta editora aparecerão aqui.'}</p></div>}
    </section>
    {showModal&&<MeetingModal
      supabase={supabase} org={org} publisherId={id} user={user} team={team} presenters={presenters}
      contacts={contacts} meetings={meetings} meeting={editing} participants={editing?(participantMap[editing.id]||[]):[]}
      canEditScheduling={!editing||isManager||editing.scheduled_by===user?.id}
      onClose={close}
      onSaved={async message=>{close();setNotice(message);await load()}}
    />}
    <style jsx>{`
      .meeting-list{display:grid;gap:8px}
      .meeting-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:12px;align-items:start;padding:13px 0;border-top:1px solid #eaecf0}
      .meeting-row:first-child{border-top:0;padding-top:2px}
      .meeting-icon{width:36px;height:36px;border-radius:9px;background:#f2f4f7;color:#475467;display:grid;place-items:center}
      .meeting-main{min-width:0}.meeting-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .meeting-meta,.meeting-people{display:flex;gap:7px 16px;flex-wrap:wrap;color:#667085;font-size:11px;margin-top:5px}
      .meeting-meta span{display:flex;align-items:center;gap:4px}.participant-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
      .meeting-main p{font-size:12px;line-height:1.45;color:#475467;margin:8px 0 0}.meeting-outcome{padding-top:7px;border-top:1px dashed #eaecf0}
      @media(max-width:700px){.meeting-row{grid-template-columns:34px minmax(0,1fr)}.meeting-row>.btn{grid-column:2;justify-self:start}.publisher-meetings-card :global(.section-title){align-items:flex-start}}
    `}</style>
  </>,mount);
}

function MeetingModal({supabase,org,publisherId,user,team,presenters,contacts,meetings,meeting,participants,canEditScheduling,onClose,onSaved}){
  const editing=Boolean(meeting?.id);
  const [form,setForm]=useState({
    title:meeting?.title||'Apresentação comercial',
    meeting_type:meeting?.meeting_type||'presentation',
    scheduled_start:localInput(meeting?.scheduled_start),
    duration_minutes:meeting?.duration_minutes||30,
    presenter_user_id:meeting?.presenter_user_id||presenters[0]?.user_id||'',
    status:meeting?.status||'scheduled',
    notes:meeting?.notes||'',
    outcome_notes:meeting?.outcome_notes||''
  });
  const [selectedContacts,setSelectedContacts]=useState(()=>participants.filter(p=>p.source==='crm_contact'&&p.contact_id).map(p=>p.contact_id));
  const [manual,setManual]=useState(()=>participants.filter(p=>p.source==='manual').map(p=>({full_name:p.full_name||'',email:p.email||'',job_title:p.job_title||''})));
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  function toggleContact(contactId){setSelectedContacts(x=>x.includes(contactId)?x.filter(id=>id!==contactId):[...x,contactId])}
  function addManual(){setManual(x=>[...x,{full_name:'',email:'',job_title:''}])}
  function updateManual(index,patch){setManual(x=>x.map((row,i)=>i===index?{...row,...patch}:row))}
  function removeManual(index){setManual(x=>x.filter((_,i)=>i!==index))}

  async function save(event){
    event.preventDefault();setError('');
    if(canEditScheduling){
      if(!form.presenter_user_id){setError('Selecione quem realizará a apresentação.');return}
      if(!form.scheduled_start){setError('Informe a data e o horário da reunião.');return}
      const start=new Date(form.scheduled_start);if(Number.isNaN(start.getTime())){setError('Informe uma data e horário válidos.');return}
      const duration=Number(form.duration_minutes);if(!Number.isFinite(duration)||duration<10||duration>480){setError('A duração deve ficar entre 10 e 480 minutos.');return}
      const end=start.getTime()+duration*60000;
      const conflict=meetings.find(m=>m.id!==meeting?.id&&m.status==='scheduled'&&m.presenter_user_id===form.presenter_user_id&&start.getTime()<new Date(m.scheduled_start).getTime()+m.duration_minutes*60000&&end>new Date(m.scheduled_start).getTime());
      if(conflict){setError(`Este apresentador já tem outra reunião no CRM em ${formatDate(conflict.scheduled_start,true)}.`);return}
    }
    setBusy(true);
    let meetingId=meeting?.id;
    let result;
    if(editing){
      const payload=canEditScheduling?{
        title:form.title.trim()||'Reunião comercial',meeting_type:form.meeting_type,scheduled_start:new Date(form.scheduled_start).toISOString(),duration_minutes:Number(form.duration_minutes),presenter_user_id:form.presenter_user_id,status:form.status,notes:form.notes.trim()||null,outcome_notes:form.outcome_notes.trim()||null
      }:{status:form.status,notes:form.notes.trim()||null,outcome_notes:form.outcome_notes.trim()||null};
      result=await supabase.from('meetings').update(payload).eq('organization_id',org).eq('id',meeting.id);
    }else{
      result=await supabase.from('meetings').insert({organization_id:org,publisher_id:publisherId,title:form.title.trim()||'Apresentação comercial',meeting_type:form.meeting_type,scheduled_start:new Date(form.scheduled_start).toISOString(),duration_minutes:Number(form.duration_minutes),status:'scheduled',scheduled_by:user.id,presenter_user_id:form.presenter_user_id,notes:form.notes.trim()||null,created_by:user.id}).select('id').single();
      meetingId=result.data?.id;
    }
    if(result.error||!meetingId){setBusy(false);setError(result.error?.message||'Não foi possível salvar a reunião.');return}

    if(canEditScheduling){
      if(editing){const del=await supabase.from('meeting_participants').delete().eq('organization_id',org).eq('meeting_id',meetingId);if(del.error){setBusy(false);setError(del.error.message);return}}
      const contactRows=selectedContacts.map(contactId=>contacts.find(c=>c.id===contactId)).filter(Boolean).map(c=>({organization_id:org,meeting_id:meetingId,contact_id:c.id,source:'crm_contact',full_name:c.full_name,email:c.email||null,job_title:c.job_title||c.department||null,created_by:user.id}));
      const manualRows=manual.filter(row=>row.full_name.trim()).map(row=>({organization_id:org,meeting_id:meetingId,contact_id:null,source:'manual',full_name:row.full_name.trim(),email:row.email.trim()||null,job_title:row.job_title.trim()||null,created_by:user.id}));
      const rows=[...contactRows,...manualRows];
      if(rows.length){const ins=await supabase.from('meeting_participants').insert(rows);if(ins.error){setBusy(false);setError(`A reunião foi salva, mas houve erro ao salvar participantes: ${ins.error.message}`);return}}
    }
    setBusy(false);
    onSaved(editing?'Reunião atualizada.':'Reunião agendada no CRM.');
  }

  const presenterName=personLabel(team.find(m=>m.user_id===form.presenter_user_id));
  return <div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><div><h3>{editing?'Editar reunião':'Agendar reunião'}</h3><p>{canEditScheduling?'Registre agora o compromisso comercial. A integração com Google Agenda será adicionada na próxima etapa.':`Você está atualizando a reunião como apresentador(a): ${presenterName}.`}</p></div><button type="button" onClick={onClose}><X/></button></div>{error&&<div className="notice error">{error}</div>}<div className="form-grid">
    <label className="span-2">Título<input className="input" required disabled={!canEditScheduling} value={form.title} onChange={e=>setForm(x=>({...x,title:e.target.value}))}/></label>
    <label>Tipo<select disabled={!canEditScheduling} value={form.meeting_type} onChange={e=>setForm(x=>({...x,meeting_type:e.target.value}))}>{Object.entries(MEETING_TYPE_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
    <label>Apresentador<select required disabled={!canEditScheduling} value={form.presenter_user_id} onChange={e=>setForm(x=>({...x,presenter_user_id:e.target.value}))}><option value="">Selecione</option>{presenters.map(p=><option key={p.user_id} value={p.user_id}>{personLabel(p)}</option>)}</select></label>
    <label>Data e horário<input required disabled={!canEditScheduling} type="datetime-local" className="input" value={form.scheduled_start} onChange={e=>setForm(x=>({...x,scheduled_start:e.target.value}))}/></label>
    <label>Duração<select disabled={!canEditScheduling} value={form.duration_minutes} onChange={e=>setForm(x=>({...x,duration_minutes:Number(e.target.value)}))}><option value={20}>20 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hora</option><option value={90}>1h30</option></select></label>
    {editing&&<label>Status<select value={form.status} onChange={e=>setForm(x=>({...x,status:e.target.value}))}>{Object.entries(MEETING_STATUS_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>}
    <label className="span-2">Observações antes da reunião<textarea rows={3} value={form.notes} onChange={e=>setForm(x=>({...x,notes:e.target.value}))} placeholder="Contexto, objetivo da apresentação, informações importantes para quem fará a reunião"/></label>
    {editing&&<label className="span-2">Resultado / observações após a reunião<textarea rows={3} value={form.outcome_notes} onChange={e=>setForm(x=>({...x,outcome_notes:e.target.value}))} placeholder="O que aconteceu, interesse percebido e encaminhamentos"/></label>}
    {canEditScheduling&&<div className="span-2 participant-editor"><div className="participant-editor-head"><div><strong>Participantes da editora</strong><p>Selecione contatos já cadastrados ou inclua alguém manualmente.</p></div><button type="button" className="btn secondary small" onClick={addManual}><UserRoundPlus size={14}/> Participante manual</button></div>
      {contacts.length?<div className="contact-options">{contacts.map(c=><label className="contact-option" key={c.id}><input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={()=>toggleContact(c.id)}/><span><b>{c.full_name}</b><small>{[c.job_title||c.department,c.email].filter(Boolean).join(' · ')||'Sem e-mail cadastrado'}</small></span></label>)}</div>:<p className="muted">Nenhum contato cadastrado nesta editora. Você ainda pode adicionar participantes manualmente.</p>}
      {manual.map((row,index)=><div className="manual-participant" key={index}><UserRound size={16}/><input className="input" placeholder="Nome" value={row.full_name} onChange={e=>updateManual(index,{full_name:e.target.value})}/><input className="input" type="email" placeholder="E-mail (opcional)" value={row.email} onChange={e=>updateManual(index,{email:e.target.value})}/><input className="input" placeholder="Cargo (opcional)" value={row.job_title} onChange={e=>updateManual(index,{job_title:e.target.value})}/><button type="button" className="icon-btn" title="Remover participante" onClick={()=>removeManual(index)}><X size={14}/></button></div>)}
      <p className="muted participant-note">Participantes sem e-mail poderão constar no CRM, mas futuramente não receberão convite automático do Google Agenda.</p>
    </div>}
  </div><div className="modal-actions"><button className="btn secondary" type="button" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy||(!editing&&!presenters.length)}>{busy?'Salvando…':editing?'Salvar reunião':'Agendar reunião'}</button></div><style jsx>{`
    .participant-editor{border-top:1px solid #eaecf0;padding-top:14px;margin-top:3px}.participant-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.participant-editor-head p{font-size:11px;color:#667085;margin:3px 0 0}.contact-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.contact-option{display:grid;grid-template-columns:18px minmax(0,1fr);gap:7px;align-items:start;padding:8px;border:1px solid #eaecf0;border-radius:8px;cursor:pointer}.contact-option b,.contact-option small{display:block}.contact-option small{font-size:10px;color:#667085;margin-top:2px}.manual-participant{display:grid;grid-template-columns:20px 1fr 1fr 1fr 34px;gap:6px;align-items:center;margin-top:8px}.participant-note{font-size:10px!important;margin:8px 0 0!important}@media(max-width:700px){.contact-options{grid-template-columns:1fr}.manual-participant{grid-template-columns:20px 1fr 34px}.manual-participant input:nth-of-type(2),.manual-participant input:nth-of-type(3){grid-column:2/3}.participant-editor-head{display:grid}}
  `}</style></form></div>;
}
