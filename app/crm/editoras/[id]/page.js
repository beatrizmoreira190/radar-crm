'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleHelp, Clock3, DatabaseZap, Globe2, Plus, Save, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { PtBrDateField, PtBrDateTimeField } from '@/components/PtBrDateFields';
import MentionTextarea from '@/components/MentionTextarea';
import { CHANNEL_LABELS, EDITORIAL_PROFILE_CONFIDENCE_LABELS, EDITORIAL_PROFILE_STATUS_LABELS, INTEREST_LABELS, OPPORTUNITY_SERVICE_LABELS, OPPORTUNITY_STAGE_LABELS, PRIORITY_LABELS, RESULT_LABELS, TASK_TYPE_LABELS, formatDate } from '@/lib/constants';
import PublisherRecordOverview from '@/components/PublisherRecordOverview';
import PublisherQuickContact from '@/components/PublisherQuickContact';
import PublisherRadarPanel from '@/components/PublisherRadarPanel';
import PublisherMeetingsMount from '@/components/PublisherMeetingsMount';
import PublisherMaterialsMount from '@/components/PublisherMaterialsMount';

const HELP={
  contacts:'Cadastre aqui as pessoas da editora com quem a equipe pode falar. Marque como decisor quem participa da decisão de compra ou contratação.',
  history:'Registre aqui o que já aconteceu: ligações, e-mails, mensagens e reuniões relevantes. Este é o diário comercial da editora.',
  opportunities:'Use quando existir uma possibilidade concreta de negócio com a editora, como uma proposta, contratação, renovação ou projeto em negociação.',
  tracking:'Mostra a situação atual da editora. Atualize estes campos quando o estado comercial da conta mudar.',
  tasks:'Mostra o que ainda precisa ser feito nesta editora. Tarefas podem vir de uma próxima ação, de uma cadência ou ser criadas manualmente.',
  summary:'Resumo automático da situação atual da editora, para consultar rapidamente os principais dados de acompanhamento.',
  stage:'Indica em que ponto da prospecção a editora está. Altere quando a situação comercial realmente avançar ou regredir.',
  accountPriority:'Define quanta atenção esta editora deve receber na rotina. Não significa, sozinha, que existe uma oportunidade de venda.',
  owner:'Pessoa responsável por conduzir o próximo estágio comercial desta editora. O prospectador de origem continua preservado separadamente.',
  nextAction:'Data e hora do próximo retorno ou ação combinada com a editora. Use quando houver um próximo passo com prazo.',
  notes:'Guarde contexto duradouro sobre a conta, como preferências, restrições e informações úteis. Conversas do dia a dia devem ir no Histórico de interações.',
  marketSegments:'Mostra em quais mercados a editora atua, como Escolar, Universitário ou Trade/Livrarias. É diferente do tipo de livro que ela publica.',
  editorialProfile:'Mostra o que a editora publica. O perfil é enriquecido a partir de catálogo, site oficial e outras fontes públicas, com fonte e nível de confiança registrados.',
  channel:'Como o contato aconteceu: ligação, e-mail, WhatsApp, LinkedIn, reunião ou outro canal.',
  result:'O que aconteceu neste contato. Escolha o resultado que melhor representa a conversa ou tentativa realizada.',
  interactionSummary:'Descreva de forma objetiva o que aconteceu e as informações importantes descobertas no contato.',
  interest:'Registre o nível de interesse percebido nesta conversa. Ele ajuda a priorizar a conta e compõe o contexto comercial.',
  nextStep:'Descreva o que ficou combinado ou qual ação deve acontecer depois deste contato.',
  interactionNextAction:'Informe quando o próximo passo deve acontecer. Ao salvar uma data, o CRM cria automaticamente um follow-up na sua fila.',
  taskTitle:'Descreva a ação concreta que precisa ser realizada, por exemplo “Ligar para o diretor comercial”.',
  taskType:'Classifique a tarefa pelo tipo de ação para facilitar a organização da fila.',
  taskPriority:'Indica a urgência desta tarefa específica. É diferente da prioridade geral da editora.',
  taskDue:'Defina quando a tarefa deve ser realizada. O CRM usa este prazo para a fila e os lembretes.',
  contactName:'Nome da pessoa que trabalha ou representa a editora.',
  contactRole:'Cargo ou função desta pessoa na editora.',
  contactArea:'Área ou departamento em que esta pessoa atua.',
  contactEmail:'E-mail profissional deste contato.',
  contactMobile:'Telefone ou celular usado para falar diretamente com esta pessoa.',
  decisionMaker:'Marque quando esta pessoa participa ou influencia a decisão de contratar o serviço.',
  opportunityTitle:'Dê um nome que identifique esta negociação de forma objetiva.',
  opportunityService:'Escolha a linha de serviço da Radar. Os campos seguintes mudam conforme o serviço selecionado.',
  opportunityType:'Use somente quando a oportunidade for de outro serviço ou projeto não listado.',
  opportunityStage:'Mostra em que ponto este negócio está: identificado, qualificado, proposta enviada, negociação, ganho, perdido ou em espera.',
  opportunityTitleCount:'No Radar de Oportunidades, informe quantos títulos a editora pretende divulgar.',
  opportunityPnldNotice:'No PNLD, informe o edital ou programa a que a inscrição se refere.',
  opportunityPnldCategory:'No PNLD, registre a categoria, objeto ou recorte da inscrição quando aplicável.',
  opportunityPnldWorks:'No PNLD, informe quantas obras estão sendo consideradas nesta oportunidade.',
  opportunityLicScope:'No Radar de Licitações, descreva o escopo do acompanhamento de editais/licitações.',
  opportunityClose:'Data em que você acredita que a negociação pode ser concluída. Ela ajuda a organizar a previsão comercial.',
  opportunityNextStep:'Próximo movimento necessário para avançar este negócio, por exemplo “Enviar proposta revisada”.',
  opportunityDescription:'Use para registrar o contexto específico desta negociação. O histórico das conversas continua no Histórico de interações.',
  opportunityLoss:'Se a oportunidade for perdida, registre o motivo para ajudar a entender por que a negociação não avançou.',
  score:'Pontuação geral calculada pelo CRM a partir da aderência editorial, potencial comercial e prospectabilidade.',
  stageBadge:'Etapa atual da editora no processo comercial.',
  legalName:'Razão social: nome jurídico registrado da empresa, conforme o cadastro do CNPJ.',
  tradeName:'Nome fantasia oficial: denominação registrada na Receita Federal, quando informada no CNPJ.',
  commercialName:'Nome comercial / marca: nome pelo qual a editora se apresenta publicamente, identificado em fontes públicas e mantido separado do nome fantasia oficial.',
  cnpj:'Cadastro Nacional da Pessoa Jurídica usado para identificar legalmente a empresa.',
  location:'Endereço, cidade e estado cadastrados para a editora.',
  registeredProfile:'Classificação administrativa ou cadastral usada na base do CRM.',
  companySize:'Faixa de tamanho estimada da empresa, usada como contexto para a prospecção.',
  lastContact:'Data da interação comercial mais recente registrada nesta editora.',
  temperature:'Sinal qualitativo do momento comercial da conta, usado como contexto de priorização.',
  contactCount:'Quantidade de pessoas da editora cadastradas como contatos ativos.'
};

const WEB_ENRICHMENT_STATUS_LABELS={
  enriched:'Validado',
  review:'Em revisão',
  not_found:'Sem evidência suficiente',
  pending:'Pendente'
};

function sameText(a,b){return Boolean(a&&b&&String(a).trim().toLocaleLowerCase('pt-BR')===String(b).trim().toLocaleLowerCase('pt-BR'))}

