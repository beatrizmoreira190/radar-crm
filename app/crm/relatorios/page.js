'use client';
import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Building2, CalendarDays, Clock3, Download, Gauge, Lightbulb, MapPin, MessageSquareText, Target, TrendingDown, TrendingUp, Users, Workflow, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { CHANNEL_LABELS, INTEREST_LABELS, MEETING_STATUS_LABELS, OPPORTUNITY_SERVICE_LABELS, OPPORTUNITY_STAGE_LABELS, PRIORITY_LABELS, RADAR_PRODUCT_LABELS, RESULT_LABELS, TASK_TYPE_LABELS } from '@/lib/constants';
import { XLSX_STYLE, downloadXlsx, xcell } from '@/lib/xlsxExport';

const TASK_STATUS_LABELS={open:'Aberta',in_progress:'Em andamento',done:'Concluída',cancelled:'Cancelada'};
const DIRECTION_LABELS={outbound:'Saída',inbound:'Entrada'};
const PIPELINE_TYPE_LABELS={open:'Em aberto',won:'Cliente',nurture:'Nutrição',lost:'Encerrada'};
const EXPORT_OPTIONS=[
  {key:'complete',label:'Completo — gestão + base'},
  {key:'executive',label:'Executivo — visão gerencial'},
  {key:'commercial',label:'Comercial — prospecção e responsabilidade'},
  {key:'pipeline',label:'Pipeline e oportunidades'},
  {key:'team',label:'Equipe e produtividade',managerOnly:true},
  {key:'cadences',label:'Cadências e abordagens'},
  {key:'meetings',label:'Reuniões'},
  {key:'publishers',label:'Base de editoras'}
];
const REPORT_SHEET_KEYS={
  complete:['dashboard','executive','comparison','trend','funnel','aging','cadences','channels','meetings','opportunityPipeline','opportunityServices','team','score','products','geography','publishers','interactions','opportunities','tasks','meetingDetails','cadenceDetails'],
  executive:['dashboard','executive','comparison','trend','funnel','aging','meetings','opportunityPipeline','opportunityServices','score','products','geography'],
  commercial:['executive','comparison','opportunityPipeline','opportunityServices','opportunities','score','products','publishers','interactions','tasks'],
  pipeline:['executive','funnel','aging','opportunityPipeline','opportunityServices','opportunities','meetingDetails'],
  team:['executive','comparison','team','interactions','meetingDetails','tasks'],
  cadences:['executive','cadences','channels','cadenceDetails','tasks'],
  meetings:['executive','meetings','meetingDetails'],
  publishers:['publishers','score','products','geography']
};

