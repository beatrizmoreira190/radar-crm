'use client';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, Download, Lightbulb, MessageSquareText, Target, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PRIORITY_LABELS, RADAR_PRODUCT_LABELS, RESULT_LABELS, currency } from '@/lib/constants';

export default function ReportsPage(){
  const {supabase,membership,teamMap,activityVersion,isManager,user}=useCrm();
  const org=membership?.organization_id;
  const [summary,setSummary]=useState(null); const [days,setDays]=useState(30); const [loading,setLoading]=useState(true); const [exporting,setExporting]=useState(false); const [notice,setNotice]=useState('');

  async function load(){if(!org)return;setLoading(true);const {data,error}=await supabase.rpc('crm_report_summary',{p_organization_id:org,p_days:days});if(error)setNotice(error.message);setSummary(data||null);setLoading(false)}
  useEffect(()=>{load()},[org,days,activityVersion]);

  const personal=summary?.scope==='personal';
  const stageStats=summary?.stages||[];
  const priorityStats=useMemo(()=>Object.entries(PRIORITY_LABELS).map(([key,label])=>({key,label,count:Number((summary?.priorities||[]).find(p=>p.key===key)?.count||0)})),[summary]);
  const resultStats=(summary?.interactions?.results||[]).map(r=>({...r,label:RESULT_LABELS[r.key]||r.key}));
  const total=Number(summary?.publishers?.total||0); const contacted=Number(summary?.publishers?.contacted||0); const unassigned=Number(summary?.publishers?.unassigned||0); const avgScore=Number(summary?.publishers?.avg_score||0);
  const openOpps=Number(summary?.opportunities?.open||0); const won=Number(summary?.opportunities?.won||0); const overdue=Number(summary?.tasks?.overdue||0); const pending=Number(summary?.tasks?.pending||0);
  const maxStage=Math.max(1,...stageStats.map(x=>Number(x.count)||0)); const maxPriority=Math.max(1,...priorityStats.map(x=>x.count));
  const insights=useMemo(()=>buildInsights(summary),[summary]);

  async function fetchAllPublishers(){
    const all=[];const chunk=1000;let from=0;
    while(true){let query=supabase.from('publishers').select('id,name,trade_name,cnpj,city,state,priority,score,radar_fit_score,commercial_potential_score,data_quality_score,best_product,fit_pnld_literario,fit_pnld_didatico,fit_pnld_tecnico_metodologico,fit_radar_licitacoes,fit_radar_oportunidades,stage_id,owner_user_id,last_contact_at,next_action_at,commercial_temperature,general_email,phone,website').eq('organization_id',org).eq('archived',false);if(!isManager)query=query.eq('owner_user_id',user?.id);const {data,error}=await query.order('name').range(from,from+chunk-1);if(error)throw error;all.push(...(data||[]));if(!data||data.length<chunk)break;from+=chunk;}
    return all;
  }

  async function exportReport(){
    if(!summary||!org)return;setExporting(true);setNotice('');
    try{
      const rows=await fetchAllPublishers();
      const stageMap=Object.fromEntries(stageStats.map(s=>[s.id,s.name]));
      const lines=['sep=;'];
      const addRow=(values=[])=>lines.push(values.map(csvCell).join(';'));

      addRow([personal?'RADAR — Relatório pessoal':'RADAR — Relatório comercial','']);
      addRow(['Gerado em',new Date().toLocaleString('pt-BR')]);
      addRow(['Período de atividade',`${days} dias`]);
      addRow(['Radar Score','70% aderência aos serviços + 20% potencial comercial + 10% prospectabilidade']);
      addRow();
      addRow(['INDICADOR','VALOR']);
      addRow([personal?'Editoras na minha carteira':'Editoras ativas',total]);
      addRow(['Editoras já contatadas',contacted]);
      addRow(['Cobertura da carteira',total?`${Math.round(contacted/total*100)}%`:'0%']);
      if(!personal)addRow(['Editoras sem responsável',unassigned]);
      addRow(['Radar Score médio',avgScore]);
      addRow(['Interações no período',Number(summary.interactions?.period_total||0)]);
      addRow(['Oportunidades abertas',openOpps]);
      addRow(['Valor de oportunidades abertas',Number(summary.opportunities?.open_value||0)]);
      addRow(['Oportunidades ganhas',won]);
      addRow(['Tarefas pendentes',pending]);
      addRow(['Tarefas atrasadas',overdue]);
      addRow();
      addRow(['PIPELINE','EDITORAS']);
      stageStats.forEach(s=>addRow([s.name,Number(s.count)||0]));
      addRow();
      addRow(['PRIORIDADE','EDITORAS']);
      priorityStats.forEach(p=>addRow([p.label,p.count]));
      addRow();
      addRow(['ESTADOS COM MAIOR BASE','EDITORAS']);
      (summary.top_states||[]).forEach(s=>addRow([s.state,Number(s.count)||0]));
      addRow();
      addRow(['ANÁLISE AUTOMÁTICA']);
      insights.forEach(text=>addRow([text]));
      addRow();
      addRow(['EDITORAS']);
      addRow(['Editora','Nome fantasia','CNPJ','Cidade','UF','Etapa','Prioridade','Radar Score','Aderência Radar','Potencial comercial','Qualidade dos dados','Melhor produto','PNLD Literário','PNLD Didático','PNLD Técnico-Metodológico','Radar de Licitações','Radar de Oportunidades','Responsável','Último contato','Próxima ação','E-mail','Telefone','Site']);
      rows.forEach(p=>addRow([
        p.name,p.trade_name||'',p.cnpj||'',p.city||'',p.state||'',stageMap[p.stage_id]||'Sem etapa',PRIORITY_LABELS[p.priority]||p.priority||'',p.score??0,p.radar_fit_score??0,p.commercial_potential_score??0,p.data_quality_score??0,RADAR_PRODUCT_LABELS[p.best_product]||'',p.fit_pnld_literario??0,p.fit_pnld_didatico??0,p.fit_pnld_tecnico_metodologico??0,p.fit_radar_licitacoes??0,p.fit_radar_oportunidades??0,
        teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',
        p.last_contact_at?new Date(p.last_contact_at).toLocaleString('pt-BR'):'',
        p.next_action_at?new Date(p.next_action_at).toLocaleString('pt-BR'):'',
        p.general_email||'',p.phone||'',p.website||''
      ]));

      const blob=new Blob(['\uFEFF',lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`radar-relatorio-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
      setNotice(`Relatório CSV exportado com ${rows.length.toLocaleString('pt-BR')} editoras e os cinco índices de aderência.`);
    }catch(e){setNotice(e?.message||'Não foi possível exportar o relatório.')}finally{setExporting(false)}
  }

  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Indicadores</div><h1>Relatórios</h1><p>{personal?'Acompanhe os indicadores da sua carteira e da sua atividade comercial.':'Acompanhe os principais indicadores da operação e exporte os dados para análise.'}</p></div><div className="toolbar" style={{margin:0}}><select className="filter-select" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>Últimos 30 dias</option><option value={60}>Últimos 60 dias</option><option value={90}>Últimos 90 dias</option></select><button className="btn" onClick={exportReport} disabled={exporting||loading}><Download size={16}/>{exporting?'Preparando arquivo…':'Exportar análise (.csv)'}</button></div></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {loading?<div className="card table-empty">Calculando indicadores…</div>:<><div className="metric-grid"><Metric icon={<Building2/>} label={personal?'Minha carteira':'Base ativa'} value={total} sub={`${contacted.toLocaleString('pt-BR')} já contatadas`}/><Metric icon={<MessageSquareText/>} label={`Interações / ${days} dias`} value={summary?.interactions?.period_total||0} sub="contatos registrados"/><Metric icon={<Target/>} label="Oportunidades abertas" value={openOpps} sub={`${won} ganhas no histórico`}/><Metric icon={<BarChart3/>} label="Tarefas atrasadas" value={overdue} sub={`${pending} pendentes`}/></div>
      <section className="card panel" style={{marginBottom:16}}><div className="panel-head"><div><h2>Leitura automática</h2><p>Use estes destaques para identificar onde merece mais atenção.</p></div><Lightbulb size={20}/></div><div className="stat-list">{insights.map((text,i)=><div className="stat-row" key={i}><span>{text}</span></div>)}</div></section>
      <div className="report-grid"><section className="card panel"><div className="panel-head"><div><h2>Editoras por etapa</h2><p>Distribuição atual no pipeline</p></div></div><div className="report-bars">{stageStats.map(s=><Bar key={s.id} label={s.name} count={Number(s.count)||0} max={maxStage}/>)}</div></section><section className="card panel"><div className="panel-head"><div><h2>Prioridades</h2><p>Como {personal?'sua carteira':'a base'} está classificada</p></div></div><div className="report-bars">{priorityStats.map(s=><Bar key={s.key} label={s.label} count={s.count} max={maxPriority}/>)}</div></section><section className="card panel"><div className="panel-head"><div><h2>Resultados de contato</h2><p>Últimos {days} dias</p></div></div><div className="stat-list">{resultStats.length?resultStats.map(r=><div className="stat-row" key={r.key}><span>{r.label}</span><strong>{r.count}</strong></div>):<p className="muted">Sem interações no período.</p>}</div></section><section className="card panel"><div className="panel-head"><div><h2>Conversão e cobertura</h2><p>{personal?'Resumo da sua carteira':'Resumo da operação'}</p></div></div><div className="stat-list"><div className="stat-row"><span>Base já contatada</span><strong>{total?Math.round(contacted/total*100):0}%</strong></div><div className="stat-row"><span>Editoras sem contato</span><strong>{Math.max(0,total-contacted).toLocaleString('pt-BR')}</strong></div>{!personal&&<div className="stat-row"><span>Sem responsável</span><strong>{unassigned.toLocaleString('pt-BR')}</strong></div>}<div className="stat-row"><span>Oportunidades ganhas</span><strong>{won}</strong></div><div className="stat-row"><span>Valor em oportunidades abertas</span><strong>{currency(summary?.opportunities?.open_value||0)}</strong></div><div className="stat-row"><span>Radar Score médio</span><strong>{avgScore}</strong></div></div></section></div></>}
  </div>;
}

function csvCell(value){if(value===null||value===undefined)return '""';if(typeof value==='number'&&Number.isFinite(value))return String(value).replace('.',',');let text=String(value);if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`;}
function buildInsights(summary){if(!summary)return[];const personal=summary.scope==='personal';const total=Number(summary.publishers?.total||0);const contacted=Number(summary.publishers?.contacted||0);const unassigned=Number(summary.publishers?.unassigned||0);const coverage=total?Math.round(contacted/total*100):0;const stages=summary.stages||[];const biggest=[...stages].sort((a,b)=>Number(b.count)-Number(a.count))[0];const priorities=summary.priorities||[];const hot=priorities.filter(p=>p.key==='high'||p.key==='urgent').reduce((a,p)=>a+Number(p.count||0),0);const overdue=Number(summary.tasks?.overdue||0);const open=Number(summary.opportunities?.open||0);const interactions=Number(summary.interactions?.period_total||0);const topState=summary.top_states?.[0];const out=[];out.push(`${personal?'Cobertura da carteira':'Cobertura comercial'}: ${coverage}% ${personal?'das suas editoras':'da base'} já recebeu ao menos um contato; ${Math.max(0,total-contacted).toLocaleString('pt-BR')} ainda não têm contato registrado.`);if(biggest)out.push(`Maior concentração do pipeline: “${biggest.name}”, com ${Number(biggest.count).toLocaleString('pt-BR')} editoras (${total?Math.round(Number(biggest.count)/total*100):0}% ${personal?'da sua carteira':'da base'}).`);if(!personal)out.push(`${unassigned.toLocaleString('pt-BR')} editoras estão sem responsável definido; elas podem ser assumidas diretamente pelos prospectadores.`);if(hot)out.push(`${hot.toLocaleString('pt-BR')} editoras estão classificadas como prioridade alta ou urgente.`);out.push(overdue?`Há ${overdue.toLocaleString('pt-BR')} tarefa${overdue===1?'':'s'} atrasada${overdue===1?'':'s'} que merece${overdue===1?'':'m'} atenção.`:'Não há tarefas atrasadas no momento.');out.push(interactions?`Foram registradas ${interactions.toLocaleString('pt-BR')} interações no período selecionado e existem ${open.toLocaleString('pt-BR')} oportunidades abertas.`:`Ainda não há interações registradas no período selecionado.`);if(topState)out.push(`${topState.state} concentra a maior quantidade de editoras ${personal?'da sua carteira':'na base'} (${Number(topState.count).toLocaleString('pt-BR')}).`);return out;}
function Metric({icon,label,value,sub}){return <div className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{Number(value).toLocaleString('pt-BR')}</strong><small>{sub}</small></div></div>}
function Bar({label,count,max}){return <div className="report-bar-row"><span>{label}</span><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(count?4:0,count/max*100)}%`}}/></div><strong className="report-number">{count.toLocaleString('pt-BR')}</strong></div>}
