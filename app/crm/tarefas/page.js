'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, CheckCheck, CheckCircle2, Clock3, Copy, MessageSquareText, Plus, Search, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PRIORITY_LABELS, RESULT_LABELS, TASK_TYPE_LABELS, formatDate } from '@/lib/constants';

const AUTOMATION_LABELS={meeting_preparation:'Preparação automática',meeting_outcome:'Resultado automático',meeting_follow_up:'Follow-up automático'};
const CADENCE_RESULTS=['no_answer','left_message','connected','replied','asked_email','meeting_scheduled','callback_scheduled','busy','follow_up','proposal_requested','qualified','not_interested','wrong_contact','contact_updated','other'];
const PAUSE_RESULTS=new Set(['callback_scheduled','busy','follow_up']);

export default function TasksPage(){
  const {supabase,membership,user,activityVersion,isManager,teamMap}=useCrm();const org=membership?.organization_id;
  const [rows,setRows]=useState([]);const [reminders,setReminders]=useState([]);const [status,setStatus]=useState('open');const [scope,setScope]=useState('mine');const [q,setQ]=useState('');const [show,setShow]=useState(false);const [notice,setNotice]=useState('');const [loading,setLoading]=useState(true);const [resultTask,setResultTask]=useState(null);const [copiedTemplate,setCopiedTemplate]=useState('');

  async function loadReminders(){
    if(!org||!user?.id)return;
    const {error:refreshError}=await supabase.rpc('crm_refresh_notifications',{p_organization_id:org});
    if(refreshError)setNotice(refreshError.message);
    const {data,error}=await supabase.from('notifications').select('id,title,body,severity,href,read_at,created_at').eq('organization_id',org).eq('user_id',user.id).is('resolved_at',null).is('read_at',null).order('created_at',{ascending:false}).limit(30);
    if(error)setNotice(error.message);setReminders(data||[]);window.dispatchEvent(new Event('crm-notifications-changed'));
  }
  async function load(){
    if(!org||!user)return;setLoading(true);
    const {error:cadenceRefreshError}=await supabase.rpc('crm_refresh_cadences',{p_organization_id:org});
    if(cadenceRefreshError)setNotice(cadenceRefreshError.message);
    let query=supabase.from('tasks').select('id,title,description,task_type,due_at,status,priority,publisher_id,assigned_to,created_at,meeting_id,automation_key,cadence_enrollment_id,cadence_step_id,result_code,result_note,outreach_template_id,outreach_templates(name,body,channel,purpose),publishers(name)').eq('organization_id',org);
    if(!isManager||scope==='mine')query=query.eq('assigned_to',user.id);
    if(status==='open')query=query.in('status',['open','in_progress']);else if(status!=='all')query=query.eq('status',status);
    const {data,error}=await query.order('due_at',{ascending:true,nullsFirst:false}).limit(250);
    if(error)setNotice(error.message);setRows(data||[]);await loadReminders();setLoading(false);
  }
  useEffect(()=>{load()},[org,user?.id,status,scope,isManager,activityVersion]);

  const filtered=useMemo(()=>{const needle=q.trim().toLowerCase();return needle?rows.filter(t=>`${t.title} ${t.publishers?.name||''} ${teamMap[t.assigned_to]?.full_name||teamMap[t.assigned_to]?.email||''}`.toLowerCase().includes(needle)):rows},[rows,q,teamMap]);
  async function done(id){const {error}=await supabase.from('tasks').update({status:'done',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',id);if(error)setNotice(error.message);else load()}
  function personalizedTemplate(task){
    const body=task?.outreach_templates?.body||'';
    const publisher=task?.publishers?.name||'[EDITORA]';
    const sender=membership?.full_name?.split(' ')?.[0]||'[SEU NOME]';
    return body.replaceAll('[EDITORA]',publisher).replaceAll('[SEU NOME]',sender);
  }
  async function copyTemplate(task){
    const text=personalizedTemplate(task);if(!text)return;
    try{await navigator.clipboard.writeText(text);setCopiedTemplate(task.id);setTimeout(()=>setCopiedTemplate(''),1600)}
    catch{setNotice('Não foi possível copiar o modelo automaticamente.')}
  }
  async function markReminder(id){const now=new Date().toISOString();const {error}=await supabase.from('notifications').update({read_at:now,updated_at:now}).eq('organization_id',org).eq('user_id',user.id).eq('id',id);if(error)setNotice(error.message);else{setReminders(current=>current.filter(item=>item.id!==id));window.dispatchEvent(new Event('crm-notifications-changed'))}}
  async function markAllReminders(){const now=new Date().toISOString();const {error}=await supabase.from('notifications').update({read_at:now,updated_at:now}).eq('organization_id',org).eq('user_id',user.id).is('resolved_at',null).is('read_at',null);if(error)setNotice(error.message);else{setReminders([]);setNotice('Lembretes revisados.');window.dispatchEvent(new Event('crm-notifications-changed'))}}
  const teamView=isManager&&scope==='team';

  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Execução</div><h1>{teamView?'Fila da equipe':'Minha fila'}</h1><p>{teamView?'Acompanhe tarefas, lembretes automáticos de reuniões e prazos da equipe.':'Um único lugar para tarefas, follow-ups, reuniões e alertas que exigem sua atenção.'}</p></div><button className="btn" onClick={()=>setShow(true)}><Plus size={16}/> Nova tarefa</button></div>{notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

    {!teamView&&reminders.length>0&&<section className="card attention-inbox"><div className="attention-head"><div><span className="attention-icon"><BellRing size={17}/></span><div><strong>Atenção agora</strong><p>{reminders.length} lembrete{reminders.length===1?'':'s'} ainda não revisado{reminders.length===1?'':'s'}.</p></div></div><button className="btn secondary small" type="button" onClick={markAllReminders}><CheckCheck size={14}/> Marcar todos como lidos</button></div><div className="attention-list">{reminders.slice(0,4).map(item=><article key={item.id} className={`attention-row ${item.severity||'info'}`}><span className="attention-bell">{item.severity==='urgent'?<BellRing size={15}/>:<Bell size={15}/>}</span><div><strong>{item.title}</strong><p>{item.body||'Há uma ação esperando por você.'}</p><small>{formatDate(item.created_at,true)}</small></div><div className="attention-actions">{item.href&&<Link href={item.href} className="btn secondary small" onClick={()=>markReminder(item.id)}>Abrir</Link>}<button type="button" className="link-btn" onClick={()=>markReminder(item.id)}>Lido</button></div></article>)}</div>{reminders.length>4&&<div className="attention-more">+{reminders.length-4} lembrete{reminders.length-4===1?'':'s'} — marque os itens revisados para avançar a fila.</div>}</section>}

    <div className="toolbar"><div className="search-box"><Search size={17}/><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar tarefa, editora ou pessoa"/></div>{isManager&&<div className="chips"><button className={`chip ${scope==='mine'?'active':''}`} onClick={()=>setScope('mine')}>Minhas</button><button className={`chip ${scope==='team'?'active':''}`} onClick={()=>setScope('team')}>Equipe</button></div>}<div className="chips"><button className={`chip ${status==='open'?'active':''}`} onClick={()=>setStatus('open')}>Em aberto</button><button className={`chip ${status==='done'?'active':''}`} onClick={()=>setStatus('done')}>Concluídas</button><button className={`chip ${status==='all'?'active':''}`} onClick={()=>setStatus('all')}>Todas</button></div></div>
    <section className="card panel">{loading?<div className="table-empty">Carregando fila…</div>:filtered.length?<div className="task-list">{filtered.map(t=>{const late=t.status!=='done'&&t.due_at&&new Date(t.due_at)<new Date();const mine=t.assigned_to===user.id;const assignee=teamMap[t.assigned_to]?.full_name||teamMap[t.assigned_to]?.email||'Equipe';const cadenceTask=Boolean(t.cadence_enrollment_id);return <div className="task-row smart-task-row" key={t.id}>{t.status!=='done'&&mine?<button className="task-check" onClick={()=>cadenceTask?setResultTask(t):done(t.id)} title={cadenceTask?'Registrar resultado':'Concluir'}><CheckCircle2 size={19}/></button>:<CheckCircle2 size={19} style={{color:t.status==='done'?'#15803d':'#98a2b3'}}/>}<div className="task-main"><div className="task-title-line"><strong>{t.title}</strong>{cadenceTask&&<span className="badge cadence-badge">Cadência</span>}{t.automation_key&&<span className="badge blue auto-badge">{AUTOMATION_LABELS[t.automation_key]||'Automático'}</span>}{t.result_code&&<span className="badge green">{RESULT_LABELS[t.result_code]||t.result_code}</span>}</div><span>{t.publisher_id?<Link href={`/app/editoras/${t.publisher_id}`}>{t.publishers?.name||'Abrir editora'}</Link>:'Sem editora'} · {TASK_TYPE_LABELS[t.task_type]||t.task_type} · {PRIORITY_LABELS[t.priority]||t.priority}{teamView?` · ${assignee}`:''}</span>{t.description&&<span>{t.description}</span>}{t.outreach_templates?.body&&t.status!=='done'&&<div className="task-template"><div><MessageSquareText size={14}/><span><b>Modelo sugerido:</b> {t.outreach_templates.name}</span></div><button className="btn secondary small" type="button" onClick={()=>copyTemplate(t)}><Copy size={13}/>{copiedTemplate===t.id?'Copiado':'Copiar texto'}</button></div>}</div><div className={`task-due ${late?'late':''}`}><Clock3 size={14}/>{t.due_at?formatDate(t.due_at,true):'Sem prazo'}</div></div>})}</div>:<div className="empty-state"><CheckCircle2/><strong>Nenhuma tarefa nesta visão.</strong><p>{teamView?'A equipe não tem tarefas que correspondam aos filtros atuais.':'Sua fila está limpa. Novos próximos passos e lembretes de reunião aparecerão aqui.'}</p></div>}</section>
    {show&&<NewTask supabase={supabase} org={org} user={user} onClose={()=>setShow(false)} onSaved={()=>{setShow(false);setNotice('Tarefa criada.');load()}}/>}
    {resultTask&&<CadenceResultModal supabase={supabase} org={org} task={resultTask} onClose={()=>setResultTask(null)} onSaved={async action=>{setResultTask(null);setNotice(action||'Resultado registrado e cadência atualizada.');await load()}}/>}
    <style jsx>{`.attention-inbox{padding:0;margin-bottom:14px;overflow:hidden;border-color:#f0d7a6}.attention-head{padding:12px 14px;background:#fffcf5;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #f6e6c5}.attention-head>div{display:flex;align-items:center;gap:9px}.attention-head strong{font-size:12px}.attention-head p{margin:1px 0 0;font-size:10px;color:#667085}.attention-icon{width:30px;height:30px;border-radius:8px;background:#fff4d9;color:#b54708;display:grid;place-items:center}.attention-list{display:grid}.attention-row{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:9px;padding:10px 14px;border-top:1px solid #f0f1f3;align-items:center}.attention-row:first-child{border-top:0}.attention-bell{color:#667085}.attention-row.urgent .attention-bell{color:#b42318}.attention-row.warning .attention-bell{color:#b54708}.attention-row strong{display:block;font-size:11px}.attention-row p{margin:2px 0;font-size:10px;color:#475467}.attention-row small{font-size:9px;color:#98a2b3}.attention-actions{display:flex;align-items:center;gap:4px}.attention-more{padding:8px 14px;background:#fcfcfd;border-top:1px solid #f0f1f3;font-size:9px;color:#667085}.task-title-line{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.auto-badge{font-size:8px!important}.cadence-badge{font-size:8px!important;background:#f2f4f7;color:#475467}.smart-task-row{align-items:start}.task-template{margin-top:7px;padding:8px 9px;border:1px solid #e4e7ec;border-radius:8px;background:#fcfcfd;display:flex;align-items:center;justify-content:space-between;gap:10px}.task-template>div{display:flex;align-items:center;gap:6px;min-width:0}.task-template>div span{font-size:10px!important;color:#475467!important}.task-template .btn{flex:0 0 auto;min-height:30px}@media(max-width:700px){.attention-head{align-items:flex-start;flex-direction:column}.attention-row{grid-template-columns:24px 1fr}.attention-actions{grid-column:2;justify-content:flex-start}}`}</style>
  </div>
}
function NewTask({supabase,org,user,onClose,onSaved}){
  const [f,setF]=useState({title:'',description:'',publisher_id:'',task_type:'follow_up',priority:'medium',due_at:''});
  const [publisherSearch,setPublisherSearch]=useState('');
  const [publisherOptions,setPublisherOptions]=useState([]);
  const [selectedPublisher,setSelectedPublisher]=useState(null);
  const [searching,setSearching]=useState(false);
  const [err,setErr]=useState('');

  useEffect(()=>{
    const needle=publisherSearch.trim();
    if(needle.length<2){setPublisherOptions([]);setSearching(false);return}
    let cancelled=false;
    setSearching(true);
    const timer=setTimeout(async()=>{
      const safe=needle.replace(/[,%()]/g,' ');
      const {data,error}=await supabase.from('publishers')
        .select('id,name,trade_name,city,state,score')
        .eq('organization_id',org).eq('archived',false)
        .or(`name.ilike.%${safe}%,trade_name.ilike.%${safe}%`)
        .order('score',{ascending:false,nullsFirst:false})
        .order('name')
        .limit(15);
      if(cancelled)return;
      if(error)setErr(error.message);
      setPublisherOptions(data||[]);
      setSearching(false);
    },250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[publisherSearch,org,supabase]);

  function choosePublisher(p){
    setSelectedPublisher(p);
    setF(x=>({...x,publisher_id:p.id}));
    setPublisherSearch('');
    setPublisherOptions([]);
  }

  function clearPublisher(){
    setSelectedPublisher(null);
    setF(x=>({...x,publisher_id:''}));
    setPublisherSearch('');
    setPublisherOptions([]);
  }

  async function save(e){
    e.preventDefault();
    const {error}=await supabase.from('tasks').insert({
      organization_id:org,publisher_id:f.publisher_id||null,assigned_to:user.id,created_by:user.id,
      title:f.title,description:f.description||null,task_type:f.task_type,priority:f.priority,status:'open',
      due_at:f.due_at?new Date(f.due_at).toISOString():null
    });
    if(error)setErr(error.message);else onSaved();
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={save}>
    <div className="modal-head"><div><h3>Nova tarefa</h3><p>Inclua o próximo passo na sua fila.</p></div><button type="button" onClick={onClose}><X/></button></div>
    {err&&<div className="notice error">{err}</div>}
    <div className="form-grid">
      <label className="span-2">Título<input required className="input" value={f.title} onChange={e=>setF(x=>({...x,title:e.target.value}))}/></label>
      <div className="span-2">
        <label>Editora <span className="muted">(opcional)</span></label>
        {selectedPublisher?
          <div style={{marginTop:6,padding:'10px 12px',border:'1px solid #d0d5dd',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div><strong style={{display:'block',fontSize:12}}>{selectedPublisher.name}</strong><span className="muted" style={{fontSize:10}}>{[selectedPublisher.city,selectedPublisher.state].filter(Boolean).join(' / ')||selectedPublisher.trade_name||'Editora selecionada'}</span></div>
            <button type="button" className="link-btn" onClick={clearPublisher}>Trocar</button>
          </div>:
          <div style={{position:'relative',marginTop:6}}>
            <div className="search-box" style={{width:'100%'}}><Search size={16}/><input className="input" value={publisherSearch} onChange={e=>setPublisherSearch(e.target.value)} placeholder="Digite pelo menos 2 letras do nome"/></div>
            {searching&&<div className="muted" style={{fontSize:10,marginTop:6}}>Buscando editoras…</div>}
            {!searching&&publisherSearch.trim().length>=2&&<div style={{marginTop:6,border:'1px solid #e4e7ec',borderRadius:9,overflow:'hidden',maxHeight:230,overflowY:'auto'}}>
              {publisherOptions.length?publisherOptions.map(p=><button key={p.id} type="button" onClick={()=>choosePublisher(p)} style={{width:'100%',border:0,borderTop:'1px solid #f2f4f7',background:'#fff',padding:'9px 11px',textAlign:'left',cursor:'pointer'}}>
                <strong style={{display:'block',fontSize:11}}>{p.name}</strong><span className="muted" style={{fontSize:9}}>{[p.trade_name,p.city,p.state].filter(Boolean).join(' · ')||'Sem dados complementares'} · Score {p.score??0}</span>
              </button>):<div className="muted" style={{padding:'10px 11px',fontSize:10}}>Nenhuma editora encontrada.</div>}
            </div>}
          </div>}
      </div>
      <label>Tipo<select value={f.task_type} onChange={e=>setF(x=>({...x,task_type:e.target.value}))}>{Object.entries(TASK_TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Prioridade<select value={f.priority} onChange={e=>setF(x=>({...x,priority:e.target.value}))}>{Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label className="span-2">Prazo<input type="datetime-local" className="input" value={f.due_at} onChange={e=>setF(x=>({...x,due_at:e.target.value}))}/></label>
      <label className="span-2">Descrição<textarea rows={3} value={f.description} onChange={e=>setF(x=>({...x,description:e.target.value}))}/></label>
    </div>
    <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn">Salvar tarefa</button></div>
  </form></div>;
}

function CadenceResultModal({supabase,org,task,onClose,onSaved}){
  const [result,setResult]=useState('no_answer');
  const [note,setNote]=useState('');
  const [resumeAt,setResumeAt]=useState('');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const needsDate=PAUSE_RESULTS.has(result);
  const reaction=result==='meeting_scheduled'?'A cadência será encerrada e a editora avançará para Conversando.':
    result==='not_interested'?'A cadência será encerrada e a editora irá para Sem interesse.':
    result==='asked_email'?'O CRM criará o envio da apresentação e um follow-up automático.':
    result==='proposal_requested'||result==='qualified'?'A prospecção será encerrada e um próximo passo de oportunidade será criado.':
    needsDate?'A cadência será pausada e retomada automaticamente na data informada.':
    result==='connected'||result==='replied'||result==='contact_updated'?'As tentativas genéricas serão substituídas por um follow-up contextualizado.':
    result==='wrong_contact'?'O CRM adicionará uma tarefa para localizar o contato correto.':
    'As próximas etapas previstas serão mantidas.';

  async function save(e){
    e.preventDefault();setErr('');
    if(needsDate&&!resumeAt){setErr('Informe quando o contato deve ser retomado.');return}
    setBusy(true);
    const {data,error}=await supabase.rpc('crm_complete_cadence_task',{
      p_organization_id:org,
      p_task_id:task.id,
      p_result_code:result,
      p_result_note:note.trim()||null,
      p_resume_at:needsDate?new Date(resumeAt).toISOString():null
    });
    setBusy(false);
    if(error)setErr(error.message);else onSaved(data?.action||'Resultado registrado e cadência atualizada.');
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={save}>
    <div className="modal-head"><div><h3>Registrar resultado</h3><p>{task.publishers?.name||'Editora'} · {task.title}</p></div><button type="button" onClick={onClose}><X/></button></div>
    {err&&<div className="notice error">{err}</div>}
    <div className="form-grid">
      <label className="span-2">O que aconteceu?<select value={result} onChange={e=>setResult(e.target.value)}>{CADENCE_RESULTS.map(key=><option key={key} value={key}>{RESULT_LABELS[key]||key}</option>)}</select></label>
      <div className="span-2" style={{padding:'9px 10px',borderRadius:8,background:'#f8fafc',border:'1px solid #e4e7ec',fontSize:11,color:'#475467',lineHeight:1.45}}>{reaction}</div>
      {needsDate&&<label className="span-2">Retomar em<input required type="datetime-local" className="input" value={resumeAt} onChange={e=>setResumeAt(e.target.value)}/></label>}
      <label className="span-2">Observação<textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Contexto útil para o próximo contato (opcional)"/></label>
    </div>
    <div className="modal-actions"><button className="btn secondary" type="button" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy}>{busy?'Atualizando…':'Concluir tarefa'}</button></div>
  </form></div>;
}
