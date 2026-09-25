'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, CheckCircle2, ChevronDown, ChevronUp, Copy, ExternalLink, Save, ShieldCheck, Unlink, UserCheck, UserPlus, Users, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useCrm } from '@/components/CrmProvider';
import { COMMERCIAL_FUNCTION_LABELS, ROLE_LABELS } from '@/lib/constants';
import { AVAILABILITY_DAY_OPTIONS, normalizeAvailabilityRule, ruleSummary, timeToMinutes } from '@/lib/meetingAvailability';

const ACCESS_PROFILES=[
  {role:'admin',title:'Administrador',desc:'Gerencia equipe e acessos, além de usar todo o CRM.'},
  {role:'supervisor',title:'Supervisor',desc:'Acompanha operação e equipe, sem administrar acessos.'},
  {role:'member',title:'Prospectador',desc:'Usa o CRM no dia a dia para prospecção, contatos e follow-ups.'},
];

const COMMERCIAL_FUNCTION_DESCRIPTIONS={
  prospecting:'Realiza contatos e conduz a prospecção das editoras.',
  meeting_scheduling:'Agenda apresentações e consulta a disponibilidade dos apresentadores.',
  commercial_presentation:'Realiza apresentações comerciais e pode disponibilizar a própria agenda para agendamento.',
  pre_meeting_materials:'Produz materiais direcionados antes das apresentações comerciais.',
  negotiation_materials:'Produz projetos, propostas e materiais específicos para apoiar negociações.'
};

