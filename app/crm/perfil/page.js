'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Camera, CheckCircle2, Link2, RefreshCw, Save, Unlink } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import Avatar from '@/components/Avatar';
import { COMMERCIAL_FUNCTION_LABELS, ROLE_LABELS } from '@/lib/constants';

function formatBusy(value){return new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}

export default function ProfilePage(){
  const {supabase,user,membership,refreshTeam,refresh,isManager}=useCrm();
  const [name,setName]=useState(membership?.full_name||'');
  const [job,setJob]=useState(membership?.job_title||'');
  const [avatar,setAvatar]=useState(membership?.avatar_url||'');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [calendar,setCalendar]=useState({loading:true,configured:false,canConnect:false,connection:null});
  const [calendarBusy,setCalendarBusy]=useState(false);
  const [calendarNotice,setCalendarNotice]=useState('');
  const [availability,setAvailability]=useState(null);
  const finalizeStarted=useRef(false);

  useEffect(()=>{setName(membership?.full_name||'');setJob(membership?.job_title||'');setAvatar(membership?.avatar_url||'')},[membership]);

  async function accessToken(){
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token||'';
  }

  async function calendarRequest(method='GET',body){
    const token=await accessToken();
    if(!token)throw new Error('Sua sessão expirou. Entre novamente no CRM.');
    const response=await fetch('/api/google-calendar',{method,headers:{Authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Não foi possível acessar a integração com Google Agenda.');
    return data;
  }

  async function loadCalendarStatus(){
    if(!membership?.organization_id)return;
    try{const data=await calendarRequest();setCalendar({loading:false,...data})}
    catch(error){setCalendar(x=>({...x,loading:false}));setCalendarNotice(error.message)}
  }

  useEffect(()=>{loadCalendarStatus()},[membership?.organization_id]);

  useEffect(()=>{
    if(!membership?.organization_id||finalizeStarted.current)return;
    const params=new URLSearchParams(window.location.search);
    const mode=params.get('google_calendar');
    if(!mode)return;
    finalizeStarted.current=true;
    if(mode==='finalize'){
      (async()=>{
        setCalendarBusy(true);setCalendarNotice('Concluindo conexão com o Google Agenda…');
        try{const data=await calendarRequest('POST',{action:'finalize'});setCalendarNotice(`Google Agenda conectado${data.email?` como ${data.email}`:''}.`);await loadCalendarStatus()}
        catch(error){setCalendarNotice(error.message)}
        finally{setCalendarBusy(false);window.history.replaceState({},'',window.location.pathname)}
      })();
    }else{
      setCalendarNotice(mode==='cancelled'?'A conexão com o Google foi cancelada.':'Não foi possível validar o retorno do Google. Tente conectar novamente.');
      window.history.replaceState({},'',window.location.pathname);
    }
  },[membership?.organization_id]);

  async function upload(e){
    const file=e.target.files?.[0];if(!file)return;
    setBusy(true);setNotice('');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`${user.id}/${Date.now()}.${ext}`;
    const {error}=await supabase.storage.from('crm-avatars').upload(path,file,{upsert:true});
    if(error){setNotice(error.message);setBusy(false);return}
    const {data}=supabase.storage.from('crm-avatars').getPublicUrl(path);setAvatar(data.publicUrl);setBusy(false);
  }

  async function save(){
    setBusy(true);setNotice('');
    const {error}=await supabase.from('org_members').update({full_name:name,job_title:job||null,avatar_url:avatar||null,updated_at:new Date().toISOString()}).eq('organization_id',membership.organization_id).eq('user_id',user.id);
    if(error)setNotice(error.message);else{setNotice('Perfil atualizado.');await refreshTeam();await refresh()}
    setBusy(false);
  }

  async function connectCalendar(){
    setCalendarBusy(true);setCalendarNotice('');
    try{const data=await calendarRequest('POST',{action:'connect'});window.location.assign(data.url)}
    catch(error){setCalendarNotice(error.message);setCalendarBusy(false)}
  }

  async function disconnectCalendar(){
    if(!window.confirm('Desconectar o Google Agenda deste usuário?'))return;
    setCalendarBusy(true);setCalendarNotice('');setAvailability(null);
    try{await calendarRequest('POST',{action:'disconnect'});setCalendarNotice('Google Agenda desconectado.');await loadCalendarStatus()}
    catch(error){setCalendarNotice(error.message)}finally{setCalendarBusy(false)}
  }

  async function testAvailability(){
    setCalendarBusy(true);setCalendarNotice('');setAvailability(null);
    const start=new Date();const end=new Date(start.getTime()+7*24*60*60*1000);
    try{const data=await calendarRequest('POST',{action:'availability',presenterUserId:user.id,timeMin:start.toISOString(),timeMax:end.toISOString()});setAvailability(data.busy||[]);setCalendarNotice('Leitura de disponibilidade realizada com sucesso.')}
    catch(error){setCalendarNotice(error.message)}finally{setCalendarBusy(false)}
  }

  const functions=membership?.commercial_functions||[];
  const showCalendar=isManager||functions.includes('commercial_presentation');

  return <div className="page-wrap narrow">
    <div className="page-head"><div><div className="eyebrow">Conta</div><h1>Meu perfil</h1><p>Atualize seus dados pessoais, consulte seu papel no fluxo comercial e gerencie suas integrações.</p></div></div>
    <section className="card profile-card">
      <div className="profile-avatar-area"><Avatar member={{...membership,full_name:name,avatar_url:avatar}} size={104}/><label className="avatar-upload"><Camera size={16}/> Alterar foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label></div>
      <div className="profile-fields">
        <label>Nome completo<input className="input" value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Cargo / função<input className="input" value={job} onChange={e=>setJob(e.target.value)} placeholder="Ex.: Prospecção comercial"/></label>
        <label>E-mail<input className="input" disabled value={user?.email||membership?.email||''}/></label>
        <label>Nível de acesso<input className="input" disabled value={ROLE_LABELS[membership?.role]||membership?.role}/></label>
        <div><small className="muted">Funções comerciais</small><div className="chips" style={{marginTop:7}}>{functions.length?functions.map(key=><span className="badge blue" key={key}>{COMMERCIAL_FUNCTION_LABELS[key]||key}</span>):<span className="muted" style={{fontSize:12}}>Nenhuma função comercial definida.</span>}</div><p className="muted" style={{fontSize:10,margin:'6px 0 0'}}>As funções comerciais são definidas pelos administradores na área Equipe.</p></div>
        {notice&&<div className="notice success">{notice}</div>}
        <button className="btn" disabled={busy} onClick={save}><Save size={16}/>{busy?'Salvando…':'Salvar perfil'}</button>
      </div>
    </section>

    {showCalendar&&<section className="card panel" style={{marginTop:16}}>
      <div className="section-title"><div><div className="eyebrow">Integrações</div><h2 style={{margin:'4px 0'}}>Google Agenda</h2><p className="muted">O CRM solicita somente a permissão para consultar horários livres e ocupados. Os títulos e detalhes dos seus compromissos não são lidos.</p></div><CalendarDays size={24}/></div>
      {calendar.loading?<div className="table-empty">Verificando integração…</div>:!calendar.configured?<div className="notice"><strong>Configuração administrativa pendente.</strong><span> O CRM já está preparado, mas ainda precisa das credenciais OAuth do Google no servidor.</span></div>:calendar.connection?<div style={{display:'grid',gap:12}}>
        <div className="info-grid"><div className="info-item"><small>Status</small><span><CheckCircle2 size={14} style={{verticalAlign:'middle',marginRight:5}}/>Conectado</span></div><div className="info-item"><small>Conta Google</small><span>{calendar.connection.google_account_email||'Conta autorizada'}</span></div><div className="info-item"><small>Agenda consultada</small><span>Principal</span></div><div className="info-item"><small>Conectado em</small><span>{new Date(calendar.connection.connected_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</span></div></div>
        <div className="chips"><span className="badge green">Somente livre/ocupado</span><span className="badge">Sem acesso aos detalhes dos eventos</span></div>
        {calendarNotice&&<div className="notice">{calendarNotice}</div>}
        {availability&&<div className="card" style={{padding:12,boxShadow:'none'}}><strong style={{fontSize:12}}>Teste — próximos 7 dias</strong><p className="muted" style={{fontSize:11,margin:'4px 0 8px'}}>{availability.length?`${availability.length} bloco${availability.length===1?'':'s'} de indisponibilidade encontrado${availability.length===1?'':'s'}.`:'Nenhum bloqueio encontrado no período.'}</p>{availability.slice(0,6).map((item,index)=><div key={`${item.start}-${index}`} style={{fontSize:11,padding:'4px 0',borderTop:index?'1px solid #f2f4f7':0}}>{formatBusy(item.start)} → {formatBusy(item.end)}</div>)}{availability.length>6&&<small className="muted">+ {availability.length-6} outros blocos</small>}</div>}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn secondary" type="button" disabled={calendarBusy} onClick={testAvailability}><RefreshCw size={15}/>{calendarBusy?'Consultando…':'Testar disponibilidade'}</button><button className="btn secondary" type="button" disabled={calendarBusy} onClick={disconnectCalendar}><Unlink size={15}/> Desconectar</button></div>
      </div>:<div style={{display:'grid',gap:12}}>
        <div className="notice"><span>Ao conectar, o CRM poderá identificar apenas quando sua agenda está <b>livre</b> ou <b>ocupada</b>. Isso permitirá que o responsável pelo agendamento consulte sua disponibilidade sem ver seus compromissos pessoais.</span></div>
        {calendarNotice&&<div className="notice">{calendarNotice}</div>}
        <button className="btn" type="button" disabled={calendarBusy||!calendar.canConnect} onClick={connectCalendar}><Link2 size={16}/>{calendarBusy?'Conectando…':'Conectar Google Agenda'}</button>
      </div>}
    </section>}
  </div>;
}
