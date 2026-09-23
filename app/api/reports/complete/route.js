import writeExcelFile from 'write-excel-file/node';
import { authenticateRequest } from '@/lib/server/googleCalendar';
import {
  CHANNEL_LABELS, EDITORIAL_PROFILE_CONFIDENCE_LABELS, EDITORIAL_PROFILE_STATUS_LABELS,
  INTEREST_LABELS, MEETING_STATUS_LABELS, OPPORTUNITY_SERVICE_LABELS, OPPORTUNITY_STAGE_LABELS,
  PRIORITY_LABELS, PUBLISHER_ARCHIVE_REASON_LABELS, PUBLISHER_COMMERCIAL_PROFILE_LABELS,
  RADAR_PRODUCT_LABELS, RESULT_LABELS, TASK_TYPE_LABELS
} from '@/lib/constants';

export const runtime='nodejs';
export const maxDuration=60;

const TASK_STATUS_LABELS={open:'Aberta',in_progress:'Em andamento',done:'Concluída',cancelled:'Cancelada'};
const DIRECTION_LABELS={outbound:'Saída',inbound:'Entrada'};

const headerStyle={fontWeight:'bold',textColor:'#FFFFFF',backgroundColor:'#111827',align:'center',alignVertical:'center',wrap:true,borderColor:'#D0D5DD',borderStyle:'thin'};
const titleStyle={fontWeight:'bold',fontSize:16,textColor:'#101828'};
const metaStyle={fontWeight:'bold',textColor:'#344054',backgroundColor:'#F2F4F7'};

function cell(value,style={}){return {value:value??'',...style}}
function row(values){return values.map(value=>cell(value))}
function header(values){return values.map(value=>cell(value,headerStyle))}
function widths(values){return values.map(width=>({width:Math.max(4,Math.min(60,width))}))}
function text(value){return value==null?'':String(value)}
function integer(value){const n=Number(value);return Number.isFinite(n)?n:0}
function date(value,withTime=false){
  if(!value)return'';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return'';
  return d.toLocaleString('pt-BR',withTime?{dateStyle:'short',timeStyle:'short'}:{dateStyle:'short'});
}
function stageLabel(value){return OPPORTUNITY_STAGE_LABELS[value]||value||''}
function serviceLabel(value){return OPPORTUNITY_SERVICE_LABELS[value]||'Outro serviço / projeto'}

