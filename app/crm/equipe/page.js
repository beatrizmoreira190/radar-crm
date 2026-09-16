'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, Save, ShieldCheck, UserCheck, UserPlus, Users, X } from 'lucide-react';
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

  useEffect(()=>{setDrafts(Object.fromEntries(team.map(m=>[m.user_id,{role:m.role,active:m.active,commercial_functions:m.commercial_functions||[]}])) )},[team]);

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
    if(member.user_id===user?.id&&!d.active){setNotice('Você não pode desativar seu próprio acesso.');return}
    const role=member.role==='owner'?'owner':d.role;
    const presenter=(d.commercial_functions||[]).includes('commercial_presentation');
    const rule=normalizeAvailabilityRule(ruleDrafts[member.user_id]);
    if(presenter){const ruleError=validateRule(rule);if(ruleError){setNotice(ruleError);return}}
    const {error}=await supabase.from('org_members').update({role,active:d.active,commercial_functions:d.commercial_functions||[],updated_at:new Date().toISOString()}).eq('organization_id',org).eq('user_id',member.user_id);
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

  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Pessoas e acessos</div><h1>Equipe</h1><p>{isAdmin?'Gerencie separadamente o nível de acesso, as funções comerciais e a disponibilidade de quem realiza apresentações.':'Consulte quem faz parte da equipe, seu nível de acesso, funções e regras de agenda.'}</p></div></div>{notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <section className="access-profile-grid">{ACCESS_PROFILES.map(p=><article className="card access-profile-card" key={p.role}><div className="access-profile-icon">{p.role==='admin'?<ShieldCheck/>:p.role==='supervisor'?<UserCheck/>:<Users/>}</div><div><strong>{p.title}</strong><p>{p.desc}</p></div></article>)}</section>
    <section className="card panel" style={{marginBottom:18}}><div className="section-title"><div><h2>Como os perfis passam a funcionar</h2><p className="muted">O nível de acesso controla permissões gerais. As funções comerciais dizem qual papel a pessoa exerce; as regras de agenda definem quando um apresentador pode receber reuniões.</p></div></div><div className="chips">{Object.entries(COMMERCIAL_FUNCTION_LABELS).map(([key,label])=><span className="badge blue" key={key}>{label}</span>)}</div></section>
    <section className="team-section"><div className="section-title"><div><h2>Pessoas da equipe</h2><p>{visibleTeam.length} acesso{visibleTeam.length===1?'':'s'} vinculado{visibleTeam.length===1?'':'s'} ao CRM.</p></div></div><div className="team-grid team-grid-wide">{visibleTeam.map(m=>{const d=drafts[m.user_id]||{role:m.role,active:m.active,commercial_functions:m.commercial_functions||[]};const owner=m.role==='owner';const presenter=(d.commercial_functions||[]).includes('commercial_presentation');const rule=normalizeAvailabilityRule(ruleDrafts[m.user_id]||rules[m.user_id]);return <article className="card team-card" key={m.user_id}><Avatar member={m} size={52}/><div className="team-card-main"><strong>{m.full_name||m.email||'Usuário'}</strong><span>{m.job_title||ROLE_LABELS[m.role]||m.role}</span><span>{m.email||''}</span>{isAdmin?<><label style={{marginTop:9}}>Nível de acesso{owner?<input className="input" disabled value={ROLE_LABELS.owner}/>:<select value={d.role} onChange={e=>changeDraft(m.user_id,{role:e.target.value})}>{ACCESS_PROFILES.map(p=><option value={p.role} key={p.role}>{p.title}</option>)}</select>}</label><div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #eaecf0'}}><strong style={{fontSize:12}}>Funções comerciais</strong><p className="muted" style={{fontSize:11,margin:'4px 0 9px'}}>Marque somente as funções que esta pessoa realmente exerce.</p><div style={{display:'grid',gap:8}}>{Object.entries(COMMERCIAL_FUNCTION_LABELS).map(([key,label])=><label key={key} style={{display:'grid',gridTemplateColumns:'18px 1fr',gap:8,alignItems:'start',fontSize:12,cursor:'pointer'}}><input type="checkbox" checked={(d.commercial_functions||[]).includes(key)} onChange={()=>toggleFunction(m.user_id,key)} style={{marginTop:2}}/><span><b>{label}</b><small className="muted" style={{display:'block',fontSize:10,lineHeight:1.35,marginTop:2}}>{COMMERCIAL_FUNCTION_DESCRIPTIONS[key]}</small></span></label>)}</div></div>{presenter&&<div className="availability-admin"><div className="availability-title"><CalendarRange size={16}/><div><strong>Regras de agenda</strong><small>Usadas antes da consulta ao Google Agenda.</small></div></div><div className="availability-days">{AVAILABILITY_DAY_OPTIONS.map(day=><label key={day.value}><input type="checkbox" checked={rule.active_days.includes(day.value)} onChange={()=>toggleRuleDay(m.user_id,day.value)}/><span>{day.label}</span></label>)}</div><div className="availability-grid"><label>Início<input type="time" className="input" value={rule.work_start} onChange={e=>changeRule(m.user_id,{work_start:e.target.value})}/></label><label>Fim<input type="time" className="input" value={rule.work_end} onChange={e=>changeRule(m.user_id,{work_end:e.target.value})}/></label><label>Intervalo de<input type="time" className="input" value={rule.break_start} onChange={e=>changeRule(m.user_id,{break_start:e.target.value})}/></label><label>Intervalo até<input type="time" className="input" value={rule.break_end} onChange={e=>changeRule(m.user_id,{break_end:e.target.value})}/></label><label>Respiro entre reuniões<select value={rule.buffer_minutes} onChange={e=>changeRule(m.user_id,{buffer_minutes:Number(e.target.value)})}><option value={0}>Sem intervalo</option><option value={10}>10 min</option><option value={15}>15 min</option><option value={20}>20 min</option><option value={30}>30 min</option></select></label><label>Antecedência mínima<select value={rule.min_notice_minutes} onChange={e=>changeRule(m.user_id,{min_notice_minutes:Number(e.target.value)})}><option value={0}>Sem mínimo</option><option value={30}>30 min</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={240}>4 horas</option><option value={1440}>1 dia</option></select></label><label>Duração padrão<select value={rule.default_duration_minutes} onChange={e=>changeRule(m.user_id,{default_duration_minutes:Number(e.target.value)})}><option value={20}>20 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hora</option></select></label></div><small className="availability-summary">{ruleSummary(rule)}</small></div>}<label className="access-toggle"><input type="checkbox" checked={d.active} onChange={e=>changeDraft(m.user_id,{active:e.target.checked})}/> Acesso ativo</label><button className="btn secondary small" onClick={()=>save(m)}><Save size={14}/> Salvar alterações</button></>:<><div style={{marginTop:8}}><small className="muted">Funções comerciais</small><div className="chips" style={{marginTop:5}}>{m.commercial_functions?.length?m.commercial_functions.map(key=><span className="badge blue" key={key}>{COMMERCIAL_FUNCTION_LABELS[key]||key}</span>):<span className="muted" style={{fontSize:11}}>Nenhuma função definida</span>}</div></div>{m.commercial_functions?.includes('commercial_presentation')&&<div className="availability-readonly"><CalendarRange size={15}/><span><b>Agenda:</b> {ruleSummary(rule)}</span></div>}<span className={`badge ${m.active?'green':'red'}`}>{m.active?'Ativo':'Inativo'}</span></>}</div></article>})}</div></section>
    {isAdmin&&<section className="team-section"><div className="section-title"><div><h2>Cadastros aguardando liberação</h2><p>Escolha primeiro o nível de acesso. Depois da liberação, defina as funções comerciais no cartão do usuário.</p></div><UserPlus/></div>{loadingPending?<div className="card table-empty">Buscando cadastros…</div>:pending.length?<div className="pending-grid">{pending.map(p=><article className="card pending-card" key={p.user_id}><div><strong>{p.full_name||p.email||'Novo usuário'}</strong><span>{p.email||''}</span><small>{p.email_confirmed?'E-mail confirmado':'E-mail ainda não confirmado'}</small></div><label>Nível de acesso<select value={pendingRoles[p.user_id]||'member'} onChange={e=>setPendingRoles(x=>({...x,[p.user_id]:e.target.value}))}>{ACCESS_PROFILES.map(r=><option value={r.role} key={r.role}>{r.title}</option>)}</select></label><button className="btn" onClick={()=>approve(p)}><CheckCircle2 size={16}/> Liberar acesso</button></article>)}</div>:<div className="card empty-state"><UserPlus/><strong>Nenhum cadastro aguardando liberação.</strong><p>Novos cadastros aparecerão aqui automaticamente.</p></div>}</section>}
    <style jsx>{`.availability-admin{margin-top:12px;padding-top:12px;border-top:1px solid #eaecf0;display:grid;gap:9px}.availability-title{display:flex;gap:8px;align-items:flex-start}.availability-title>div{display:grid;gap:2px}.availability-title strong{font-size:12px}.availability-title small{font-size:10px;color:#667085}.availability-days{display:flex;gap:5px;flex-wrap:wrap}.availability-days label{cursor:pointer}.availability-days input{display:none}.availability-days span{display:block;border:1px solid #d0d5dd;border-radius:999px;padding:4px 7px;font-size:10px;color:#475467}.availability-days input:checked+span{background:#344054;color:white;border-color:#344054}.availability-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.availability-grid label{font-size:10px;color:#667085}.availability-grid input,.availability-grid select{margin-top:3px}.availability-summary{font-size:9px;line-height:1.4;color:#667085}.availability-readonly{display:flex;gap:6px;align-items:flex-start;margin-top:8px;font-size:10px;color:#667085}@media(max-width:650px){.availability-grid{grid-template-columns:1fr}}`}</style>
  </div>;
}
