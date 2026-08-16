'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BarChart3, Bell, BookOpenCheck, Building2, ClipboardList, FileUp, Gauge, HeartPulse, LayoutDashboard, ListChecks, LogOut, MessageSquareText, Paperclip, Target, UserCircle2, Users, Workflow } from 'lucide-react';
import { useCrm } from './CrmProvider';
import Avatar from './Avatar';

const NAV_GROUPS = [
  { label:'Trabalho do dia', items:[
    ['/app', 'Visão geral', LayoutDashboard],
    ['/app/prioridades', 'Prioridades', ListChecks],
    ['/app/tarefas', 'Minha fila', ClipboardList],
    ['/app/lembretes', 'Lembretes', Bell],
  ]},
  { label:'Prospecção', items:[
    ['/app/editoras', 'Editoras', Building2],
    ['/app/cadencias', 'Cadências', Workflow],
    ['/app/pipeline', 'Pipeline', Target],
    ['/app/modelos', 'Modelos', MessageSquareText],
    ['/app/anexos', 'Anexos', Paperclip],
  ]},
  { label:'Acompanhamento', items:[
    ['/app/desempenho', 'Desempenho', Gauge],
    ['/app/relatorios', 'Relatórios', BarChart3],
    ['/app/atividade', 'Atividade', Activity],
  ]},
  { label:'Gestão', managerOnly:true, items:[
    ['/app/qualidade', 'Qualidade da base', HeartPulse],
    ['/app/equipe', 'Equipe', Users],
  ]},
  { label:'Administração', adminOnly:true, items:[
    ['/app/importar', 'Importar', FileUp],
  ]},
  { label:'Conta e ajuda', items:[
    ['/app/perfil', 'Meu perfil', UserCircle2],
    ['/app/manual', 'Manual', BookOpenCheck],
  ]},
];

export default function CrmShell({ children }) {
  const path = usePathname(); const router = useRouter();
  const { supabase, loading, user, membership, isAdmin, isManager, activityVersion } = useCrm();
  const [unread,setUnread]=useState(0);
  async function refreshReminders(){if(!membership?.organization_id||!user?.id)return;const {data}=await supabase.rpc('crm_refresh_notifications',{p_organization_id:membership.organization_id});if(typeof data==='number')setUnread(data)}
  useEffect(()=>{if(!membership?.organization_id||!user?.id)return;refreshReminders();const onChanged=()=>refreshReminders();window.addEventListener('crm-notifications-changed',onChanged);const timer=setInterval(refreshReminders,60000);return()=>{window.removeEventListener('crm-notifications-changed',onChanged);clearInterval(timer)}},[membership?.organization_id,user?.id,activityVersion]);
  async function logout(){ await supabase.auth.signOut(); router.replace('/login'); }
  if (loading) return <div className="full-loader"><div className="spinner"/><p>Carregando RADAR - CRM EDITORAS…</p></div>;
  if (!membership) return <div className="access-pending"><div className="login-card"><div className="brand-dark">RADAR <span>—</span> CRM EDITORAS</div><h1>Acesso aguardando liberação</h1><p>Seu login existe, mas ainda não foi vinculado à equipe Radar. Peça a um administrador para liberar seu perfil.</p><button className="btn secondary" onClick={logout}>Sair</button></div></div>;
  return <div className="crm-shell">
    <aside className="sidebar">
      <Link href="/app" className="brand">RADAR <span>—</span><small>CRM EDITORAS</small></Link>
      <nav>{NAV_GROUPS.map(group=>{
        if(group.managerOnly&&!isManager)return null;
        if(group.adminOnly&&!isAdmin)return null;
        return <div className="nav-section" key={group.label}>
          <div className="nav-section-title">{group.label}</div>
          {group.items.map(([href,label,Icon])=>{
            const active=href==='/app'?path===href:path.startsWith(href);
            return <Link key={href} href={href} className={active?'active':''}><Icon size={18}/><span>{label}</span>{href==='/app/lembretes'&&unread>0&&<b className="nav-count">{unread>99?'99+':unread}</b>}</Link>;
          })}
        </div>;
      })}</nav>
      <div className="sidebar-footer">
        <Link href="/app/perfil" className="profile-link"><Avatar member={membership} size={38}/><div><strong>{membership.full_name || user?.email}</strong><small>{membership.role==='owner'||membership.role==='admin'?'Administrador':membership.role==='supervisor'?'Supervisor':'Prospectador'}</small></div></Link>
        <button className="logout-btn" onClick={logout}><LogOut size={17}/> Sair</button>
      </div>
    </aside>
    <main className="crm-main">{children}</main>
  </div>;
}