function TeamCalendarAdmin({member}){
  const {supabase}=useCrm();
  const [calendar,setCalendar]=useState({loading:true,connection:null,scriptCode:null});
  const [bridgeUrl,setBridgeUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [copied,setCopied]=useState(false);
  const [reminder,setReminder]=useState({loading:false,checked:false,enabled:false,upgradeRequired:false,quota:null});
  const [showScriptUpgrade,setShowScriptUpgrade]=useState(false);

  async function accessToken(){const {data:{session}}=await supabase.auth.getSession();return session?.access_token||''}
  async function request(method='GET',body){
    const token=await accessToken();
    if(!token)throw new Error('Sua sessão expirou.');
    const url=method==='GET'?'/api/google-calendar?userId='+encodeURIComponent(member.user_id):'/api/google-calendar';
    const payload=body?{...body,presenterUserId:member.user_id}:undefined;
    const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Não foi possível gerenciar o Google Agenda.');
    return data;
  }
  async function load(){
    try{
      const data=await request();
      setCalendar({loading:false,...data});
      if(data.connection?.bridge_url)setBridgeUrl(data.connection.bridge_url);
      if(data.connection?.bridge_status==='connected'){
        await checkReminders(true);
      }else{
        setReminder({loading:false,checked:false,enabled:false,upgradeRequired:false,quota:null});
      }
    }catch(error){setCalendar(x=>({...x,loading:false}));setMessage(error.message)}
  }
  async function checkReminders(silent=false){
    if(!silent)setReminder(x=>({...x,loading:true}));
    try{
      const data=await request('POST',{action:'reminder_status'});
      setReminder({
        loading:false,
        checked:true,
        enabled:Boolean(data.remindersEnabled),
        upgradeRequired:Boolean(data.upgradeRequired),
        quota:Number.isFinite(Number(data.remainingDailyQuota))?Number(data.remainingDailyQuota):null
      });
      return data;
    }catch(error){
      setReminder({loading:false,checked:true,enabled:false,upgradeRequired:true,quota:null});
      if(!silent)setMessage(error.message||'Não foi possível verificar os lembretes automáticos.');
      return null;
    }
  }
  useEffect(()=>{load()},[member.user_id]);

  async function prepare(){
    if(calendar.connection?.bridge_status==='connected'&&!window.confirm('Gerar uma nova configuração invalidará a conexão atual desta pessoa. Continuar?'))return;
    setBusy(true);setMessage('');setCopied(false);
    try{
      const data=await request('POST',{action:'prepare'});
      setCalendar(x=>({...x,connection:{...(x.connection||{}),bridge_status:'pending',bridge_url:null},scriptCode:data.scriptCode}));
      setBridgeUrl('');
      setMessage('Novo código gerado. Publique-o na conta Google deste apresentador e salve a URL /exec abaixo.');
    }catch(error){setMessage(error.message)}finally{setBusy(false)}
  }
  async function copyScript(){
    if(!calendar.scriptCode)return;
    try{await navigator.clipboard.writeText(calendar.scriptCode);setCopied(true);setTimeout(()=>setCopied(false),1800)}
    catch{setMessage('Não foi possível copiar automaticamente. Selecione o código manualmente.')}
  }
  async function saveBridge(){
    if(!bridgeUrl.trim())return;
    setBusy(true);setMessage('Testando a conexão…');
    try{
      const data=await request('POST',{action:'save_bridge',bridgeUrl:bridgeUrl.trim()});
      setMessage(`Google Agenda conectado${data.email?` em ${data.email}`:''}. O lembrete automático ficará ativo após a autorização do script.`);
      await load();
    }catch(error){setMessage(error.message)}finally{setBusy(false)}
  }
  async function disconnect(){
    if(!window.confirm('Desconectar o Google Agenda deste usuário? As reuniões no CRM permanecem, mas deixam de sincronizar até uma nova configuração.'))return;
    setBusy(true);setMessage('');
    try{await request('POST',{action:'disconnect'});setBridgeUrl('');setMessage('Google Agenda desconectado.');await load()}
    catch(error){setMessage(error.message)}finally{setBusy(false)}
  }

  const connected=calendar.connection?.bridge_status==='connected';
  const pending=calendar.connection?.bridge_status==='pending';
  return <div className="calendar-admin">
    <div className="calendar-admin-title"><CalendarDays size={16}/><div><strong>Google Agenda</strong><small>Integração administrada pelo CRM.</small></div><span className={`badge ${connected?'green':pending?'amber':''}`}>{calendar.loading?'Verificando…':connected?'Conectado':pending?'Configuração pendente':'Não configurado'}</span></div>
    {connected&&<div className="calendar-admin-meta"><span><b>Conta:</b> {calendar.connection.google_account_email||'Conta autorizada'}</span><span><b>Último teste:</b> {calendar.connection.last_verified_at?new Date(calendar.connection.last_verified_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—'}</span><span><b>Lembrete 24h:</b> {reminder.loading?'Verificando…':reminder.enabled?'Ativo':reminder.upgradeRequired?'Atualização necessária':reminder.checked?'Aguardando ativação':'—'}</span></div>}
    {message&&<div className="notice" style={{margin:0}}>{message}</div>}
    {calendar.scriptCode&&(!connected||pending)&&<div className="calendar-setup">
      <div className="calendar-setup-head"><strong>Código do Apps Script</strong><button className="btn secondary small" type="button" onClick={copyScript}><Copy size={13}/>{copied?'Copiado':'Copiar código'}</button></div>
      <textarea className="input" readOnly rows={7} value={calendar.scriptCode}/>
      <div className="calendar-setup-actions"><a className="btn secondary small" href="https://script.google.com/create" target="_blank" rel="noreferrer"><ExternalLink size={13}/> Abrir Apps Script</a><input className="input" value={bridgeUrl} onChange={e=>setBridgeUrl(e.target.value)} placeholder="Cole a URL /exec"/><button className="btn small" type="button" disabled={busy||!bridgeUrl.trim()} onClick={saveBridge}>{busy?'Testando…':'Salvar e testar'}</button></div>
      <small>O script deve ser autorizado e implantado usando a conta Google cuja agenda será sincronizada. Antes de implantar, execute a função <b>authorizeRadar</b> uma vez para autorizar Agenda e envio de e-mail e criar o lembrete automático.</small>
    </div>}
    {connected&&reminder.upgradeRequired&&<div className="notice" style={{margin:0}}>A integração atual ainda não possui o lembrete automático por e-mail. Atualize o Apps Script uma vez para ativá-lo.</div>}
    {connected&&reminder.checked&&!reminder.enabled&&!reminder.upgradeRequired&&<div className="notice" style={{margin:0}}>O script já suporta lembretes, mas o gatilho ainda não está ativo. Execute <b>authorizeRadar</b> uma vez no Apps Script.</div>}
    {connected&&showScriptUpgrade&&<div className="calendar-setup">
      <div className="calendar-setup-head"><strong>Atualizar Apps Script para lembretes</strong><button className="btn secondary small" type="button" onClick={copyScript}><Copy size={13}/>{copied?'Copiado':'Copiar código atualizado'}</button></div>
      <ol style={{margin:'0 0 8px 18px',padding:0,fontSize:11,color:'#475467',lineHeight:1.6}}>
        <li>Abra o projeto do Apps Script já conectado a esta conta.</li>
        <li>Substitua todo o código pelo código atualizado abaixo e salve.</li>
        <li>Execute a função <b>authorizeRadar</b> uma vez e aceite a permissão de envio de e-mail.</li>
        <li>Em <b>Implantar → Gerenciar implantações</b>, edite a implantação e publique uma nova versão. A URL /exec permanece a mesma.</li>
        <li>Volte ao CRM e clique em <b>Verificar lembrete</b>.</li>
      </ol>
      <textarea className="input" readOnly rows={7} value={calendar.scriptCode||''}/>
      <div className="calendar-setup-actions"><a className="btn secondary small" href="https://script.google.com" target="_blank" rel="noreferrer"><ExternalLink size={13}/> Abrir Apps Script</a></div>
    </div>}
    <div className="calendar-admin-actions">
      {!pending&&<button className="btn secondary small" type="button" disabled={busy||calendar.loading} onClick={prepare}>{connected?'Reconfigurar integração':'Configurar Google Agenda'}</button>}
      {connected&&<button className="btn secondary small" type="button" disabled={reminder.loading} onClick={()=>checkReminders(false)}>{reminder.loading?'Verificando…':'Verificar lembrete'}</button>}
      {connected&&<button className="btn secondary small" type="button" onClick={()=>setShowScriptUpgrade(x=>!x)}>{showScriptUpgrade?'Ocultar código':'Atualizar script de lembretes'}</button>}
      {connected&&<button className="btn secondary small" type="button" disabled={busy} onClick={disconnect}><Unlink size={13}/> Desconectar integração</button>}
    </div>
  </div>;
}

export default function TeamPage(){
  const {supabase,membership,user,team,isAdmin,isManager,refreshTeam}=useCrm();
  const org=membership?.organization_id;
  const [drafts,setDrafts]=useState({});
  const [rules,setRules]=useState({});
  const [ruleDrafts,setRuleDrafts]=useState({});
  const [pending,setPending]=useState([]);
  const [pendingRoles,setPendingRoles]=useState({});
  const [notice,setNotice]=useState('');
  const [loadingPending,setLoadingPending]=useState(false);
  const [expandedMember,setExpandedMember]=useState('');

  useEffect(()=>{setDrafts(Object.fromEntries(team.map(m=>[m.user_id,{role:m.role,active:m.active,commercial_functions:m.commercial_functions||[],full_name:m.full_name||'',job_title:m.job_title||''}])) )},[team]);

  async function loadRules(){
    if(!org)return;
    const {data,error}=await supabase.from('presenter_availability_rules').select('*').eq('organization_id',org);
    if(error){setNotice(error.message);return}
    const map=Object.fromEntries((data||[]).map(row=>[row.user_id,normalizeAvailabilityRule(row)]));
    setRules(map);
    setRuleDrafts(Object.fromEntries(team.map(member=>[member.user_id,normalizeAvailabilityRule(map[member.user_id])])))
  }
  useEffect(()=>{loadRules()},[org,team.length]);

  async function loadPending(){if(!org||!isAdmin)return;setLoadingPending(true);const {data,error}=await supabase.rpc('admin_pending_users',{p_organization_id:org});if(error)setNotice(error.message);else{setPending(data||[]);setPendingRoles(Object.fromEntries((data||[]).map(p=>[p.user_id,'member'])))}setLoadingPending(false)}
  useEffect(()=>{loadPending()},[org,isAdmin]);

  function changeDraft(userId,patch){setDrafts(x=>({...x,[userId]:{...x[userId],...patch}}))}
  function toggleFunction(userId,key){const current=drafts[userId]?.commercial_functions||[];changeDraft(userId,{commercial_functions:current.includes(key)?current.filter(v=>v!==key):[...current,key]})}
  function changeRule(userId,patch){setRuleDrafts(x=>({...x,[userId]:{...normalizeAvailabilityRule(x[userId]),...patch}}))}
  function toggleRuleDay(userId,day){const current=normalizeAvailabilityRule(ruleDrafts[userId]).active_days;changeRule(userId,{active_days:current.includes(day)?current.filter(value=>value!==day):[...current,day].sort((a,b)=>a-b)})}

  function validateRule(rule){
    if(!rule.active_days.length)return 'Selecione pelo menos um dia disponível.';
    if(timeToMinutes(rule.work_end)<=timeToMinutes(rule.work_start))return 'O fim do expediente deve ser depois do início.';
    if((rule.break_start&&!rule.break_end)||(!rule.break_start&&rule.break_end))return 'Preencha o início e o fim do intervalo, ou deixe os dois vazios.';
    if(rule.break_start&&rule.break_end&&timeToMinutes(rule.break_end)<=timeToMinutes(rule.break_start))return 'O fim do intervalo deve ser depois do início.';
    return '';
  }

  async function save(member){
    if(!isAdmin)return;
    const d=drafts[member.user_id];if(!d)return;
    const displayName=String(d.full_name||'').trim();
    if(!displayName){setNotice('Informe o nome de exibição antes de salvar este usuário.');return}
    if(member.user_id===user?.id&&!d.active){setNotice('Você não pode desativar seu próprio acesso.');return}
    const role=member.role==='owner'?'owner':d.role;
    const presenter=(d.commercial_functions||[]).includes('commercial_presentation');
    const rule=normalizeAvailabilityRule(ruleDrafts[member.user_id]);
    if(presenter){const ruleError=validateRule(rule);if(ruleError){setNotice(ruleError);return}}
    const {error}=await supabase.from('org_members').update({role,active:d.active,full_name:displayName,job_title:String(d.job_title||'').trim()||null,commercial_functions:d.commercial_functions||[],updated_at:new Date().toISOString()}).eq('organization_id',org).eq('user_id',member.user_id);
    if(error){setNotice(error.message);return}
    if(presenter){
      const {error:ruleError}=await supabase.from('presenter_availability_rules').upsert({
        organization_id:org,user_id:member.user_id,timezone:rule.timezone,active_days:rule.active_days,
        work_start:rule.work_start,work_end:rule.work_end,break_start:rule.break_start||null,break_end:rule.break_end||null,
        buffer_minutes:Number(rule.buffer_minutes),min_notice_minutes:Number(rule.min_notice_minutes),default_duration_minutes:Number(rule.default_duration_minutes)
      },{onConflict:'organization_id,user_id'});
      if(ruleError){setNotice(`As funções foram salvas, mas houve erro nas regras de agenda: ${ruleError.message}`);await refreshTeam();return}
    }
    setNotice(presenter?'Perfil, funções e regras de agenda atualizados.':'Perfil e funções comerciais atualizados.');
    await Promise.all([refreshTeam(),loadRules()]);
  }

  async function approve(p){const role=pendingRoles[p.user_id]||'member';const {error}=await supabase.rpc('admin_approve_user',{p_organization_id:org,p_user_id:p.user_id,p_role:role});if(error)setNotice(error.message);else{setNotice('Cadastro liberado. Agora você pode definir as funções comerciais desse usuário.');await Promise.all([refreshTeam(),loadPending()])}}
  const visibleTeam=useMemo(()=>team,[team]);

  if(!isManager)return <div className="page-wrap"><div className="card panel"><h2>Acesso restrito</h2><p className="muted">Esta página é exclusiva de supervisores e administradores.</p></div></div>;

  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Pessoas e acessos</div><h1>Equipe</h1><p>{isAdmin?'Veja a equipe em uma lista compacta e abra somente a pessoa que precisa configurar.':'Consulte acessos, funções e regras de agenda sem precisar percorrer cartões extensos.'}</p></div></div>{notice&&<div className="notice-bar"><span>{notice}</span><button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <section className="access-profile-grid">{ACCESS_PROFILES.map(p=><article className="card access-profile-card" key={p.role}><div className="access-profile-icon">{p.role==='admin'?<ShieldCheck/>:p.role==='supervisor'?<UserCheck/>:<Users/>}</div><div><strong>{p.title}</strong><p>{p.desc}</p></div></article>)}</section>
    <section className="card panel team-function-summary"><div className="section-title"><div><h2>Funções comerciais</h2><p className="muted">O nível de acesso controla permissões; as funções abaixo descrevem o papel de cada pessoa na operação.</p></div></div><div className="chips">{Object.entries(COMMERCIAL_FUNCTION_LABELS).map(([key,label])=><span className="badge blue" key={key}>{label}</span>)}</div></section>

    <section className="team-section">
      <div className="section-title"><div><h2>Pessoas da equipe</h2><p>{visibleTeam.length} acesso{visibleTeam.length===1?'':'s'} vinculado{visibleTeam.length===1?'':'s'} ao CRM.</p></div></div>
      <div className="team-compact-list">{visibleTeam.map(m=>{
        const d=drafts[m.user_id]||{role:m.role,active:m.active,commercial_functions:m.commercial_functions||[],full_name:m.full_name||'',job_title:m.job_title||''};
        const owner=m.role==='owner';
        const presenter=(d.commercial_functions||[]).includes('commercial_presentation');
        const rule=normalizeAvailabilityRule(ruleDrafts[m.user_id]||rules[m.user_id]);
        const expanded=expandedMember===m.user_id;
        const missingName=!String(m.full_name||'').trim();
        return <article className={`card team-member-row ${expanded?'expanded':''}`} key={m.user_id}>
          <div className="team-member-summary">
            <Avatar member={m} size={44}/>
            <div className="team-member-identity"><strong>{m.full_name||m.email||'Usuário'}</strong><span>{m.email||''}</span><small>{m.job_title||ROLE_LABELS[m.role]||m.role}</small></div>
            <div className="team-member-badges"><span className="badge">{ROLE_LABELS[m.role]||m.role}</span><span className={`badge ${m.active?'green':'red'}`}>{m.active?'Ativo':'Inativo'}</span>{missingName&&<span className="badge amber">Nome pendente</span>}{(m.commercial_functions||[]).length>0&&<span className="badge blue">{m.commercial_functions.length} função{m.commercial_functions.length===1?'':'ões'}</span>}</div>
            <button type="button" className="btn secondary small team-member-toggle" onClick={()=>setExpandedMember(expanded?'':m.user_id)}>{expanded?<><ChevronUp size={14}/> Fechar</>:<><ChevronDown size={14}/> {isAdmin?'Gerenciar':'Ver detalhes'}</>}</button>
          </div>
          {expanded&&<div className="team-member-details">
            {isAdmin?<>
              <div className="team-member-fields">
                <label>Nome de exibição<input className="input" required value={d.full_name||''} onChange={e=>changeDraft(m.user_id,{full_name:e.target.value})} placeholder="Nome e sobrenome"/></label>
                <label>Cargo / função<input className="input" value={d.job_title||''} onChange={e=>changeDraft(m.user_id,{job_title:e.target.value})} placeholder="Ex.: Prospecção comercial"/></label>
                <label>Nível de acesso{owner?<input className="input" disabled value={ROLE_LABELS.owner}/>:<select value={d.role} onChange={e=>changeDraft(m.user_id,{role:e.target.value})}>{ACCESS_PROFILES.map(p=><option value={p.role} key={p.role}>{p.title}</option>)}</select>}</label>
                <label className="team-active-control"><span>Acesso ao CRM</span><span className="team-switch-line"><input type="checkbox" checked={d.active} onChange={e=>changeDraft(m.user_id,{active:e.target.checked})}/> {d.active?'Ativo':'Inativo'}</span></label>
              </div>
              <div className="team-member-functions"><strong>Funções comerciais</strong><p className="muted">Marque somente as funções que esta pessoa realmente exerce.</p><div className="team-function-options">{Object.entries(COMMERCIAL_FUNCTION_LABELS).map(([key,label])=><label key={key}><input type="checkbox" checked={(d.commercial_functions||[]).includes(key)} onChange={()=>toggleFunction(m.user_id,key)}/><span><b>{label}</b><small>{COMMERCIAL_FUNCTION_DESCRIPTIONS[key]}</small></span></label>)}</div></div>
              {presenter&&<div className="availability-admin"><div className="availability-title"><CalendarRange size={16}/><div><strong>Regras de agenda</strong><small>Usadas antes da consulta ao Google Agenda.</small></div></div><div className="availability-days">{AVAILABILITY_DAY_OPTIONS.map(day=><label key={day.value}><input type="checkbox" checked={rule.active_days.includes(day.value)} onChange={()=>toggleRuleDay(m.user_id,day.value)}/><span>{day.label}</span></label>)}</div><div className="availability-grid"><label>Início<input type="time" className="input" value={rule.work_start} onChange={e=>changeRule(m.user_id,{work_start:e.target.value})}/></label><label>Fim<input type="time" className="input" value={rule.work_end} onChange={e=>changeRule(m.user_id,{work_end:e.target.value})}/></label><label>Intervalo de<input type="time" className="input" value={rule.break_start} onChange={e=>changeRule(m.user_id,{break_start:e.target.value})}/></label><label>Intervalo até<input type="time" className="input" value={rule.break_end} onChange={e=>changeRule(m.user_id,{break_end:e.target.value})}/></label><label>Respiro entre reuniões<select value={rule.buffer_minutes} onChange={e=>changeRule(m.user_id,{buffer_minutes:Number(e.target.value)})}><option value={0}>Sem intervalo</option><option value={10}>10 min</option><option value={15}>15 min</option><option value={20}>20 min</option><option value={30}>30 min</option></select></label><label>Antecedência mínima<select value={rule.min_notice_minutes} onChange={e=>changeRule(m.user_id,{min_notice_minutes:Number(e.target.value)})}><option value={0}>Sem mínimo</option><option value={30}>30 min</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={240}>4 horas</option><option value={1440}>1 dia</option></select></label><label>Duração padrão<select value={rule.default_duration_minutes} onChange={e=>changeRule(m.user_id,{default_duration_minutes:Number(e.target.value)})}><option value={20}>20 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hora</option></select></label></div><small className="availability-summary">{ruleSummary(rule)}</small></div>}
              {presenter&&<TeamCalendarAdmin member={{...m,full_name:d.full_name,job_title:d.job_title}}/>}
              <div className="team-member-save"><button className="btn" onClick={()=>save(m)}><Save size={14}/> Salvar alterações</button></div>
            </>:<>
              <div className="team-readonly-grid"><div><small>Nome</small><strong>{m.full_name||'Não informado'}</strong></div><div><small>E-mail</small><strong>{m.email||'—'}</strong></div><div><small>Acesso</small><strong>{ROLE_LABELS[m.role]||m.role}</strong></div><div><small>Status</small><strong>{m.active?'Ativo':'Inativo'}</strong></div></div>
              <div className="team-member-functions"><strong>Funções comerciais</strong><div className="chips">{m.commercial_functions?.length?m.commercial_functions.map(key=><span className="badge blue" key={key}>{COMMERCIAL_FUNCTION_LABELS[key]||key}</span>):<span className="muted">Nenhuma função definida</span>}</div></div>
              {m.commercial_functions?.includes('commercial_presentation')&&<div className="availability-readonly"><CalendarRange size={15}/><span><b>Agenda:</b> {ruleSummary(rule)}</span></div>}
            </>}
          </div>}
        </article>
      })}</div>
    </section>

    {isAdmin&&<section className="team-section pending-team-section"><div className="section-title"><div><h2>Cadastros aguardando liberação</h2><p>Escolha o nível de acesso; depois da liberação, defina nome e funções comerciais na lista acima.</p></div><UserPlus/></div>{loadingPending?<div className="card table-empty">Buscando cadastros…</div>:pending.length?<div className="pending-grid">{pending.map(p=><article className="card pending-card" key={p.user_id}><div><strong>{p.full_name||p.email||'Novo usuário'}</strong><span>{p.email||''}</span><small>{p.email_confirmed?'E-mail confirmado':'E-mail ainda não confirmado'}</small></div><label>Nível de acesso<select value={pendingRoles[p.user_id]||'member'} onChange={e=>setPendingRoles(x=>({...x,[p.user_id]:e.target.value}))}>{ACCESS_PROFILES.map(r=><option value={r.role} key={r.role}>{r.title}</option>)}</select></label><button className="btn" onClick={()=>approve(p)}><CheckCircle2 size={16}/> Liberar acesso</button></article>)}</div>:<div className="card empty-state"><UserPlus/><strong>Nenhum cadastro aguardando liberação.</strong><p>Novos cadastros aparecerão aqui automaticamente.</p></div>}</section>}
    <style jsx>{`.availability-admin{margin-top:12px;padding-top:12px;border-top:1px solid #eaecf0;display:grid;gap:9px}.availability-title{display:flex;gap:8px;align-items:flex-start}.availability-title>div{display:grid;gap:2px}.availability-title strong{font-size:12px}.availability-title small{font-size:10px;color:#667085}.availability-days{display:flex;gap:5px;flex-wrap:wrap}.availability-days label{cursor:pointer}.availability-days input{display:none}.availability-days span{display:block;border:1px solid #d0d5dd;border-radius:999px;padding:4px 7px;font-size:10px;color:#475467}.availability-days input:checked+span{background:#344054;color:white;border-color:#344054}.availability-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.availability-grid label{font-size:10px;color:#667085}.availability-grid input,.availability-grid select{margin-top:3px}.availability-summary{font-size:9px;line-height:1.4;color:#667085}.availability-readonly{display:flex;gap:6px;align-items:flex-start;margin-top:8px;font-size:10px;color:#667085}.calendar-admin{margin-top:12px;padding-top:12px;border-top:1px solid #eaecf0;display:grid;gap:9px}.calendar-admin-title{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:7px;align-items:start}.calendar-admin-title>div{display:grid;gap:2px}.calendar-admin-title strong{font-size:12px}.calendar-admin-title small{font-size:10px;color:#667085}.calendar-admin-title>.badge{font-size:9px}.calendar-admin-meta{display:grid;gap:3px;font-size:10px;color:#667085}.calendar-setup{display:grid;gap:7px;padding:10px;border:1px solid #eaecf0;border-radius:9px;background:#fcfcfd}.calendar-setup-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.calendar-setup textarea{font-family:monospace;font-size:9px;resize:vertical}.calendar-setup-actions{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;align-items:center}.calendar-setup>small{font-size:9px;color:#667085;line-height:1.4}.calendar-admin-actions{display:flex;gap:7px;flex-wrap:wrap}@media(max-width:650px){.availability-grid{grid-template-columns:1fr}.calendar-setup-actions{grid-template-columns:1fr}.calendar-admin-title{grid-template-columns:18px 1fr}.calendar-admin-title>.badge{grid-column:2;justify-self:start}}`}</style>
  </div>;
}
