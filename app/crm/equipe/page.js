'use client';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Save, ShieldCheck, UserCheck, UserPlus, Users, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useCrm } from '@/components/CrmProvider';
import { COMMERCIAL_FUNCTION_LABELS, ROLE_LABELS } from '@/lib/constants';

const ACCESS_PROFILES=[
  {role:'admin',title:'Administrador',desc:'Gerencia equipe e acessos, além de usar todo o CRM.'},
  {role:'supervisor',title:'Supervisor',desc:'Acompanha operação e equipe, sem administrar acessos.'},
  {role:'member',title:'Prospectador',desc:'Usa o CRM no dia a dia para prospecção, contatos e follow-ups.'},
];

const COMMERCIAL_FUNCTION_DESCRIPTIONS={
  prospecting:'Realiza contatos e conduz a prospecção das editoras.',
  meeting_scheduling:'Agenda apresentações e, na próxima etapa, consultará a disponibilidade dos apresentadores.',
  commercial_presentation:'Realiza apresentações comerciais e poderá disponibilizar a própria agenda para agendamento.',
  pre_meeting_materials:'Produz materiais direcionados antes das apresentações comerciais.',
  negotiation_materials:'Produz projetos, propostas e materiais específicos para apoiar negociações.'
};

export default function TeamPage(){
  const {supabase,membership,user,team,isAdmin,isManager,refreshTeam}=useCrm(); const org=membership?.organization_id;
  const [drafts,setDrafts]=useState({}); const [pending,setPending]=useState([]); const [pendingRoles,setPendingRoles]=useState({}); const [notice,setNotice]=useState(''); const [loadingPending,setLoadingPending]=useState(false);
  useEffect(()=>{setDrafts(Object.fromEntries(team.map(m=>[m.user_id,{role:m.role,active:m.active,commercial_functions:m.commercial_functions||[]}])) )},[team]);
  async function loadPending(){if(!org||!isAdmin)return;setLoadingPending(true);const {data,error}=await supabase.rpc('admin_pending_users',{p_organization_id:org});if(error)setNotice(error.message);else{setPending(data||[]);setPendingRoles(Object.fromEntries((data||[]).map(p=>[p.user_id,'member'])))}setLoadingPending(false)}
  useEffect(()=>{loadPending()},[org,isAdmin]);
  function changeDraft(userId,patch){setDrafts(x=>({...x,[userId]:{...x[userId],...patch}}))}
  function toggleFunction(userId,key){const current=drafts[userId]?.commercial_functions||[];changeDraft(userId,{commercial_functions:current.includes(key)?current.filter(v=>v!==key):[...current,key]})}
  async function save(member){
    if(!isAdmin)return;
    const d=drafts[member.user_id];if(!d)return;
    if(member.user_id===user?.id&&!d.active){setNotice('Você não pode desativar seu próprio acesso.');return}
    const role=member.role==='owner'?'owner':d.role;
    const {error}=await supabase.from('org_members').update({role,active:d.active,commercial_functions:d.commercial_functions||[],updated_at:new Date().toISOString()}).eq('organization_id',org).eq('user_id',member.user_id);
    if(error)setNotice(error.message);else{setNotice('Perfil e funções comerciais atualizados.');await refreshTeam()}
  }
  async function approve(p){const role=pendingRoles[p.user_id]||'member';const {error}=await supabase.rpc('admin_approve_user',{p_organization_id:org,p_user_id:p.user_id,p_role:role});if(error)setNotice(error.message);else{setNotice('Cadastro liberado. Agora você pode definir as funções comerciais desse usuário.');await Promise.all([refreshTeam(),loadPending()])}}
  const visibleTeam=useMemo(()=>team,[team]);
  if(!isManager)return <div className="page-wrap"><div className="card panel"><h2>Acesso restrito</h2><p className="muted">Esta página é exclusiva de supervisores e administradores.</p></div></div>;
  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Pessoas e acessos</div><h1>Equipe</h1><p>{isAdmin?'Gerencie separadamente o nível de acesso e as funções que cada pessoa exerce no fluxo comercial.':'Consulte quem faz parte da equipe, seu nível de acesso e suas funções comerciais.'}</p></div></div>{notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <section className="access-profile-grid">{ACCESS_PROFILES.map(p=><article className="card access-profile-card" key={p.role}><div className="access-profile-icon">{p.role==='admin'?<ShieldCheck/>:p.role==='supervisor'?<UserCheck/>:<Users/>}</div><div><strong>{p.title}</strong><p>{p.desc}</p></div></article>)}</section>
    <section className="card panel" style={{marginBottom:18}}><div className="section-title"><div><h2>Como os perfis passam a funcionar</h2><p className="muted">O nível de acesso controla permissões gerais. As funções comerciais dizem qual papel a pessoa exerce no processo; uma mesma pessoa pode acumular várias funções.</p></div></div><div className="chips">{Object.entries(COMMERCIAL_FUNCTION_LABELS).map(([key,label])=><span className="badge blue" key={key}>{label}</span>)}</div></section>
    <section className="team-section"><div className="section-title"><div><h2>Pessoas da equipe</h2><p>{visibleTeam.length} acesso{visibleTeam.length===1?'':'s'} vinculado{visibleTeam.length===1?'':'s'} ao CRM.</p></div></div><div className="team-grid team-grid-wide">{visibleTeam.map(m=>{const d=drafts[m.user_id]||{role:m.role,active:m.active,commercial_functions:m.commercial_functions||[]};const owner=m.role==='owner';return <article className="card team-card" key={m.user_id}><Avatar member={m} size={52}/><div className="team-card-main"><strong>{m.full_name||m.email||'Usuário'}</strong><span>{m.job_title||ROLE_LABELS[m.role]||m.role}</span><span>{m.email||''}</span>{isAdmin?<><label style={{marginTop:9}}>Nível de acesso{owner?<input className="input" disabled value={ROLE_LABELS.owner}/>:<select value={d.role} onChange={e=>changeDraft(m.user_id,{role:e.target.value})}>{ACCESS_PROFILES.map(p=><option value={p.role} key={p.role}>{p.title}</option>)}</select>}</label><div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #eaecf0'}}><strong style={{fontSize:12}}>Funções comerciais</strong><p className="muted" style={{fontSize:11,margin:'4px 0 9px'}}>Marque somente as funções que esta pessoa realmente exerce.</p><div style={{display:'grid',gap:8}}>{Object.entries(COMMERCIAL_FUNCTION_LABELS).map(([key,label])=><label key={key} style={{display:'grid',gridTemplateColumns:'18px 1fr',gap:8,alignItems:'start',fontSize:12,cursor:'pointer'}}><input type="checkbox" checked={(d.commercial_functions||[]).includes(key)} onChange={()=>toggleFunction(m.user_id,key)} style={{marginTop:2}}/><span><b>{label}</b><small className="muted" style={{display:'block',fontSize:10,lineHeight:1.35,marginTop:2}}>{COMMERCIAL_FUNCTION_DESCRIPTIONS[key]}</small></span></label>)}</div></div><label className="access-toggle"><input type="checkbox" checked={d.active} onChange={e=>changeDraft(m.user_id,{active:e.target.checked})}/> Acesso ativo</label><button className="btn secondary small" onClick={()=>save(m)}><Save size={14}/> Salvar alterações</button></>:<><div style={{marginTop:8}}><small className="muted">Funções comerciais</small><div className="chips" style={{marginTop:5}}>{m.commercial_functions?.length?m.commercial_functions.map(key=><span className="badge blue" key={key}>{COMMERCIAL_FUNCTION_LABELS[key]||key}</span>):<span className="muted" style={{fontSize:11}}>Nenhuma função definida</span>}</div></div><span className={`badge ${m.active?'green':'red'}`}>{m.active?'Ativo':'Inativo'}</span></>}</div></article>})}</div></section>
    {isAdmin&&<section className="team-section"><div className="section-title"><div><h2>Cadastros aguardando liberação</h2><p>Escolha primeiro o nível de acesso. Depois da liberação, defina as funções comerciais no cartão do usuário.</p></div><UserPlus/></div>{loadingPending?<div className="card table-empty">Buscando cadastros…</div>:pending.length?<div className="pending-grid">{pending.map(p=><article className="card pending-card" key={p.user_id}><div><strong>{p.full_name||p.email||'Novo usuário'}</strong><span>{p.email||''}</span><small>{p.email_confirmed?'E-mail confirmado':'E-mail ainda não confirmado'}</small></div><label>Nível de acesso<select value={pendingRoles[p.user_id]||'member'} onChange={e=>setPendingRoles(x=>({...x,[p.user_id]:e.target.value}))}>{ACCESS_PROFILES.map(r=><option value={r.role} key={r.role}>{r.title}</option>)}</select></label><button className="btn" onClick={()=>approve(p)}><CheckCircle2 size={16}/> Liberar acesso</button></article>)}</div>:<div className="card empty-state"><UserPlus/><strong>Nenhum cadastro aguardando liberação.</strong><p>Novos cadastros aparecerão aqui automaticamente.</p></div>}</section>}
  </div>;
}
