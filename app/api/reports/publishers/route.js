import writeExcelFile from 'write-excel-file/node';
import { authenticateRequest } from '@/lib/server/googleCalendar';
import {
  EDITORIAL_PROFILE_CONFIDENCE_LABELS,
  EDITORIAL_PROFILE_STATUS_LABELS,
  PRIORITY_LABELS,
  PUBLISHER_COMMERCIAL_PROFILE_LABELS,
  RADAR_PRODUCT_LABELS
} from '@/lib/constants';

export const runtime='nodejs';
export const maxDuration=60;

const headerStyle={fontWeight:'bold',textColor:'#FFFFFF',backgroundColor:'#111827',align:'center',alignVertical:'center',wrap:true,borderColor:'#D0D5DD',borderStyle:'thin'};
const titleStyle={fontWeight:'bold',fontSize:16,textColor:'#101828'};
const metaStyle={fontWeight:'bold',textColor:'#344054',backgroundColor:'#F2F4F7'};

function cell(value,style={}){return {value:value??'',...style}}
function row(values){return values.map(value=>cell(value))}
function header(values){return values.map(value=>cell(value,headerStyle))}
function widths(values){return values.map(width=>({width:Math.max(4,Math.min(60,width))}))}
function text(value){return value==null?'':String(value)}
function integer(value){const n=Number(value);return Number.isFinite(n)?n:0}
function yesNo(value){if(value==null||value==='')return'';const v=String(value).toLowerCase();return ['true','1','sim','s','yes'].includes(v)?'Sim':['false','0','não','nao','n','no'].includes(v)?'Não':String(value)}
function joinArray(value,separator=' · '){return Array.isArray(value)?value.filter(Boolean).join(separator):text(value)}
function date(value,withTime=true){
  if(!value)return'';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return'';
  return d.toLocaleString('pt-BR',withTime?{dateStyle:'short',timeStyle:'short'}:{dateStyle:'short'});
}
function sourceUrls(value){
  const rows=Array.isArray(value)?value:[];
  return rows.map(item=>item?.url).filter(Boolean).join(' | ');
}
function commercialProfileSource(value){
  return value==='manual'?'Confirmado manualmente':value==='editorial_profile'?'Confirmado pelo perfil editorial':'Padrão do sistema';
}
function contactSource(value){
  const ref=String(value||'');
  if(ref.startsWith('receita:cnpj:'))return'Receita Federal — quadro societário';
  if(/^https?:\/\//i.test(ref))return'Fonte pública';
  return ref?'Importação / referência externa':'Cadastro Radar';
}
function cnpjBase(value){
  const d=String(value||'').replace(/\D/g,'');
  return d.length>=8?d.slice(0,8):'';
}
function normalizedName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase()}
function displayName(p){return p.commercial_name||p.trade_name||p.name||p.legal_name||''}
function autoWidths(headers){
  const long=new Set(['Razão social','Endereço completo','Observações perfil comercial','Notas perfil editorial','Notas enriquecimento web','Fontes nome comercial','Fontes enriquecimento web','Empresas relacionadas','CNPJs relacionados','Observações','Notas']);
  return headers.map(label=>long.has(label)?38:Math.max(10,Math.min(28,Math.ceil(String(label).length*.9)+4)));
}

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

function tableSheet(name,description,headers,data){
  return {
    data:[
      [cell(name,titleStyle),...Array(Math.max(0,headers.length-1)).fill(null)],
      [cell(description),...Array(Math.max(0,headers.length-1)).fill(null)],
      [cell('Gerado em',metaStyle),cell(new Date().toLocaleString('pt-BR')),...Array(Math.max(0,headers.length-2)).fill(null)],
      [],
      header(headers),
      ...data.map(row)
    ],
    sheet:name.slice(0,31),
    columns:widths(autoWidths(headers)),
    stickyRowsCount:5,
    showGridLines:true
  };
}

