'use client';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, Download, Lightbulb, MessageSquareText, Target, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { CHANNEL_LABELS, INTEREST_LABELS, OPPORTUNITY_STAGE_LABELS, PRIORITY_LABELS, RADAR_PRODUCT_LABELS, RESULT_LABELS, TASK_TYPE_LABELS, currency } from '@/lib/constants';
import { XLSX_STYLE, downloadXlsx, xcell } from '@/lib/xlsxExport';

const TASK_STATUS_LABELS={open:'Aberta',in_progress:'Em andamento',done:'Concluída',cancelled:'Cancelada'};
const DIRECTION_LABELS={outbound:'Saída',inbound:'Entrada'};
const PIPELINE_TYPE_LABELS={open:'Em aberto',won:'Cliente',nurture:'Nutrição',lost:'Encerrada'};

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

  async function fetchPaged(makeQuery){
    const all=[];const chunk=1000;let from=0;
    while(true){
      const {data,error}=await makeQuery().range(from,from+chunk-1);
      if(error)throw error;
      all.push(...(data||[]));
      if(!data||data.length<chunk)break;
      from+=chunk;
    }
    return all;
  }

  async function fetchAllPublishers(){
    return fetchPaged(()=>{
      let query=supabase.from('publishers').select('id,name,trade_name,cnpj,city,state,priority,score,radar_fit_score,commercial_potential_score,data_quality_score,best_product,fit_pnld_literario,fit_pnld_didatico,fit_pnld_tecnico_metodologico,fit_radar_licitacoes,fit_radar_oportunidades,stage_id,owner_user_id,last_contact_at,next_action_at,commercial_temperature,general_email,phone,website').eq('organization_id',org).eq('archived',false);
      if(!isManager)query=query.eq('owner_user_id',user?.id);
      return query.order('name');
    });
  }

  async function fetchInteractions(){
    const since=new Date(Date.now()-days*86400000).toISOString();
    return fetchPaged(()=>{
      let query=supabase.from('interactions').select('id,publisher_id,user_id,occurred_at,channel,direction,result,subject,summary,response_summary,opportunity_signal,next_step,next_action_at,interest_level,priority,contact_name_snapshot,duration_minutes,publishers(name)').eq('organization_id',org).gte('occurred_at',since);
      if(!isManager)query=query.eq('user_id',user?.id);
      return query.order('occurred_at',{ascending:false});
    });
  }

  async function fetchOpportunities(){
    return fetchPaged(()=>{
      let query=supabase.from('opportunities').select('id,publisher_id,owner_user_id,created_by,title,service_type,description,stage,estimated_value,probability,expected_close_date,loss_reason,next_step,next_action_at,created_at,updated_at,publishers(name)').eq('organization_id',org);
      if(!isManager)query=query.or(`owner_user_id.eq.${user?.id},created_by.eq.${user?.id}`);
      return query.order('updated_at',{ascending:false});
    });
  }

  async function fetchTasks(){
    const since=new Date(Date.now()-days*86400000).toISOString();
    return fetchPaged(()=>{
      let query=supabase.from('tasks').select('id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,completed_at,created_at,cadence_enrollment_id,automation_key,result_code,result_note,publishers(name)').eq('organization_id',org).or(`status.eq.open,status.eq.in_progress,completed_at.gte.${since}`);
      if(!isManager)query=query.or(`assigned_to.eq.${user?.id},created_by.eq.${user?.id}`);
      return query.order('due_at',{ascending:true,nullsFirst:false});
    });
  }

  async function exportReport(){
    if(!summary||!org)return;setExporting(true);setNotice('');
    try{
      const [publishers,interactions,opportunities,tasks]=await Promise.all([
        fetchAllPublishers(),fetchInteractions(),fetchOpportunities(),fetchTasks()
      ]);
      const S=XLSX_STYLE;
      const stageMap=Object.fromEntries(stageStats.map(s=>[s.id,s.name]));
      const header=values=>values.map(value=>xcell(value,S.header));
      const int=value=>xcell(Number(value)||0,S.integer,'number');
      const decimal=value=>xcell(Number(value)||0,S.decimal,'number');
      const percent=value=>xcell(Number(value)||0,S.percent,'number');
      const money=value=>xcell(Number(value)||0,S.currency,'number');
      const dt=value=>value?xcell(new Date(value),S.datetime,'datetime'):'';
      const date=value=>value?xcell(new Date(value),S.date,'date'):'';
      const wrap=value=>xcell(value||'',S.wrap);
      const generatedAt=new Date();

      const summaryRows=[];const summaryMerges=[];
      const merged=(text,style=S.section)=>{const row=summaryRows.length+1;summaryRows.push([xcell(text,style),'','','']);summaryMerges.push(`A${row}:D${row}`);};
      merged(personal?'RADAR — Relatório pessoal':'RADAR — Relatório comercial',S.title);
      summaryRows.push([xcell('Escopo',S.meta),personal?'Minha carteira':'Operação comercial',xcell('Período',S.meta),`Últimos ${days} dias`]);
      summaryRows.push([xcell('Gerado em',S.meta),dt(generatedAt),xcell('Editoras exportadas',S.meta),int(publishers.length)]);
      summaryRows.push([]);
      merged('INDICADORES');
      summaryRows.push(header(['Indicador','Valor','Leitura','']));
      summaryRows.push([personal?'Editoras na minha carteira':'Editoras ativas',int(total),`${contacted.toLocaleString('pt-BR')} já contatadas`,'']);
      summaryRows.push(['Editoras já contatadas',int(contacted),'Contas com ao menos um contato registrado','']);
      summaryRows.push(['Cobertura da carteira',percent(total?contacted/total:0),`${Math.max(0,total-contacted).toLocaleString('pt-BR')} ainda sem contato`,'']);
      if(!personal)summaryRows.push(['Editoras sem responsável',int(unassigned),'Disponíveis para distribuição/assunção','']);
      summaryRows.push(['Radar Score médio',decimal(avgScore),'Média da base no escopo do relatório','']);
      summaryRows.push([`Interações / ${days} dias`,int(Number(summary.interactions?.period_total||0)),'Contatos registrados no período','']);
      summaryRows.push(['Oportunidades abertas',int(openOpps),'Negociações ainda em andamento','']);
      summaryRows.push(['Valor de oportunidades abertas',money(summary.opportunities?.open_value||0),'Soma dos valores estimados','']);
      summaryRows.push(['Oportunidades ganhas',int(won),'Histórico acumulado','']);
      summaryRows.push(['Tarefas pendentes',int(pending),'Abertas ou em andamento','']);
      summaryRows.push(['Tarefas atrasadas',int(overdue),'Prazo anterior ao momento da exportação','']);
      summaryRows.push([]);
      merged('LEITURA AUTOMÁTICA');
      insights.forEach(text=>{const row=summaryRows.length+1;summaryRows.push([wrap(text),'','','']);summaryMerges.push(`A${row}:D${row}`);});
      summaryRows.push([]);
      merged('ESTADOS COM MAIOR BASE');
      summaryRows.push(header(['UF','Editoras','','']));
      (summary.top_states||[]).forEach(s=>summaryRows.push([s.state,int(s.count),'','']));

      const pipelineRows=[
        [xcell('Pipeline',S.title),'',''],
        [wrap('Distribuição atual das editoras pelas etapas do funil.'),'',''],
        [],
        header(['Etapa','Tipo','Editoras'])
      ];
      stageStats.forEach(s=>pipelineRows.push([s.name,PIPELINE_TYPE_LABELS[s.stage_type]||s.stage_type||'',int(s.count)]));
      const staged=stageStats.reduce((sum,s)=>sum+Number(s.count||0),0);
      if(Math.max(0,total-staged)>0)pipelineRows.push(['Sem etapa','—',int(Math.max(0,total-staged))]);

      const priorityRows=[
        [xcell('Prioridades',S.title),''],
        [wrap(`Classificação de prioridade das editoras no escopo ${personal?'da carteira':'da operação'}.`),''],
        [],
        header(['Prioridade','Editoras'])
      ];
      priorityStats.forEach(p=>priorityRows.push([p.label,int(p.count)]));

      const resultRows=[
        [xcell('Resultados de contato',S.title),''],
        [wrap(`Distribuição dos resultados registrados nos últimos ${days} dias.`),''],
        [],
        header(['Resultado','Interações'])
      ];
      resultStats.forEach(r=>resultRows.push([r.label,int(r.count)]));

      const publisherHeaders=['Editora','Nome fantasia','CNPJ','Cidade','UF','Etapa','Prioridade','Temperatura','Radar Score','Aderência Radar','Potencial comercial','Qualidade dos dados','Melhor produto','PNLD Literário','PNLD Didático','PNLD Técnico-Metodológico','Radar de Licitações','Radar de Oportunidades','Responsável','Último contato','Próxima ação','E-mail','Telefone','Site'];
      const publisherRows=[
        [xcell('Editoras',S.title),...Array(publisherHeaders.length-1).fill('')],
        [wrap(personal?'Base da carteira do usuário no momento da exportação.':'Base ativa da operação no momento da exportação.'),...Array(publisherHeaders.length-1).fill('')],
        [],
        header(publisherHeaders)
      ];
      publishers.forEach(p=>publisherRows.push([
        p.name||'',p.trade_name||'',p.cnpj||'',p.city||'',p.state||'',stageMap[p.stage_id]||'Sem etapa',
        PRIORITY_LABELS[p.priority]||p.priority||'',p.commercial_temperature||'',int(p.score),int(p.radar_fit_score),int(p.commercial_potential_score),int(p.data_quality_score),
        RADAR_PRODUCT_LABELS[p.best_product]||'',int(p.fit_pnld_literario),int(p.fit_pnld_didatico),int(p.fit_pnld_tecnico_metodologico),int(p.fit_radar_licitacoes),int(p.fit_radar_oportunidades),
        teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',dt(p.last_contact_at),dt(p.next_action_at),p.general_email||'',p.phone||'',p.website||''
      ]));

      const interactionHeaders=['Data/hora','Editora','Responsável','Contato','Canal','Direção','Resultado','Assunto','Resumo','Resposta / retorno','Interesse','Sinal de oportunidade','Próximo passo','Próxima ação','Duração (min)','Prioridade'];
      const interactionRows=[
        [xcell('Interações',S.title),...Array(interactionHeaders.length-1).fill('')],
        [wrap(`Contatos registrados nos últimos ${days} dias.`),...Array(interactionHeaders.length-1).fill('')],
        [],
        header(interactionHeaders)
      ];
      interactions.forEach(i=>interactionRows.push([
        dt(i.occurred_at),i.publishers?.name||'',teamMap[i.user_id]?.full_name||teamMap[i.user_id]?.email||'',i.contact_name_snapshot||'',
        CHANNEL_LABELS[i.channel]||i.channel||'',DIRECTION_LABELS[i.direction]||i.direction||'',RESULT_LABELS[i.result]||i.result||'',
        i.subject||'',wrap(i.summary),wrap(i.response_summary),INTEREST_LABELS[i.interest_level]||i.interest_level||'',i.opportunity_signal||'',
        wrap(i.next_step),dt(i.next_action_at),int(i.duration_minutes),PRIORITY_LABELS[i.priority]||i.priority||''
      ]));

      const opportunityHeaders=['Editora','Oportunidade','Serviço / projeto','Etapa','Valor estimado','Probabilidade','Responsável','Fechamento previsto','Próxima ação','Próximo passo','Motivo da perda','Criada em','Atualizada em'];
      const opportunityRows=[
        [xcell('Oportunidades',S.title),...Array(opportunityHeaders.length-1).fill('')],
        [wrap('Negociações registradas no CRM, incluindo abertas e histórico de ganhos/perdas.'),...Array(opportunityHeaders.length-1).fill('')],
        [],
        header(opportunityHeaders)
      ];
      opportunities.forEach(o=>opportunityRows.push([
        o.publishers?.name||'',o.title||'',o.service_type||'',OPPORTUNITY_STAGE_LABELS[o.stage]||o.stage||'',money(o.estimated_value),
        percent((Number(o.probability)||0)/100),teamMap[o.owner_user_id]?.full_name||teamMap[o.owner_user_id]?.email||'',date(o.expected_close_date),
        dt(o.next_action_at),wrap(o.next_step),wrap(o.loss_reason),dt(o.created_at),dt(o.updated_at)
      ]));

      const taskHeaders=['Editora','Tarefa','Tipo','Status','Prioridade','Responsável','Prazo','Concluída em','Resultado','Observação do resultado','Origem','Criada em','Descrição'];
      const taskRows=[
        [xcell('Tarefas',S.title),...Array(taskHeaders.length-1).fill('')],
        [wrap(`Tarefas abertas e tarefas concluídas nos últimos ${days} dias.`),...Array(taskHeaders.length-1).fill('')],
        [],
        header(taskHeaders)
      ];
      tasks.forEach(t=>taskRows.push([
        t.publishers?.name||'',t.title||'',TASK_TYPE_LABELS[t.task_type]||t.task_type||'',TASK_STATUS_LABELS[t.status]||t.status||'',
        PRIORITY_LABELS[t.priority]||t.priority||'',teamMap[t.assigned_to]?.full_name||teamMap[t.assigned_to]?.email||'',dt(t.due_at),dt(t.completed_at),
        RESULT_LABELS[t.result_code]||t.result_code||'',wrap(t.result_note),t.cadence_enrollment_id?'Cadência':t.automation_key?'Automação de reunião':'Manual',dt(t.created_at),wrap(t.description)
      ]));

      downloadXlsx(`radar-relatorio-${new Date().toISOString().slice(0,10)}.xlsx`,[
        {name:'Resumo',rows:summaryRows,widths:[34,20,52,20],merges:summaryMerges},
        {name:'Pipeline',rows:pipelineRows,widths:[30,18,14],merges:['A1:C1','A2:C2'],freezeRows:4,autoFilter:`A4:C${pipelineRows.length}`},
        {name:'Prioridades',rows:priorityRows,widths:[24,14],merges:['A1:B1','A2:B2'],freezeRows:4,autoFilter:`A4:B${priorityRows.length}`},
        {name:'Resultados',rows:resultRows,widths:[32,14],merges:['A1:B1','A2:B2'],freezeRows:4,autoFilter:`A4:B${resultRows.length}`},
        {name:'Editoras',rows:publisherRows,widths:[30,26,18,22,8,24,14,14,12,15,18,17,25,14,14,22,18,20,24,20,20,28,18,32],merges:['A1:X1','A2:X2'],freezeRows:4,autoFilter:`A4:X${publisherRows.length}`},
        {name:'Interações',rows:interactionRows,widths:[19,28,24,22,14,12,22,28,42,42,14,20,40,19,14,14],merges:['A1:P1','A2:P2'],freezeRows:4,autoFilter:`A4:P${interactionRows.length}`},
        {name:'Oportunidades',rows:opportunityRows,widths:[28,30,24,18,18,14,24,18,19,38,32,19,19],merges:['A1:M1','A2:M2'],freezeRows:4,autoFilter:`A4:M${opportunityRows.length}`},
        {name:'Tarefas',rows:taskRows,widths:[28,38,16,16,14,24,19,19,22,36,20,19,42],merges:['A1:M1','A2:M2'],freezeRows:4,autoFilter:`A4:M${taskRows.length}`}
      ]);

      setNotice(`Relatório Excel exportado: ${publishers.length.toLocaleString('pt-BR')} editoras, ${interactions.length.toLocaleString('pt-BR')} interações, ${opportunities.length.toLocaleString('pt-BR')} oportunidades e ${tasks.length.toLocaleString('pt-BR')} tarefas.`);
    }catch(e){setNotice(e?.message||'Não foi possível exportar o relatório.')}finally{setExporting(false)}
  }

  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">Indicadores</div><h1>Relatórios</h1><p>{personal?'Acompanhe os indicadores da sua carteira e da sua atividade comercial.':'Acompanhe os principais indicadores da operação e exporte os dados para análise.'}</p></div><div className="toolbar" style={{margin:0}}><select className="filter-select" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>Últimos 30 dias</option><option value={60}>Últimos 60 dias</option><option value={90}>Últimos 90 dias</option></select><button className="btn" onClick={exportReport} disabled={exporting||loading}><Download size={16}/>{exporting?'Preparando arquivo…':'Exportar relatório (.xlsx)'}</button></div></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {loading?<div className="card table-empty">Calculando indicadores…</div>:<><div className="metric-grid"><Metric icon={<Building2/>} label={personal?'Minha carteira':'Base ativa'} value={total} sub={`${contacted.toLocaleString('pt-BR')} já contatadas`}/><Metric icon={<MessageSquareText/>} label={`Interações / ${days} dias`} value={summary?.interactions?.period_total||0} sub="contatos registrados"/><Metric icon={<Target/>} label="Oportunidades abertas" value={openOpps} sub={`${won} ganhas no histórico`}/><Metric icon={<BarChart3/>} label="Tarefas atrasadas" value={overdue} sub={`${pending} pendentes`}/></div>
      <section className="card panel" style={{marginBottom:16}}><div className="panel-head"><div><h2>Leitura automática</h2><p>Use estes destaques para identificar onde merece mais atenção.</p></div><Lightbulb size={20}/></div><div className="stat-list">{insights.map((text,i)=><div className="stat-row" key={i}><span>{text}</span></div>)}</div></section>
      <div className="report-grid"><section className="card panel"><div className="panel-head"><div><h2>Editoras por etapa</h2><p>Distribuição atual no pipeline</p></div></div><div className="report-bars">{stageStats.map(s=><Bar key={s.id} label={s.name} count={Number(s.count)||0} max={maxStage}/>)}</div></section><section className="card panel"><div className="panel-head"><div><h2>Prioridades</h2><p>Como {personal?'sua carteira':'a base'} está classificada</p></div></div><div className="report-bars">{priorityStats.map(s=><Bar key={s.key} label={s.label} count={s.count} max={maxPriority}/>)}</div></section><section className="card panel"><div className="panel-head"><div><h2>Resultados de contato</h2><p>Últimos {days} dias</p></div></div><div className="stat-list">{resultStats.length?resultStats.map(r=><div className="stat-row" key={r.key}><span>{r.label}</span><strong>{r.count}</strong></div>):<p className="muted">Sem interações no período.</p>}</div></section><section className="card panel"><div className="panel-head"><div><h2>Conversão e cobertura</h2><p>{personal?'Resumo da sua carteira':'Resumo da operação'}</p></div></div><div className="stat-list"><div className="stat-row"><span>Base já contatada</span><strong>{total?Math.round(contacted/total*100):0}%</strong></div><div className="stat-row"><span>Editoras sem contato</span><strong>{Math.max(0,total-contacted).toLocaleString('pt-BR')}</strong></div>{!personal&&<div className="stat-row"><span>Sem responsável</span><strong>{unassigned.toLocaleString('pt-BR')}</strong></div>}<div className="stat-row"><span>Oportunidades ganhas</span><strong>{won}</strong></div><div className="stat-row"><span>Valor em oportunidades abertas</span><strong>{currency(summary?.opportunities?.open_value||0)}</strong></div><div className="stat-row"><span>Radar Score médio</span><strong>{avgScore}</strong></div></div></section></div></>}
  </div>;
}

