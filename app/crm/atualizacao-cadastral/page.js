'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseZap, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCrm } from '@/components/CrmProvider';

export default function CadastroReceitaPage(){
  const router=useRouter();
  const {supabase,membership,isAdmin}=useCrm();
  const org=membership?.organization_id;
  const [stats,setStats]=useState({loading:true,total:0,withCnpj:0,withoutCnpj:0});
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    if(membership&&!isAdmin)router.replace('/app');
  },[membership,isAdmin,router]);

  useEffect(()=>{
    if(!org||!isAdmin)return;
    let active=true;
    (async()=>{
      const [all,withCnpj]=await Promise.all([
        supabase.from('publishers').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('archived',false),
        supabase.from('publishers').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('archived',false).not('cnpj','is',null).neq('cnpj','')
      ]);
      if(!active)return;
      const total=all.count||0;
      const cnpj=withCnpj.count||0;
      setStats({loading:false,total,withCnpj:cnpj,withoutCnpj:Math.max(0,total-cnpj)});
      if(all.error||withCnpj.error)setNotice(all.error?.message||withCnpj.error?.message||'Não foi possível carregar os indicadores.');
    })();
    return()=>{active=false};
  },[org,isAdmin,supabase]);

  if(!isAdmin)return null;

  return <div className="page-wrap">
    <div className="page-head">
      <div>
        <div className="eyebrow">Administração</div>
        <h1>Atualização cadastral</h1>
        <p>Central exclusiva da administração para conferir e atualizar os dados oficiais das editoras a partir do CNPJ.</p>
      </div>
    </div>

    {notice&&<div className="notice error"><AlertTriangle size={16}/><span>{notice}</span></div>}

    <section className="card panel">
      <div className="section-title">
        <div>
          <div className="eyebrow">Base Radar</div>
          <h2 style={{margin:'4px 0'}}>Situação atual</h2>
          <p className="muted">A sincronização utilizará o CNPJ como chave e não alterará informações comerciais ou editoriais da Radar.</p>
        </div>
        <DatabaseZap size={26}/>
      </div>

      <div className="info-grid" style={{marginTop:14}}>
        <div className="info-item"><small>Editoras ativas</small><span>{stats.loading?'—':stats.total.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Com CNPJ</small><span>{stats.loading?'—':stats.withCnpj.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Sem CNPJ</small><span>{stats.loading?'—':stats.withoutCnpj.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Última sincronização</small><span>Ainda não executada</span></div>
      </div>
    </section>

    <section className="card panel" style={{marginTop:16}}>
      <div className="section-title">
        <div>
          <div className="eyebrow">Receita Federal</div>
          <h2 style={{margin:'4px 0'}}>Sincronização manual</h2>
          <p className="muted">A atualização só será iniciada quando você clicar no botão e confirmar. Não haverá execução automática.</p>
        </div>
        <ShieldCheck size={24}/>
      </div>

      <div className="notice" style={{marginTop:14}}>
        <span><b>Campos oficiais previstos:</b> razão social, nome fantasia, situação cadastral, matriz/filial, natureza jurídica, porte, capital social, CNAEs, endereço, telefone e e-mail cadastral, conforme disponibilidade da base pública.</span>
      </div>

      <div className="notice" style={{marginTop:10}}>
        <span><b>Dados protegidos:</b> perfil editorial, segmentos, score, prioridade, responsável, histórico, observações, contatos comerciais, site, redes sociais e demais informações internas da Radar não serão sobrescritos.</span>
      </div>

      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:16}}>
        <button className="btn" type="button" disabled title="O mecanismo de processamento da Receita será conectado na próxima etapa">
          <RefreshCw size={16}/> Atualizar dados pela Receita Federal
        </button>
        <span className="muted" style={{fontSize:11}}>A página administrativa está pronta; o motor de sincronização ainda será conectado antes de liberar o botão.</span>
      </div>
    </section>

    <section className="card panel" style={{marginTop:16}}>
      <div className="section-title">
        <div>
          <h2 style={{margin:'4px 0'}}>Como funcionará</h2>
          <p className="muted">Fluxo previsto para cada execução manual.</p>
        </div>
        <CheckCircle2 size={22}/>
      </div>
      <div className="info-grid" style={{marginTop:14}}>
        <div className="info-item"><small>1</small><span>Baixar a base pública mais recente</span></div>
        <div className="info-item"><small>2</small><span>Localizar os CNPJs do CRM</span></div>
        <div className="info-item"><small>3</small><span>Comparar os campos cadastrais</span></div>
        <div className="info-item"><small>4</small><span>Atualizar e registrar as mudanças</span></div>
      </div>
    </section>
  </div>;
}
