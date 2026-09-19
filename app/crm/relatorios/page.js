'use client';
import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Building2, CalendarDays, CircleDollarSign, Clock3, Download, Gauge, Lightbulb, MapPin, MessageSquareText, Target, TrendingDown, TrendingUp, Users, Workflow, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { CHANNEL_LABELS, INTEREST_LABELS, MEETING_STATUS_LABELS, OPPORTUNITY_STAGE_LABELS, PRIORITY_LABELS, RADAR_PRODUCT_LABELS, RESULT_LABELS, TASK_TYPE_LABELS, currency } from '@/lib/constants';
import { XLSX_STYLE, downloadXlsx, xcell } from '@/lib/xlsxExport';

const TASK_STATUS_LABELS={open:'Aberta',in_progress:'Em andamento',done:'Concluída',cancelled:'Cancelada'};
const DIRECTION_LABELS={outbound:'Saída',inbound:'Entrada'};
const PIPELINE_TYPE_LABELS={open:'Em aberto',won:'Cliente',nurture:'Nutrição',lost:'Encerrada'};
const EXPORT_OPTIONS=[
  {key:'complete',label:'Completo — gestão + base'},
  {key:'executive',label:'Executivo — visão gerencial'},
  {key:'commercial',label:'Comercial — prospecção e carteira'},
  {key:'pipeline',label:'Pipeline e oportunidades'},
  {key:'team',label:'Equipe e produtividade',managerOnly:true},
  {key:'cadences',label:'Cadências e abordagens'},
  {key:'meetings',label:'Reuniões'},
  {key:'publishers',label:'Base de editoras'}
];
const REPORT_SHEET_KEYS={
  complete:['executive','comparison','trend','funnel','aging','cadences','channels','meetings','financial','team','score','products','geography','publishers','interactions','opportunities','tasks','meetingDetails','cadenceDetails'],
  executive:['executive','comparison','trend','funnel','aging','meetings','financial','score','products','geography'],
  commercial:['executive','comparison','score','products','publishers','interactions','tasks'],
  pipeline:['executive','funnel','aging','financial','opportunities','meetingDetails'],
  team:['executive','comparison','team','interactions','meetingDetails','tasks'],
  cadences:['executive','cadences','channels','cadenceDetails','tasks'],
  meetings:['executive','meetings','meetingDetails'],
  publishers:['publishers','score','products','geography']
};

