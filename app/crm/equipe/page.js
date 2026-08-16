'use client';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Save, ShieldCheck, UserCheck, UserPlus, Users, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useCrm } from '@/components/CrmProvider';
import { ROLE_LABELS } from '@/lib/constants';

const ACCESS_PROFILES=[
  {role:'admin',title:'Administrador',desc:'Gerencia equipe e acessos, além de usar todo o CRM.'},
  {role:'supervisor',title:'Supervisor',desc:'Acompanha operação e equipe, sem administrar acessos.'},
  {role:'member',title:'Prospectador',desc:'Usa o CRM no dia a dia para prospecção, contatos e follow-ups.'},
];

export default function TeamPage(){
  const {supabase,membership,user,team,isAdmin,isManager,refreshTeam}=useCrm(); const org=membership?.organization_id;
  const [drafts,setDrafts]=useState({}); const [pending,setPending]=useState([]); const [pendingRoles,setPendingRoles]=useState({}); const [notice,setNotice]=useState(''); const [loadingPending,setLoadingPending]=useState(false);
  useEffect(()=>{setDrafts(Object.fromEntries(team.map(m=>[m.user_id,{role:m.role==='owner'?'admin':m.role,active:m.active}])))},[team]);
  async function loadPending(){if(!org||!isAdmin)return;setLoadingPending(true);const {data,error}=await supabase.rpc('admin_pending_users',{p_organization_id:org});if(error)setNotice(error.message);else{setPending(data||[]);setPendingRoles(Object.fromEntries((data||[]).map(p=>[p.user_id,'member'])))}setLoadingPending(false)}
  useEffect(()=>{loadPending()},[org,isAdmin]);
  async function save(member){if(!isAdmin)return;const d=drafts[member.user_id];if(!d)return;if(member.user_id===user?.id&&!d.active){setNotice('Você não pode desativar seu próprio acesso.');return}const {error}=await supabase.from('org_members').update({role:d.role,active:d.active,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('user_id',member.user_id);if(error)setNotice(error.message);else{setNotice('Perfil de acesso atualizado.');refreshTeam()}}
  async function approve(p){const role=pendingRoles[p.user_id]||'member';const {error}=await supabase.rpc('admin_approve_user',{p_organization_id:org,p_user_id:p.user_id,p_role:role});if(error)setNotice(error.message);else{setNotice('Cadastro liberado com sucesso.');await Promise.all([refreshTeam(),loadPending()])}}
  const visibleTeam=useMemo(()=>team.map(m=>({...m,displayRole:m.role==='owner'?'admin':m.role})),[team]);
  if(!isManager)return <div className="page-wrap"><div className="card panel"><h2>Acesso restrito</h2><p className="muted">Esta página é exclusiva de supervisores e administradores.</p></div></div>;
  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Pessoas e acessos</div><h1>Equipe</h1><p>{isAdmin?'Gerencie os perfis da equipe, atualize acessos e libere novos cadastros.':'Consulte quem faz parte da equipe e o perfil de acesso de cada pessoa.'}</p></div></div>{notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <section className="access-profile-grid">{ACCESS_PROFILES.map(p=><article className="card access-profile-card" key={p.role}><div className="access-profile-icon">{p.role==='admin'?<ShieldCheck/>:p.role==='supervisor'?<UserCheck/>:<Users/>}</div><div><strong>{p.title}</strong><p>{p.desc}</p></div></article>)}</section>
    <section className="team-section"><div className="section-title"><div><h2>Pessoas da equipe</h2><p>{visibleTeam.length} acesso{visibleTeam.length===1?'':'s'} vinculado{visibleTeam.length===1?'':'s'} ao CRM.</p></div></div><div className="team-grid team-grid-wide">{visibleTeam.map(m=>{const d=drafts[m.user_id]||{role:m.displayRole,active:m.active};return <article className="card team-card" key={m.user_id}><Avatar member={m} size={52}/><div className="team-card-main"><strong>{m.full_name||m.email||'Usuário'}</strong><span>{m.job_title||ROLE_LABELS[m.displayRole]||m.displayRole}</span><span>{m.email||''}</span>{isAdmin?<><label style={{marginTop:9}}>Perfil<select value={d.role} onChange={e=>setDrafts(x=>({...x,[m.user_id]:{...d,role:e.target.value}}))}>{ACCESS_PROFILES.map(p=><option value={p.role} key={p.role}>{p.title}</option>)}</select></label><label className="access-toggle"><input type="checkbox" checked={d.active} onChange={e=>setDrafts(x=>({...x,[m.user_id]:{...d,active:e.target.checked}}))}/> Acesso ativo</label><button className="btn secondary small" onClick={()=>save(m)}><Save size={14}/> Salvar alterações</button></>:<span className={`badge ${m.active?'green':'red'}`}>{m.active?'Ativo':'Inativo'}</span>}</div></article>})}</div></section>
    {isAdmin&&<section className="team-section"><div className="section-title"><div><h2>Cadastros aguardando liberação</h2><p>Escolha o perfil de cada novo cadastro antes de liberar o acesso.</p></div><UserPlus/></div>{loadingPending?<div className="card table-empty">Buscando cadastros…</div>:pending.length?<div className="pending-grid">{pending.map(p=><article className="card pending-card" key={p.user_id}><div><strong>{p.full_name||p.email||'Novo usuário'}</strong><span>{p.email||''}</span><small>{p.email_confirmed?'E-mail confirmado':'E-mail ainda não confirmado'}</small></div><label>Perfil<select value={pendingRoles[p.user_id]||'member'} onChange={e=>setPendingRoles(x=>({...x,[p.user_id]:e.target.value}))}>{ACCESS_PROFILES.map(r=><option value={r.role} key={r.role}>{r.title}</option>)}</select></label><button className="btn" onClick={()=>approve(p)}><CheckCircle2 size={16}/> Liberar acesso</button></article>)}</div>:<div className="card empty-state"><UserPlus/><strong>Nenhum cadastro aguardando liberação.</strong><p>Novos cadastros aparecerão aqui automaticamente.</p></div>}</section>}
  </div>;
}