export default function ReportsPage(){
  const {supabase,membership,teamMap,activityVersion,isManager,user}=useCrm();
  const org=membership?.organization_id;
  const [summary,setSummary]=useState(null); const [analytics,setAnalytics]=useState(null); const [originMetrics,setOriginMetrics]=useState(null); const [opportunityPipeline,setOpportunityPipeline]=useState(null); const [days,setDays]=useState(30); const [loading,setLoading]=useState(true); const [exporting,setExporting]=useState(false); const [notice,setNotice]=useState(''); const [view,setView]=useState('overview'); const [exportType,setExportType]=useState('complete');

  async function load(){
    if(!org)return;
    setLoading(true);setNotice('');
    const [{data:summaryData,error:summaryError},{data:analyticsData,error:analyticsError},{data:originData,error:originError},{data:pipelineData,error:pipelineError}]=await Promise.all([
      supabase.rpc('crm_report_summary',{p_organization_id:org,p_days:days}),
      supabase.rpc('crm_report_dashboard',{p_organization_id:org,p_days:days}),
      supabase.rpc('crm_origin_metrics',{p_organization_id:org}),
      supabase.rpc('crm_opportunity_pipeline_summary',{p_organization_id:org,p_days:days})
    ]);
    if(summaryError||analyticsError||originError||pipelineError)setNotice(summaryError?.message||analyticsError?.message||originError?.message||pipelineError?.message||'Não foi possível calcular os relatórios.');
    setSummary(summaryData||null);setAnalytics(analyticsData||null);setOriginMetrics(originData||null);setOpportunityPipeline(pipelineData||null);setLoading(false);
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
  const meetingAnalytics=analytics?.meetings||{}; const geography=analytics?.geography||[]; const opportunityStats=opportunityPipeline||{};
  const teamPerformance=useMemo(()=>{const map=Object.fromEntries((originMetrics?.team||[]).map(item=>[item.user_id,item]));return (analytics?.team||[]).map(row=>({...row,originated_publishers:map[row.user_id]?.originated_publishers||0,current_responsibility:map[row.user_id]?.current_responsibility??row.portfolio??0}))},[analytics,originMetrics]);
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
      let query=supabase.from('publishers').select('id,name,trade_name,cnpj,city,state,priority,score,radar_fit_score,commercial_potential_score,data_quality_score,best_product,fit_pnld_literario,fit_pnld_didatico,fit_pnld_tecnico_metodologico,fit_radar_licitacoes,fit_radar_oportunidades,stage_id,owner_user_id,prospector_user_id,last_contact_at,next_action_at,commercial_temperature,general_email,phone,website').eq('organization_id',org).eq('archived',false);
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
      let query=supabase.from('opportunities').select('id,publisher_id,owner_user_id,created_by,title,service_key,service_type,radar_opportunities_title_count,pnld_notice,pnld_category,pnld_works_count,licitacoes_scope,description,stage,expected_close_date,loss_reason,next_step,next_action_at,created_at,updated_at,publishers(name)').eq('organization_id',org);
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

  async function downloadServerReport(path,fallbackName,errorMessage){
    const {data:{session},error:sessionError}=await supabase.auth.getSession();
    if(sessionError||!session?.access_token)throw new Error('Sua sessão expirou. Entre novamente no CRM para exportar o relatório.');

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),120000);
    try{
      const response=await fetch(path,{
        method:'GET',
        headers:{Authorization:'Bearer '+session.access_token},
        cache:'no-store',
        signal:controller.signal
      });
      if(!response.ok){
        const body=await response.json().catch(()=>({}));
        throw new Error(body?.error||errorMessage);
      }
      const blob=await response.blob();
      if(!blob.size)throw new Error('O relatório foi gerado sem conteúdo.');
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=response.headers.get('x-radar-file-name')||fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){
      if(error?.name==='AbortError')throw new Error('A geração demorou mais de 2 minutos. Tente novamente.');
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }

  function downloadCompleteReport(){
    return downloadServerReport(
      '/api/reports/complete?days='+days,
      'radar-completo-'+new Date().toISOString().slice(0,10)+'.xlsx',
      'Não foi possível gerar o relatório completo.'
    );
  }

  function downloadPublisherBase(){
    return downloadServerReport(
      '/api/reports/publishers',
      'radar-base-editoras-'+new Date().toISOString().slice(0,10)+'.xlsx',
      'Não foi possível gerar a base de editoras.'
    );
  }

  async function exportReport(){
    if(!summary||!analytics||!org)return;
    setExporting(true);setNotice('');
    try{
      if(exportType==='complete'){
        setNotice('Preparando o relatório completo no servidor…');
        await downloadCompleteReport();
        setNotice('Relatório completo gerado com sucesso.');
        return;
      }
      if(exportType==='publishers'){
        setNotice('Preparando a base de editoras no servidor…');
        await downloadPublisherBase();
        setNotice('Base de editoras exportada com sucesso.');
        return;
      }
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
      executiveRows.push([xcell('Gerado em',S.meta),dt(generatedAt),xcell('Escopo',S.meta),personal?'Responsabilidade atual':'Operação comercial']);
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
      executiveRows.push(['Cobertura da responsabilidade atual',percent(total?contacted/total:0),'','']);
      executiveRows.push(['Oportunidades abertas',int(opportunityStats.open_total||0),'','']);
      executiveRows.push(['Em negociação',int(opportunityStats.negotiation_total||0),'','']);
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

      const opportunityPipelineRows=(opportunityStats.by_stage||[]).map(row=>[
        OPPORTUNITY_STAGE_LABELS[row.stage]||row.stage,int(row.count)
      ]);
      opportunityPipelineRows.unshift(['TOTAL ABERTO',int(opportunityStats.open_total||0)]);
      const opportunityServiceRows=(opportunityStats.by_service||[]).map(row=>[
        OPPORTUNITY_SERVICE_LABELS[row.service_key]||'Outro serviço / projeto',
        int(row.open_count),
        int(row.radar_opportunities_titles||0),
        int(row.pnld_works||0)
      ]);

      const teamRows=(teamPerformance||[]).map(row=>[
        row.full_name||row.email||'Equipe',row.email||'',int(row.originated_publishers),int(row.current_responsibility),
        int(row.contacted),percent(Number(row.current_responsibility)?Number(row.contacted)/Number(row.current_responsibility):0),
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

      const publisherHeaders=['Editora','Nome fantasia','CNPJ','Cidade','UF','Etapa','Prioridade','Temperatura','Radar Score','Aderência Radar','Potencial comercial','Qualidade dos dados','Melhor produto','PNLD Literário','PNLD Didático','PNLD Técnico-Metodológico','Radar de Licitações','Radar de Oportunidades','Responsável atual','Prospector de origem','Último contato','Próxima ação','E-mail','Telefone','Site'];
      const publisherData=publishers.map(p=>[
        p.name||'',p.trade_name||'',p.cnpj||'',p.city||'',p.state||'',stageMap[p.stage_id]||'Sem etapa',
        PRIORITY_LABELS[p.priority]||p.priority||'',p.commercial_temperature||'',int(p.score),int(p.radar_fit_score),int(p.commercial_potential_score),int(p.data_quality_score),
        RADAR_PRODUCT_LABELS[p.best_product]||'',int(p.fit_pnld_literario),int(p.fit_pnld_didatico),int(p.fit_pnld_tecnico_metodologico),int(p.fit_radar_licitacoes),int(p.fit_radar_oportunidades),
        teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',teamMap[p.prospector_user_id]?.full_name||teamMap[p.prospector_user_id]?.email||'',dt(p.last_contact_at),dt(p.next_action_at),p.general_email||'',p.phone||'',p.website||''
      ]);

      const interactionHeaders=['Data/hora','Editora','Responsável','Contato','Canal','Direção','Resultado','Assunto','Resumo','Resposta / retorno','Interesse','Sinal de oportunidade','Próximo passo','Próxima ação','Duração (min)','Prioridade'];
      const interactionData=interactions.map(i=>[
        dt(i.occurred_at),i.publishers?.name||'',teamMap[i.user_id]?.full_name||teamMap[i.user_id]?.email||'',i.contact_name_snapshot||'',
        CHANNEL_LABELS[i.channel]||i.channel||'',DIRECTION_LABELS[i.direction]||i.direction||'',RESULT_LABELS[i.result]||i.result||'',
        i.subject||'',wrap(i.summary),wrap(i.response_summary),INTEREST_LABELS[i.interest_level]||i.interest_level||'',i.opportunity_signal||'',
        wrap(i.next_step),dt(i.next_action_at),int(i.duration_minutes),PRIORITY_LABELS[i.priority]||i.priority||''
      ]);

      const opportunityHeaders=['Editora','Oportunidade','Serviço Radar','Etapa','Títulos — Radar de Oportunidades','Edital / programa PNLD','Categoria / objeto PNLD','Obras PNLD','Escopo — Radar de Licitações','Outro serviço / projeto','Responsável atual','Previsão de conclusão','Próxima ação','Próximo passo','Motivo da perda','Criada em','Atualizada em','Descrição'];
      const opportunityData=opportunities.map(o=>[
        o.publishers?.name||'',o.title||'',OPPORTUNITY_SERVICE_LABELS[o.service_key]||'Outro serviço / projeto',OPPORTUNITY_STAGE_LABELS[o.stage]||o.stage||'',
        int(o.radar_opportunities_title_count),o.pnld_notice||'',o.pnld_category||'',int(o.pnld_works_count),wrap(o.licitacoes_scope),o.service_type||'',
        teamMap[o.owner_user_id]?.full_name||teamMap[o.owner_user_id]?.email||'',date(o.expected_close_date),dt(o.next_action_at),wrap(o.next_step),wrap(o.loss_reason),dt(o.created_at),dt(o.updated_at),wrap(o.description)
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

      const dashboardSheet=keys.includes('dashboard')?await buildExcelDashboard({
        personal,days,current,previous,total,contacted,overdue,opportunityStats,
        activitySeries,funnel,cadencePerformance,meetingAnalytics,scoreDistribution,productFit,geography,teamPerformance,teamMap
      }):null;

      const catalog={
        dashboard:dashboardSheet,
        executive:{name:'Resumo executivo',rows:executiveRows,widths:[38,22,42,22],merges:executiveMerges},
        comparison:makeTable('Comparativo','Período selecionado versus período imediatamente anterior de mesma duração.',['Indicador','Atual','Anterior','Variação','Variação %'],comparisonRows,[32,14,14,18,16]),
        trend:makeTable('Tendência','Atividade diária no período selecionado.',['Data','Interações','Reuniões','Oportunidades'],trendRows,[16,14,14,16]),
        funnel:makeTable('Funil','Avanço acumulado da base e conversão sequencial entre etapas.',['Etapa','Alcançaram a etapa','Conversão da etapa anterior','Atualmente na etapa','Dias médios na etapa'],funnelRows,[30,18,22,18,18]),
        aging:makeTable('Tempo por etapa','Tempo médio das editoras atualmente em cada etapa.',['Etapa','Editoras atuais','Dias médios'],agingRows,[30,18,18]),
        cadences:makeTable('Cadências','Desempenho das cadências iniciadas no período.',['Cadência','Editoras','Respostas','Taxa de resposta','Reuniões','Taxa de reunião','Oportunidades','Taxa de oportunidade'],cadenceRows,[34,12,12,18,12,18,16,20]),
        channels:makeTable('Abordagens','Resultados dos canais utilizados nas tarefas de cadência.',['Canal','Tentativas','Resultados positivos','Taxa positiva'],channelRows,[22,14,20,16]),
        meetings:makeTable('Reuniões','Resumo das reuniões no período selecionado.',['Indicador','Valor'],meetingRows,[48,18]),
        opportunityPipeline:makeTable('Pipeline de oportunidades','Oportunidades abertas por estágio, sem dados financeiros.',['Etapa','Oportunidades'],opportunityPipelineRows,[30,18]),
        opportunityServices:makeTable('Oportunidades por serviço','Oportunidades abertas por linha de serviço da Radar.',['Serviço','Abertas','Títulos em divulgação','Obras PNLD'],opportunityServiceRows,[34,14,20,16]),
        team:makeTable('Equipe','Origem de contas, responsabilidade atual e produtividade comercial.',['Pessoa','E-mail','Originadas','Responsabilidade atual','Contatadas','Cobertura atual','Interações','Reuniões','Oportunidades','Tarefas atrasadas'],teamRows,[28,30,12,18,12,14,14,12,16,18]),
        score:makeTable('Radar Score','Distribuição da base por faixa de Radar Score e alertas de alta prioridade.',['Faixa / alerta','Editoras'],scoreRows,[34,16]),
        products:makeTable('Aderência por produto','Editoras com aderência alta (≥70) em cada produto Radar.',['Produto','Alta aderência','Ainda sem contato','% sem contato'],productRows,[34,18,18,16]),
        geography:makeTable('Geografia','Cobertura e atividade comercial por estado.',['UF','Base','Contatadas','Cobertura','Interações no período'],geoRows,[10,14,14,14,20]),
        publishers:makeTable('Editoras',personal?'Editoras sob responsabilidade atual do usuário.':'Base ativa da operação.',publisherHeaders,publisherData,[30,26,18,22,8,24,14,14,12,15,18,17,25,14,14,22,18,20,24,24,20,20,28,18,32]),
        interactions:makeTable('Interações','Contatos registrados nos últimos '+days+' dias.',interactionHeaders,interactionData,[19,28,24,22,14,12,22,28,42,42,14,20,40,19,14,14]),
        opportunities:makeTable('Oportunidades','Negociações registradas no CRM sem valores comerciais sensíveis.',opportunityHeaders,opportunityData,[28,30,26,18,22,24,28,14,36,28,24,18,19,38,32,19,19,42]),
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
      <div><div className="eyebrow">Inteligência comercial</div><h1>Relatórios</h1><p>{personal?'Acompanhe sua responsabilidade atual, ritmo comercial e próximos pontos de atenção.':'Acompanhe desempenho, conversão, cobertura e oportunidades da operação em um só lugar.'}</p></div>
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
        <ValueMetric icon={<Target/>} label="Oportunidades abertas" value={Number(opportunityStats.open_total||0).toLocaleString('pt-BR')} sub={Number(opportunityStats.negotiation_total||0).toLocaleString('pt-BR')+' em negociação'}/>
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
            <div className="panel-head"><div><h2>Pipeline de oportunidades</h2><p>Volume de oportunidades abertas por estágio, sem valores comerciais.</p></div><Target size={20}/></div>
            <div className="finance-total"><div><span>Abertas</span><strong>{Number(opportunityStats.open_total||0).toLocaleString('pt-BR')}</strong></div><div><span>Em negociação</span><strong>{Number(opportunityStats.negotiation_total||0).toLocaleString('pt-BR')}</strong></div></div>
            <SimpleBarList data={(opportunityStats.by_stage||[]).map(row=>({label:OPPORTUNITY_STAGE_LABELS[row.stage]||row.stage,value:Number(row.count)||0,display:Number(row.count||0).toLocaleString('pt-BR')}))}/>
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
        <section className="card panel"><div className="panel-head"><div><h2>Oportunidades por etapa e serviço</h2><p>Acompanhe o volume comercial sem armazenar valores sensíveis.</p></div><Target size={20}/></div>
          <div className="finance-total"><div><span>Abertas</span><strong>{Number(opportunityStats.open_total||0).toLocaleString('pt-BR')}</strong></div><div><span>Propostas enviadas</span><strong>{Number(opportunityStats.proposal_total||0).toLocaleString('pt-BR')}</strong></div><div><span>Em negociação</span><strong>{Number(opportunityStats.negotiation_total||0).toLocaleString('pt-BR')}</strong></div><div><span>Ganhas no período</span><strong>{Number(opportunityStats.won_period||0).toLocaleString('pt-BR')}</strong></div></div>
          <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Etapa</th><th>Oportunidades</th></tr></thead><tbody>{(opportunityStats.by_stage||[]).map(row=><tr key={row.stage}><td>{OPPORTUNITY_STAGE_LABELS[row.stage]||row.stage}</td><td>{Number(row.count||0).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div>
          {(opportunityStats.by_service||[]).length>0&&<div className="report-table-wrap" style={{marginTop:14}}><table className="report-table"><thead><tr><th>Serviço</th><th>Abertas</th><th>Títulos em divulgação</th><th>Obras PNLD</th></tr></thead><tbody>{opportunityStats.by_service.map(row=><tr key={row.service_key}><td>{OPPORTUNITY_SERVICE_LABELS[row.service_key]||'Outro serviço / projeto'}</td><td>{Number(row.open_count||0).toLocaleString('pt-BR')}</td><td>{Number(row.radar_opportunities_titles||0).toLocaleString('pt-BR')}</td><td>{Number(row.pnld_works||0).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div>}
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
        <section className="card panel"><div className="panel-head"><div><h2>Cobertura e produtividade da equipe</h2><p>Origem das contas, responsabilidade atual, contatos, reuniões, oportunidades e pendências.</p></div><Users size={20}/></div><TeamTable data={teamPerformance}/></section>
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

    <style jsx global>{`
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
  return <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Pessoa</th><th>Originadas</th><th>Responsabilidade atual</th><th>Cobertura atual</th><th>Interações</th><th>Reuniões</th><th>Oportunidades</th><th>Atrasadas</th></tr></thead><tbody>{data.map(row=><tr key={row.user_id}><td><strong>{row.full_name||row.email||'Equipe'}</strong></td><td>{Number(row.originated_publishers||0).toLocaleString('pt-BR')}</td><td>{Number(row.current_responsibility||0).toLocaleString('pt-BR')}</td><td>{Number(row.current_responsibility)?Math.round(Number(row.contacted||0)/Number(row.current_responsibility)*100):0}%</td><td>{Number(row.interactions||0)}</td><td>{Number(row.meetings||0)}</td><td>{Number(row.opportunities||0)}</td><td>{Number(row.overdue||0)}</td></tr>)}</tbody></table></div>
}
function ProductFitTable({data}){
  if(!data?.length)return <p className="muted">Aderência ainda não calculada.</p>;
  return <div className="product-fit-list">{data.map(row=><div className="product-fit-row" key={row.key}><div><strong>{row.label}</strong><span>{Number(row.high_fit||0).toLocaleString('pt-BR')} com alta aderência</span></div><div><strong>{Number(row.uncontacted||0).toLocaleString('pt-BR')}</strong><span>sem contato</span></div></div>)}</div>
}
function GeographyTable({data}){
  if(!data?.length)return <p className="muted">Sem dados geográficos suficientes.</p>;
  return <div className="report-table-wrap"><table className="report-table"><thead><tr><th>UF</th><th>Base</th><th>Contatadas</th><th>Cobertura</th><th>Interações</th></tr></thead><tbody>{data.slice(0,15).map(row=><tr key={row.state}><td><strong>{row.state}</strong></td><td>{Number(row.base_count||0).toLocaleString('pt-BR')}</td><td>{Number(row.contacted||0).toLocaleString('pt-BR')}</td><td>{Number(row.base_count)?Math.round(Number(row.contacted||0)/Number(row.base_count)*100):0}%</td><td>{Number(row.interactions||0).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div>
}

async function buildExcelDashboard({personal,days,current,previous,total,contacted,overdue,opportunityStats,activitySeries,funnel,cadencePerformance,meetingAnalytics,scoreDistribution,productFit,geography,teamPerformance,teamMap}){
  const S=XLSX_STYLE;
  const cols=14;
  const rows=Array.from({length:86},()=>Array(cols).fill(''));
  rows[0][0]=xcell(personal?'RADAR — Dashboard pessoal':'RADAR — Dashboard gerencial',S.title);
  rows[1][0]=xcell('Período',S.meta);rows[1][1]='Últimos '+days+' dias';
  rows[1][3]=xcell('Gerado em',S.meta);rows[1][4]=xcell(new Date(),S.datetime,'datetime');
  rows[3][0]=xcell('Interações',S.meta);rows[3][2]=xcell('Reuniões realizadas',S.meta);rows[3][4]=xcell('Oportunidades criadas',S.meta);rows[3][6]=xcell('Oportunidades abertas',S.meta);rows[3][9]=xcell('Cobertura comercial',S.meta);rows[3][12]=xcell('Tarefas atrasadas',S.meta);
  rows[4][0]=xcell(Number(current?.interactions||0),S.integer,'number');
  rows[4][2]=xcell(Number(current?.meetings_completed||0),S.integer,'number');
  rows[4][4]=xcell(Number(current?.opportunities_created||0),S.integer,'number');
  rows[4][6]=xcell(Number(opportunityStats?.open_total||0),S.integer,'number');
  rows[4][9]=xcell(total?contacted/total:0,S.percent,'number');
  rows[4][12]=xcell(Number(overdue||0),S.integer,'number');

  const images=[];
  const pushImage=async(chart,row,column)=>{
    const blob=await chart.blob;
    images.push({
      content:blob,contentType:'image/png',width:chart.width,height:chart.height,dpi:96,
      anchor:{row,column},title:chart.title,description:chart.description||chart.title
    });
  };

  const activity=groupActivitySeries(activitySeries,days);
  await pushImage({
    title:'Evolução de interações',width:520,height:235,
    blob:lineChartPng('Evolução de interações','Ritmo comercial ao longo do período',activity.map(r=>({label:r.label,value:Number(r.interactions||0)})))
  },7,1);
  await pushImage({
    title:'Funil comercial',width:520,height:235,
    blob:horizontalBarChartPng('Funil comercial','Editoras que alcançaram cada etapa',(funnel||[]).map(r=>({label:r.name,value:Number(r.reached||0)})).slice(0,10))
  },7,8);

  await pushImage({
    title:'Pipeline de oportunidades',width:520,height:235,
    blob:verticalBarChartPng('Pipeline de oportunidades','Oportunidades abertas por etapa',(opportunityStats?.by_stage||[]).map(row=>({
      label:OPPORTUNITY_STAGE_LABELS[row.stage]||row.stage,value:Number(row.count||0)
    })))
  },23,1);
  await pushImage({
    title:'Cadências',width:520,height:235,
    blob:horizontalBarChartPng('Desempenho das cadências','Taxa de resposta das sequências',(cadencePerformance||[]).map(r=>({
      label:r.name,value:Number(r.enrollments)?Math.round(Number(r.responses||0)/Number(r.enrollments)*100):0
    })).slice(0,8),{suffix:'%'})
  },23,8);

  await pushImage({
    title:'Reuniões',width:520,height:235,
    blob:verticalBarChartPng('Reuniões','Status no período',[
      {label:'Agendadas',value:Number(meetingAnalytics?.scheduled||0)},
      {label:'Realizadas',value:Number(meetingAnalytics?.completed||0)},
      {label:'Canceladas',value:Number(meetingAnalytics?.cancelled||0)},
      {label:'No-show',value:Number(meetingAnalytics?.no_show||0)}
    ])
  },39,1);
  await pushImage({
    title:'Radar Score',width:520,height:235,
    blob:verticalBarChartPng('Distribuição do Radar Score','Editoras por faixa',(scoreDistribution||[]).map(r=>({label:r.bucket,value:Number(r.count||0)})))
  },39,8);

  await pushImage({
    title:'Aderência por produto',width:520,height:235,
    blob:horizontalBarChartPng('Aderência por produto Radar','Editoras com aderência ≥ 70',(productFit||[]).map(r=>({label:r.label,value:Number(r.high_fit||0)})))
  },55,1);
  await pushImage({
    title:'Distribuição geográfica',width:520,height:235,
    blob:horizontalBarChartPng('Distribuição geográfica','Estados com maior base',(geography||[]).slice(0,8).map(r=>({label:r.state,value:Number(r.base_count||0)})))
  },55,8);

  if((teamPerformance||[]).length){
    await pushImage({
      title:'Cobertura da responsabilidade atual',width:520,height:235,
      blob:horizontalBarChartPng('Cobertura da responsabilidade atual','Percentual das editoras sob responsabilidade atual já contatadas',(teamPerformance||[]).slice(0,8).map(r=>({
        label:r.full_name||r.email||'Equipe',value:Number(r.portfolio)?Math.round(Number(r.contacted||0)/Number(r.portfolio)*100):0
      })),{suffix:'%'})
    },71,1);
    await pushImage({
      title:'Atividade da equipe',width:520,height:235,
      blob:horizontalBarChartPng('Atividade da equipe','Interações registradas no período',(teamPerformance||[]).slice(0,8).map(r=>({
        label:r.full_name||r.email||'Equipe',value:Number(r.interactions||0)
      })))
    },71,8);
  }

  return {
    name:'Dashboard',
    rows,
    widths:Array(cols).fill(12),
    merges:['A1:N1','A2:B2','D2:E2','A4:B4','C4:D4','E4:F4','G4:I4','J4:L4','M4:N4','A5:B5','C5:D5','E5:F5','G5:I5','J5:L5','M5:N5'],
    images,
    showGridLines:false,
    zoomScale:.85
  };
}

function chartCanvas(title,subtitle,width=520,height=235){
  const canvas=document.createElement('canvas');
  const scale=2;canvas.width=width*scale;canvas.height=height*scale;
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='#e4e7ec';ctx.lineWidth=1;ctx.strokeRect(.5,.5,width-1,height-1);
  ctx.fillStyle='#101828';ctx.font='700 16px Arial';ctx.fillText(title,18,26);
  ctx.fillStyle='#667085';ctx.font='11px Arial';ctx.fillText(subtitle||'',18,44);
  return {canvas,ctx,width,height,left:46,top:62,right:18,bottom:34};
}
function canvasToPng(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível gerar o gráfico.')),'image/png'));
}
function emptyChart(ctx,width,height,text='Sem dados suficientes'){
  ctx.fillStyle='#98a2b3';ctx.font='12px Arial';ctx.textAlign='center';ctx.fillText(text,width/2,height/2+12);ctx.textAlign='left';
}
async function lineChartPng(title,subtitle,data){
  const {canvas,ctx,width,height,left,top,right,bottom}=chartCanvas(title,subtitle);
  const rows=(data||[]).filter(r=>Number.isFinite(Number(r.value)));
  if(!rows.length||!rows.some(r=>Number(r.value)>0)){emptyChart(ctx,width,height);return canvasToPng(canvas)}
  const w=width-left-right,h=height-top-bottom,max=Math.max(1,...rows.map(r=>Number(r.value)||0));
  ctx.strokeStyle='#eaecf0';ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=top+h*i/3;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+w,y);ctx.stroke()}
  ctx.strokeStyle='#ef3d36';ctx.lineWidth=3;ctx.beginPath();
  rows.forEach((r,i)=>{const x=left+(rows.length===1?0:w*i/(rows.length-1));const y=top+h-(Number(r.value)||0)/max*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});
  ctx.stroke();
  ctx.fillStyle='#ef3d36';
  rows.forEach((r,i)=>{const x=left+(rows.length===1?0:w*i/(rows.length-1));const y=top+h-(Number(r.value)||0)/max*h;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill()});
  ctx.fillStyle='#667085';ctx.font='9px Arial';ctx.textAlign='center';
  const every=Math.max(1,Math.ceil(rows.length/6));
  rows.forEach((r,i)=>{if(i%every===0||i===rows.length-1)ctx.fillText(r.label||'',left+(rows.length===1?0:w*i/(rows.length-1)),height-12)});
  ctx.textAlign='left';
  return canvasToPng(canvas);
}
async function horizontalBarChartPng(title,subtitle,data,{suffix=''}={}){
  const {canvas,ctx,width,height,left,top,right,bottom}=chartCanvas(title,subtitle);
  const rows=(data||[]).filter(r=>r&&r.label!==undefined).slice(0,9);
  if(!rows.length||!rows.some(r=>Number(r.value)>0)){emptyChart(ctx,width,height);return canvasToPng(canvas)}
  const labelW=145,w=width-left-right-labelW,h=height-top-bottom,max=Math.max(1,...rows.map(r=>Number(r.value)||0));
  const gap=6,barH=Math.max(10,(h-gap*(rows.length-1))/rows.length);
  ctx.font='10px Arial';
  rows.forEach((r,i)=>{
    const y=top+i*(barH+gap);const value=Number(r.value)||0;
    ctx.fillStyle='#475467';ctx.textAlign='right';ctx.fillText(shortLabel(String(r.label),24),left+labelW-8,y+barH*.7);
    ctx.fillStyle='#f2f4f7';ctx.fillRect(left+labelW,y,w,barH);
    ctx.fillStyle='#ef3d36';ctx.fillRect(left+labelW,y,Math.max(value?3:0,value/max*w),barH);
    ctx.fillStyle='#101828';ctx.textAlign='left';ctx.font='700 10px Arial';ctx.fillText(formatChartNumber(value)+suffix,left+labelW+Math.max(value?3:0,value/max*w)+6,y+barH*.7);ctx.font='10px Arial';
  });
  ctx.textAlign='left';
  return canvasToPng(canvas);
}
async function verticalBarChartPng(title,subtitle,data,{currency=false,suffix=''}={}){
  const {canvas,ctx,width,height,left,top,right,bottom}=chartCanvas(title,subtitle);
  const rows=(data||[]).filter(r=>r&&r.label!==undefined);
  if(!rows.length||!rows.some(r=>Number(r.value)>0)){emptyChart(ctx,width,height);return canvasToPng(canvas)}
  const w=width-left-right,h=height-top-bottom,max=Math.max(1,...rows.map(r=>Number(r.value)||0));
  const slot=w/rows.length,barW=Math.min(58,slot*.58);
  ctx.strokeStyle='#eaecf0';ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=top+h*i/3;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+w,y);ctx.stroke()}
  rows.forEach((r,i)=>{
    const value=Number(r.value)||0;const bh=value/max*h;const x=left+i*slot+(slot-barW)/2;const y=top+h-bh;
    ctx.fillStyle='#ef3d36';ctx.fillRect(x,y,barW,bh);
    ctx.fillStyle='#101828';ctx.font='700 10px Arial';ctx.textAlign='center';ctx.fillText(currency?compactCurrency(value):formatChartNumber(value)+suffix,x+barW/2,Math.max(top+10,y-5));
    ctx.fillStyle='#667085';ctx.font='9px Arial';ctx.fillText(shortLabel(String(r.label),15),x+barW/2,height-12);
  });
  ctx.textAlign='left';
  return canvasToPng(canvas);
}
function shortLabel(text,max){return text.length>max?text.slice(0,max-1)+'…':text}
function formatChartNumber(value){return new Intl.NumberFormat('pt-BR',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1}).format(value||0)}
function compactCurrency(value){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',notation:'compact',maximumFractionDigits:1}).format(value||0)}