export default function ReportsPage(){
  const {supabase,membership,teamMap,activityVersion,isManager,user}=useCrm();
  const org=membership?.organization_id;
  const [summary,setSummary]=useState(null); const [analytics,setAnalytics]=useState(null); const [days,setDays]=useState(30); const [loading,setLoading]=useState(true); const [exporting,setExporting]=useState(false); const [notice,setNotice]=useState(''); const [view,setView]=useState('overview'); const [exportType,setExportType]=useState('complete');

  async function load(){
    if(!org)return;
    setLoading(true);setNotice('');
    const [{data:summaryData,error:summaryError},{data:analyticsData,error:analyticsError}]=await Promise.all([
      supabase.rpc('crm_report_summary',{p_organization_id:org,p_days:days}),
      supabase.rpc('crm_report_dashboard',{p_organization_id:org,p_days:days})
    ]);
    if(summaryError||analyticsError)setNotice(summaryError?.message||analyticsError?.message||'Não foi possível calcular os relatórios.');
    setSummary(summaryData||null);setAnalytics(analyticsData||null);setLoading(false);
  }
  useEffect(()=>{load()},[org,days,activityVersion]);

  const personal=summary?.scope==='personal';
  const stageStats=summary?.stages||[];
  const priorityStats=useMemo(()=>Object.entries(PRIORITY_LABELS).map(([key,label])=>({key,label,count:Number((summary?.priorities||[]).find(p=>p.key===key)?.count||0)})),[summary]);
  const resultStats=(summary?.interactions?.results||[]).map(r=>({...r,label:RESULT_LABELS[r.key]||r.key}));
  const total=Number(summary?.publishers?.total||0); const contacted=Number(summary?.publishers?.contacted||0); const unassigned=Number(summary?.publishers?.unassigned||0); const avgScore=Number(summary?.publishers?.avg_score||0);
  const openOpps=Number(summary?.opportunities?.open||0); const won=Number(summary?.opportunities?.won||0); const overdue=Number(summary?.tasks?.overdue||0); const pending=Number(summary?.tasks?.pending||0);
  const maxStage=Math.max(1,...stageStats.map(x=>Number(x.count)||0)); const maxPriority=Math.max(1,...priorityStats.map(x=>x.count));
  const current=analytics?.current||{}; const previous=analytics?.previous||{};
  const activitySeries=analytics?.activity_series||[]; const funnel=analytics?.funnel||[]; const stageAging=analytics?.stage_aging||[];
  const scoreDistribution=analytics?.score_distribution||[]; const productFit=analytics?.product_fit||[]; const cadencePerformance=analytics?.cadences?.performance||[]; const cadenceChannels=analytics?.cadences?.channels||[];
  const meetingAnalytics=analytics?.meetings||{}; const financial=analytics?.financial||{}; const teamPerformance=analytics?.team||[]; const geography=analytics?.geography||[];
  const insights=useMemo(()=>buildActionableInsights(summary,analytics,personal),[summary,analytics,personal]);
  const exportOptions=EXPORT_OPTIONS.filter(option=>!option.managerOnly||isManager);

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

  async function fetchMeetings(){
    const since=new Date(Date.now()-days*86400000).toISOString();
    return fetchPaged(()=>{
      let query=supabase.from('meetings').select('id,publisher_id,title,meeting_type,scheduled_start,duration_minutes,status,scheduled_by,presenter_user_id,outcome_interest,next_step,follow_up_at,created_at,outcome_notes,publishers(name)').eq('organization_id',org).gte('scheduled_start',since);
      if(!isManager)query=query.or('presenter_user_id.eq.'+user?.id+',scheduled_by.eq.'+user?.id);
      return query.order('scheduled_start',{ascending:false});
    });
  }

  async function fetchCadenceEnrollments(){
    const since=new Date(Date.now()-days*86400000).toISOString();
    return fetchPaged(()=>{
      let query=supabase.from('cadence_enrollments').select('id,cadence_id,publisher_id,user_id,status,started_at,completed_at,paused_until,pause_reason,last_result_code,cadences(name,cadence_key),publishers(name)').eq('organization_id',org).gte('started_at',since);
      if(!isManager)query=query.eq('user_id',user?.id);
      return query.order('started_at',{ascending:false});
    });
  }

  async function exportReport(){
    if(!summary||!analytics||!org)return;
    setExporting(true);setNotice('');
    try{
      const keys=REPORT_SHEET_KEYS[exportType]||REPORT_SHEET_KEYS.complete;
      const needsPublishers=keys.includes('publishers');
      const needsInteractions=keys.includes('interactions');
      const needsOpportunities=keys.includes('opportunities');
      const needsTasks=keys.includes('tasks');
      const needsMeetingDetails=keys.includes('meetingDetails');
      const needsCadenceDetails=keys.includes('cadenceDetails');

      const [publishers,interactions,opportunities,tasks,meetings,cadenceEnrollments]=await Promise.all([
        needsPublishers?fetchAllPublishers():Promise.resolve([]),
        needsInteractions?fetchInteractions():Promise.resolve([]),
        needsOpportunities?fetchOpportunities():Promise.resolve([]),
        needsTasks?fetchTasks():Promise.resolve([]),
        needsMeetingDetails?fetchMeetings():Promise.resolve([]),
        needsCadenceDetails?fetchCadenceEnrollments():Promise.resolve([])
      ]);

      const S=XLSX_STYLE;
      const stageMap=Object.fromEntries(stageStats.map(s=>[s.id,s.name]));
      const stageCountMap=Object.fromEntries(stageStats.map(s=>[s.id,Number(s.count)||0]));
      const header=values=>values.map(value=>xcell(value,S.header));
      const int=value=>xcell(Number(value)||0,S.integer,'number');
      const decimal=value=>xcell(Number(value)||0,S.decimal,'number');
      const percent=value=>xcell(Number(value)||0,S.percent,'number');
      const money=value=>xcell(Number(value)||0,S.currency,'number');
      const dt=value=>value?xcell(new Date(value),S.datetime,'datetime'):'';
      const date=value=>value?xcell(new Date(value),S.date,'date'):'';
      const wrap=value=>xcell(value||'',S.wrap);
      const generatedAt=new Date();
      const reportLabel=exportOptions.find(option=>option.key===exportType)?.label||'Relatório completo';

      const makeTable=(name,description,headers,data,widths)=>({
        name,
        rows:[
          [xcell(name,S.title),...Array(Math.max(0,headers.length-1)).fill('')],
          [wrap(description),...Array(Math.max(0,headers.length-1)).fill('')],
          [],
          header(headers),
          ...data
        ],
        widths,
        freezeRows:4
      });

      const executiveRows=[];
      const executiveMerges=[];
      const mergeExecutive=(text,style=S.section)=>{
        const row=executiveRows.length+1;
        executiveRows.push([xcell(text,style),'','','']);
        executiveMerges.push('A'+row+':D'+row);
      };
      mergeExecutive(personal?'RADAR — Relatório pessoal':'RADAR — Relatório gerencial',S.title);
      executiveRows.push([xcell('Tipo de relatório',S.meta),reportLabel,xcell('Período',S.meta),'Últimos '+days+' dias']);
      executiveRows.push([xcell('Gerado em',S.meta),dt(generatedAt),xcell('Escopo',S.meta),personal?'Minha carteira':'Operação comercial']);
      executiveRows.push([]);
      mergeExecutive('INDICADORES');
      executiveRows.push(header(['Indicador','Período atual','Período anterior','Variação']));
      const comparisons=[
        ['Interações','interactions'],
        ['Editoras trabalhadas','publishers_worked'],
        ['Reuniões realizadas','meetings_completed'],
        ['Oportunidades criadas','opportunities_created'],
        ['Tarefas concluídas','tasks_completed'],
        ['Oportunidades ganhas','won_opportunities']
      ];
      comparisons.forEach(([label,key])=>{
        const cur=Number(current[key]||0),prev=Number(previous[key]||0);
        executiveRows.push([label,int(cur),int(prev),deltaText(cur,prev)]);
      });
      executiveRows.push(['Cobertura da carteira',percent(total?contacted/total:0),'','']);
      executiveRows.push(['Pipeline bruto',money(financial.gross_open||0),'','']);
      executiveRows.push(['Pipeline ponderado',money(financial.weighted_open||0),'','']);
      executiveRows.push(['Tarefas atrasadas',int(overdue),'','']);
      executiveRows.push([]);
      mergeExecutive('ONDE AGIR AGORA');
      insights.forEach(item=>{
        const row=executiveRows.length+1;
        executiveRows.push([wrap(item.text||item),'','','']);
        executiveMerges.push('A'+row+':D'+row);
      });

      const comparisonRows=comparisons.map(([label,key])=>{
        const cur=Number(current[key]||0),prev=Number(previous[key]||0);
        return [label,int(cur),int(prev),deltaText(cur,prev),deltaRatio(cur,prev)===null?'':percent(deltaRatio(cur,prev))];
      });

      const trendRows=(activitySeries||[]).map(row=>[
        date(row.date),int(row.interactions),int(row.meetings),int(row.opportunities)
      ]);

      const funnelRows=(funnel||[]).map((row,index)=>{
        const reached=Number(row.reached||0);
        const prevReached=index?Number(funnel[index-1]?.reached||0):reached;
        const conversion=index===0?1:(prevReached?reached/prevReached:0);
        const aging=(stageAging||[]).find(item=>item.id===row.id);
        return [row.name,int(reached),percent(conversion),int(stageCountMap[row.id]||0),decimal(aging?.avg_days||0)];
      });

      const agingRows=(stageAging||[]).map(row=>[
        row.name,int(row.count),decimal(row.avg_days||0)
      ]);

      const cadenceRows=(cadencePerformance||[]).map(row=>[
        row.name,int(row.enrollments),int(row.responses),
        percent(Number(row.enrollments)?Number(row.responses)/Number(row.enrollments):0),
        int(row.meetings),percent(Number(row.enrollments)?Number(row.meetings)/Number(row.enrollments):0),
        int(row.opportunities),percent(Number(row.enrollments)?Number(row.opportunities)/Number(row.enrollments):0)
      ]);

      const channelRows=(cadenceChannels||[]).map(row=>[
        TASK_TYPE_LABELS[row.channel]||row.channel,int(row.attempts),int(row.positive),
        percent(Number(row.attempts)?Number(row.positive)/Number(row.attempts):0)
      ]);

      const meetingCompleted=Number(meetingAnalytics.completed||0);
      const meetingFollowed=Number(meetingAnalytics.followed_by_opportunity||0);
      const meetingRows=[
        ['Agendadas',int(meetingAnalytics.scheduled||0)],
        ['Realizadas',int(meetingAnalytics.completed||0)],
        ['Canceladas',int(meetingAnalytics.cancelled||0)],
        ['Não compareceu',int(meetingAnalytics.no_show||0)],
        ['Reuniões seguidas de oportunidade em até 30 dias',int(meetingFollowed)],
        ['Conversão reunião → oportunidade',percent(meetingCompleted?meetingFollowed/meetingCompleted:0)],
        ['Dias médios: primeiro contato → reunião',decimal(meetingAnalytics.avg_days_first_contact_to_meeting||0)]
      ];

      const financeRows=(financial.by_stage||[]).map(row=>[
        OPPORTUNITY_STAGE_LABELS[row.stage]||row.stage,int(row.count),money(row.gross_value),money(row.weighted_value)
      ]);
      financeRows.unshift(['TOTAL',int((financial.by_stage||[]).reduce((a,row)=>a+Number(row.count||0),0)),money(financial.gross_open||0),money(financial.weighted_open||0)]);

      const teamRows=(teamPerformance||[]).map(row=>[
        row.full_name||row.email||'Equipe',row.email||'',int(row.portfolio),int(row.contacted),
        percent(Number(row.portfolio)?Number(row.contacted)/Number(row.portfolio):0),
        int(row.interactions),int(row.meetings),int(row.opportunities),int(row.overdue)
      ]);

      const scoreRows=(scoreDistribution||[]).map(row=>[row.bucket,int(row.count)]);
      scoreRows.push(['Score ≥ 90 sem contato',int(analytics?.score_alerts?.high_score_uncontacted||0)]);
      if(isManager)scoreRows.push(['Score ≥ 90 sem responsável',int(analytics?.score_alerts?.high_score_unassigned||0)]);

      const productRows=(productFit||[]).map(row=>[
        row.label,int(row.high_fit),int(row.uncontacted),
        percent(Number(row.high_fit)?Number(row.uncontacted)/Number(row.high_fit):0)
      ]);

      const geoRows=(geography||[]).map(row=>[
        row.state,int(row.base_count),int(row.contacted),
        percent(Number(row.base_count)?Number(row.contacted)/Number(row.base_count):0),int(row.interactions)
      ]);

      const publisherHeaders=['Editora','Nome fantasia','CNPJ','Cidade','UF','Etapa','Prioridade','Temperatura','Radar Score','Aderência Radar','Potencial comercial','Qualidade dos dados','Melhor produto','PNLD Literário','PNLD Didático','PNLD Técnico-Metodológico','Radar de Licitações','Radar de Oportunidades','Responsável','Último contato','Próxima ação','E-mail','Telefone','Site'];
      const publisherData=publishers.map(p=>[
        p.name||'',p.trade_name||'',p.cnpj||'',p.city||'',p.state||'',stageMap[p.stage_id]||'Sem etapa',
        PRIORITY_LABELS[p.priority]||p.priority||'',p.commercial_temperature||'',int(p.score),int(p.radar_fit_score),int(p.commercial_potential_score),int(p.data_quality_score),
        RADAR_PRODUCT_LABELS[p.best_product]||'',int(p.fit_pnld_literario),int(p.fit_pnld_didatico),int(p.fit_pnld_tecnico_metodologico),int(p.fit_radar_licitacoes),int(p.fit_radar_oportunidades),
        teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',dt(p.last_contact_at),dt(p.next_action_at),p.general_email||'',p.phone||'',p.website||''
      ]);

      const interactionHeaders=['Data/hora','Editora','Responsável','Contato','Canal','Direção','Resultado','Assunto','Resumo','Resposta / retorno','Interesse','Sinal de oportunidade','Próximo passo','Próxima ação','Duração (min)','Prioridade'];
      const interactionData=interactions.map(i=>[
        dt(i.occurred_at),i.publishers?.name||'',teamMap[i.user_id]?.full_name||teamMap[i.user_id]?.email||'',i.contact_name_snapshot||'',
        CHANNEL_LABELS[i.channel]||i.channel||'',DIRECTION_LABELS[i.direction]||i.direction||'',RESULT_LABELS[i.result]||i.result||'',
        i.subject||'',wrap(i.summary),wrap(i.response_summary),INTEREST_LABELS[i.interest_level]||i.interest_level||'',i.opportunity_signal||'',
        wrap(i.next_step),dt(i.next_action_at),int(i.duration_minutes),PRIORITY_LABELS[i.priority]||i.priority||''
      ]);

      const opportunityHeaders=['Editora','Oportunidade','Serviço / projeto','Etapa','Valor estimado','Probabilidade','Responsável','Fechamento previsto','Próxima ação','Próximo passo','Motivo da perda','Criada em','Atualizada em'];
      const opportunityData=opportunities.map(o=>[
        o.publishers?.name||'',o.title||'',o.service_type||'',OPPORTUNITY_STAGE_LABELS[o.stage]||o.stage||'',money(o.estimated_value),
        percent((Number(o.probability)||0)/100),teamMap[o.owner_user_id]?.full_name||teamMap[o.owner_user_id]?.email||'',date(o.expected_close_date),
        dt(o.next_action_at),wrap(o.next_step),wrap(o.loss_reason),dt(o.created_at),dt(o.updated_at)
      ]);

      const taskHeaders=['Editora','Tarefa','Tipo','Status','Prioridade','Responsável','Prazo','Concluída em','Resultado','Observação do resultado','Origem','Criada em','Descrição'];
      const taskData=tasks.map(t=>[
        t.publishers?.name||'',t.title||'',TASK_TYPE_LABELS[t.task_type]||t.task_type||'',TASK_STATUS_LABELS[t.status]||t.status||'',
        PRIORITY_LABELS[t.priority]||t.priority||'',teamMap[t.assigned_to]?.full_name||teamMap[t.assigned_to]?.email||'',dt(t.due_at),dt(t.completed_at),
        RESULT_LABELS[t.result_code]||t.result_code||'',wrap(t.result_note),t.cadence_enrollment_id?'Cadência':t.automation_key?'Automação de reunião':'Manual',dt(t.created_at),wrap(t.description)
      ]);

      const meetingHeaders=['Data/hora','Editora','Reunião','Tipo','Status','Duração (min)','Apresentador','Agendada por','Interesse','Próximo passo','Follow-up','Observações de resultado'];
      const meetingData=meetings.map(m=>[
        dt(m.scheduled_start),m.publishers?.name||'',m.title||'',m.meeting_type||'',MEETING_STATUS_LABELS[m.status]||m.status||'',int(m.duration_minutes),
        teamMap[m.presenter_user_id]?.full_name||teamMap[m.presenter_user_id]?.email||'',teamMap[m.scheduled_by]?.full_name||teamMap[m.scheduled_by]?.email||'',
        INTEREST_LABELS[m.outcome_interest]||m.outcome_interest||'',wrap(m.next_step),dt(m.follow_up_at),wrap(m.outcome_notes)
      ]);

      const cadenceDetailHeaders=['Editora','Cadência','Responsável','Status','Início','Conclusão','Pausada até','Motivo da pausa','Último resultado'];
      const cadenceDetailData=cadenceEnrollments.map(e=>[
        e.publishers?.name||'',e.cadences?.name||'',teamMap[e.user_id]?.full_name||teamMap[e.user_id]?.email||'',e.status||'',
        dt(e.started_at),dt(e.completed_at),dt(e.paused_until),wrap(e.pause_reason),RESULT_LABELS[e.last_result_code]||e.last_result_code||''
      ]);

      const catalog={
        executive:{name:'Resumo executivo',rows:executiveRows,widths:[38,22,42,22],merges:executiveMerges},
        comparison:makeTable('Comparativo','Período selecionado versus período imediatamente anterior de mesma duração.',['Indicador','Atual','Anterior','Variação','Variação %'],comparisonRows,[32,14,14,18,16]),
        trend:makeTable('Tendência','Atividade diária no período selecionado.',['Data','Interações','Reuniões','Oportunidades'],trendRows,[16,14,14,16]),
        funnel:makeTable('Funil','Avanço acumulado da base e conversão sequencial entre etapas.',['Etapa','Alcançaram a etapa','Conversão da etapa anterior','Atualmente na etapa','Dias médios na etapa'],funnelRows,[30,18,22,18,18]),
        aging:makeTable('Tempo por etapa','Tempo médio das editoras atualmente em cada etapa.',['Etapa','Editoras atuais','Dias médios'],agingRows,[30,18,18]),
        cadences:makeTable('Cadências','Desempenho das cadências iniciadas no período.',['Cadência','Editoras','Respostas','Taxa de resposta','Reuniões','Taxa de reunião','Oportunidades','Taxa de oportunidade'],cadenceRows,[34,12,12,18,12,18,16,20]),
        channels:makeTable('Abordagens','Resultados dos canais utilizados nas tarefas de cadência.',['Canal','Tentativas','Resultados positivos','Taxa positiva'],channelRows,[22,14,20,16]),
        meetings:makeTable('Reuniões','Resumo das reuniões no período selecionado.',['Indicador','Valor'],meetingRows,[48,18]),
        financial:makeTable('Pipeline financeiro','Valor bruto e ponderado das oportunidades em aberto.',['Etapa','Oportunidades','Valor bruto','Valor ponderado'],financeRows,[24,16,20,20]),
        team:makeTable('Equipe','Cobertura de carteira e produtividade comercial por responsável.',['Responsável','E-mail','Carteira','Contatadas','Cobertura','Interações','Reuniões','Oportunidades','Tarefas atrasadas'],teamRows,[28,30,12,12,14,14,12,16,18]),
        score:makeTable('Radar Score','Distribuição da base por faixa de Radar Score e alertas de alta prioridade.',['Faixa / alerta','Editoras'],scoreRows,[34,16]),
        products:makeTable('Aderência por produto','Editoras com aderência alta (≥70) em cada produto Radar.',['Produto','Alta aderência','Ainda sem contato','% sem contato'],productRows,[34,18,18,16]),
        geography:makeTable('Geografia','Cobertura e atividade comercial por estado.',['UF','Base','Contatadas','Cobertura','Interações no período'],geoRows,[10,14,14,14,20]),
        publishers:makeTable('Editoras',personal?'Base atual da carteira do usuário.':'Base ativa da operação.',publisherHeaders,publisherData,[30,26,18,22,8,24,14,14,12,15,18,17,25,14,14,22,18,20,24,20,20,28,18,32]),
        interactions:makeTable('Interações','Contatos registrados nos últimos '+days+' dias.',interactionHeaders,interactionData,[19,28,24,22,14,12,22,28,42,42,14,20,40,19,14,14]),
        opportunities:makeTable('Oportunidades','Negociações registradas no CRM.',opportunityHeaders,opportunityData,[28,30,24,18,18,14,24,18,19,38,32,19,19]),
        tasks:makeTable('Tarefas','Tarefas abertas e tarefas concluídas nos últimos '+days+' dias.',taskHeaders,taskData,[28,38,16,16,14,24,19,19,22,36,20,19,42]),
        meetingDetails:makeTable('Reuniões detalhadas','Reuniões do período com status e encaminhamentos.',meetingHeaders,meetingData,[19,28,32,20,16,14,24,24,14,38,19,42]),
        cadenceDetails:makeTable('Cadências detalhadas','Inscrições em cadências iniciadas no período.',cadenceDetailHeaders,cadenceDetailData,[28,34,24,16,19,19,19,38,22])
      };

      const sheets=keys.map(key=>catalog[key]).filter(sheet=>sheet&&(sheet.name!=='Equipe'||isManager));
      await downloadXlsx('radar-'+exportType+'-'+new Date().toISOString().slice(0,10)+'.xlsx',sheets);
      setNotice(reportLabel+' exportado com sucesso.');
    }catch(e){
      setNotice(e?.message||'Não foi possível exportar o relatório.');
    }finally{
      setExporting(false);
    }
  }

  return <div className="page-wrap reports-v2">
    <div className="page-head">
      <div><div className="eyebrow">Inteligência comercial</div><h1>Relatórios</h1><p>{personal?'Acompanhe sua carteira, ritmo comercial e próximos pontos de atenção.':'Acompanhe desempenho, conversão, cobertura e oportunidades da operação em um só lugar.'}</p></div>
      <div className="report-actions">
        <select className="filter-select" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>Últimos 30 dias</option><option value={60}>Últimos 60 dias</option><option value={90}>Últimos 90 dias</option></select>
        <select className="filter-select report-export-select" value={exportType} onChange={e=>setExportType(e.target.value)}>{exportOptions.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select>
        <button className="btn" onClick={exportReport} disabled={exporting||loading}><Download size={16}/>{exporting?'Gerando Excel…':'Baixar relatório'}</button>
      </div>
    </div>

    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

    {loading?<div className="card table-empty">Calculando indicadores e comparativos…</div>:<>
      <div className="report-kpi-grid">
        <ComparisonMetric icon={<Activity/>} label="Interações" current={current.interactions} previous={previous.interactions} sub={'últimos '+days+' dias'}/>
        <ComparisonMetric icon={<Building2/>} label="Editoras trabalhadas" current={current.publishers_worked} previous={previous.publishers_worked} sub="com contato no período"/>
        <ComparisonMetric icon={<CalendarDays/>} label="Reuniões realizadas" current={current.meetings_completed} previous={previous.meetings_completed} sub="no período"/>
        <ComparisonMetric icon={<Target/>} label="Oportunidades criadas" current={current.opportunities_created} previous={previous.opportunities_created} sub="novas oportunidades"/>
        <ValueMetric icon={<CircleDollarSign/>} label="Pipeline ponderado" value={currency(financial.weighted_open||0)} sub={'bruto: '+currency(financial.gross_open||0)}/>
        <ValueMetric icon={<Clock3/>} label="Tarefas atrasadas" value={Number(overdue||0).toLocaleString('pt-BR')} sub={Number(pending||0).toLocaleString('pt-BR')+' pendentes'}/>
      </div>

      <div className="report-tabs">
        <button className={view==='overview'?'active':''} onClick={()=>setView('overview')}>Visão geral</button>
        <button className={view==='pipeline'?'active':''} onClick={()=>setView('pipeline')}>Funil e oportunidades</button>
        <button className={view==='cadences'?'active':''} onClick={()=>setView('cadences')}>Cadências e reuniões</button>
        {isManager&&<button className={view==='team'?'active':''} onClick={()=>setView('team')}>Equipe</button>}
        <button className={view==='radar'?'active':''} onClick={()=>setView('radar')}>Inteligência Radar</button>
      </div>

      {view==='overview'&&<>
        <section className="card panel action-reading">
          <div className="panel-head"><div><h2>Onde agir agora</h2><p>Leitura automática orientada a decisão, não apenas descrição do que aconteceu.</p></div><Lightbulb size={20}/></div>
          <div className="action-insight-grid">{insights.map((item,index)=><div className={'action-insight '+(item.tone||'')} key={index}><strong>{item.title}</strong><span>{item.text}</span></div>)}</div>
        </section>

        <section className="card panel">
          <div className="panel-head"><div><h2>Ritmo comercial</h2><p>Comparação visual da atividade ao longo do período.</p></div><BarChart3 size={20}/></div>
          <ActivityCharts data={activitySeries} days={days}/>
        </section>

        <div className="report-two">
          <section className="card panel">
            <div className="panel-head"><div><h2>Funil acumulado</h2><p>Quantas editoras chegaram a cada etapa e a conversão entre elas.</p></div><Workflow size={20}/></div>
            <FunnelView data={funnel}/>
          </section>
          <section className="card panel">
            <div className="panel-head"><div><h2>Reuniões</h2><p>Resultado das reuniões no período selecionado.</p></div><CalendarDays size={20}/></div>
            <MeetingSnapshot data={meetingAnalytics}/>
          </section>
        </div>

        <div className="report-two">
          <section className="card panel">
            <div className="panel-head"><div><h2>Pipeline financeiro</h2><p>Valor bruto versus valor ponderado pela probabilidade.</p></div><CircleDollarSign size={20}/></div>
            <div className="finance-total"><div><span>Bruto</span><strong>{currency(financial.gross_open||0)}</strong></div><div><span>Ponderado</span><strong>{currency(financial.weighted_open||0)}</strong></div></div>
            <SimpleBarList data={(financial.by_stage||[]).map(row=>({label:OPPORTUNITY_STAGE_LABELS[row.stage]||row.stage,value:Number(row.gross_value)||0,display:currency(row.gross_value)}))}/>
          </section>
          <section className="card panel">
            <div className="panel-head"><div><h2>Cobertura comercial</h2><p>Quanto da base já entrou efetivamente no trabalho comercial.</p></div><Gauge size={20}/></div>
            <div className="coverage-big"><strong>{total?Math.round(contacted/total*100):0}%</strong><span>{contacted.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} editoras já contatadas</span></div>
            <div className="coverage-track"><i style={{width:(total?Math.min(100,contacted/total*100):0)+'%'}}/></div>
            {!personal&&<div className="small-callout">{unassigned.toLocaleString('pt-BR')} editoras ainda estão sem responsável.</div>}
          </section>
        </div>
      </>}

      {view==='pipeline'&&<>
        <div className="report-two">
          <section className="card panel"><div className="panel-head"><div><h2>Conversão do funil</h2><p>Avanço acumulado e taxa de passagem entre etapas.</p></div><Workflow size={20}/></div><FunnelView data={funnel}/></section>
          <section className="card panel"><div className="panel-head"><div><h2>Tempo médio por etapa</h2><p>Ajuda a identificar contas paradas e gargalos do processo.</p></div><Clock3 size={20}/></div><SimpleBarList data={stageAging.map(row=>({label:row.name,value:Number(row.avg_days)||0,display:(Number(row.avg_days)||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+' dias',sub:Number(row.count||0).toLocaleString('pt-BR')+' editoras'}))}/></section>
        </div>
        <section className="card panel"><div className="panel-head"><div><h2>Pipeline financeiro por etapa</h2><p>Valores em aberto e valor ponderado pela probabilidade cadastrada.</p></div><CircleDollarSign size={20}/></div>
          <div className="finance-total"><div><span>Pipeline bruto</span><strong>{currency(financial.gross_open||0)}</strong></div><div><span>Pipeline ponderado</span><strong>{currency(financial.weighted_open||0)}</strong></div></div>
          <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Etapa</th><th>Oportunidades</th><th>Valor bruto</th><th>Valor ponderado</th></tr></thead><tbody>{(financial.by_stage||[]).map(row=><tr key={row.stage}><td>{OPPORTUNITY_STAGE_LABELS[row.stage]||row.stage}</td><td>{Number(row.count||0).toLocaleString('pt-BR')}</td><td>{currency(row.gross_value)}</td><td>{currency(row.weighted_value)}</td></tr>)}</tbody></table></div>
        </section>
      </>}

      {view==='cadences'&&<>
        <section className="card panel"><div className="panel-head"><div><h2>Desempenho das cadências</h2><p>Resposta, reunião e oportunidade geradas pelas sequências iniciadas no período.</p></div><Workflow size={20}/></div><CadenceTable data={cadencePerformance}/></section>
        <div className="report-two">
          <section className="card panel"><div className="panel-head"><div><h2>Canais de abordagem</h2><p>Resultado positivo das tarefas de cadência por canal.</p></div><MessageSquareText size={20}/></div><SimpleBarList data={cadenceChannels.map(row=>({label:TASK_TYPE_LABELS[row.channel]||row.channel,value:Number(row.attempts)?Number(row.positive)/Number(row.attempts)*100:0,display:(Number(row.attempts)?Math.round(Number(row.positive)/Number(row.attempts)*100):0)+'%',sub:Number(row.attempts||0).toLocaleString('pt-BR')+' tentativas'}))}/></section>
          <section className="card panel"><div className="panel-head"><div><h2>Reuniões e conversão</h2><p>Do primeiro contato até uma oportunidade concreta.</p></div><CalendarDays size={20}/></div><MeetingSnapshot data={meetingAnalytics}/></section>
        </div>
        {(meetingAnalytics.by_presenter||[]).length>0&&<section className="card panel"><div className="panel-head"><div><h2>Reuniões por apresentador</h2><p>Volume e realização no período.</p></div><Users size={20}/></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Apresentador</th><th>Reuniões</th><th>Realizadas</th><th>Taxa de realização</th></tr></thead><tbody>{meetingAnalytics.by_presenter.map(row=><tr key={row.user_id}><td>{teamMap[row.user_id]?.full_name||teamMap[row.user_id]?.email||'Equipe'}</td><td>{Number(row.meetings||0)}</td><td>{Number(row.completed||0)}</td><td>{Number(row.meetings)?Math.round(Number(row.completed)/Number(row.meetings)*100):0}%</td></tr>)}</tbody></table></div></section>}
      </>}

      {view==='team'&&isManager&&<>
        <section className="card panel"><div className="panel-head"><div><h2>Cobertura e produtividade da equipe</h2><p>Carteira, contatos, reuniões, oportunidades e pendências por responsável.</p></div><Users size={20}/></div><TeamTable data={teamPerformance}/></section>
        <section className="card panel"><div className="panel-head"><div><h2>Atividade por estado</h2><p>Onde a base está concentrada e onde o esforço comercial está acontecendo.</p></div><MapPin size={20}/></div><GeographyTable data={geography}/></section>
      </>}

      {view==='radar'&&<>
        <div className="report-two">
          <section className="card panel"><div className="panel-head"><div><h2>Distribuição do Radar Score</h2><p>Concentração da base nas faixas de prioridade comercial.</p></div><Gauge size={20}/></div><SimpleBarList data={scoreDistribution.map(row=>({label:row.bucket,value:Number(row.count)||0,display:Number(row.count||0).toLocaleString('pt-BR')+' editoras'}))}/><div className="small-callout">{Number(analytics?.score_alerts?.high_score_uncontacted||0).toLocaleString('pt-BR')} editoras com Score ≥ 90 ainda não receberam contato.</div></section>
          <section className="card panel"><div className="panel-head"><div><h2>Aderência por produto Radar</h2><p>Editoras com índice de aderência igual ou superior a 70.</p></div><Target size={20}/></div><ProductFitTable data={productFit}/></section>
        </div>
        <section className="card panel"><div className="panel-head"><div><h2>Distribuição geográfica</h2><p>Base, cobertura e volume de interações por estado.</p></div><MapPin size={20}/></div><GeographyTable data={geography}/></section>
      </>}
    </>}

    <style jsx>{`
      .report-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.report-export-select{min-width:245px}.report-kpi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}.report-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;padding:5px;background:#f2f4f7;border-radius:10px;width:max-content;max-width:100%}.report-tabs button{border:0;background:transparent;padding:8px 11px;border-radius:7px;font-weight:700;font-size:10px;color:#667085;cursor:pointer}.report-tabs button.active{background:#fff;color:#101828;box-shadow:0 1px 3px rgba(16,24,40,.08)}.report-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.action-reading{margin-bottom:14px}.action-insight-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.action-insight{padding:10px 11px;border:1px solid #e4e7ec;border-radius:9px;background:#fcfcfd;display:grid;gap:3px}.action-insight strong{font-size:11px}.action-insight span{font-size:10px;line-height:1.45;color:#667085}.action-insight.warning{background:#fffcf5;border-color:#f2d6a2}.action-insight.danger{background:#fff5f4;border-color:#f3c4c1}.action-insight.good{background:#f4fbf7;border-color:#bde4cb}.finance-total{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.finance-total>div{padding:12px;border:1px solid #eaecf0;border-radius:9px;background:#fcfcfd}.finance-total span{display:block;font-size:9px;color:#667085;margin-bottom:3px}.finance-total strong{font-size:18px}.coverage-big{display:grid;gap:4px;margin:12px 0}.coverage-big strong{font-size:36px;line-height:1}.coverage-big span{font-size:10px;color:#667085}.coverage-track{height:10px;border-radius:999px;background:#f2f4f7;overflow:hidden;margin-bottom:12px}.coverage-track i{display:block;height:100%;background:#ef3d36;border-radius:inherit}.small-callout{margin-top:10px;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #eaecf0;font-size:10px;color:#475467}.report-table-wrap{overflow:auto}.report-table{width:100%;border-collapse:collapse;font-size:10px}.report-table th{text-align:left;padding:8px;border-bottom:1px solid #d0d5dd;color:#667085;font-size:9px;text-transform:uppercase;letter-spacing:.03em}.report-table td{padding:9px 8px;border-bottom:1px solid #f0f1f3;vertical-align:top}.report-table tr:last-child td{border-bottom:0}.metric-card{position:relative}.delta-badge{position:absolute;right:10px;top:10px;display:inline-flex;align-items:center;gap:3px;font-size:8px;font-weight:800;padding:3px 5px;border-radius:999px;background:#f2f4f7;color:#667085}.delta-badge.up{background:#ecfdf3;color:#027a48}.delta-badge.down{background:#fff1f0;color:#b42318}.activity-chart-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.mini-chart{border:1px solid #eaecf0;border-radius:10px;padding:10px;background:#fcfcfd}.mini-chart-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.mini-chart-head strong{font-size:11px}.mini-chart-head span{font-size:16px;font-weight:800}.mini-bars{height:130px;display:flex;align-items:flex-end;gap:3px;border-bottom:1px solid #d0d5dd;padding-top:6px}.mini-bar-col{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;position:relative;min-width:2px}.mini-bar-col i{display:block;width:70%;background:#ef3d36;border-radius:3px 3px 0 0;min-height:1px}.mini-bar-col small{position:absolute;bottom:-18px;font-size:7px;color:#98a2b3;white-space:nowrap}.mini-chart{padding-bottom:25px}.funnel-list{display:grid;gap:9px}.funnel-row{display:grid;grid-template-columns:1fr auto;gap:3px 8px}.funnel-label{grid-column:1/-1;display:flex;justify-content:space-between;gap:8px;font-size:10px}.funnel-label strong{font-size:10px}.funnel-track{height:9px;background:#f2f4f7;border-radius:999px;overflow:hidden}.funnel-track i{display:block;height:100%;background:#101828;border-radius:999px}.funnel-row small{font-size:8px;color:#98a2b3}.simple-bar-list{display:grid;gap:9px}.simple-bar-row{display:grid;gap:3px}.simple-bar-label{display:flex;justify-content:space-between;gap:8px;font-size:10px}.simple-bar-row>small{font-size:8px;color:#98a2b3}.simple-bar-track{height:7px;background:#f2f4f7;border-radius:999px;overflow:hidden}.simple-bar-track i{display:block;height:100%;background:#475467;border-radius:999px}.meeting-snapshot{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.meeting-snapshot>div{padding:10px;border:1px solid #eaecf0;border-radius:9px;background:#fcfcfd;display:grid;gap:3px}.meeting-snapshot span{font-size:9px;color:#667085}.meeting-snapshot strong{font-size:18px}.meeting-snapshot .wide{grid-column:span 2}.product-fit-list{display:grid}.product-fit-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #f0f1f3}.product-fit-row:first-child{border-top:0}.product-fit-row>div{display:grid;gap:2px}.product-fit-row>div:last-child{text-align:right}.product-fit-row strong{font-size:10px}.product-fit-row span{font-size:8px;color:#98a2b3}@media(max-width:1050px){.activity-chart-grid{grid-template-columns:1fr}.meeting-snapshot{grid-template-columns:repeat(2,1fr)} .report-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.report-two{grid-template-columns:1fr}}@media(max-width:680px){.report-kpi-grid{grid-template-columns:1fr}.report-actions{width:100%}.report-actions>*{flex:1 1 100%}.action-insight-grid{grid-template-columns:1fr}.report-tabs{width:100%}.report-tabs button{flex:1 1 auto}}`
    }</style>
  </div>;
}

function deltaRatio(current,previous){
  const c=Number(current||0),p=Number(previous||0);
  if(!p)return c?null:0;
  return (c-p)/p;
}
function deltaText(current,previous){
  const ratio=deltaRatio(current,previous);
  if(ratio===null)return 'Novo no período';
  if(!ratio)return 'Sem variação';
  return (ratio>0?'+':'')+Math.round(ratio*100)+'%';
}
function buildActionableInsights(summary,analytics,personal){
  if(!summary||!analytics)return[];
  const out=[];
  const high=Number(analytics?.score_alerts?.high_score_uncontacted||0);
  if(high)out.push({tone:'warning',title:'Alta aderência ainda sem contato',text:high.toLocaleString('pt-BR')+' editoras com Radar Score ≥ 90 ainda não receberam contato.'});
  const noNext=Number(analytics?.alerts?.opportunities_without_next_action||0);
  if(noNext)out.push({tone:'danger',title:'Oportunidades sem próxima ação',text:noNext.toLocaleString('pt-BR')+' oportunidades abertas não têm próxima ação cadastrada.'});
  const stale=Number(analytics?.alerts?.stale_conversations_30d||0);
  if(stale)out.push({tone:'warning',title:'Conversas paradas',text:stale.toLocaleString('pt-BR')+' editoras estão há mais de 30 dias em “Conversando” sem atividade recente.'});
  const overdue=Number(analytics?.alerts?.overdue_tasks||0);
  if(overdue)out.push({tone:'danger',title:'Pendências vencidas',text:overdue.toLocaleString('pt-BR')+' tarefas estão atrasadas e precisam de revisão.'});
  const noPublisherNext=Number(analytics?.alerts?.no_next_action_publishers||0);
  if(noPublisherNext)out.push({tone:'warning',title:'Contas sem próximo passo',text:noPublisherNext.toLocaleString('pt-BR')+' editoras já contatadas estão sem próxima ação definida.'});
  const topProduct=[...(analytics?.product_fit||[])].sort((a,b)=>Number(b.uncontacted||0)-Number(a.uncontacted||0))[0];
  if(topProduct&&Number(topProduct.uncontacted||0)>0)out.push({title:'Oportunidade por produto',text:Number(topProduct.uncontacted).toLocaleString('pt-BR')+' editoras com alta aderência a '+topProduct.label+' ainda não foram contatadas.'});
  const cur=Number(analytics?.current?.interactions||0),prev=Number(analytics?.previous?.interactions||0),ratio=deltaRatio(cur,prev);
  if(ratio!==null&&Math.abs(ratio)>=.1)out.push({tone:ratio>0?'good':'warning',title:'Ritmo comercial '+(ratio>0?'acelerou':'caiu'),text:'O volume de interações '+(ratio>0?'subiu ':'caiu ')+Math.abs(Math.round(ratio*100))+'% em relação ao período anterior.'});
  if(!out.length)out.push({tone:'good',title:'Sem alertas críticos',text:'Não há gargalos relevantes detectados para o período selecionado.'});
  return out.slice(0,8);
}
function ComparisonMetric({icon,label,current,previous,sub}){
  const cur=Number(current||0),prev=Number(previous||0),ratio=deltaRatio(cur,prev);
  return <div className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{cur.toLocaleString('pt-BR')}</strong><small>{sub}</small></div><DeltaBadge ratio={ratio} current={cur} previous={prev}/></div>
}
function ValueMetric({icon,label,value,sub}){
  return <div className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>
}
function DeltaBadge({ratio,current,previous}){
  if(ratio===null)return <span className="delta-badge up"><TrendingUp size={12}/> novo</span>;
  if(!ratio)return <span className="delta-badge neutral">= período anterior</span>;
  const up=ratio>0;
  return <span className={'delta-badge '+(up?'up':'down')}>{up?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {Math.abs(Math.round(ratio*100))}%</span>
}
function groupActivitySeries(data,days){
  if(!Array.isArray(data))return[];
  if(days<=31)return data.map(row=>({...row,label:new Date(row.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}));
  const groups=[];
  data.forEach((row,index)=>{
    const bucket=Math.floor(index/7);
    if(!groups[bucket])groups[bucket]={date:row.date,interactions:0,meetings:0,opportunities:0};
    groups[bucket].interactions+=Number(row.interactions||0);
    groups[bucket].meetings+=Number(row.meetings||0);
    groups[bucket].opportunities+=Number(row.opportunities||0);
  });
  return groups.map(row=>({...row,label:new Date(row.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}));
}
function ActivityCharts({data,days}){
  const rows=groupActivitySeries(data,days);
  return <div className="activity-chart-grid"><MiniBars title="Interações" rows={rows} field="interactions"/><MiniBars title="Reuniões" rows={rows} field="meetings"/><MiniBars title="Oportunidades" rows={rows} field="opportunities"/></div>
}
function MiniBars({title,rows,field}){
  const max=Math.max(1,...rows.map(row=>Number(row[field]||0)));
  const labelEvery=Math.max(1,Math.ceil(rows.length/6));
  return <div className="mini-chart"><div className="mini-chart-head"><strong>{title}</strong><span>{rows.reduce((sum,row)=>sum+Number(row[field]||0),0).toLocaleString('pt-BR')}</span></div><div className="mini-bars">{rows.map((row,index)=><div className="mini-bar-col" key={row.date||index}><i style={{height:Math.max(Number(row[field]||0)?5:1,Number(row[field]||0)/max*100)+'%'}} title={row.label+': '+Number(row[field]||0)}/>{(index%labelEvery===0||index===rows.length-1)&&<small>{row.label}</small>}</div>)}</div></div>
}
function FunnelView({data}){
  if(!data?.length)return <p className="muted">Ainda não há histórico suficiente para calcular conversões.</p>;
  const max=Math.max(1,Number(data[0]?.reached||0),...data.map(row=>Number(row.reached||0)));
  return <div className="funnel-list">{data.map((row,index)=>{const reached=Number(row.reached||0);const prev=index?Number(data[index-1]?.reached||0):reached;const conversion=index===0?100:(prev?Math.round(reached/prev*100):0);return <div className="funnel-row" key={row.id||row.name}><div className="funnel-label"><span>{row.name}</span><strong>{reached.toLocaleString('pt-BR')}</strong></div><div className="funnel-track"><i style={{width:Math.max(reached?4:0,reached/max*100)+'%'}}/></div><small>{index===0?'Base do funil':conversion+'% da etapa anterior'}</small></div>})}</div>
}
function SimpleBarList({data}){
  if(!data?.length)return <p className="muted">Ainda não há dados suficientes.</p>;
  const max=Math.max(1,...data.map(row=>Number(row.value)||0));
  return <div className="simple-bar-list">{data.map((row,index)=><div className="simple-bar-row" key={(row.label||'item')+index}><div className="simple-bar-label"><span>{row.label}</span><strong>{row.display||Number(row.value||0).toLocaleString('pt-BR')}</strong></div>{row.sub&&<small>{row.sub}</small>}<div className="simple-bar-track"><i style={{width:Math.max(Number(row.value)?4:0,Number(row.value||0)/max*100)+'%'}}/></div></div>)}</div>
}
function MeetingSnapshot({data}){
  const completed=Number(data?.completed||0),followed=Number(data?.followed_by_opportunity||0);
  return <div className="meeting-snapshot"><div><span>Agendadas</span><strong>{Number(data?.scheduled||0)}</strong></div><div><span>Realizadas</span><strong>{completed}</strong></div><div><span>Canceladas</span><strong>{Number(data?.cancelled||0)}</strong></div><div><span>No-show</span><strong>{Number(data?.no_show||0)}</strong></div><div className="wide"><span>Conversão reunião → oportunidade</span><strong>{completed?Math.round(followed/completed*100):0}%</strong></div><div className="wide"><span>Tempo médio do 1º contato à reunião</span><strong>{Number(data?.avg_days_first_contact_to_meeting||0).toLocaleString('pt-BR',{maximumFractionDigits:1})} dias</strong></div></div>
}
function CadenceTable({data}){
  if(!data?.length)return <p className="muted">Nenhuma cadência iniciada no período selecionado.</p>;
  return <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Cadência</th><th>Editoras</th><th>Respostas</th><th>Reuniões</th><th>Oportunidades</th></tr></thead><tbody>{data.map(row=><tr key={row.id||row.name}><td><strong>{row.name}</strong></td><td>{Number(row.enrollments||0)}</td><td>{Number(row.responses||0)} <small>({Number(row.enrollments)?Math.round(Number(row.responses)/Number(row.enrollments)*100):0}%)</small></td><td>{Number(row.meetings||0)} <small>({Number(row.enrollments)?Math.round(Number(row.meetings)/Number(row.enrollments)*100):0}%)</small></td><td>{Number(row.opportunities||0)} <small>({Number(row.enrollments)?Math.round(Number(row.opportunities)/Number(row.enrollments)*100):0}%)</small></td></tr>)}</tbody></table></div>
}
function TeamTable({data}){
  if(!data?.length)return <p className="muted">Ainda não há atividade suficiente da equipe.</p>;
  return <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Responsável</th><th>Carteira</th><th>Cobertura</th><th>Interações</th><th>Reuniões</th><th>Oportunidades</th><th>Atrasadas</th></tr></thead><tbody>{data.map(row=><tr key={row.user_id}><td><strong>{row.full_name||row.email||'Equipe'}</strong></td><td>{Number(row.portfolio||0).toLocaleString('pt-BR')}</td><td>{Number(row.portfolio)?Math.round(Number(row.contacted||0)/Number(row.portfolio)*100):0}%</td><td>{Number(row.interactions||0)}</td><td>{Number(row.meetings||0)}</td><td>{Number(row.opportunities||0)}</td><td>{Number(row.overdue||0)}</td></tr>)}</tbody></table></div>
}
function ProductFitTable({data}){
  if(!data?.length)return <p className="muted">Aderência ainda não calculada.</p>;
  return <div className="product-fit-list">{data.map(row=><div className="product-fit-row" key={row.key}><div><strong>{row.label}</strong><span>{Number(row.high_fit||0).toLocaleString('pt-BR')} com alta aderência</span></div><div><strong>{Number(row.uncontacted||0).toLocaleString('pt-BR')}</strong><span>sem contato</span></div></div>)}</div>
}
function GeographyTable({data}){
  if(!data?.length)return <p className="muted">Sem dados geográficos suficientes.</p>;
  return <div className="report-table-wrap"><table className="report-table"><thead><tr><th>UF</th><th>Base</th><th>Contatadas</th><th>Cobertura</th><th>Interações</th></tr></thead><tbody>{data.slice(0,15).map(row=><tr key={row.state}><td><strong>{row.state}</strong></td><td>{Number(row.base_count||0).toLocaleString('pt-BR')}</td><td>{Number(row.contacted||0).toLocaleString('pt-BR')}</td><td>{Number(row.base_count)?Math.round(Number(row.contacted||0)/Number(row.base_count)*100):0}%</td><td>{Number(row.interactions||0).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div>
}
