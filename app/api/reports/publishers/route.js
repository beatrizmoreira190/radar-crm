import writeExcelFile from 'write-excel-file/node';
import { authenticateRequest } from '@/lib/server/googleCalendar';
import { PRIORITY_LABELS, RADAR_PRODUCT_LABELS } from '@/lib/constants';

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
function date(value){
  if(!value)return'';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return'';
  return d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
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

export async function GET(request){
  try{
    const {supabase,membership,user}=await authenticateRequest(request);
    const org=membership.organization_id;
    const isManager=['owner','admin','supervisor'].includes(membership.role);

    const [publishers,teamR,stagesR]=await Promise.all([
      fetchPaged(()=>{
        let query=supabase.from('publishers').select(
          'id,name,legal_name,trade_name,cnpj,registration_status,cnpj_status_date,cnpj_status_reason,city,state,postal_code,address_street,address_number,neighborhood,company_size,cnae_primary,cnae_description,priority,score,radar_fit_score,commercial_potential_score,data_quality_score,best_product,fit_pnld_literario,fit_pnld_didatico,fit_pnld_tecnico_metodologico,fit_radar_licitacoes,fit_radar_oportunidades,stage_id,owner_user_id,prospector_user_id,last_contact_at,next_action_at,commercial_temperature,general_email,phone,website'
        ).eq('organization_id',org).eq('archived',false);
        if(!isManager)query=query.eq('owner_user_id',user.id);
        return query.order('name');
      }),
      supabase.from('org_members').select('user_id,full_name,email').eq('organization_id',org).eq('active',true),
      supabase.from('pipeline_stages').select('id,name').eq('organization_id',org).eq('active',true)
    ]);

    if(teamR.error)throw teamR.error;
    if(stagesR.error)throw stagesR.error;

    const teamMap=Object.fromEntries((teamR.data||[]).map(member=>[member.user_id,member]));
    const stageMap=Object.fromEntries((stagesR.data||[]).map(stage=>[stage.id,stage.name]));

    const headers=[
      'Editora','Razão social','Nome fantasia','CNPJ','Situação CNPJ','Data da situação','Motivo da situação',
      'Cidade','UF','CEP','Logradouro','Número','Bairro','Porte','CNAE principal','Descrição CNAE',
      'Etapa','Prioridade','Temperatura','Radar Score','Aderência Radar','Potencial comercial','Qualidade dos dados',
      'Melhor produto','PNLD Literário','PNLD Didático','PNLD Técnico-Metodológico','Radar de Licitações',
      'Radar de Oportunidades','Responsável atual','Prospector de origem','Último contato','Próxima ação',
      'E-mail','Telefone','Site'
    ];

    const data=publishers.map(p=>[
      text(p.name),text(p.legal_name),text(p.trade_name),text(p.cnpj),text(p.registration_status),
      date(p.cnpj_status_date),text(p.cnpj_status_reason),text(p.city),text(p.state),text(p.postal_code),
      text(p.address_street),text(p.address_number),text(p.neighborhood),text(p.company_size),
      text(p.cnae_primary),text(p.cnae_description),stageMap[p.stage_id]||'Sem etapa',
      PRIORITY_LABELS[p.priority]||text(p.priority),text(p.commercial_temperature),integer(p.score),
      integer(p.radar_fit_score),integer(p.commercial_potential_score),integer(p.data_quality_score),
      RADAR_PRODUCT_LABELS[p.best_product]||'',integer(p.fit_pnld_literario),integer(p.fit_pnld_didatico),
      integer(p.fit_pnld_tecnico_metodologico),integer(p.fit_radar_licitacoes),integer(p.fit_radar_oportunidades),
      teamMap[p.owner_user_id]?.full_name||teamMap[p.owner_user_id]?.email||'',
      teamMap[p.prospector_user_id]?.full_name||teamMap[p.prospector_user_id]?.email||'',
      date(p.last_contact_at),date(p.next_action_at),text(p.general_email),text(p.phone),text(p.website)
    ]);

    const sheet={
      data:[
        [cell('RADAR — Base de editoras',titleStyle),...Array(headers.length-1).fill(null)],
        [cell('Base ativa da operação',metaStyle),cell(\`\${publishers.length.toLocaleString('pt-BR')} editoras\`),...Array(headers.length-2).fill(null)],
        [cell('Gerado em',metaStyle),cell(new Date().toLocaleString('pt-BR')),...Array(headers.length-2).fill(null)],
        [],
        header(headers),
        ...data.map(row)
      ],
      sheet:'Editoras',
      columns:widths([30,34,26,18,16,18,34,22,8,14,28,10,20,22,16,30,24,14,14,12,15,18,17,25,14,14,22,18,20,24,24,20,20,28,18,32]),
      stickyRowsCount:5,
      showGridLines:true
    };

    const buffer=await writeExcelFile([sheet],{fontFamily:'Aptos',fontSize:10}).toBuffer();
    const fileName=\`radar-base-editoras-\${new Date().toISOString().slice(0,10)}.xlsx\`;

    return new Response(buffer,{
      status:200,
      headers:{
        'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition':\`attachment; filename="\${fileName}"\`,
        'cache-control':'no-store',
        'x-radar-file-name':fileName
      }
    });
  }catch(error){
    console.error('publisher-base-export',error);
    return Response.json({error:error?.message||'Não foi possível gerar a base de editoras.'},{status:error?.status||500});
  }
}
