'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BarChart3, BookOpenCheck, Building2, ClipboardList, LayoutDashboard, LogOut, MessageSquareText, Target, UserCircle2, Users } from 'lucide-react';
import { useCrm } from './CrmProvider';
import Avatar from './Avatar';

const NAV = [
  ['/app', 'Visão geral', LayoutDashboard],
  ['/app/tarefas', 'Minha fila', ClipboardList],
  ['/app/editoras', 'Editoras', Building2],
  ['/app/pipeline', 'Pipeline', Target],
  ['/app/atividade', 'Atividade', Activity],
  ['/app/relatorios', 'Relatórios', BarChart3],
  ['/app/modelos', 'Modelos', MessageSquareText],
  ['/app/equipe', 'Equipe', Users],
  ['/app/perfil', 'Meu perfil', UserCircle2],
  ['/app/manual', 'Manual', BookOpenCheck],
];

export default function CrmShell({ children }) {
  const path = usePathname(); const router = useRouter();
  const { loading, user, membership, isAdmin } = useCrm();
  async function logout(){ const { supabase } = await import('@/lib/supabase'); await supabase.auth.signOut(); router.replace('/login'); }
  if (loading) return <div className="full-loader"><div className="spinner"/><p>Carregando RADAR - CRM EDITORAS…</p></div>;
  if (!membership) return <div className="access-pending"><div className="login-card"><div className="brand-dark">RADAR <span>—</span> CRM EDITORAS</div><h1>Acesso aguardando liberação</h1><p>Seu login existe, mas ainda não foi vinculado à equipe Radar. Peça a um administrador para liberar seu perfil.</p><button className="btn secondary" onClick={logout}>Sair</button></div></div>;
  return <div className="crm-shell">
    <aside className="sidebar">
      <Link href="/app" className="brand">RADAR <span>—</span><small>CRM EDITORAS</small></Link>
      <nav>{NAV.map(([href,label,Icon]) => {
        if (href === '/app/equipe' && !isAdmin && membership.role !== 'supervisor') return null;
        const active = href === '/app' ? path === href : path.startsWith(href);
        return <Link key={href} href={href} className={active?'active':''}><Icon size={18}/><span>{label}</span></Link>;
      })}</nav>
      <div className="sidebar-footer">
        <Link href="/app/perfil" className="profile-link"><Avatar member={membership} size={38}/><div><strong>{membership.full_name || user?.email}</strong><small>{membership.role==='owner'||membership.role==='admin'?'Administrador':membership.role==='supervisor'?'Supervisor':'Prospectador'}</small></div></Link>
        <button className="logout-btn" onClick={logout}><LogOut size={17}/> Sair</button>
      </div>
    </aside>
    <main className="crm-main">{children}</main>
  </div>;
}
