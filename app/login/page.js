'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { supabase, SITE_URL } from '@/lib/supabase';

export default function LoginPage(){
  const router=useRouter();
  const [confirmed,setConfirmed]=useState(false);
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [passwordConfirm,setPasswordConfirm]=useState('');
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [msgType,setMsgType]=useState('');

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setConfirmed(params.get('confirmed')==='1');
    const recoveryLink=window.location.hash.includes('type=recovery')||params.get('type')==='recovery';
    if(recoveryLink)setMode('recovery');

    const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{
      if(event==='PASSWORD_RECOVERY'){
        setMode('recovery');
        setMsg('');
        setMsgType('');
      }
    });

    supabase.auth.getUser().then(({data})=>{
      if(data.user&&!recoveryLink)router.replace('/app');
    });

    return()=>subscription.unsubscribe();
  },[router]);

  function switchMode(next){
    setMode(next);setMsg('');setMsgType('');setPassword('');setPasswordConfirm('');
  }

  async function submit(e){
    e.preventDefault();setBusy(true);setMsg('');setMsgType('');

    if(mode==='login'){
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error){setMsg(error.message==='Email not confirmed'?'Seu e-mail ainda não foi confirmado.':error.message);setMsgType('error')}
      else router.replace('/app');
    }else if(mode==='signup'){
      if(password.length<12){setMsg('Use uma senha com pelo menos 12 caracteres.');setMsgType('error');setBusy(false);return}
      const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${SITE_URL}/login?confirmed=1`}});
      if(error){setMsg(error.message);setMsgType('error')}
      else{setMsg('Acesso criado. Verifique seu e-mail. Depois, um administrador da Radar precisa liberar seu perfil.');setMsgType('success')}
    }else if(mode==='forgot'){
      const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${SITE_URL}/login`});
      if(error){setMsg(error.message);setMsgType('error')}
      else{setMsg('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');setMsgType('success')}
    }else if(mode==='recovery'){
      if(password.length<12){setMsg('Use uma senha com pelo menos 12 caracteres.');setMsgType('error');setBusy(false);return}
      if(password!==passwordConfirm){setMsg('As duas senhas precisam ser iguais.');setMsgType('error');setBusy(false);return}
      const {error}=await supabase.auth.updateUser({password});
      if(error){setMsg(error.message);setMsgType('error')}
      else{
        await supabase.auth.signOut();
        window.history.replaceState({},'', '/login');
        setPassword('');setPasswordConfirm('');
        setMode('login');
        setMsg('Senha atualizada. Entre novamente com a nova senha.');
        setMsgType('success');
      }
    }
    setBusy(false);
  }

  const title=mode==='login'?'Entrar no CRM':mode==='signup'?'Criar acesso':mode==='forgot'?'Recuperar senha':'Definir nova senha';
  const subtitle=mode==='login'?'Use seu e-mail e senha de trabalho.':
    mode==='signup'?'A criação do acesso não libera os dados automaticamente; um administrador precisa aprovar o perfil.':
    mode==='forgot'?'Informe seu e-mail de trabalho para receber o link de recuperação.':
    'Crie uma nova senha com pelo menos 12 caracteres.';

  return <div className="auth-page">
    <div className="auth-visual">
      <Link href="/" className="back-link"><ArrowLeft size={16}/> Voltar</Link>
      <div><div className="brand-light">RADAR <span>—</span> CRM EDITORAS</div><h1>Inteligência comercial compartilhada.</h1><p>Antes de abordar uma editora, consulte o histórico. Depois de cada contato, registre a resposta e o próximo passo.</p></div>
      <small><LockKeyhole size={14}/> Ambiente interno da Radar</small>
    </div>
    <div className="auth-form-wrap"><form className="login-card" onSubmit={submit}>
      <div className="brand-dark">RADAR <span>—</span> CRM EDITORAS</div>
      <h2>{title}</h2>
      <p className="muted">{subtitle}</p>
      {confirmed&&mode==='login'&&<div className="notice success">E-mail confirmado. Agora você já pode entrar.</div>}
      {msg&&<div className={`notice ${msgType==='success'?'success':'error'}`}>{msg}</div>}

      {mode!=='recovery'&&<label>E-mail<input className="input" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/></label>}

      {(mode==='login'||mode==='signup'||mode==='recovery')&&<label>{mode==='recovery'?'Nova senha':'Senha'}<div className="password-wrap">
        <input className="input" type={show?'text':'password'} required minLength={mode==='login'?1:12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••••"/>
        <button type="button" onClick={()=>setShow(v=>!v)} aria-label="Mostrar ou ocultar senha">{show?<EyeOff size={17}/>:<Eye size={17}/>}</button>
      </div></label>}

      {mode==='recovery'&&<label>Confirmar nova senha<input className="input" type={show?'text':'password'} required minLength={12} value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} placeholder="••••••••••••"/></label>}

      <button className="btn full" disabled={busy}>{busy?'Aguarde…':mode==='login'?'Entrar':mode==='signup'?'Criar acesso':mode==='forgot'?'Enviar link de recuperação':'Salvar nova senha'}</button>

      {mode==='login'&&<><button type="button" className="link-btn" onClick={()=>switchMode('forgot')}>Esqueci minha senha</button><button type="button" className="link-btn" onClick={()=>switchMode('signup')}>Ainda não tenho acesso</button></>}
      {mode==='signup'&&<button type="button" className="link-btn" onClick={()=>switchMode('login')}>Já tenho acesso</button>}
      {mode==='forgot'&&<button type="button" className="link-btn" onClick={()=>switchMode('login')}>Voltar ao login</button>}
    </form></div>
  </div>;
}