function joinArray(value,separator=' · '){return Array.isArray(value)?value.filter(Boolean).join(separator):text(value)}
function yesNo(value){if(value==null||value==='')return'';const v=String(value).toLowerCase();return ['true','1','sim','s','yes'].includes(v)?'Sim':['false','0','não','nao','n','no'].includes(v)?'Não':String(value)}
function sourceUrls(value){const rows=Array.isArray(value)?value:[];return rows.map(item=>item?.url).filter(Boolean).join(' | ')}
function commercialProfileSource(value){return value==='manual'?'Confirmado manualmente':value==='editorial_profile'?'Confirmado pelo perfil editorial':'Padrão do sistema'}
function contactSource(value){const ref=String(value||'');if(ref.startsWith('receita:cnpj:'))return'Receita Federal — quadro societário';if(/^https?:\/\//i.test(ref))return'Fonte pública';return ref?'Importação / referência externa':'Cadastro Radar'}
function displayName(p){return p?.commercial_name||p?.trade_name||p?.name||p?.legal_name||''}
function cnpjBase(value){const d=String(value||'').replace(/\D/g,'');return d.length>=8?d.slice(0,8):''}
function normalizedName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase()}

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

function tableSheet(name,description,headers,data,columnWidths){
  const resolvedWidths=columnWidths||headers.map(label=>Math.max(10,Math.min(38,Math.ceil(String(label).length*.85)+5)));
  return {
    data:[
      [cell(name,titleStyle),...Array(Math.max(0,headers.length-1)).fill(null)],
      [cell(description),...Array(Math.max(0,headers.length-1)).fill(null)],
      [],
      header(headers),
      ...data.map(row)
    ],
    sheet:name.slice(0,31),
    columns:widths(resolvedWidths),
    stickyRowsCount:4,
    showGridLines:true
  };
}

export async function GET(request){
  try{
    const {supabase,membership,user}=await authenticateRequest(request);
    const url=new URL(request.url);
    const days=Math.max(1,Math.min(Number(url.searchParams.get('days')||30),365));
    const org=membership.organization_id;
    const isManager=['owner','admin','supervisor'].includes(membership.role);
    const since=new Date(Date.now()-days*86400000).toISOString();

    const [
      summaryR,analyticsR,originR,pipelineR,teamR,stagesR
    ]=await Promise.all([
      supabase.rpc('crm_report_summary',{p_organization_id:org,p_days:days}),
      supabase.rpc('crm_report_dashboard',{p_organization_id:org,p_days:days}),
      supabase.rpc('crm_origin_metrics',{p_organization_id:org}),
      supabase.rpc('crm_opportunity_pipeline_summary',{p_organization_id:org,p_days:days}),
      supabase.from('org_members').select('user_id,full_name,email,role,active').eq('organization_id',org).eq('active',true).order('full_name'),
      supabase.from('pipeline_stages').select('id,name,position').eq('organization_id',org).eq('active',true).order('position')
    ]);

    const firstError=[summaryR.error,analyticsR.error,originR.error,pipelineR.error,teamR.error,stagesR.error].find(Boolean);
    if(firstError)throw firstError;

    const summary=summaryR.data||{};
    const analytics=analyticsR.data||{};
    const origin=originR.data||{};
    const opportunityPipeline=pipelineR.data||{};
    const team=teamR.data||[];
    const stages=stagesR.data||[];
    const teamMap=Object.fromEntries(team.map(member=>[member.user_id,member]));
    const stageMap=Object.fromEntries(stages.map(stage=>[stage.id,stage.name]));

    const [publishers,interactions,opportunities,tasks,meetings,cadenceEnrollments,contacts,archivedPublishers]=await Promise.all([
      fetchPaged(()=>{
        let query=supabase.from('publishers').select(
          'id,name,legal_name,trade_name,commercial_name,commercial_name_confidence,commercial_name_sources,commercial_name_verified_at,cnpj,registration_status,cnpj_status_date,cnpj_status_reason,cnpj_start_date,cnpj_special_status,cnpj_special_status_date,simples_nacional,mei,city,state,postal_code,address_type,address_street,address_number,address_complement,neighborhood,company_size,legal_nature,cnae_primary,cnae_description,cnae_secondary,matrix_branch,market_segments,owners_names,commercial_profile_code,commercial_profile_source,commercial_profile_note,commercial_profile_reviewed_at,commercial_profile_reviewed_by,editorial_profile,editorial_profile_status,editorial_profile_confidence,editorial_profile_verified_at,editorial_profile_notes,web_enrichment_status,web_enrichment_sources,web_enrichment_verified_at,web_enrichment_notes,priority,score,radar_fit_score,commercial_potential_score,data_quality_score,best_product,fit_pnld_literario,fit_pnld_didatico,fit_pnld_tecnico_metodologico,fit_radar_licitacoes,fit_radar_oportunidades,stage_id,owner_user_id,prospector_user_id,last_contact_at,next_action_at,commercial_temperature,general_email,alternate_emails,phone,secondary_phone,website,instagram,linkedin_url'
        ).eq('organization_id',org).eq('archived',false);
        if(!isManager)query=query.eq('owner_user_id',user.id);
        return query.order('name');
      }),
      fetchPaged(()=>{
        let query=supabase.from('interactions').select('id,publisher_id,user_id,occurred_at,channel,direction,result,subject,summary,response_summary,opportunity_signal,next_step,next_action_at,interest_level,priority,contact_name_snapshot,duration_minutes,publishers(name)').eq('organization_id',org).gte('occurred_at',since);
        if(!isManager)query=query.eq('user_id',user.id);
        return query.order('occurred_at',{ascending:false});
      }),
      fetchPaged(()=>{
        let query=supabase.from('opportunities').select('id,publisher_id,owner_user_id,created_by,title,service_key,service_type,radar_opportunities_title_count,pnld_notice,pnld_category,pnld_works_count,licitacoes_scope,description,stage,expected_close_date,loss_reason,next_step,next_action_at,created_at,updated_at,publishers(name)').eq('organization_id',org);
        if(!isManager)query=query.or(`owner_user_id.eq.${user.id},created_by.eq.${user.id}`);
        return query.order('updated_at',{ascending:false});
      }),
      fetchPaged(()=>{
        let query=supabase.from('tasks').select('id,publisher_id,assigned_to,created_by,title,description,task_type,due_at,status,priority,completed_at,created_at,cadence_enrollment_id,automation_key,result_code,result_note,publishers(name)').eq('organization_id',org).or(`status.eq.open,status.eq.in_progress,completed_at.gte.${since}`);
        if(!isManager)query=query.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`);
        return query.order('due_at',{ascending:true,nullsFirst:false});
      }),
      fetchPaged(()=>{
        let query=supabase.from('meetings').select('id,publisher_id,title,meeting_type,scheduled_start,duration_minutes,status,scheduled_by,presenter_user_id,outcome_interest,next_step,follow_up_at,created_at,outcome_notes,publishers(name)').eq('organization_id',org).gte('scheduled_start',since);
        if(!isManager)query=query.or(`presenter_user_id.eq.${user.id},scheduled_by.eq.${user.id}`);
        return query.order('scheduled_start',{ascending:false});
      }),
      fetchPaged(()=>{
        let query=supabase.from('cadence_enrollments').select('id,cadence_id,publisher_id,user_id,status,started_at,completed_at,paused_until,pause_reason,last_result_code,cadences(name,cadence_key),publishers(name)').eq('organization_id',org).gte('started_at',since);
        if(!isManager)query=query.eq('user_id',user.id);
        return query.order('started_at',{ascending:false});
      }),
      fetchPaged(()=>supabase.from('contacts').select(
        'id,publisher_id,full_name,job_title,department,email,phone,mobile,linkedin_url,is_decision_maker,preferred_channel,notes,source_ref,active,created_at,updated_at'
      ).eq('organization_id',org).eq('active',true).order('full_name')),
      isManager?fetchPaged(()=>supabase.from('publishers').select(
        'id,name,legal_name,trade_name,commercial_name,cnpj,registration_status,archive_reason_code,archive_reason_note,archived_at,archived_by,commercial_profile_code,commercial_profile_source,editorial_profile,editorial_profile_status,city,state'
      ).eq('organization_id',org).eq('archived',true).order('archived_at',{ascending:false,nullsFirst:false})):Promise.resolve([])
    ]);

    const current=analytics.current||{};
    const previous=analytics.previous||{};
    const originTeam=Object.fromEntries((origin.team||[]).map(item=>[item.user_id,item]));
    const teamRows=(analytics.team||[]).map(item=>{
      const extra=originTeam[item.user_id]||{};
      return [
        item.full_name||item.email||item.name||'Equipe',
        item.email||teamMap[item.user_id]?.email||'',
        integer(extra.originated_publishers),
        integer(extra.current_responsibility??item.portfolio),
        integer(item.contacted),
        integer(item.interactions),
        integer(item.meetings),
        integer(item.opportunities),
        integer(item.overdue)
      ];
    });

    const executiveRows=[
      [cell(isManager?'RADAR — Relatório gerencial completo':'RADAR — Relatório pessoal completo',titleStyle),null,null,null],
      [cell('Período',metaStyle),`Últimos ${days} dias`,cell('Gerado em',metaStyle),new Date().toLocaleString('pt-BR')],
      [cell('Escopo',metaStyle),isManager?'Operação comercial':'Responsabilidade atual',cell('Editoras incluídas',metaStyle),publishers.length],
      [],
      header(['Indicador','Período atual','Período anterior','Observação']),
      row(['Interações',integer(current.interactions),integer(previous.interactions),'']),
      row(['Editoras trabalhadas',integer(current.publishers_worked),integer(previous.publishers_worked),'']),
      row(['Reuniões realizadas',integer(current.meetings_completed),integer(previous.meetings_completed),'']),
      row(['Oportunidades criadas',integer(current.opportunities_created),integer(previous.opportunities_created),'']),
      row(['Tarefas concluídas',integer(current.tasks_completed),integer(previous.tasks_completed),'']),
      row(['Oportunidades abertas',integer(opportunityPipeline.open_total),'',`${integer(opportunityPipeline.negotiation_total)} em negociação`]),
      row(['Propostas enviadas',integer(opportunityPipeline.proposal_total),'','']),
      row(['Ganhas no período',integer(opportunityPipeline.won_period),'','']),
      row(['Tarefas atrasadas',integer(summary?.tasks?.overdue),'',''])
    ];

    const pipelineStageRows=(opportunityPipeline.by_stage||[]).map(item=>[
      stageLabel(item.stage),integer(item.count)
    ]);
    const serviceRows=(opportunityPipeline.by_service||[]).map(item=>[
      serviceLabel(item.service_key),integer(item.open_count),
      integer(item.radar_opportunities_titles),integer(item.pnld_works)
    ]);

    const publisherMap=Object.fromEntries(publishers.map(p=>[p.id,p]));
    const includedIds=new Set(publishers.map(p=>p.id));
    const includedContacts=contacts.filter(contact=>includedIds.has(contact.publisher_id));

    const publisherHeaders=[
      'Nome principal','Nome comercial','Nome fantasia oficial','Razão social','CNPJ',
      'Perfil comercial Radar','Origem perfil comercial','Observações perfil comercial',
      'Perfis editoriais','Status perfil editorial','Confiança perfil editorial',
      'Cidade','UF','Etapa','Prioridade','Temperatura','Radar Score','Aderência Radar','Potencial comercial','Qualidade dos dados',
      'Melhor produto','PNLD Literário','PNLD Didático','PNLD Técnico-Metodológico','Radar de Licitações','Radar de Oportunidades',
      'Responsável atual','Prospector de origem','Último contato','Próxima ação',
      'E-mail principal','Outros e-mails','Telefone','Telefone secundário / WhatsApp','Site','Instagram','LinkedIn',
      'Sócios / quadro societário','Status enriquecimento web','Enriquecimento verificado em'
    ];
    const publisherRows=publishers.map(p=>[
      displayName(p),text(p.commercial_name),text(p.trade_name),text(p.legal_name),text(p.cnpj),
      PUBLISHER_COMMERCIAL_PROFILE_LABELS[p.commercial_profile_code]||text(p.commercial_profile_code),commercialProfileSource(p.commercial_profile_source),text(p.commercial_profile_note),
      joinArray(p.editorial_profile),EDITORIAL_PROFILE_STATUS_LABELS[p.editorial_profile_status]||text(p.editorial_profile_status),EDITORIAL_PROFILE_CONFIDENCE_LABELS[p.editorial_profile_confidence]||text(p.editorial_profile_confidence),
      text(p.city),text(p.state),stageMap[p.stage_id]||'Sem etapa',PRIORITY_LABELS[p.priority]||text(p.priority),text(p.commercial_temperature),
      integer(p.score),integer(p.radar_fit_score),integer(p.commercial_potential_score),integer(p.data_quality_score),
      RADAR_PRODUCT_LABELS[p.best_product]||'',integer(p.fit_pnld_literario),integer(p.fit_pnld_didatico),integer(p.fit_pnld_tecnico_metodologico),integer(p.fit_radar_licitacoes),integer(p.fit_radar_oportunidades),
      teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',teamMap[p.prospector_user_id]?.full_name||teamMap[p.prospector_user_id]?.email||'',
      date(p.last_contact_at,true),date(p.next_action_at,true),text(p.general_email),joinArray(p.alternate_emails,' | '),text(p.phone),text(p.secondary_phone),text(p.website),text(p.instagram),text(p.linkedin_url),
      text(p.owners_names),text(p.web_enrichment_status),date(p.web_enrichment_verified_at,true)
    ]);

    const contactHeaders=['Editora','CNPJ','Pessoa','Cargo / função','Área / departamento','E-mail profissional','Telefone','Celular / WhatsApp','LinkedIn','Decisor','Canal preferido','Origem','Observações','Atualizado em'];
    const contactRows=includedContacts.map(contact=>{
      const p=publisherMap[contact.publisher_id]||{};
      return [displayName(p),text(p.cnpj),text(contact.full_name),text(contact.job_title),text(contact.department),text(contact.email),text(contact.phone),text(contact.mobile),text(contact.linkedin_url),contact.is_decision_maker?'Sim':'Não',text(contact.preferred_channel),contactSource(contact.source_ref),text(contact.notes),date(contact.updated_at,true)];
    });

    const ownerGroups=new Map();
    for(const contact of includedContacts){
      if(!String(contact.source_ref||'').startsWith('receita:cnpj:'))continue;
      const p=publisherMap[contact.publisher_id];if(!p)continue;
      const key=normalizedName(contact.full_name);if(!key)continue;
      const base=cnpjBase(p.cnpj)||p.id;
      if(!ownerGroups.has(key))ownerGroups.set(key,{owner:contact.full_name,entities:new Map()});
      const group=ownerGroups.get(key);
      if(!group.entities.has(base))group.entities.set(base,{names:new Set(),cnpjs:new Set()});
      const entity=group.entities.get(base);
      entity.names.add(displayName(p));
      if(p.cnpj)entity.cnpjs.add(p.cnpj);
    }
    const societaryRows=[];
    for(const group of ownerGroups.values()){
      if(group.entities.size<2)continue;
      const entities=[...group.entities.values()];
      societaryRows.push([group.owner,group.entities.size,entities.map(e=>[...e.names].join(' / ')).join(' | '),entities.map(e=>[...e.cnpjs].join(' / ')).join(' | ')]);
    }
    societaryRows.sort((a,b)=>Number(b[1])-Number(a[1])||String(a[0]).localeCompare(String(b[0]),'pt-BR'));

    const archivedHeaders=['Nome principal','Nome comercial','Nome fantasia','Razão social','CNPJ','Cidade','UF','Situação CNPJ','Perfil comercial','Perfil editorial','Motivo do arquivamento','Observação do arquivamento','Arquivada em','Arquivada por'];
    const archivedRows=(archivedPublishers||[]).map(p=>[
      displayName(p),text(p.commercial_name),text(p.trade_name),text(p.legal_name),text(p.cnpj),text(p.city),text(p.state),text(p.registration_status),
      PUBLISHER_COMMERCIAL_PROFILE_LABELS[p.commercial_profile_code]||text(p.commercial_profile_code),joinArray(p.editorial_profile),
      PUBLISHER_ARCHIVE_REASON_LABELS[p.archive_reason_code]||text(p.archive_reason_code),text(p.archive_reason_note),date(p.archived_at,true),
      teamMap[p.archived_by]?.full_name||teamMap[p.archived_by]?.email||''
    ]);

    const interactionRows=interactions.map(i=>[
      date(i.occurred_at,true),text(i.publishers?.name),
      teamMap[i.user_id]?.full_name||teamMap[i.user_id]?.email||'',
      text(i.contact_name_snapshot),CHANNEL_LABELS[i.channel]||text(i.channel),
      DIRECTION_LABELS[i.direction]||text(i.direction),RESULT_LABELS[i.result]||text(i.result),
      text(i.subject),text(i.summary),text(i.response_summary),INTEREST_LABELS[i.interest_level]||text(i.interest_level),
      text(i.opportunity_signal),text(i.next_step),date(i.next_action_at,true),integer(i.duration_minutes),
      PRIORITY_LABELS[i.priority]||text(i.priority)
    ]);

    const opportunityRows=opportunities.map(o=>[
      text(o.publishers?.name),text(o.title),serviceLabel(o.service_key),stageLabel(o.stage),
      integer(o.radar_opportunities_title_count),text(o.pnld_notice),text(o.pnld_category),integer(o.pnld_works_count),
      text(o.licitacoes_scope),text(o.service_type),
      teamMap[o.owner_user_id]?.full_name||teamMap[o.owner_user_id]?.email||'',
      date(o.expected_close_date),date(o.next_action_at,true),text(o.next_step),text(o.loss_reason),
      date(o.created_at,true),date(o.updated_at,true),text(o.description)
    ]);

    const taskRows=tasks.map(t=>[
      text(t.publishers?.name),text(t.title),TASK_TYPE_LABELS[t.task_type]||text(t.task_type),
      TASK_STATUS_LABELS[t.status]||text(t.status),PRIORITY_LABELS[t.priority]||text(t.priority),
      teamMap[t.assigned_to]?.full_name||teamMap[t.assigned_to]?.email||'',
      date(t.due_at,true),date(t.completed_at,true),RESULT_LABELS[t.result_code]||text(t.result_code),
      text(t.result_note),t.cadence_enrollment_id?'Cadência':t.automation_key?'Automação de reunião':'Manual',
      date(t.created_at,true),text(t.description)
    ]);

    const meetingRows=meetings.map(m=>[
      date(m.scheduled_start,true),text(m.publishers?.name),text(m.title),text(m.meeting_type),
      MEETING_STATUS_LABELS[m.status]||text(m.status),integer(m.duration_minutes),
      teamMap[m.presenter_user_id]?.full_name||teamMap[m.presenter_user_id]?.email||'',
      teamMap[m.scheduled_by]?.full_name||teamMap[m.scheduled_by]?.email||'',
      INTEREST_LABELS[m.outcome_interest]||text(m.outcome_interest),text(m.next_step),
      date(m.follow_up_at,true),text(m.outcome_notes)
    ]);

    const cadenceRows=cadenceEnrollments.map(e=>[
      text(e.publishers?.name),text(e.cadences?.name),
      teamMap[e.user_id]?.full_name||teamMap[e.user_id]?.email||'',
      text(e.status),date(e.started_at,true),date(e.completed_at,true),date(e.paused_until,true),
      text(e.pause_reason),RESULT_LABELS[e.last_result_code]||text(e.last_result_code)
    ]);

    const sheets=[
      {data:executiveRows,sheet:'Resumo executivo',columns:widths([38,22,38,24]),stickyRowsCount:5},
      tableSheet('Pipeline oportunidades','Oportunidades abertas por etapa, sem dados financeiros.',
        ['Etapa','Oportunidades'],pipelineStageRows,[30,18]),
      tableSheet('Oportunidades por serviço','Oportunidades abertas por linha de serviço da Radar.',
        ['Serviço','Abertas','Títulos em divulgação','Obras PNLD'],serviceRows,[34,14,20,16]),
      ...(isManager?[tableSheet('Equipe','Origem das contas, responsabilidade atual e atividade comercial.',
        ['Pessoa','E-mail','Originadas','Responsabilidade atual','Contatadas','Interações','Reuniões','Oportunidades','Tarefas atrasadas'],
        teamRows,[28,30,12,18,12,14,12,16,18])]:[]),
      tableSheet('Editoras','Base ativa incluída no relatório, com perfil comercial, perfil editorial e canais públicos.',publisherHeaders,publisherRows),
      tableSheet('Contatos','Pessoas de contato ativas vinculadas às editoras incluídas no relatório.',contactHeaders,contactRows),
      ...(societaryRows.length?[tableSheet('Vínculos societários','Sócios que aparecem em duas ou mais empresas/CNPJs-base da seleção. Filiais do mesmo CNPJ-base são consolidadas.',
        ['Sócio em comum','Empresas relacionadas','Empresas / marcas relacionadas','CNPJs relacionados'],societaryRows,[28,18,48,48])]:[]),
      ...(isManager&&archivedRows.length?[tableSheet('Editoras arquivadas','Editoras fora da base ativa, com motivo e responsável pelo arquivamento.',archivedHeaders,archivedRows)]:[]),
      tableSheet('Interações',`Interações registradas nos últimos ${days} dias.`,
        ['Data/hora','Editora','Responsável','Contato','Canal','Direção','Resultado','Assunto','Resumo','Resposta / retorno','Interesse','Sinal de oportunidade','Próximo passo','Próxima ação','Duração (min)','Prioridade'],
        interactionRows,[19,28,24,22,14,12,22,28,42,42,14,20,40,19,14,14]),
      tableSheet('Oportunidades','Negociações registradas sem valores comerciais sensíveis.',
        ['Editora','Oportunidade','Serviço Radar','Etapa','Títulos — Radar de Oportunidades','Edital / programa PNLD','Categoria / objeto PNLD','Obras PNLD','Escopo — Radar de Licitações','Outro serviço / projeto','Responsável atual','Previsão de conclusão','Próxima ação','Próximo passo','Motivo da perda','Criada em','Atualizada em','Descrição'],
        opportunityRows,[28,30,26,18,22,24,28,14,36,28,24,18,19,38,32,19,19,42]),
      tableSheet('Tarefas',`Tarefas abertas e concluídas nos últimos ${days} dias.`,
        ['Editora','Tarefa','Tipo','Status','Prioridade','Responsável','Prazo','Concluída em','Resultado','Observação do resultado','Origem','Criada em','Descrição'],
        taskRows,[28,38,16,16,14,24,19,19,22,36,20,19,42]),
      tableSheet('Reuniões',`Reuniões dos últimos ${days} dias.`,
        ['Data/hora','Editora','Reunião','Tipo','Status','Duração (min)','Apresentador','Agendada por','Interesse','Próximo passo','Follow-up','Observações de resultado'],
        meetingRows,[19,28,32,20,16,14,24,24,14,38,19,42]),
      tableSheet('Cadências',`Cadências iniciadas nos últimos ${days} dias.`,
        ['Editora','Cadência','Responsável','Status','Início','Conclusão','Pausada até','Motivo da pausa','Último resultado'],
        cadenceRows,[28,34,24,16,19,19,19,38,22])
    ];

    const buffer=await writeExcelFile(sheets,{fontFamily:'Aptos',fontSize:10}).toBuffer();
    const fileName=`radar-completo-${new Date().toISOString().slice(0,10)}.xlsx`;

    return new Response(buffer,{
      status:200,
      headers:{
        'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition':`attachment; filename="${fileName}"`,
        'cache-control':'no-store',
        'x-radar-file-name':fileName
      }
    });
  }catch(error){
    console.error('complete-report-export',error);
    return Response.json({error:error?.message||'Não foi possível gerar o relatório completo.'},{status:error?.status||500});
  }
}