export async function GET(request){
  try{
    const {supabase,membership,user}=await authenticateRequest(request);
    const org=membership.organization_id;
    const isManager=['owner','admin','supervisor'].includes(membership.role);

    const [publishers,contacts,teamR,stagesR]=await Promise.all([
      fetchPaged(()=>{
        let query=supabase.from('publishers').select(
          'id,name,legal_name,trade_name,commercial_name,commercial_name_confidence,commercial_name_sources,commercial_name_verified_at,cnpj,registration_status,cnpj_status_date,cnpj_status_reason,cnpj_start_date,cnpj_special_status,cnpj_special_status_date,simples_nacional,mei,city,state,postal_code,address_type,address_street,address_number,address_complement,neighborhood,company_size,legal_nature,cnae_primary,cnae_description,cnae_secondary,matrix_branch,market_segments,owners_names,commercial_profile_code,commercial_profile_source,commercial_profile_note,commercial_profile_reviewed_at,commercial_profile_reviewed_by,editorial_profile,editorial_profile_status,editorial_profile_confidence,editorial_profile_verified_at,editorial_profile_notes,web_enrichment_status,web_enrichment_sources,web_enrichment_verified_at,web_enrichment_notes,priority,score,radar_fit_score,commercial_potential_score,data_quality_score,best_product,fit_pnld_literario,fit_pnld_didatico,fit_pnld_tecnico_metodologico,fit_radar_licitacoes,fit_radar_oportunidades,stage_id,owner_user_id,prospector_user_id,last_contact_at,next_action_at,commercial_temperature,general_email,alternate_emails,phone,secondary_phone,website,instagram,linkedin_url'
        ).eq('organization_id',org).eq('archived',false);
        if(!isManager)query=query.eq('owner_user_id',user.id);
        return query.order('name');
      }),
      fetchPaged(()=>supabase.from('contacts').select(
        'id,publisher_id,full_name,job_title,department,email,phone,mobile,linkedin_url,is_decision_maker,preferred_channel,notes,source_ref,active,created_at,updated_at'
      ).eq('organization_id',org).eq('active',true).order('full_name')),
      supabase.from('org_members').select('user_id,full_name,email').eq('organization_id',org).eq('active',true),
      supabase.from('pipeline_stages').select('id,name').eq('organization_id',org).eq('active',true)
    ]);

    if(teamR.error)throw teamR.error;
    if(stagesR.error)throw stagesR.error;

    const teamMap=Object.fromEntries((teamR.data||[]).map(member=>[member.user_id,member]));
    const stageMap=Object.fromEntries((stagesR.data||[]).map(stage=>[stage.id,stage.name]));
    const publisherMap=Object.fromEntries(publishers.map(p=>[p.id,p]));
    const includedIds=new Set(publishers.map(p=>p.id));
    const includedContacts=contacts.filter(c=>includedIds.has(c.publisher_id));

    const publisherHeaders=[
      'Nome principal','Nome comercial','Nome fantasia oficial','Razão social','CNPJ','Situação CNPJ','Data da situação','Motivo da situação','Início do CNPJ','Situação especial','Data situação especial','Simples Nacional','MEI',
      'Perfil comercial Radar','Origem perfil comercial','Observações perfil comercial','Perfil comercial revisado em','Perfil comercial revisado por',
      'Perfis editoriais','Status perfil editorial','Confiança perfil editorial','Perfil editorial verificado em','Notas perfil editorial',
      'Cidade','UF','CEP','Endereço completo','Porte','Natureza jurídica','Matriz/filial','CNAE principal','Descrição CNAE','CNAEs secundários','Segmentos de atuação','Sócios / quadro societário',
      'Etapa','Prioridade','Temperatura','Radar Score','Aderência Radar','Potencial comercial','Qualidade dos dados','Melhor produto','PNLD Literário','PNLD Didático','PNLD Técnico-Metodológico','Radar de Licitações','Radar de Oportunidades',
      'Responsável atual','Prospector de origem','Último contato','Próxima ação',
      'E-mail principal','Outros e-mails','Telefone','Telefone secundário / WhatsApp','Site','Instagram','LinkedIn',
      'Confiança nome comercial','Nome comercial verificado em','Fontes nome comercial','Status enriquecimento web','Enriquecimento web verificado em','Fontes enriquecimento web','Notas enriquecimento web'
    ];

    const publisherData=publishers.map(p=>[
      displayName(p),text(p.commercial_name),text(p.trade_name),text(p.legal_name),text(p.cnpj),text(p.registration_status),date(p.cnpj_status_date,false),text(p.cnpj_status_reason),date(p.cnpj_start_date,false),text(p.cnpj_special_status),date(p.cnpj_special_status_date,false),yesNo(p.simples_nacional),yesNo(p.mei),
      PUBLISHER_COMMERCIAL_PROFILE_LABELS[p.commercial_profile_code]||text(p.commercial_profile_code),commercialProfileSource(p.commercial_profile_source),text(p.commercial_profile_note),date(p.commercial_profile_reviewed_at),teamMap[p.commercial_profile_reviewed_by]?.full_name||teamMap[p.commercial_profile_reviewed_by]?.email||'',
      joinArray(p.editorial_profile),EDITORIAL_PROFILE_STATUS_LABELS[p.editorial_profile_status]||text(p.editorial_profile_status),EDITORIAL_PROFILE_CONFIDENCE_LABELS[p.editorial_profile_confidence]||text(p.editorial_profile_confidence),date(p.editorial_profile_verified_at),text(p.editorial_profile_notes),
      text(p.city),text(p.state),text(p.postal_code),[p.address_type,p.address_street,p.address_number,p.address_complement,p.neighborhood].filter(Boolean).join(', '),text(p.company_size),text(p.legal_nature),text(p.matrix_branch),text(p.cnae_primary),text(p.cnae_description),text(p.cnae_secondary),joinArray(p.market_segments),text(p.owners_names),
      stageMap[p.stage_id]||'Sem etapa',PRIORITY_LABELS[p.priority]||text(p.priority),text(p.commercial_temperature),integer(p.score),integer(p.radar_fit_score),integer(p.commercial_potential_score),integer(p.data_quality_score),RADAR_PRODUCT_LABELS[p.best_product]||'',integer(p.fit_pnld_literario),integer(p.fit_pnld_didatico),integer(p.fit_pnld_tecnico_metodologico),integer(p.fit_radar_licitacoes),integer(p.fit_radar_oportunidades),
      teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',teamMap[p.prospector_user_id]?.full_name||teamMap[p.prospector_user_id]?.email||'',date(p.last_contact_at),date(p.next_action_at),
      text(p.general_email),joinArray(p.alternate_emails,' | '),text(p.phone),text(p.secondary_phone),text(p.website),text(p.instagram),text(p.linkedin_url),
      text(p.commercial_name_confidence),date(p.commercial_name_verified_at),sourceUrls(p.commercial_name_sources),text(p.web_enrichment_status),date(p.web_enrichment_verified_at),sourceUrls(p.web_enrichment_sources),text(p.web_enrichment_notes)
    ]);

    const contactHeaders=['Editora','CNPJ','Pessoa','Cargo / função','Área / departamento','E-mail profissional','Telefone','Celular / WhatsApp','LinkedIn','Decisor','Canal preferido','Origem','Observações','Atualizado em'];
    const contactData=includedContacts.map(c=>{
      const p=publisherMap[c.publisher_id]||{};
      return [displayName(p),text(p.cnpj),text(c.full_name),text(c.job_title),text(c.department),text(c.email),text(c.phone),text(c.mobile),text(c.linkedin_url),c.is_decision_maker?'Sim':'Não',text(c.preferred_channel),contactSource(c.source_ref),text(c.notes),date(c.updated_at)];
    });

    const ownerGroups=new Map();
    for(const c of includedContacts){
      if(!String(c.source_ref||'').startsWith('receita:cnpj:'))continue;
      const p=publisherMap[c.publisher_id];if(!p)continue;
      const key=normalizedName(c.full_name);if(!key)continue;
      const base=cnpjBase(p.cnpj)||p.id;
      if(!ownerGroups.has(key))ownerGroups.set(key,{owner:c.full_name,entities:new Map()});
      const group=ownerGroups.get(key);
      if(!group.entities.has(base))group.entities.set(base,{names:new Set(),cnpjs:new Set()});
      const entity=group.entities.get(base);
      entity.names.add(displayName(p));
      if(p.cnpj)entity.cnpjs.add(p.cnpj);
    }
    const relationData=[];
    for(const group of ownerGroups.values()){
      if(group.entities.size<2)continue;
      const entities=[...group.entities.values()];
      relationData.push([
        group.owner,
        group.entities.size,
        entities.map(e=>[...e.names].join(' / ')).join(' | '),
        entities.map(e=>[...e.cnpjs].join(' / ')).join(' | ')
      ]);
    }
    relationData.sort((a,b)=>Number(b[1])-Number(a[1])||String(a[0]).localeCompare(String(b[0]),'pt-BR'));

    const sheets=[
      tableSheet('Editoras','Base ativa da operação com dados cadastrais, comerciais, editoriais e canais públicos.',publisherHeaders,publisherData),
      tableSheet('Contatos','Pessoas de contato ativas vinculadas às editoras incluídas na base.',contactHeaders,contactData)
    ];
    if(relationData.length)sheets.push(tableSheet('Vínculos societários','Sócios pessoas físicas que aparecem em duas ou mais empresas/CNPJs-base da seleção exportada. Filiais do mesmo CNPJ-base são consolidadas.',['Sócio em comum','Empresas relacionadas','Empresas / marcas relacionadas','CNPJs relacionados'],relationData));

    const buffer=await writeExcelFile(sheets,{fontFamily:'Aptos',fontSize:10}).toBuffer();
    const fileName='radar-base-editoras-'+new Date().toISOString().slice(0,10)+'.xlsx';

    return new Response(buffer,{
      status:200,
      headers:{
        'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition':'attachment; filename="'+fileName+'"',
        'cache-control':'no-store',
        'x-radar-file-name':fileName
      }
    });
  }catch(error){
    console.error('publisher-base-export',error);
    return Response.json({error:error?.message||'Não foi possível gerar a base de editoras.'},{status:error?.status||500});
  }
}
