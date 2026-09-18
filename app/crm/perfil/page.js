'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, Camera, CheckCircle2, Copy, ExternalLink, RefreshCw, Save, Unlink } from 'lucide-react';
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
  const [calendar,setCalendar]=useState({loading:true,canConnect:false,connection:null,scriptCode:null});
  const [calendarBusy,setCalendarBusy]=useState(false);
  const [calendarNotice,setCalendarNotice]=useState('');
  const [availability,setAvailability]=useState(null);
  const [bridgeUrl,setBridgeUrl]=useState('');
  const [copied,setCopied]=useState(false);

  useEffect(()=>{setName(membership?.full_name||'');setJob(membership?.job_title||'');setAvatar(membership?.avatar_url||'')},[membership]);

  async function accessToken(){const {data:{session}}=await supabase.auth.getSession();return session?.access_token||''}
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
    try{
      const data=await calendarRequest();
      setCalendar({loading:false,...data});
      if(data.connection?.bridge_url)setBridgeUrl(data.connection.bridge_url);
    }catch(error){setCalendar(x=>({...x,loading:false}));setCalendarNotice(error.message)}
  }
  useEffect(()=>{loadCalendarStatus()},[membership?.organization_id]);

  async function upload(e){
    const file=e.target.files?.[0];if(!file)return;setBusy(true);setNotice('');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${user.id}/${Date.now()}.${ext}`;
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

  async function prepareBridge(){
    if(calendar.connection&&calendar.connection.bridge_status==='connected'&&!window.confirm('Gerar uma nova configuração invalidará a ponte atual. Continuar?'))return;
    setCalendarBusy(true);setCalendarNotice('');setAvailability(null);setCopied(false);
    try{const data=await calendarRequest('POST',{action:'prepare'});setCalendar(x=>({...x,connection:{...(x.connection||{}),bridge_status:'pending',bridge_url:null},scriptCode:data.scriptCode}));setBridgeUrl('');setCalendarNotice('Código preparado. Faça a configuração única abaixo.')}
    catch(error){setCalendarNotice(error.message)}finally{setCalendarBusy(false)}
  }

  async function copyScript(){
    if(!calendar.scriptCode)return;
    try{await navigator.clipboard.writeText(calendar.scriptCode);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setCalendarNotice('Não consegui copiar automaticamente. Selecione o código e copie manualmente.')}
  }

  async function saveBridge(){
    setCalendarBusy(true);setCalendarNotice('Testando a ponte com sua agenda…');setAvailability(null);
    try{
      const data=await calendarRequest('POST',{action:'save_bridge',bridgeUrl:bridgeUrl.trim()});
      setCalendarNotice('Google Agenda conectado. A partir de agora o CRM pode ler apenas seus blocos de indisponibilidade.');
      setAvailability(data.busy||[]);await loadCalendarStatus();
    }catch(error){setCalendarNotice(error.message)}finally{setCalendarBusy(false)}
  }

  async function disconnectCalendar(){
    if(!window.confirm('Desconectar a disponibilidade do Google Agenda deste usuário?'))return;
    setCalendarBusy(true);setCalendarNotice('');setAvailability(null);
    try{await calendarRequest('POST',{action:'disconnect'});setBridgeUrl('');setCalendarNotice('Google Agenda desconectado.');await loadCalendarStatus()}
    catch(error){setCalendarNotice(error.message)}finally{setCalendarBusy(false)}
  }

  async function testAvailability(){
    setCalendarBusy(true);setCalendarNotice('');setAvailability(null);
    const start=new Date();const end=new Date(start.getTime()+7*24*60*60*1000);
    try{const data=await calendarRequest('POST',{action:'availability',presenterUserId:user.id,timeMin:start.toISOString(),timeMax:end.toISOString()});setAvailability(data.busy||[]);setCalendarNotice('Disponibilidade atualizada com sucesso.')}
    catch(error){setCalendarNotice(error.message)}finally{setCalendarBusy(false)}
  }

  const functions=membership?.commercial_functions||[];
  const showCalendar=isManager||functions.includes('commercial_presentation');
  const connected=calendar.connection?.bridge_status==='connected';
  const setupStarted=Boolean(calendar.scriptCode)&&!connected;

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
      <div className="section-title"><div><div className="eyebrow">Integrações</div><h2 style={{margin:'4px 0'}}>Google Agenda</h2><p className="muted">A conexão usa um Apps Script da própria conta Google. O CRM recebe somente horários ocupados — nunca título, descrição ou local dos compromissos.</p></div><CalendarDays size={24}/></div>
      {calendar.loading?<div className="table-empty">Verificando integração…</div>:connected?<div style={{display:'grid',gap:12}}>
        <div className="info-grid"><div className="info-item"><small>Status</small><span><CheckCircle2 size={14} style={{verticalAlign:'middle',marginRight:5}}/>Conectado</span></div><div className="info-item"><small>Conta Google</small><span>{calendar.connection.google_account_email||'Conta autorizada'}</span></div><div className="info-item"><small>Método</small><span>Apps Script</span></div><div className="info-item"><small>Último teste</small><span>{calendar.connection.last_verified_at?new Date(calendar.connection.last_verified_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—'}</span></div></div>
        <div className="chips"><span className="badge green">Somente livre/ocupado</span><span className="badge">Sem Google Cloud</span><span className="badge">Sem detalhes pessoais</span></div>
        {calendarNotice&&<div className="notice">{calendarNotice}</div>}
        {availability&&<AvailabilityPreview availability={availability}/>} 
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn secondary" type="button" disabled={calendarBusy} onClick={testAvailability}><RefreshCw size={15}/>{calendarBusy?'Consultando…':'Testar disponibilidade'}</button><button className="btn secondary" type="button" disabled={calendarBusy} onClick={prepareBridge}>Refazer configuração</button><button className="btn secondary" type="button" disabled={calendarBusy} onClick={disconnectCalendar}><Unlink size={15}/> Desconectar</button></div>
      </div>:<div style={{display:'grid',gap:13}}>
        <div className="notice"><span><b>Configuração única.</b> Depois disso você continua usando o Google Agenda normalmente; o CRM consulta os bloqueios automaticamente.</span></div>
        {!setupStarted?<button className="btn" type="button" disabled={calendarBusy||!calendar.canConnect} onClick={prepareBridge}>{calendarBusy?'Preparando…':'Preparar conexão com Google Agenda'}</button>:<>
          <div className="card" style={{padding:14,boxShadow:'none'}}><strong style={{fontSize:12}}>1. Crie o Apps Script</strong><p className="muted" style={{fontSize:11}}>Abra o editor na conta Google que possui a agenda, apague o conteúdo inicial e cole o código pronto abaixo.</p><a className="btn secondary small" href="https://script.google.com/create" target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir Apps Script</a></div>
          <div className="card" style={{padding:14,boxShadow:'none'}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong style={{fontSize:12}}>2. Copie o código pronto</strong><button className="btn secondary small" type="button" onClick={copyScript}><Copy size={13}/>{copied?'Copiado':'Copiar código'}</button></div><textarea className="input" readOnly value={calendar.scriptCode||''} rows={11} style={{marginTop:9,fontFamily:'monospace',fontSize:10,resize:'vertical'}}/></div>
          <div className="card" style={{padding:14,boxShadow:'none'}}><strong style={{fontSize:12}}>3. Autorize e publique</strong><ol style={{fontSize:11,lineHeight:1.6,color:'#475467',paddingLeft:18,marginBottom:0}}><li>No Apps Script, selecione a função <b>authorizeRadar</b> e clique em <b>Executar</b> uma vez; autorize o acesso à agenda.</li><li>Depois vá em <b>Implantar → Nova implantação → App da Web</b>.</li><li>Escolha <b>Executar como: Eu</b> e acesso <b>Qualquer pessoa</b>.</li><li>Implante e copie a URL terminada em <b>/exec</b>.</li></ol></div>
          <div className="card" style={{padding:14,boxShadow:'none'}}><strong style={{fontSize:12}}>4. Cole a URL aqui</strong><p className="muted" style={{fontSize:11}}>O CRM testa a conexão antes de salvá-la.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input className="input" style={{flex:'1 1 320px'}} value={bridgeUrl} onChange={e=>setBridgeUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec"/><button className="btn" type="button" disabled={calendarBusy||!bridgeUrl.trim()} onClick={saveBridge}>{calendarBusy?'Testando…':'Salvar e testar'}</button></div></div>
        </>}
        {calendarNotice&&<div className="notice">{calendarNotice}</div>}
      </div>}
    </section>}
  </div>;
}

function AvailabilityPreview({availability}){
  return <div className="card" style={{padding:12,boxShadow:'none'}}><strong style={{fontSize:12}}>Teste — próximos 7 dias</strong><p className="muted" style={{fontSize:11,margin:'4px 0 8px'}}>{availability.length?`${availability.length} bloco${availability.length===1?'':'s'} de indisponibilidade encontrado${availability.length===1?'':'s'}.`:'Nenhum bloqueio encontrado no período.'}</p>{availability.slice(0,6).map((item,index)=><div key={`${item.start}-${index}`} style={{fontSize:11,padding:'4px 0',borderTop:index?'1px solid #f2f4f7':0}}><b>{item.title||'Compromisso'}</b><br/>{formatBusy(item.start)} → {formatBusy(item.end)}</div>)}{availability.length>6&&<small className="muted">+ {availability.length-6} outros blocos</small>}</div>;
}