function buildInsights(summary){if(!summary)return[];const personal=summary.scope==='personal';const total=Number(summary.publishers?.total||0);const contacted=Number(summary.publishers?.contacted||0);const unassigned=Number(summary.publishers?.unassigned||0);const coverage=total?Math.round(contacted/total*100):0;const stages=summary.stages||[];const biggest=[...stages].sort((a,b)=>Number(b.count)-Number(a.count))[0];const priorities=summary.priorities||[];const hot=priorities.filter(p=>p.key==='high'||p.key==='urgent').reduce((a,p)=>a+Number(p.count||0),0);const overdue=Number(summary.tasks?.overdue||0);const open=Number(summary.opportunities?.open||0);const interactions=Number(summary.interactions?.period_total||0);const topState=summary.top_states?.[0];const out=[];out.push(`${personal?'Cobertura da carteira':'Cobertura comercial'}: ${coverage}% ${personal?'das suas editoras':'da base'} já recebeu ao menos um contato; ${Math.max(0,total-contacted).toLocaleString('pt-BR')} ainda não têm contato registrado.`);if(biggest)out.push(`Maior concentração do pipeline: “${biggest.name}”, com ${Number(biggest.count).toLocaleString('pt-BR')} editoras (${total?Math.round(Number(biggest.count)/total*100):0}% ${personal?'da sua carteira':'da base'}).`);if(!personal)out.push(`${unassigned.toLocaleString('pt-BR')} editoras estão sem responsável definido; elas podem ser assumidas diretamente pelos prospectadores.`);if(hot)out.push(`${hot.toLocaleString('pt-BR')} editoras estão classificadas como prioridade alta ou urgente.`);out.push(overdue?`Há ${overdue.toLocaleString('pt-BR')} tarefa${overdue===1?'':'s'} atrasada${overdue===1?'':'s'} que merece${overdue===1?'':'m'} atenção.`:'Não há tarefas atrasadas no momento.');out.push(interactions?`Foram registradas ${interactions.toLocaleString('pt-BR')} interações no período selecionado e existem ${open.toLocaleString('pt-BR')} oportunidades abertas.`:`Ainda não há interações registradas no período selecionado.`);if(topState)out.push(`${topState.state} concentra a maior quantidade de editoras ${personal?'da sua carteira':'na base'} (${Number(topState.count).toLocaleString('pt-BR')}).`);return out;}
function Metric({icon,label,value,sub}){return <div className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{Number(value).toLocaleString('pt-BR')}</strong><small>{sub}</small></div></div>}
function Bar({label,count,max}){return <div className="report-bar-row"><span>{label}</span><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(count?4:0,count/max*100)}%`}}/></div><strong className="report-number">{count.toLocaleString('pt-BR')}</strong></div>}
