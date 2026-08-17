'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AcceptInvite(){
  const router=useRouter(); const [user,setUser]=useState(null); const [name,setName]=useState(''); const [job,setJob]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(true); const [msg,setMsg]=useState('');
  useEffect(()=>{const timer=setTimeout(async()=>{const {data}=await supabase.auth.getSession();setUser(data.session?.user||null);setBusy(false);},500);return()=>clearTimeout(timer)},[]);
  async function save(e){e.preventDefault();setBusy(true);setMsg('');if(!user){setMsg('Não foi possível identificar o convite. Abra novamente o link enviado por e-mail.');setBusy(false);return;}if(password.length<12){setMsg('Use uma senha com pelo menos 12 caracteres.');setBusy(false);return;}const {error:uerr}=await supabase.auth.updateUser({password});if(uerr){setMsg(uerr.message);setBusy(false);return;}const {error:merr}=await supabase.from('org_members').update({full_name:name,job_title:job||null,updated_at:new Date().toISOString()}).eq('user_id',user.id);if(merr){setMsg(merr.message);setBusy(false);return;}router.replace('/app');}
  return <div className="auth-page simple"><form className="login-card" onSubmit={save}><div className="brand-dark">RADAR <span>—</span> CRM EDITORAS</div><h2>Concluir seu acesso</h2><p className="muted">Defina seu perfil e uma senha para entrar no CRM.</p>{msg&&<div className="notice error">{msg}</div>}<label>Nome completo<input className="input" required value={name} onChange={e=>setName(e.target.value)}/></label><label>Cargo / função<input className="input" value={job} onChange={e=>setJob(e.target.value)} placeholder="Ex.: Prospecção comercial"/></label><label>Nova senha<input className="input" type="password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 12 caracteres"/></label><button className="btn full" disabled={busy}>{busy?'Aguarde…':'Ativar meu acesso'}</button></form></div>;
}