function HelpTip({text}){return <button type="button" className="help-tip" aria-label={`Ajuda: ${text}`}><CircleHelp size={14}/><span className="help-tip-popover" role="tooltip">{text}</span></button>}
function HelpHeading({as='h3',children,help}){const Tag=as;return <div className="help-heading"><Tag>{children}</Tag><HelpTip text={help}/></div>}
function HelpLabel({children,help}){return <span className="help-label">{children}<HelpTip text={help}/></span>}
function localInput(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function dateTimeLabel(value){if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function formatCnpj(value){const d=String(value||'').replace(/\D/g,'');return d.length===14?`${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`:(value||'—')}
function opportunityServiceDetail(opportunity){
  if(opportunity?.service_key==='radar_oportunidades'&&opportunity.radar_opportunities_title_count)return `${Number(opportunity.radar_opportunities_title_count).toLocaleString('pt-BR')} título${Number(opportunity.radar_opportunities_title_count)===1?'':'s'} em divulgação`;
  if(opportunity?.service_key==='pnld'){
    return [opportunity.pnld_notice,opportunity.pnld_category,opportunity.pnld_works_count?`${Number(opportunity.pnld_works_count).toLocaleString('pt-BR')} obra${Number(opportunity.pnld_works_count)===1?'':'s'}`:null].filter(Boolean).join(' · ');
  }
  if(opportunity?.service_key==='radar_licitacoes')return opportunity.licitacoes_scope||'Acompanhamento de editais/licitações';
  if(opportunity?.service_key==='other')return opportunity.service_type||'Outro serviço / projeto';
  return opportunity?.service_type||'Serviço não informado';
}

export default function PublisherDetailPage(){
  const {id}=useParams(); const {supabase,membership,user,teamMap,team,isManager,hasCommercialFunction,activityVersion}=useCrm(); const org=membership?.organization_id;
  const [publisher,setPublisher]=useState(null); const [contacts,setContacts]=useState([]); const [interactions,setInteractions]=useState([]); const [tasks,setTasks]=useState([]); const [opps,setOpps]=useState([]); const [stages,setStages]=useState([]); const [cnpjVerification,setCnpjVerification]=useState(null); const [societaryLinks,setSocietaryLinks]=useState({related_count:0,shared_owner_count:0,related_publishers:[]});
  const [loading,setLoading]=useState(true); const [notice,setNotice]=useState(''); const [modal,setModal]=useState(''); const [actionsOpen,setActionsOpen]=useState(false); const [editingOpportunity,setEditingOpportunity]=useState(null); const [editingContact,setEditingContact]=useState(null); const [noteMentions,setNoteMentions]=useState([]); const [edit,setEdit]=useState({priority:'medium',stage_id:'',owner_user_id:'',next_action_at:'',notes:''}); const editHydratedFor=useRef(null); const actionMenuRef=useRef(null);
  async function load(){if(!org||!id)return;setLoading(true);const [p,c,i,t,o,s,v,sl]=await Promise.all([
    supabase.from('publishers').select('*').eq('organization_id',org).eq('id',id).maybeSingle(),
    supabase.from('contacts').select('*').eq('organization_id',org).eq('publisher_id',id).eq('active',true).order('is_decision_maker',{ascending:false}).order('full_name'),
    supabase.from('interactions').select('*').eq('organization_id',org).eq('publisher_id',id).order('occurred_at',{ascending:false}).limit(30),
    supabase.from('tasks').select('*').eq('organization_id',org).eq('publisher_id',id).in('status',['open','in_progress']).order('due_at',{ascending:true,nullsFirst:false}).limit(30),
    supabase.from('opportunities').select('*').eq('organization_id',org).eq('publisher_id',id).order('created_at',{ascending:false}),
    supabase.from('pipeline_stages').select('id,name,position,stage_type').eq('organization_id',org).eq('active',true).order('position'),
    supabase.from('publisher_cnpj_verifications').select('status,source_period,last_verified_at,error_message,last_run_id').eq('organization_id',org).eq('publisher_id',id).maybeSingle(),
    supabase.rpc('crm_publisher_societary_links',{p_organization_id:org,p_publisher_id:id})
  ]);if(p.error)setNotice(p.error.message);setPublisher(p.data||null);setContacts(c.data||[]);setInteractions(i.data||[]);setTasks(t.data||[]);setOpps(o.data||[]);setStages(s.data||[]);setCnpjVerification(v.data||null);setSocietaryLinks(sl.data||{related_count:0,shared_owner_count:0,related_publishers:[]});if(p.data&&editHydratedFor.current!==p.data.id){setEdit({priority:p.data.priority||'medium',stage_id:p.data.stage_id||'',owner_user_id:p.data.owner_user_id||'',next_action_at:localInput(p.data.next_action_at),notes:p.data.notes||''});editHydratedFor.current=p.data.id}setLoading(false)}
  useEffect(()=>{load()},[org,id,activityVersion]);
  const stageMap=useMemo(()=>Object.fromEntries(stages.map(s=>[s.id,s])),[stages]);
  const canManageAccount=Boolean(publisher&&(isManager||publisher.owner_user_id===user?.id));
  const canCollaborate=Boolean(publisher&&(isManager||publisher.owner_user_id===user?.id||hasCommercialFunction('prospecting')));
  const canScheduleMeeting=Boolean(isManager||hasCommercialFunction('meeting_scheduling'));
  const canManageMaterials=Boolean(isManager||hasCommercialFunction('pre_meeting_materials')||hasCommercialFunction('negotiation_materials'));
  const canCreateAnyAction=canCollaborate||canScheduleMeeting||canManageMaterials;
  const unassigned=Boolean(publisher&&!publisher.owner_user_id);
  const ownerName=publisher?.owner_user_id?(teamMap[publisher.owner_user_id]?.full_name||teamMap[publisher.owner_user_id]?.email||'Outra pessoa da equipe'):'Sem responsável';
  const editorialSources=Array.isArray(publisher?.editorial_profile_sources)?publisher.editorial_profile_sources:[];
  const commercialSources=Array.isArray(publisher?.commercial_name_sources)?publisher.commercial_name_sources.filter(Boolean):[];
  const publicSources=Array.isArray(publisher?.web_enrichment_sources)?publisher.web_enrichment_sources.filter(Boolean):[];
  const headName=publisher?.commercial_name||publisher?.trade_name||publisher?.name;
  const locationLabel=[publisher?.city,publisher?.state].filter(Boolean).join(' / ');
  async function claimPublisher(){if(!publisher||isManager||publisher.owner_user_id||!user?.id)return;const {data,error}=await supabase.from('publishers').update({owner_user_id:user.id,updated_by:user.id,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',publisher.id).is('owner_user_id',null).select('id,owner_user_id').maybeSingle();if(error)setNotice(error.message);else if(!data){setNotice('Esta editora acabou de ser assumida por outra pessoa.');load()}else{setNotice(`Você assumiu ${publisher.name}.`);load()}}
  async function saveCommercial(){if(!publisher||!canManageAccount)return;const {error}=await supabase.from('publishers').update({priority:edit.priority,stage_id:edit.stage_id||null,owner_user_id:isManager?(edit.owner_user_id||null):user.id,next_action_at:edit.next_action_at?new Date(edit.next_action_at).toISOString():null,notes:edit.notes||null,updated_by:user?.id||null,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',publisher.id);setNotice(error?error.message:'Dados comerciais atualizados.');if(!error){if(noteMentions.length){await supabase.rpc('crm_notify_mentions',{p_organization_id:org,p_user_ids:noteMentions,p_title:'Você foi mencionado nas notas de uma editora',p_body:`${publisher.name} · ${edit.notes}`.slice(0,900),p_href:`/app/editoras/${publisher.id}`,p_source_type:'publisher',p_source_id:publisher.id,p_dedupe_prefix:`mention:publisher:${publisher.id}:notes:${Date.now()}`});setNoteMentions([]);window.dispatchEvent(new Event('crm-notifications-changed'))}load()}}
  async function doneTask(task){if(!(isManager||task.assigned_to===user?.id))return;const {error}=await supabase.from('tasks').update({status:'done',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('organization_id',org).eq('id',task.id);if(error)setNotice(error.message);else load()}
  function dispatchPublisherAction(type){
    setActionsOpen(false);
    if(type==='contact'||type==='interaction'||type==='task'){setModal(type);return}
    if(type==='opportunity'){newOpportunity();return}
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('radar:publisher-action',{detail:{type}}));
  }
  useEffect(()=>{
    if(!actionsOpen)return;
    function onPointer(event){if(actionMenuRef.current&&!actionMenuRef.current.contains(event.target))setActionsOpen(false)}
    function onKey(event){if(event.key==='Escape')setActionsOpen(false)}
    document.addEventListener('pointerdown',onPointer);
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('pointerdown',onPointer);document.removeEventListener('keydown',onKey)}
  },[actionsOpen]);
  function newOpportunity(){setEditingOpportunity(null);setModal('opportunity')}
  function editOpportunity(opportunity){setEditingOpportunity(opportunity);setModal('opportunity')}
  function closeOpportunity(){setModal('');setEditingOpportunity(null)}
  function editContact(contact){if(!canCollaborate)return;setEditingContact(contact);setModal('contact-edit')}
  function closeContactEdit(){setModal('');setEditingContact(null)}
  if(loading&&!publisher)return <div className="page-wrap"><div className="table-empty">Carregando editora…</div></div>;
  if(!publisher)return <div className="page-wrap"><Link href="/app/editoras" className="text-link"><ArrowLeft size={15}/> Voltar</Link><div className="card panel" style={{marginTop:16}}><h2>Editora não encontrada</h2><p className="muted">Ela pode ter sido arquivada ou você não tem acesso a esse registro.</p></div></div>;
  return <div className="page-wrap">
    <div className="page-head"><div><Link href="/app/editoras" className="text-link"><ArrowLeft size={15}/> Editoras</Link><div className="eyebrow" style={{marginTop:12}}>Ficha comercial</div><h1>{headName}</h1><div className="publisher-head-identity">{publisher.trade_name&&!sameText(publisher.trade_name,headName)&&<span><b>Nome fantasia (Receita):</b> {publisher.trade_name}</span>}{!publisher.trade_name&&<span className="publisher-head-missing">Sem nome fantasia na Receita</span>}{publisher.legal_name&&<span><b>Razão social:</b> {publisher.legal_name}</span>}{locationLabel&&<span>{locationLabel}</span>}</div></div><div className="publisher-head-actions"><div className="chips"><span className="badge dark">Score {publisher.score??0}</span><HelpTip text={HELP.score}/>{publisher.registration_status&&<span className={`badge ${String(publisher.registration_status).toUpperCase()==='BAIXADA'?'red':String(publisher.registration_status).toUpperCase()==='ATIVA'?'green':'amber'}`}>CNPJ {publisher.registration_status}</span>}{societaryLinks?.related_count>0&&<span className="badge amber">{societaryLinks.related_count} empresa{societaryLinks.related_count===1?'':'s'} relacionada{societaryLinks.related_count===1?'':'s'}</span>}<span className="badge">{stageMap[publisher.stage_id]?.name||'Sem etapa'}</span><HelpTip text={HELP.stageBadge}/></div>{canCreateAnyAction&&<div className="publisher-action-menu" ref={actionMenuRef}><button type="button" className="btn" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={()=>setActionsOpen(value=>!value)}><Plus size={15}/> Nova ação</button>{actionsOpen&&<div className="publisher-action-popover" role="menu" aria-label="Nova ação">{canCollaborate&&<><button type="button" role="menuitem" onClick={()=>dispatchPublisherAction('interaction')}>Registrar interação</button><button type="button" role="menuitem" onClick={()=>dispatchPublisherAction('task')}>Criar tarefa</button><button type="button" role="menuitem" onClick={()=>dispatchPublisherAction('opportunity')}>Criar oportunidade</button><button type="button" role="menuitem" onClick={()=>dispatchPublisherAction('contact')}>Adicionar pessoa de contato</button></>}{canScheduleMeeting&&<button type="button" role="menuitem" onClick={()=>dispatchPublisherAction('meeting')}>Agendar reunião</button>}{canManageMaterials&&<button type="button" role="menuitem" onClick={()=>dispatchPublisherAction('material')}>Adicionar material</button>}</div>}</div>}</div></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {String(publisher.registration_status||'').toUpperCase()==='BAIXADA'&&<div className="notice error" style={{marginBottom:16,display:'flex',alignItems:'flex-start',gap:10}}><AlertTriangle size={18} style={{marginTop:1,flex:'0 0 auto'}}/><div><strong>CNPJ baixado na Receita Federal</strong><div style={{fontSize:12,marginTop:3}}>Este cadastro consta como <b>BAIXADO</b>{publisher.cnpj_status_date?(' desde '+formatDate(publisher.cnpj_status_date)):''}{publisher.cnpj_status_reason?('. Motivo: '+publisher.cnpj_status_reason):''}.</div></div></div>}
    {!canManageAccount&&<div className="notice-bar" style={{marginBottom:16}}><span>{unassigned?'Esta editora ainda está sem responsável atual. Você pode registrar ações permitidas pela sua função; assuma a conta se você for conduzir o próximo estágio.':`${ownerName} é o responsável atual. Você pode registrar ações permitidas pela sua função; etapa, prioridade e próxima ação principal ficam em modo leitura.`}</span>{unassigned&&hasCommercialFunction('prospecting')&&<button className="btn small" onClick={claimPublisher}>Assumir responsabilidade</button>}</div>}
    <PublisherRecordOverview publisher={publisher} tasks={tasks} opportunities={opps} interactions={interactions} stages={stages} teamMap={teamMap}/>
    <PublisherQuickContact publisher={publisher}/>
    <div className="detail-grid publisher-record-grid"><div className="detail-stack publisher-record-main">
      <section className="card panel publisher-data-card">
        <div className="section-title publisher-data-title">
          <div>
            <h2>Dados da editora</h2>
            <p className="muted">Identidade oficial e informações cadastrais.</p>
          </div>
          {publisher.web_enrichment_status&&<span className={`badge ${publisher.web_enrichment_status==='enriched'?'green':publisher.web_enrichment_status==='review'?'amber':''}`}>{WEB_ENRICHMENT_STATUS_LABELS[publisher.web_enrichment_status]||publisher.web_enrichment_status}</span>}
        </div>

        <div className="publisher-name-summary">
          <div className="publisher-name-primary">
            <small>Nome comercial / marca <HelpTip text={HELP.commercialName}/></small>
            <strong>{publisher.commercial_name||publisher.trade_name||publisher.name||'—'}</strong>
            {publisher.commercial_name&&<div className="publisher-name-meta">
              {publisher.commercial_name_confidence&&<span>Confiança {publisher.commercial_name_confidence==='high'?'alta':publisher.commercial_name_confidence==='medium'?'média':'baixa'}</span>}
              {publisher.commercial_name_verified_at&&<span>Verificado em {dateTimeLabel(publisher.commercial_name_verified_at)}</span>}
            </div>}
          </div>
          <div className="publisher-name-official">
            <Info label="Nome fantasia oficial (Receita)" value={publisher.trade_name||'Não informado'} help={HELP.tradeName}/>
            <Info label="Razão social" value={publisher.legal_name} help={HELP.legalName}/>
          </div>
        </div>

        <div className="info-grid publisher-registration-grid">
          <Info label="CNPJ" value={publisher.cnpj} help={HELP.cnpj}/>
          <Info label="Situação cadastral" value={publisher.registration_status} help="Situação atual do CNPJ informada pela Receita Federal."/>
          <Info label="Data da situação cadastral" value={publisher.cnpj_status_date?formatDate(publisher.cnpj_status_date):null} help="Data associada à situação cadastral atual na base do CNPJ."/>
          <Info label="Porte" value={publisher.company_size||publisher.size_label} help={HELP.companySize}/>
          <Info label="Localização" value={[publisher.address_street,publisher.address_number,publisher.city,publisher.state].filter(Boolean).join(', ')} help={HELP.location}/>
          <Info label="Segmentos de atuação" value={(publisher.market_segments||[]).join(', ')} help={HELP.marketSegments}/>
          <Info label="Perfil cadastral" value={publisher.profile} help={HELP.registeredProfile}/>
        </div>

        {(cnpjVerification||publisher.web_enrichment_status||commercialSources.length>0||publicSources.length>0)&&<details className="publisher-source-details">
          <summary>Fontes e verificações</summary>
          <div className="publisher-source-details-body">
            {cnpjVerification&&<div className="publisher-source-detail-row"><DatabaseZap size={16}/><div><strong>Receita Federal</strong><span>Última verificação: {dateTimeLabel(cnpjVerification.last_verified_at)}{cnpjVerification.source_period?` · Base ${cnpjVerification.source_period}`:''}{cnpjVerification.status==='matched'?' · CNPJ localizado':cnpjVerification.status==='not_found'?' · CNPJ não localizado':' · Verificação com ocorrência'}</span></div></div>}
            {publisher.web_enrichment_status&&<div className="publisher-source-detail-row"><Globe2 size={16}/><div><strong>Fontes públicas</strong><span>{WEB_ENRICHMENT_STATUS_LABELS[publisher.web_enrichment_status]||publisher.web_enrichment_status}{publisher.web_enrichment_verified_at?` · Verificado em ${dateTimeLabel(publisher.web_enrichment_verified_at)}`:''}</span><div className="publisher-source-links">{[...commercialSources,...publicSources].map((src,index)=>src?.url?<a className="text-link" href={src.url} target="_blank" rel="noreferrer" key={(src.url||'fonte')+'-'+index}>{src.label||`Fonte ${index+1}`}</a>:null)}</div></div></div>}
          </div>
        </details>}
      </section>

      <section className="card panel publisher-editorial-card">
        <div className="section-title">
          <div><HelpHeading as="h2" help={HELP.editorialProfile}>Perfil editorial</HelpHeading><p className="muted">O que a editora publica e como está classificada editorialmente.</p></div>
          <div className="chips"><span className={`badge ${publisher.editorial_profile_status==='confirmed'?'green':publisher.editorial_profile_status==='review'?'red':publisher.editorial_profile_status==='partial'?'amber':''}`}>{EDITORIAL_PROFILE_STATUS_LABELS[publisher.editorial_profile_status]||publisher.editorial_profile_status||'Pendente'}</span>{publisher.editorial_profile_confidence&&<span className="badge">Confiança {EDITORIAL_PROFILE_CONFIDENCE_LABELS[publisher.editorial_profile_confidence]||publisher.editorial_profile_confidence}</span>}</div>
        </div>
        {publisher.editorial_profile?.length?<div className="chips">{publisher.editorial_profile.map(item=><span className="badge blue" key={item}>{item}</span>)}</div>:<p className="muted" style={{fontSize:12,margin:'4px 0'}}>{publisher.editorial_profile_status==='review'?'Cadastro marcado para revisão antes de classificar o perfil editorial.':publisher.editorial_profile_status==='not_identified'?'Não foi possível identificar o perfil editorial com segurança.':'Perfil editorial ainda não enriquecido.'}</p>}
        {publisher.editorial_profile_notes&&<p className="muted publisher-editorial-notes">{publisher.editorial_profile_notes}</p>}
        {editorialSources.length>0&&<div className="publisher-meta publisher-editorial-sources">{editorialSources.map((src,index)=>src?.url?<a className="text-link" href={src.url} target="_blank" rel="noreferrer" key={`${src.url}-${index}`}><Globe2 size={13}/>{src.label||'Fonte do perfil'}</a>:null)}{publisher.editorial_profile_verified_at&&<span>Verificado em {formatDate(publisher.editorial_profile_verified_at)}</span>}</div>}
      </section>
      <PublisherRadarPanel publisher={publisher} contacts={contacts} interactions={interactions}/>
      {societaryLinks?.related_count>0&&<SocietaryLinksCard data={societaryLinks}/>}
      <section className="card panel publisher-contacts-card">
        <div className="section-title">
          <div><HelpHeading as="h2" help={HELP.contacts}>Pessoas de contato</HelpHeading><p className="muted">Clique em uma pessoa para completar telefone, e-mail, LinkedIn e outros dados profissionais.</p></div>
        </div>
        {contacts.length?contacts.map(contact=>{
          const channels=[contact.email,contact.mobile||contact.phone,contact.linkedin_url?'LinkedIn':null].filter(Boolean);
          const societary=String(contact.source_ref||'').startsWith('receita:cnpj:');
          const content=<>
            <div className="contact-row-main">
              <strong>{contact.full_name}{contact.is_decision_maker?' · Decisor':''}</strong>
              <span>{[contact.job_title,contact.department].filter(Boolean).join(' · ')||'Sem cargo informado'}</span>
              <span>{channels.join(' · ')||'Sem dados de contato profissional'}</span>
            </div>
            <div className="contact-row-side">
              {societary&&<span className="badge">Receita</span>}
              {canCollaborate&&<span className="contact-edit-label">{channels.length?'Editar dados':'Adicionar dados'} →</span>}
            </div>
          </>;
          return canCollaborate
            ?<button type="button" className="contact-row contact-row-button" key={contact.id} onClick={()=>editContact(contact)}>{content}</button>
            :<div className="contact-row" key={contact.id}>{content}</div>
        }):<p className="muted">Nenhum contato cadastrado.</p>}
      </section>
      <section className="card panel publisher-history-card"><div className="section-title"><div><HelpHeading as="h2" help={HELP.history}>Histórico de interações</HelpHeading><p className="muted">Interações mais recentes primeiro.</p></div></div>{interactions.length?<div className="timeline">{interactions.map(i=><div className="timeline-item" key={i.id}><div className="timeline-dot"/><div className="timeline-body"><strong>{CHANNEL_LABELS[i.channel]||i.channel} · {RESULT_LABELS[i.result]||i.result||'Interação'}</strong><p>{i.summary}</p>{i.next_step&&<p><b>Próximo passo:</b> {i.next_step}</p>}<small>{formatDate(i.occurred_at,true)} · {teamMap[i.user_id]?.full_name||teamMap[i.user_id]?.email||'Equipe'}</small></div></div>)}</div>:<p className="muted">Ainda não há interações registradas.</p>}</section>
      <section className="card panel publisher-opportunities-card"><div className="section-title"><div><HelpHeading as="h2" help={HELP.opportunities}>Oportunidades</HelpHeading><p className="muted">Negócios concretos em negociação com esta editora, sem registrar valores comerciais sensíveis.</p></div></div>{opps.length?opps.map(o=><div className="opportunity-row" key={o.id}><div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'flex-start'}}><div style={{minWidth:0}}><strong>{o.title}</strong><div className="publisher-meta" style={{marginTop:4}}><span>{OPPORTUNITY_SERVICE_LABELS[o.service_key]||o.service_type||'Serviço não informado'}</span><span>{OPPORTUNITY_STAGE_LABELS[o.stage]||o.stage}</span>{o.expected_close_date&&<span>Previsão: {formatDate(o.expected_close_date)}</span>}</div><p className="muted" style={{fontSize:11,margin:'5px 0 0'}}>{opportunityServiceDetail(o)}</p>{o.next_step&&<p style={{fontSize:12,margin:'6px 0 0',color:'#475467'}}><b>Próximo passo:</b> {o.next_step}</p>}{o.stage==='lost'&&o.loss_reason&&<p style={{fontSize:12,margin:'6px 0 0',color:'#b42318'}}><b>Motivo da perda:</b> {o.loss_reason}</p>}</div>{(isManager||o.owner_user_id===user?.id||o.created_by===user?.id)&&<button className="btn secondary small" type="button" onClick={()=>editOpportunity(o)}>Editar</button>}</div></div>):<p className="muted">Nenhuma oportunidade cadastrada. Crie uma quando surgir uma possibilidade concreta de negócio.</p>}</section>
      <div className="publisher-meetings-section"><PublisherMeetingsMount/></div>
      <div className="publisher-materials-section"><PublisherMaterialsMount/></div>
    </div><aside className="detail-stack publisher-record-aside">
      {canManageAccount?<section className="card panel publisher-sidebar-tracking"><div className="section-title"><HelpHeading help={HELP.tracking}>Acompanhamento</HelpHeading></div><label><HelpLabel help={HELP.stage}>Etapa</HelpLabel><select value={edit.stage_id} onChange={e=>setEdit(x=>({...x,stage_id:e.target.value}))}><option value="">Sem etapa</option>{stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label style={{marginTop:12}}><HelpLabel help={HELP.accountPriority}>Prioridade</HelpLabel><select value={edit.priority} onChange={e=>setEdit(x=>({...x,priority:e.target.value}))}>{Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{isManager?<label style={{marginTop:12}}><HelpLabel help={HELP.owner}>Responsável atual</HelpLabel><select value={edit.owner_user_id} onChange={e=>setEdit(x=>({...x,owner_user_id:e.target.value}))}><option value="">Sem responsável</option>{team.filter(m=>m.active).map(m=><option value={m.user_id} key={m.user_id}>{m.full_name||m.email}</option>)}</select></label>:<div className="info-item" style={{marginTop:12}}><small><HelpLabel help={HELP.owner}>Responsável atual</HelpLabel></small><span>Você</span></div>}<label style={{marginTop:12}}><HelpLabel help={HELP.nextAction}>Próxima ação</HelpLabel><PtBrDateTimeField value={edit.next_action_at} onChange={value=>setEdit(x=>({...x,next_action_at:value}))} ariaLabel="Próxima ação"/></label><label style={{marginTop:12}}><HelpLabel help={HELP.notes}>Notas</HelpLabel><MentionTextarea rows={5} value={edit.notes} onChange={value=>setEdit(x=>({...x,notes:value}))} team={team} mentions={noteMentions} onMentionsChange={setNoteMentions} placeholder="Digite @ para mencionar alguém da equipe"/></label><button className="btn full" style={{marginTop:14}} onClick={saveCommercial}><Save size={15}/> Salvar acompanhamento</button></section>:<section className="card panel publisher-sidebar-tracking"><div className="section-title"><HelpHeading help={HELP.tracking}>Acompanhamento</HelpHeading></div><div className="stat-list"><div className="stat-row"><HelpLabel help={HELP.stage}>Etapa</HelpLabel><strong>{stageMap[publisher.stage_id]?.name||'Sem etapa'}</strong></div><div className="stat-row"><HelpLabel help={HELP.accountPriority}>Prioridade</HelpLabel><strong>{PRIORITY_LABELS[publisher.priority]||publisher.priority||'—'}</strong></div><div className="stat-row"><HelpLabel help={HELP.owner}>Responsável atual</HelpLabel><strong>{ownerName}</strong></div><div className="stat-row"><HelpLabel help={HELP.nextAction}>Próxima ação</HelpLabel><strong>{formatDate(publisher.next_action_at,true)}</strong></div></div>{publisher.notes&&<div style={{marginTop:14}}><small className="muted"><HelpLabel help={HELP.notes}>Notas</HelpLabel></small><p style={{marginBottom:0}}>{publisher.notes}</p></div>}</section>}
      <section className="card panel publisher-sidebar-tasks"><div className="section-title"><div><HelpHeading help={HELP.tasks}>Tarefas</HelpHeading><p className="muted">Pendências ligadas à editora.</p></div></div>{tasks.filter(t=>t.status!=='done'&&t.status!=='cancelled').length?tasks.filter(t=>t.status!=='done'&&t.status!=='cancelled').map(t=><div className="task-row" key={t.id}>{(isManager||t.assigned_to===user?.id)?<button className="task-check" onClick={()=>doneTask(t)}><CheckCircle2 size={18}/></button>:<CheckCircle2 size={18} style={{color:'#98a2b3'}}/>}<div className="task-main"><strong>{t.title}</strong><span>{TASK_TYPE_LABELS[t.task_type]||t.task_type}</span></div><div className={`task-due ${t.due_at&&new Date(t.due_at)<new Date()?'late':''}`}><Clock3 size={13}/>{formatDate(t.due_at,true)}</div></div>):<p className="muted">Sem tarefas abertas.</p>}</section>
      <section className="card panel publisher-sidebar-summary"><div className="section-title"><HelpHeading help={HELP.summary}>Resumo</HelpHeading></div><div className="stat-list"><div className="stat-row"><HelpLabel help={HELP.lastContact}>Último contato</HelpLabel><strong>{formatDate(publisher.last_contact_at,true)}</strong></div><div className="stat-row"><HelpLabel help={HELP.nextAction}>Próxima ação</HelpLabel><strong>{formatDate(publisher.next_action_at,true)}</strong></div><div className="stat-row"><HelpLabel help={HELP.temperature}>Temperatura</HelpLabel><strong>{publisher.commercial_temperature||'—'}</strong></div><div className="stat-row"><HelpLabel help={HELP.contactCount}>Contatos</HelpLabel><strong>{contacts.length}</strong></div></div></section>
    </aside></div>
    {canCollaborate&&modal==='contact'&&<ContactModal supabase={supabase} org={org} publisher={publisher} user={user} onClose={()=>setModal('')} onSaved={()=>{setModal('');setNotice('Pessoa de contato adicionada.');load()}}/>}
    {canCollaborate&&modal==='contact-edit'&&editingContact&&<EditContactModal supabase={supabase} org={org} contact={editingContact} user={user} onClose={closeContactEdit} onSaved={()=>{closeContactEdit();setNotice('Dados do contato atualizados.');load()}}/>}
    {canCollaborate&&modal==='interaction'&&<InteractionModal supabase={supabase} org={org} publisher={publisher} user={user} team={team} onClose={()=>setModal('')} onSaved={()=>{setModal('');setNotice('Interação registrada.');load()}}/>}
    {canCollaborate&&modal==='task'&&<TaskModal supabase={supabase} org={org} publisher={publisher} user={user} onClose={()=>setModal('')} onSaved={()=>{setModal('');setNotice('Tarefa criada.');load()}}/>}
    {canCollaborate&&modal==='opportunity'&&<OpportunityModal supabase={supabase} org={org} publisher={publisher} user={user} opportunity={editingOpportunity} onClose={closeOpportunity} onSaved={mode=>{closeOpportunity();setNotice(mode==='updated'?'Oportunidade atualizada.':'Oportunidade criada.');load()}}/>}
  </div>;
}

function SocietaryLinksCard({data}){
  const rows=Array.isArray(data?.related_publishers)?data.related_publishers:[];
  const primary=rows.slice(0,6);
  const extra=rows.slice(6);
  const row=(item)=><div className="publisher-related-row" key={item.publisher_id}>
    <div className="publisher-related-main">
      <Link href={`/app/editoras/${item.publisher_id}`} className="publisher-related-name">{item.display_name||item.legal_name||'Empresa relacionada'}</Link>
      <div className="publisher-related-meta">
        <span>CNPJ {formatCnpj(item.cnpj)}</span>
        {Array.isArray(item.stage_names)&&item.stage_names.length>0&&<span>Etapa{item.stage_names.length===1?'':'s'}: {item.stage_names.join(', ')}</span>}
        {Number(item.cnpj_count)>1&&<span>{item.cnpj_count} CNPJs/filiais na base</span>}
        {Number(item.active_opportunities)>0&&<span>{item.active_opportunities} oportunidade{Number(item.active_opportunities)===1?'':'s'} aberta{Number(item.active_opportunities)===1?'':'s'}</span>}
      </div>
      <div className="publisher-related-owner">Sócio{(item.shared_owners||[]).length===1?'':'s'} em comum: <b>{(item.shared_owners||[]).join(', ')||'—'}</b></div>
    </div>
    {item.registration_status&&<span className={`badge ${String(item.registration_status).toUpperCase()==='ATIVA'?'green':String(item.registration_status).toUpperCase()==='BAIXADA'?'red':'amber'}`}>{item.registration_status}</span>}
  </div>;
  return <details className="card panel publisher-societary-card">
    <summary className="publisher-societary-summary">
      <div>
        <h2>Vínculos societários</h2>
        <p>{data.related_count} empresa{data.related_count===1?'':'s'} relacionada{data.related_count===1?'':'s'} por sócio em comum.</p>
      </div>
      <div className="publisher-societary-summary-actions">
        <span className="badge amber">{data.related_count} relacionada{data.related_count===1?'':'s'}</span>
        <span className="publisher-societary-chevron" aria-hidden="true">⌄</span>
      </div>
    </summary>
    <div className="publisher-societary-body">
      <div className="publisher-societary-warning"><AlertTriangle size={17}/><div><strong>Atenção comercial</strong><span>Antes de definir escopo ou preço, confira estes CNPJs. Eles podem integrar a mesma estrutura comercial, embora o vínculo societário não confirme sozinho um grupo econômico.</span></div></div>
      <div className="publisher-related-list">{primary.map(row)}</div>
      {extra.length>0&&<details className="publisher-related-more"><summary>Ver mais {extra.length} empresa{extra.length===1?'':'s'}</summary><div className="publisher-related-list extra">{extra.map(row)}</div></details>}
      <p className="publisher-societary-footnote">Detecção automática por coincidência exata do nome do sócio no quadro societário sincronizado da Receita Federal.</p>
    </div>
  </details>;
}

function Info({label,value,help}){return <div className="info-item"><small>{help?<HelpLabel help={help}>{label}</HelpLabel>:label}</small><span>{value||'—'}</span></div>}
function contactOrigin(contact){
  const ref=String(contact?.source_ref||'');
  if(ref.startsWith('receita:cnpj:'))return {label:'Receita Federal — quadro societário',url:''};
  if(/^https?:\/\//i.test(ref))return {label:'Fonte pública',url:ref.replace(/#[a-f0-9]{32}$/i,'')};
  return {label:'Cadastro Radar',url:''};
}
function EditContactModal({supabase,org,contact,user,onClose,onSaved}){
  const origin=contactOrigin(contact);
  const [f,setF]=useState({
    job_title:contact.job_title||'',
    department:contact.department||'',
    email:contact.email||'',
    phone:contact.phone||'',
    mobile:contact.mobile||'',
    linkedin_url:contact.linkedin_url||'',
    notes:contact.notes||'',
    is_decision_maker:Boolean(contact.is_decision_maker)
  });
  const [err,setErr]=useState('');
  async function save(e){
    e.preventDefault();
    setErr('');
    const payload={
      job_title:f.job_title.trim()||null,
      department:f.department.trim()||null,
      email:f.email.trim()||null,
      phone:f.phone.trim()||null,
      mobile:f.mobile.trim()||null,
      linkedin_url:f.linkedin_url.trim()||null,
      notes:f.notes.trim()||null,
      is_decision_maker:f.is_decision_maker,
      updated_by:user?.id||null,
      updated_at:new Date().toISOString()
    };
    const {error}=await supabase.from('contacts').update(payload).eq('organization_id',org).eq('id',contact.id);
    if(error)setErr(error.message);else onSaved();
  }
  return <Modal title="Editar pessoa de contato" onClose={onClose} onSubmit={save} err={err} submitLabel="Salvar alterações">
    <label className="span-2"><HelpLabel help="O nome fica bloqueado para preservar o vínculo societário e o histórico do contato.">Nome</HelpLabel><input className="input contact-locked-field" value={contact.full_name||''} readOnly aria-readonly="true"/></label>
    <div className="span-2 contact-origin-box"><small>Origem do contato</small><strong>{origin.label}</strong>{origin.url&&<a className="text-link" href={origin.url} target="_blank" rel="noreferrer">Abrir fonte pública</a>}</div>
    <label><HelpLabel help={HELP.contactRole}>Cargo / função</HelpLabel><input className="input" value={f.job_title} onChange={e=>setF(x=>({...x,job_title:e.target.value}))} placeholder="Ex.: Diretor editorial"/></label>
    <label><HelpLabel help={HELP.contactArea}>Área / departamento</HelpLabel><input className="input" value={f.department} onChange={e=>setF(x=>({...x,department:e.target.value}))} placeholder="Ex.: Editorial"/></label>
    <label><HelpLabel help={HELP.contactEmail}>E-mail profissional</HelpLabel><input type="email" className="input" value={f.email} onChange={e=>setF(x=>({...x,email:e.target.value}))} placeholder="nome@empresa.com.br"/></label>
    <label><HelpLabel help="Telefone profissional ou ramal desta pessoa.">Telefone</HelpLabel><input className="input" value={f.phone} onChange={e=>setF(x=>({...x,phone:e.target.value}))} placeholder="(11) 0000-0000"/></label>
    <label><HelpLabel help={HELP.contactMobile}>Celular / WhatsApp</HelpLabel><input className="input" value={f.mobile} onChange={e=>setF(x=>({...x,mobile:e.target.value}))} placeholder="(11) 90000-0000"/></label>
    <label><HelpLabel help="Perfil profissional público no LinkedIn.">LinkedIn</HelpLabel><input className="input" value={f.linkedin_url} onChange={e=>setF(x=>({...x,linkedin_url:e.target.value}))} placeholder="https://linkedin.com/in/..."/></label>
    <label className="span-2"><span className="help-label"><span><input type="checkbox" checked={f.is_decision_maker} onChange={e=>setF(x=>({...x,is_decision_maker:e.target.checked}))}/> É decisor(a)</span><HelpTip text={HELP.decisionMaker}/></span></label>
    <label className="span-2"><span>Observações</span><textarea rows={3} value={f.notes} onChange={e=>setF(x=>({...x,notes:e.target.value}))} placeholder="Ex.: Responsável por compras institucionais; prefere contato por WhatsApp."/></label>
    <p className="span-2 contact-edit-note">O nome original não pode ser alterado aqui. Para contatos vindos da Receita, isso preserva o cruzamento societário entre CNPJs.</p>
  </Modal>;
}

function ContactModal({supabase,org,publisher,user,onClose,onSaved}){const [f,setF]=useState({full_name:'',job_title:'',department:'',email:'',phone:'',mobile:'',is_decision_maker:false});const [err,setErr]=useState('');async function save(e){e.preventDefault();const {error}=await supabase.from('contacts').insert({organization_id:org,publisher_id:publisher.id,...f,active:true,created_by:user?.id||null,updated_by:user?.id||null});if(error)setErr(error.message);else onSaved()}return <Modal title="Adicionar pessoa de contato" onClose={onClose} onSubmit={save} err={err}><label className="span-2"><HelpLabel help={HELP.contactName}>Nome</HelpLabel><input required className="input" value={f.full_name} onChange={e=>setF(x=>({...x,full_name:e.target.value}))}/></label><label><HelpLabel help={HELP.contactRole}>Cargo</HelpLabel><input className="input" value={f.job_title} onChange={e=>setF(x=>({...x,job_title:e.target.value}))}/></label><label><HelpLabel help={HELP.contactArea}>Área</HelpLabel><input className="input" value={f.department} onChange={e=>setF(x=>({...x,department:e.target.value}))}/></label><label><HelpLabel help={HELP.contactEmail}>E-mail</HelpLabel><input type="email" className="input" value={f.email} onChange={e=>setF(x=>({...x,email:e.target.value}))}/></label><label><HelpLabel help={HELP.contactMobile}>Celular</HelpLabel><input className="input" value={f.mobile} onChange={e=>setF(x=>({...x,mobile:e.target.value}))}/></label><label className="span-2"><span className="help-label"><span><input type="checkbox" checked={f.is_decision_maker} onChange={e=>setF(x=>({...x,is_decision_maker:e.target.checked}))}/> É decisor(a)</span><HelpTip text={HELP.decisionMaker}/></span></label></Modal>}
function InteractionModal({supabase,org,publisher,user,team,onClose,onSaved}){const [f,setF]=useState({channel:'phone',result:'connected',summary:'',interest_level:'',next_step:'',next_action_at:''});const [mentions,setMentions]=useState([]);const [err,setErr]=useState('');async function save(e){e.preventDefault();const payload={organization_id:org,publisher_id:publisher.id,user_id:user?.id||null,occurred_at:new Date().toISOString(),channel:f.channel,direction:'outbound',result:f.result||null,summary:f.summary,interest_level:f.interest_level||null,next_step:f.next_step||null,next_action_at:f.next_action_at?new Date(f.next_action_at).toISOString():null};const {data,error}=await supabase.from('interactions').insert(payload).select('id').single();if(error)setErr(error.message);else{if(mentions.length){await supabase.rpc('crm_notify_mentions',{p_organization_id:org,p_user_ids:mentions,p_title:'Você foi mencionado em uma interação',p_body:`${publisher.name} · ${f.summary}`.slice(0,900),p_href:`/app/editoras/${publisher.id}`,p_source_type:'interaction',p_source_id:data?.id||publisher.id,p_dedupe_prefix:`mention:interaction:${data?.id||Date.now()}`});window.dispatchEvent(new Event('crm-notifications-changed'))}onSaved()}}return <Modal title="Registrar interação" onClose={onClose} onSubmit={save} err={err}><label><HelpLabel help={HELP.channel}>Canal</HelpLabel><select value={f.channel} onChange={e=>setF(x=>({...x,channel:e.target.value}))}>{Object.entries(CHANNEL_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label><HelpLabel help={HELP.result}>Resultado</HelpLabel><select value={f.result} onChange={e=>setF(x=>({...x,result:e.target.value}))}>{Object.entries(RESULT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="span-2"><HelpLabel help={HELP.interactionSummary}>Resumo</HelpLabel><textarea required rows={4} value={f.summary} onChange={e=>setF(x=>({...x,summary:e.target.value}))}/></label><label><HelpLabel help={HELP.interest}>Interesse</HelpLabel><select value={f.interest_level} onChange={e=>setF(x=>({...x,interest_level:e.target.value}))}><option value="">Não informado</option>{Object.entries(INTEREST_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label><HelpLabel help={HELP.interactionNextAction}>Próxima ação</HelpLabel><PtBrDateTimeField value={f.next_action_at} onChange={value=>setF(x=>({...x,next_action_at:value}))} ariaLabel="Próxima ação"/></label><label className="span-2"><HelpLabel help={HELP.nextStep}>Próximo passo</HelpLabel><input className="input" value={f.next_step} onChange={e=>setF(x=>({...x,next_step:e.target.value}))}/></label></Modal>}
function TaskModal({supabase,org,publisher,user,onClose,onSaved}){const [f,setF]=useState({title:'',task_type:'follow_up',priority:'medium',due_at:''});const [err,setErr]=useState('');async function save(e){e.preventDefault();const {error}=await supabase.from('tasks').insert({organization_id:org,publisher_id:publisher.id,assigned_to:user?.id||null,created_by:user?.id||null,title:f.title,task_type:f.task_type,priority:f.priority,status:'open',due_at:f.due_at?new Date(f.due_at).toISOString():null});if(error)setErr(error.message);else onSaved()}return <Modal title="Criar tarefa" onClose={onClose} onSubmit={save} err={err}><label className="span-2"><HelpLabel help={HELP.taskTitle}>Título</HelpLabel><input required className="input" value={f.title} onChange={e=>setF(x=>({...x,title:e.target.value}))}/></label><label><HelpLabel help={HELP.taskType}>Tipo</HelpLabel><select value={f.task_type} onChange={e=>setF(x=>({...x,task_type:e.target.value}))}>{Object.entries(TASK_TYPE_LABELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label><HelpLabel help={HELP.taskPriority}>Prioridade</HelpLabel><select value={f.priority} onChange={e=>setF(x=>({...x,priority:e.target.value}))}>{Object.entries(PRIORITY_LABELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label className="span-2"><HelpLabel help={HELP.taskDue}>Prazo</HelpLabel><PtBrDateTimeField value={f.due_at} onChange={value=>setF(x=>({...x,due_at:value}))} ariaLabel="Prazo"/></label></Modal>}
function OpportunityModal({supabase,org,publisher,user,opportunity,onClose,onSaved}){
  const [f,setF]=useState({
    title:opportunity?.title||'',
    service_key:opportunity?.service_key||'radar_oportunidades',
    service_type:opportunity?.service_type||'',
    radar_opportunities_title_count:opportunity?.radar_opportunities_title_count??'',
    pnld_notice:opportunity?.pnld_notice||'',
    pnld_category:opportunity?.pnld_category||'',
    pnld_works_count:opportunity?.pnld_works_count??'',
    licitacoes_scope:opportunity?.licitacoes_scope||'',
    stage:opportunity?.stage||'identified',
    expected_close_date:opportunity?.expected_close_date||'',
    next_step:opportunity?.next_step||'',
    description:opportunity?.description||'',
    loss_reason:opportunity?.loss_reason||''
  });
  const [err,setErr]=useState('');
  const editing=Boolean(opportunity?.id);
  function countValue(value){if(value==='')return null;const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0?parsed:null}
  async function save(e){
    e.preventDefault();setErr('');
    const title=f.title.trim();
    if(!title){setErr('Informe um título para a oportunidade.');return}
    const titleCount=countValue(f.radar_opportunities_title_count);
    const pnldWorks=countValue(f.pnld_works_count);
    if(f.service_key==='radar_oportunidades'&&f.radar_opportunities_title_count!==''&&!titleCount){setErr('A quantidade de títulos deve ser um número inteiro maior que zero.');return}
    if(f.service_key==='pnld'&&f.pnld_works_count!==''&&!pnldWorks){setErr('A quantidade de obras deve ser um número inteiro maior que zero.');return}
    const payload={
      organization_id:org,
      publisher_id:publisher.id,
      owner_user_id:opportunity?.owner_user_id||publisher.owner_user_id||user?.id||null,
      title,
      service_key:f.service_key,
      service_type:f.service_key==='other'?(f.service_type.trim()||null):null,
      radar_opportunities_title_count:f.service_key==='radar_oportunidades'?titleCount:null,
      pnld_notice:f.service_key==='pnld'?(f.pnld_notice.trim()||null):null,
      pnld_category:f.service_key==='pnld'?(f.pnld_category.trim()||null):null,
      pnld_works_count:f.service_key==='pnld'?pnldWorks:null,
      licitacoes_scope:f.service_key==='radar_licitacoes'?(f.licitacoes_scope.trim()||null):null,
      description:f.description.trim()||null,
      stage:f.stage,
      estimated_value:null,
      probability:null,
      expected_close_date:f.expected_close_date||null,
      loss_reason:f.stage==='lost'?(f.loss_reason.trim()||null):null,
      next_step:f.next_step.trim()||null,
      updated_by:user?.id||null,
      updated_at:new Date().toISOString()
    };
    let error;
    if(editing)({error}=await supabase.from('opportunities').update(payload).eq('organization_id',org).eq('id',opportunity.id));
    else({error}=await supabase.from('opportunities').insert({...payload,created_by:user?.id||null}));
    if(error)setErr(error.message);else onSaved(editing?'updated':'created');
  }
  return <Modal title={editing?'Editar oportunidade':'Criar oportunidade'} onClose={onClose} onSubmit={save} err={err} submitLabel={editing?'Salvar alterações':'Criar oportunidade'}>
    <label className="span-2"><HelpLabel help={HELP.opportunityTitle}>Título da oportunidade</HelpLabel><input required className="input" value={f.title} onChange={e=>setF(x=>({...x,title:e.target.value}))} placeholder="Ex.: Divulgação de novo catálogo"/></label>
    <label className="span-2"><HelpLabel help={HELP.opportunityService}>Serviço Radar</HelpLabel><select required value={f.service_key} onChange={e=>setF(x=>({...x,service_key:e.target.value}))}>{Object.entries(OPPORTUNITY_SERVICE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {f.service_key==='radar_oportunidades'&&<label className="span-2"><HelpLabel help={HELP.opportunityTitleCount}>Quantidade de títulos</HelpLabel><input className="input" type="number" min="1" step="1" value={f.radar_opportunities_title_count} onChange={e=>setF(x=>({...x,radar_opportunities_title_count:e.target.value}))} placeholder="Ex.: 10"/></label>}
    {f.service_key==='pnld'&&<><label><HelpLabel help={HELP.opportunityPnldNotice}>Edital / programa</HelpLabel><input className="input" value={f.pnld_notice} onChange={e=>setF(x=>({...x,pnld_notice:e.target.value}))} placeholder="Ex.: PNLD 2028"/></label><label><HelpLabel help={HELP.opportunityPnldWorks}>Quantidade de obras</HelpLabel><input className="input" type="number" min="1" step="1" value={f.pnld_works_count} onChange={e=>setF(x=>({...x,pnld_works_count:e.target.value}))} placeholder="Ex.: 4"/></label><label className="span-2"><HelpLabel help={HELP.opportunityPnldCategory}>Categoria / objeto</HelpLabel><input className="input" value={f.pnld_category} onChange={e=>setF(x=>({...x,pnld_category:e.target.value}))} placeholder="Ex.: Anos Finais · Categoria 2"/></label></>}
    {f.service_key==='radar_licitacoes'&&<label className="span-2"><HelpLabel help={HELP.opportunityLicScope}>Escopo do acompanhamento</HelpLabel><textarea rows={3} value={f.licitacoes_scope} onChange={e=>setF(x=>({...x,licitacoes_scope:e.target.value}))} placeholder="Ex.: acompanhamento de editais de secretarias municipais e estaduais"/></label>}
    {f.service_key==='other'&&<label className="span-2"><HelpLabel help={HELP.opportunityType}>Outro serviço / projeto</HelpLabel><input className="input" value={f.service_type} onChange={e=>setF(x=>({...x,service_type:e.target.value}))} placeholder="Descreva o serviço ou projeto"/></label>}
    <label><HelpLabel help={HELP.opportunityStage}>Etapa</HelpLabel><select value={f.stage} onChange={e=>setF(x=>({...x,stage:e.target.value}))}>{Object.entries(OPPORTUNITY_STAGE_LABELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <label><HelpLabel help={HELP.opportunityClose}>Previsão de conclusão</HelpLabel><PtBrDateField value={f.expected_close_date} onChange={value=>setF(x=>({...x,expected_close_date:value}))} ariaLabel="Previsão de conclusão"/></label>
    <label className="span-2"><HelpLabel help={HELP.opportunityNextStep}>Próximo passo</HelpLabel><input className="input" value={f.next_step} onChange={e=>setF(x=>({...x,next_step:e.target.value}))} placeholder="Ex.: Enviar proposta / aguardar avaliação"/></label>
    {f.stage==='lost'&&<label className="span-2"><HelpLabel help={HELP.opportunityLoss}>Motivo da perda</HelpLabel><input className="input" value={f.loss_reason} onChange={e=>setF(x=>({...x,loss_reason:e.target.value}))} placeholder="Ex.: Projeto adiado ou sem interesse neste momento"/></label>}
    <label className="span-2"><HelpLabel help={HELP.opportunityDescription}>Descrição</HelpLabel><textarea rows={4} value={f.description} onChange={e=>setF(x=>({...x,description:e.target.value}))} placeholder="Contexto específico desta negociação"/></label>
  </Modal>;
}
function Modal({title,onClose,onSubmit,err,children,submitLabel='Salvar'}){
  const titleId=useId();
  const dialogRef=useRef(null);
  const restoreFocusRef=useRef(null);
  const busyRef=useRef(false);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{busyRef.current=busy},[busy]);
  useEffect(()=>{
    restoreFocusRef.current=document.activeElement;
    const dialog=dialogRef.current;
    const focusables=()=>Array.from(dialog?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')||[]).filter(el=>!el.hasAttribute('hidden'));
    const first=focusables()[0];
    (first||dialog)?.focus();
    function onKeyDown(event){
      if(event.key==='Escape'&&!busyRef.current){event.preventDefault();onClose();return}
      if(event.key!=='Tab')return;
      const items=focusables();
      if(!items.length){event.preventDefault();dialog?.focus();return}
      const firstItem=items[0],lastItem=items[items.length-1];
      if(event.shiftKey&&document.activeElement===firstItem){event.preventDefault();lastItem.focus()}
      else if(!event.shiftKey&&document.activeElement===lastItem){event.preventDefault();firstItem.focus()}
    }
    document.addEventListener('keydown',onKeyDown);
    return ()=>{document.removeEventListener('keydown',onKeyDown);restoreFocusRef.current?.focus?.()}
  },[]);
  async function handleSubmit(event){
    event.preventDefault();
    if(busyRef.current)return;
    setBusy(true);busyRef.current=true;
    try{await onSubmit(event)}finally{busyRef.current=false;setBusy(false)}
  }
  function requestClose(){if(!busyRef.current)onClose()}
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)requestClose()}}>
    <form ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} onSubmit={handleSubmit}>
      <div className="modal-head"><div><h3 id={titleId}>{title}</h3></div><button type="button" aria-label="Fechar" disabled={busy} onClick={requestClose}><X/></button></div>
      {err&&<div className="notice error" role="alert">{err}</div>}
      <div className="form-grid">{children}</div>
      <div className="modal-actions"><button className="btn secondary" type="button" disabled={busy} onClick={requestClose}>Cancelar</button><button className="btn" disabled={busy}>{busy?'Salvando…':submitLabel}</button></div>
    </form>
  </div>
}
