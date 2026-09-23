'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseZap, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCrm } from '@/components/CrmProvider';

const STATUS_LABELS={
  pending:'Na fila',
  running:'Processando',
  completed:'Concluída',
  failed:'Falhou',
  cancelled:'Cancelada',
};

function dateTime(value){
  if(!value)return '—';
  return new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

export default function CadastroReceitaPage(){
  const router=useRouter();
  const {supabase,membership,isAdmin}=useCrm();
  const org=membership?.organization_id;
  const [stats,setStats]=useState({loading:true,total:0,withCnpj:0,withoutCnpj:0});
  const [runs,setRuns]=useState([]);
  const [changes,setChanges]=useState([]);
  const [loadingRuns,setLoadingRuns]=useState(true);
  const [starting,setStarting]=useState(false);
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    if(membership&&!isAdmin)router.replace('/app');
  },[membership,isAdmin,router]);

  const loadStats=useCallback(async()=>{
    if(!org||!isAdmin)return;
    const [all,withCnpj]=await Promise.all([
      supabase.from('publishers').select('id',{count:'exact',head:true}).eq('organization_id',org),
      supabase.from('publishers').select('id',{count:'exact',head:true}).eq('organization_id',org).not('cnpj','is',null).neq('cnpj','')
    ]);
    const total=all.count||0;
    const cnpj=withCnpj.count||0;
    setStats({loading:false,total,withCnpj:cnpj,withoutCnpj:Math.max(0,total-cnpj)});
    if(all.error||withCnpj.error)setNotice(all.error?.message||withCnpj.error?.message||'Não foi possível carregar os indicadores.');
  },[org,isAdmin,supabase]);

  const loadRuns=useCallback(async()=>{
    if(!org||!isAdmin)return;
    setLoadingRuns(true);
    const {data,error}=await supabase.from('cnpj_sync_runs')
      .select('id,status,stage,progress,source_period,source_url,total_publishers,matched_publishers,updated_publishers,unchanged_publishers,not_found_publishers,error_publishers,requested_at,started_at,finished_at,message')
      .eq('organization_id',org).order('requested_at',{ascending:false}).limit(8);
    if(error){
      setNotice(error.message);
      setRuns([]);
    }else setRuns(data||[]);
    setLoadingRuns(false);
  },[org,isAdmin,supabase]);

  useEffect(()=>{loadStats();loadRuns()},[loadStats,loadRuns]);

  const activeRun=useMemo(()=>runs.find(r=>r.status==='pending'||r.status==='running')||null,[runs]);
  const lastCompleted=useMemo(()=>runs.find(r=>r.status==='completed')||null,[runs]);

  useEffect(()=>{
    if(!activeRun)return;
    const timer=setInterval(()=>loadRuns(),5000);
    return()=>clearInterval(timer);
  },[activeRun?.id,loadRuns]);

  useEffect(()=>{
    if(!lastCompleted?.id){setChanges([]);return}
    let active=true;
    (async()=>{
      const {data}=await supabase.from('cnpj_sync_changes')
        .select('id,cnpj,changed_fields,created_at,publishers(name,trade_name,legal_name)')
        .eq('run_id',lastCompleted.id).order('created_at',{ascending:false}).limit(12);
      if(active)setChanges(data||[]);
    })();
    return()=>{active=false};
  },[lastCompleted?.id,supabase]);

  async function startSync(){
    if(activeRun||starting)return;
    const ok=window.confirm(
      'Iniciar a atualização cadastral de todas as editoras com CNPJ?\n\n'+
      'O CRM comparará os dados oficiais da Receita Federal e substituirá somente os campos cadastrais correspondentes. '+
      'Dados comerciais e editoriais da Radar serão preservados.'
    );
    if(!ok)return;
    setStarting(true);setNotice('');
    const {data,error}=await supabase.rpc('crm_start_cnpj_sync',{p_organization_id:org});
    if(error)setNotice(error.message);
    else if(data?.already_running)setNotice('Já existe uma atualização cadastral em andamento.');
    else setNotice('Atualização solicitada. O processamento será iniciado pelo worker em até alguns minutos.');
    await loadRuns();
    setStarting(false);
  }

  if(!isAdmin)return null;

  return <div className="page-wrap">
    <div className="page-head">
      <div>
        <div className="eyebrow">Administração</div>
        <h1>Atualização cadastral</h1>
        <p>Central exclusiva da administração para atualizar os dados oficiais das editoras a partir do CNPJ.</p>
      </div>
    </div>

    {notice&&<div className="notice"><AlertTriangle size={16}/><span>{notice}</span></div>}

    <section className="card panel">
      <div className="section-title">
        <div>
          <div className="eyebrow">Base Radar</div>
          <h2 style={{margin:'4px 0'}}>Situação atual</h2>
          <p className="muted">O CNPJ é usado como chave. A atualização alcança todos os cadastros que possuem CNPJ, inclusive os arquivados.</p>
        </div>
        <DatabaseZap size={26}/>
      </div>

      <div className="info-grid" style={{marginTop:14}}>
        <div className="info-item"><small>Editoras cadastradas</small><span>{stats.loading?'—':stats.total.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Com CNPJ</small><span>{stats.loading?'—':stats.withCnpj.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Sem CNPJ</small><span>{stats.loading?'—':stats.withoutCnpj.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Última sincronização</small><span>{lastCompleted?dateTime(lastCompleted.finished_at):'Ainda não executada'}</span></div>
      </div>
    </section>

    <section className="card panel" style={{marginTop:16}}>
      <div className="section-title">
        <div>
          <div className="eyebrow">Receita Federal</div>
          <h2 style={{margin:'4px 0'}}>Sincronização manual</h2>
          <p className="muted">Nada roda sozinho. Uma nova atualização só é criada quando um administrador clica no botão abaixo e confirma.</p>
        </div>
        <ShieldCheck size={24}/>
      </div>

      <div className="notice" style={{marginTop:14}}>
        <span><b>Campos oficiais:</b> razão social, nome fantasia, situação cadastral e motivo, matriz/filial, natureza jurídica, porte, capital social, CNAEs, endereço, telefones, e-mail cadastral, Simples Nacional/MEI, datas cadastrais e quadro societário, conforme disponibilidade da base pública.</span>
      </div>

      <div className="notice" style={{marginTop:10}}>
        <span><b>Dados protegidos:</b> nome de exibição do CRM, perfil editorial, segmentos, score, prioridade, responsável, histórico, observações, site, redes sociais e demais informações internas da Radar não são sobrescritos.</span>
      </div>

      {activeRun&&<div className="card" style={{padding:14,marginTop:14,boxShadow:'none'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
          <div><strong>{activeRun.stage||STATUS_LABELS[activeRun.status]}</strong><p className="muted" style={{margin:'3px 0 0',fontSize:11}}>{activeRun.message||'Processamento em andamento.'}</p></div>
          <span className="badge amber">{activeRun.progress||0}%</span>
        </div>
        <div style={{height:8,background:'#f2f4f7',borderRadius:999,overflow:'hidden',marginTop:10}}>
          <div style={{height:'100%',width:`${Math.max(2,activeRun.progress||0)}%`,background:'#344054',transition:'width .3s ease'}}/>
        </div>
        <div className="chips" style={{marginTop:10}}>
          <span className="badge">{activeRun.total_publishers.toLocaleString('pt-BR')} CNPJs</span>
          {activeRun.source_period&&<span className="badge">Base {activeRun.source_period}</span>}
          {activeRun.matched_publishers>0&&<span className="badge green">{activeRun.matched_publishers.toLocaleString('pt-BR')} localizados</span>}
        </div>
      </div>}

      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:16}}>
        <button className="btn" type="button" disabled={starting||Boolean(activeRun)} onClick={startSync}>
          <RefreshCw size={16}/> {starting?'Solicitando…':activeRun?'Atualização em andamento':'Atualizar dados pela Receita Federal'}
        </button>
        <span className="muted" style={{fontSize:11}}>{activeRun?'Acompanhe o andamento acima.':'Depois do clique, o worker verifica a fila e inicia o processamento em poucos minutos.'}</span>
      </div>
    </section>

    {lastCompleted&&<section className="card panel" style={{marginTop:16}}>
      <div className="section-title">
        <div>
          <div className="eyebrow">Última execução</div>
          <h2 style={{margin:'4px 0'}}>{dateTime(lastCompleted.finished_at)}</h2>
          <p className="muted">Competência da base utilizada: <b>{lastCompleted.source_period||'—'}</b>.</p>
        </div>
        <CheckCircle2 size={24}/>
      </div>
      <div className="info-grid" style={{marginTop:14}}>
        <div className="info-item"><small>CNPJs analisados</small><span>{lastCompleted.total_publishers.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Localizados</small><span>{lastCompleted.matched_publishers.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Com alterações</small><span>{lastCompleted.updated_publishers.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Sem alterações</small><span>{lastCompleted.unchanged_publishers.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Não encontrados</small><span>{lastCompleted.not_found_publishers.toLocaleString('pt-BR')}</span></div>
        <div className="info-item"><small>Erros</small><span>{lastCompleted.error_publishers.toLocaleString('pt-BR')}</span></div>
      </div>

      {changes.length>0&&<div className="import-preview-wrap" style={{marginTop:16}}>
        <table className="data-table import-preview">
          <thead><tr><th>Editora</th><th>CNPJ</th><th>Campos alterados</th><th>Quando</th></tr></thead>
          <tbody>{changes.map(item=><tr key={item.id}>
            <td>{item.publishers?.trade_name||item.publishers?.name||item.publishers?.legal_name||'—'}</td>
            <td>{item.cnpj}</td>
            <td>{(item.changed_fields||[]).join(' · ')||'—'}</td>
            <td>{dateTime(item.created_at)}</td>
          </tr>)}</tbody>
        </table>
        <p className="muted import-preview-note">Mostrando as 12 alterações mais recentes desta execução.</p>
      </div>}
    </section>}

    <section className="card panel" style={{marginTop:16}}>
      <div className="section-title">
        <div><h2 style={{margin:'4px 0'}}>Histórico</h2><p className="muted">As últimas solicitações feitas pela administração.</p></div>
      </div>
      {loadingRuns?<div className="table-empty">Carregando histórico…</div>:runs.length?<div className="import-preview-wrap">
        <table className="data-table import-preview">
          <thead><tr><th>Solicitada em</th><th>Status</th><th>Base</th><th>Atualizadas</th><th>Não encontradas</th></tr></thead>
          <tbody>{runs.map(run=><tr key={run.id}>
            <td>{dateTime(run.requested_at)}</td>
            <td><span className={`badge ${run.status==='completed'?'green':run.status==='failed'?'red':run.status==='running'?'amber':''}`}>{STATUS_LABELS[run.status]||run.status}</span></td>
            <td>{run.source_period||'—'}</td>
            <td>{run.updated_publishers.toLocaleString('pt-BR')}</td>
            <td>{run.not_found_publishers.toLocaleString('pt-BR')}</td>
          </tr>)}</tbody>
        </table>
      </div>:<div className="table-empty">Nenhuma sincronização executada ainda.</div>}
    </section>
  </div>;
}
