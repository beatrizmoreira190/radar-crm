'use client';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, Download, Lightbulb, MessageSquareText, Target, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PRIORITY_LABELS, RESULT_LABELS, currency } from '@/lib/constants';

export default function ReportsPage(){
  const {supabase,membership,teamMap,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [summary,setSummary]=useState(null); const [days,setDays]=useState(30); const [loading,setLoading]=useState(true); const [exporting,setExporting]=useState(false); const [notice,setNotice]=useState('');

  async function load(){if(!org)return;setLoading(true);const {data,error}=await supabase.rpc('crm_report_summary',{p_organization_id:org,p_days:days});if(error)setNotice(error.message);setSummary(data||null);setLoading(false)}
  useEffect(()=>{load()},[org,days,activityVersion]);

  const stageStats=summary?.stages||[];
  const priorityStats=useMemo(()=>Object.entries(PRIORITY_LABELS).map(([key,label])=>({key,label,count:Number((summary?.priorities||[]).find(p=>p.key===key)?.count||0)})),[summary]);
  const resultStats=(summary?.interactions?.results||[]).map(r=>({...r,label:RESULT_LABELS[r.key]||r.key}));
  const total=Number(summary?.publishers?.total||0); const contacted=Number(summary?.publishers?.contacted||0); const unassigned=Number(summary?.publishers?.unassigned||0); const avgScore=Number(summary?.publishers?.avg_score||0);
  const openOpps=Number(summary?.opportunities?.open||0); const won=Number(summary?.opportunities?.won||0); const overdue=Number(summary?.tasks?.overdue||0); const pending=Number(summary?.tasks?.pending||0);
  const maxStage=Math.max(1,...stageStats.map(x=>Number(x.count)||0)); const maxPriority=Math.max(1,...priorityStats.map(x=>x.count));
  const insights=useMemo(()=>buildInsights(summary),[summary]);

  async function fetchAllPublishers(){
    const all=[];const chunk=1000;let from=0;
    while(true){const {data,error}=await supabase.from('publishers').select('id,name,trade_name,cnpj,city,state,priority,score,stage_id,owner_user_id,last_contact_at,next_action_at,commercial_temperature,general_email,phone,website').eq('organization_id',org).eq('archived',false).order('name').range(from,from+chunk-1);if(error)throw error;all.push(...(data||[]));if(!data||data.length<chunk)break;from+=chunk;}
    return all;
  }

  async function exportReport(){
    if(!summary||!org)return;setExporting(true);setNotice('');
    try{
      const [rows,mod]=await Promise.all([fetchAllPublishers(),import('exceljs')]);
      const ExcelJS=mod.default||mod; const wb=new ExcelJS.Workbook(); wb.creator='RADAR CRM'; wb.created=new Date();
      const stageMap=Object.fromEntries(stageStats.map(s=>[s.id,s.name]));

      const ws=wb.addWorksheet('Resumo executivo'); ws.columns=[{width:34},{width:24}];
      ws.addRow(['RADAR — Relatório comercial','']); ws.addRow(['Gerado em',new Date().toLocaleString('pt-BR')]); ws.addRow(['Período de atividade',`${days} dias`]); ws.addRow([]);
      ws.addRow(['INDICADOR','VALOR']); ws.addRow(['Editoras ativas',total]); ws.addRow(['Editoras já contatadas',contacted]); ws.addRow(['Cobertura da base',total?`${Math.round(contacted/total*100)}%`:'0%']); ws.addRow(['Editoras sem responsável',unassigned]); ws.addRow(['Radar Score médio',avgScore]); ws.addRow(['Interações no período',Number(summary.interactions?.period_total||0)]); ws.addRow(['Oportunidades abertas',openOpps]); ws.addRow(['Valor de oportunidades abertas',Number(summary.opportunities?.open_value||0)]); ws.addRow(['Oportunidades ganhas',won]); ws.addRow(['Tarefas pendentes',pending]); ws.addRow(['Tarefas atrasadas',overdue]);
      ws.addRow([]);ws.addRow(['PIPELINE','EDITORAS']);stageStats.forEach(s=>ws.addRow([s.name,Number(s.count)||0]));
      ws.addRow([]);ws.addRow(['PRIORIDADE','EDITORAS']);priorityStats.forEach(p=>ws.addRow([p.label,p.count]));
      ws.addRow([]);ws.addRow(['ESTADOS COM MAIOR BASE','EDITORAS']);(summary.top_states||[]).forEach(s=>ws.addRow([s.state,Number(s.count)||0]));
      ws.getRow(1).font={bold:true,size:16}; [5,17,17+stageStats.length+2,17+stageStats.length+priorityStats.length+4].forEach(n=>{if(ws.getRow(n))ws.getRow(n).font={bold:true}});

      const wi=wb.addWorksheet('Análise');wi.columns=[{header:'Leitura automática dos dados',key:'text',width:110}];insights.forEach(x=>wi.addRow({text:x}));wi.getRow(1).font={bold:true};wi.views=[{state:'frozen',ySplit:1}];

      const wd=wb.addWorksheet('Editoras');wd.columns=[
        {header:'Editora',key:'name',width:38},{header:'Nome fantasia',key:'trade_name',width:28},{header:'CNPJ',key:'cnpj',width:18},{header:'Cidade',key:'city',width:22},{header:'UF',key:'state',width:8},{header:'Etapa',key:'stage',width:25},{header:'Prioridade',key:'priority',width:14},{header:'Score',key:'score',width:10},{header:'Responsável',key:'owner',width:28},{header:'Último contato',key:'last_contact',width:20},{header:'Próxima ação',key:'next_action',width:20},{header:'E-mail',key:'email',width:30},{header:'Telefone',key:'phone',width:18},{header:'Site',key:'website',width:32}
      ];
      rows.forEach(p=>wd.addRow({name:p.name,trade_name:p.trade_name||'',cnpj:p.cnpj||'',city:p.city||'',state:p.state||'',stage:stageMap[p.stage_id]||'Sem etapa',priority:PRIORITY_LABELS[p.priority]||p.priority||'',score:p.score??0,owner:teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',last_contact:p.last_contact_at?new Date(p.last_contact_at).toLocaleString('pt-BR'):'',next_action:p.next_action_at?new Date(p.next_action_at).toLocaleString('pt-BR'):'',email:p.general_email||'',phone:p.phone||'',website:p.website||''}));
      wd.getRow(1).font={bold:true};wd.views=[{state:'frozen',ySplit:1}];wd.autoFilter={from:'A1',to:'N1'};

      const buffer=await wb.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`radar-relatorio-${new Date().toISOString().slice(0,10)}.xlsx`;a.click();URL.revokeObjectURL(url);setNotice(`Relatório exportado com ${rows.length.toLocaleString('pt-BR')} editoras.`);
    }catch(e){setNotice(e?.message||'Não foi possível exportar o relatório.')}finally{setExporting(false)}
  }

  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Indicadores</div><h1>Relatórios</h1><p>Acompanhe os principais indicadores da operação e exporte os dados para análise.</p></div><div className="toolbar" style={{margin:0}}><select className="filter-select" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>Últimos 30 dias</option><option value={60}>Últimos 60 dias</option><option value={90}>Últimos 90 dias</option></select><button className="btn" onClick={exportReport} disabled={exporting||loading}><Download size={16}/>{exporting?'Preparando arquivo…':'Exportar análise (.xlsx)'}</button></div></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {loading?<div className="card table-empty">Calculando indicadores sobre toda a base…</div>:<><div className="metric-grid"><Metric icon={<Building2/>} label="Base ativa" value={total} sub={`${contacted.toLocaleString('pt-BR')} já contatadas`}/><Metric icon={<MessageSquareText/>} label={`Interações / ${days} dias`} value={summary?.interactions?.period_total||0} sub="contatos registrados"/><Metric icon={<Target/>} label="Oportunidades abertas" value={openOpps} sub={`${won} ganhas no histórico`}/><Metric icon={<BarChart3/>} label="Tarefas atrasadas" value={overdue} sub={`${pending} pendentes`}/></div>
      <section className="card panel" style={{marginBottom:16}}><div className="panel-head"><div><h2>Leitura automática</h2><p>Use estes destaques para identificar onde a operação precisa de mais atenção.</p></div><Lightbulb size={20}/></div><div className="stat-list">{insights.map((text,i)=><div className="stat-row" key={i}><span>{text}</span></div>)}</section>
      <div className="report-grid"><section className="card panel"><div className="panel-head"><div><h2>Editoras por etapa</h2><p>Distribuição atual no pipeline</p></div></div><div className="report-bars">{stageStats.map(s=><Bar key={s.id} label={s.name} count={Number(s.count)||0} max={maxStage}/>)}</div></section><section className="card panel"><div className="panel-head"><div><h2>Prioridades</h2><p>Como a base está classificada</p></div></div><div className="report-bars">{priorityStats.map(s=><Bar key={s.key} label={s.label} count={s.count} max={maxPriority}/>)}</div></section><section className="card panel"><div className="panel-head"><div><h2>Resultados de contato</h2><p>Últimos {days} dias</p></div></div><div className="stat-list">{resultStats.length?resultStats.map(r=><div className="stat-row" key={r.key}><span>{r.label}</span><strong>{r.count}</strong></div>):<p className="muted">Sem interações no período.</p>}</div></section><section className="card panel"><div className="panel-head"><div><h2>Conversão e cobertura</h2><p>Resumo da operação</p></div></div><div className="stat-list"><div className="stat-row"><span>Base já contatada</span><strong>{total?Math.round(contacted/total*100):0}%</strong></div><div className="stat-row"><span>Editoras sem contato</span><strong>{(total-contacted).toLocaleString('pt-BR')}</strong></div><div className="stat-row"><span>Sem responsável</span><strong>{unassigned.toLocaleString('pt-BR')}</strong></div><div className="stat-row"><span>Oportunidades ganhas</span><strong>{won}</strong></div><div className="stat-row"><span>Valor em oportunidades abertas</span><strong>{currency(summary?.opportunities?.open_value||0)}</strong></div><div className="stat-row"><span>Radar Score médio</span><strong>{avgScore}</strong></div></div></section></div></>}
  </div>;
}

function buildInsights(summary){if(!summary)return[];const total=Number(summary.publishers?.total||0);const contacted=Number(summary.publishers?.contacted||0);const unassigned=Number(summary.publishers?.unassigned||0);const coverage=total?Math.round(contacted/total*100):0;const stages=summary.stages||[];const biggest=[...stages].sort((a,b)=>Number(b.count)-Number(a.count))[0];const priorities=summary.priorities||[];const hot=priorities.filter(p=>p.key==='high'||p.key==='urgent').reduce((a,p)=>a+Number(p.count||0),0);const overdue=Number(summary.tasks?.overdue||0);const open=Number(summary.opportunities?.open||0);const interactions=Number(summary.interactions?.period_total||0);const topState=summary.top_states?.[0];const out=[];out.push(`Cobertura comercial: ${coverage}% da base já recebeu ao menos um contato; ${(total-contacted).toLocaleString('pt-BR')} editoras ainda não têm contato registrado.`);if(biggest)out.push(`Maior concentração do pipeline: “${biggest.name}”, com ${Number(biggest.count).toLocaleString('pt-BR')} editoras (${total?Math.round(Number(biggest.count)/total*100):0}% da base).`);out.push(`${unassigned.toLocaleString('pt-BR')} editoras estão sem responsável definido; elas podem ser assumidas diretamente pelos prospectadores.`);if(hot)out.push(`${hot.toLocaleString('pt-BR')} editoras estão classificadas como prioridade alta ou urgente.`);out.push(overdue?`Há ${overdue.toLocaleString('pt-BR')} tarefa${overdue===1?'':'s'} atrasada${overdue===1?'':'s'} que merece${overdue===1?'':'m'} atenção.`:'Não há tarefas atrasadas no momento.');out.push(interactions?`Foram registradas ${interactions.toLocaleString('pt-BR')} interações no período selecionado e existem ${open.toLocaleString('pt-BR')} oportunidades abertas.`:`Ainda não há interações registradas no período selecionado; os indicadores de resultado ganharão valor conforme a equipe registrar os contatos.`);if(topState)out.push(`${topState.state} concentra a maior quantidade de editoras na base (${Number(topState.count).toLocaleString('pt-BR')}).`);return out;}
function Metric({icon,label,value,sub}){return <div className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{Number(value).toLocaleString('pt-BR')}</strong><small>{sub}</small></div></div>}
function Bar({label,count,max}){return <div className="report-bar-row"><span>{label}</span><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(count?4:0,count/max*100)}%`}}/></div><strong className="report-number">{count.toLocaleString('pt-BR')}</strong></div>}
