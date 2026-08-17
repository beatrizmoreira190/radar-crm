'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { supabase, SITE_URL } from '@/lib/supabase';

export default function LoginPage(){
  const router=useRouter(); const [confirmed,setConfirmed]=useState(false);
  const [mode,setMode]=useState('login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [show,setShow]=useState(false); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
  useEffect(()=>{setConfirmed(new URLSearchParams(window.location.search).get('confirmed')==='1');supabase.auth.getUser().then(({data})=>{if(data.user) router.replace('/app')});},[]);
  async function submit(e){e.preventDefault();setBusy(true);setMsg('');
    if(mode==='login'){
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error)setMsg(error.message==='Email not confirmed'?'Seu e-mail ainda não foi confirmado.':error.message); else router.replace('/app');
    } else {
      if(password.length<12){setMsg('Use uma senha com pelo menos 12 caracteres.');setBusy(false);return;}
      const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${SITE_URL}/login?confirmed=1`}});
      if(error)setMsg(error.message); else setMsg('Acesso criado. Verifique seu e-mail. Depois, um administrador da Radar precisa liberar seu perfil.');
    } setBusy(false);
  }
  return <div className="auth-page"><div className="auth-visual"><Link href="/" className="back-link"><ArrowLeft size={16}/> Voltar</Link><div><div className="brand-light">RADAR <span>—</span> CRM EDITORAS</div><h1>Inteligência comercial compartilhada.</h1><p>Antes de abordar uma editora, consulte o histórico. Depois de cada contato, registre a resposta e o próximo passo.</p></div><small><LockKeyhole size={14}/> Ambiente interno da Radar</small></div><div className="auth-form-wrap"><form className="login-card" onSubmit={submit}><div className="brand-dark">RADAR <span>—</span> CRM EDITORAS</div><h2>{mode==='login'?'Entrar no CRM':'Criar acesso'}</h2><p className="muted">{mode==='login'?'Use seu e-mail e senha de trabalho.':'A criação do acesso não libera os dados automaticamente; um administrador precisa aprovar o perfil.'}</p>{confirmed&&<div className="notice success">E-mail confirmado. Agora você já pode entrar.</div>}{msg&&<div className={`notice ${msg.includes('criado')?'success':'error'}`}>{msg}</div>}<label>E-mail<input className="input" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/></label><label>Senha<div className="password-wrap"><input className="input" type={show?'text':'password'} required minLength={mode==='login'?1:12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••••"/><button type="button" onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label><button className="btn full" disabled={busy}>{busy?'Aguarde…':mode==='login'?'Entrar':'Criar acesso'}</button><button type="button" className="link-btn" onClick={()=>{setMode(mode==='login'?'signup':'login');setMsg('')}}>{mode==='login'?'Ainda não tenho acesso':'Já tenho acesso'}</button></form></div></div>;
}
