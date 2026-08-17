'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, Building2, ClipboardCheck, Eye, EyeOff, LockKeyhole, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Landing(){
  const router=useRouter();
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [show,setShow]=useState(false); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
  useEffect(()=>{supabase.auth.getUser().then(({data})=>{if(data.user) router.replace('/app')})},[]);
  async function login(e){e.preventDefault();setBusy(true);setMsg('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setMsg(error.message==='Email not confirmed'?'Seu e-mail ainda não foi confirmado.':error.message);else router.replace('/app');setBusy(false)}
  return <main className="welcome-page">
    <section className="welcome-hero">
      <div className="welcome-brand">RADAR <span>—</span> CRM EDITORAS</div>
      <div className="welcome-copy"><div className="eyebrow">Inteligência comercial da equipe Radar</div><h1>Bem-vinda ao seu espaço de prospecção editorial.</h1><p>Centralize editoras, contatos, histórico de conversas, follow-ups, oportunidades e próximos passos em um só lugar — com contexto compartilhado para toda a equipe.</p><div className="welcome-points"><div><Building2/><span><strong>Editoras e decisores</strong><small>Informações comerciais organizadas e histórico centralizado.</small></span></div><div><ClipboardCheck/><span><strong>Follow-ups claros</strong><small>Tarefas, prazos e próximos passos sem depender de memória.</small></span></div><div><BarChart3/><span><strong>Visão do funil</strong><small>Acompanhe a evolução da prospecção e as oportunidades.</small></span></div><div><Users/><span><strong>Trabalho em equipe</strong><small>Cada ação fica contextualizada para quem continuar a conversa.</small></span></div></div></div>
      <div className="welcome-security"><LockKeyhole size={15}/> Ambiente interno e restrito à equipe Radar</div>
    </section>
    <section className="welcome-login-wrap"><form className="welcome-login-card" onSubmit={login}><div className="eyebrow">Acesso ao CRM</div><h2>Entrar</h2><p>Use seu e-mail e sua senha de trabalho.</p>{msg&&<div className="notice error">{msg}</div>}<label>E-mail<input className="input" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/></label><label>Senha<div className="password-wrap"><input className="input" type={show?'text':'password'} required minLength={1} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••••"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label="Mostrar ou ocultar senha">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label><button className="btn full welcome-submit" disabled={busy}>{busy?'Entrando…':<>Entrar no CRM <ArrowRight size={17}/></>}</button><div className="welcome-signup">Ainda não tem acesso? <Link href="/login">Criar cadastro</Link><small>Após o cadastro, um administrador libera seu perfil.</small></div></form></section>
  </main>;
}
