'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, ChevronDown, Download, FileSpreadsheet,
  Info, RefreshCw, Upload, Users, X
} from 'lucide-react';
import writeExcelFile from 'write-excel-file/browser';
import { useCrm } from '@/components/CrmProvider';
import { PUBLISHER_COMMERCIAL_PROFILE_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { excelSerialToIso, readXlsxWorkbook } from '@/lib/xlsxWorkbook';

const PUBLISHER_COLUMNS=[
  {key:'name',label:'Nome principal no CRM',required:true,width:26},
  {key:'commercial_name',label:'Nome comercial / marca',required:true,width:26},
  {key:'trade_name',label:'Nome fantasia oficial',required:true,width:26},
  {key:'legal_name',label:'Razão social',required:true,width:34},
  {key:'cnpj',label:'CNPJ',required:true,width:20},
  {key:'registration_status',label:'Situação cadastral',width:20},
  {key:'cnpj_status_date',label:'Data da situação cadastral',date:true,width:22},
  {key:'cnpj_status_reason',label:'Motivo da situação cadastral',width:30},
  {key:'cnpj_start_date',label:'Data de abertura',date:true,width:18},
  {key:'matrix_branch',label:'Matriz / filial',width:16},
  {key:'cnpj_special_status',label:'Situação especial',width:20},
  {key:'cnpj_special_status_date',label:'Data da situação especial',date:true,width:22},
  {key:'legal_nature',label:'Natureza jurídica',width:30},
  {key:'cnae_primary',label:'CNAE principal',width:18},
  {key:'cnae_description',label:'Descrição do CNAE principal',width:34},
  {key:'cnae_secondary',label:'CNAEs secundários',width:34},
  {key:'company_size',label:'Porte empresarial',width:18},
  {key:'size_label',label:'Classificação de tamanho',width:22},
  {key:'tax_regime',label:'Regime tributário',width:22},
  {key:'simples_nacional',label:'Simples Nacional',width:18},
  {key:'mei',label:'MEI',width:12},
  {key:'share_capital',label:'Capital social',width:20},
  {key:'estimated_revenue',label:'Faturamento estimado',width:22},
  {key:'employee_range',label:'Faixa de funcionários',width:20},
  {key:'age_range',label:'Tempo / faixa de atuação',width:22},
  {key:'country',label:'País',width:16},
  {key:'postal_code',label:'CEP',width:14},
  {key:'address_type',label:'Tipo de logradouro',width:18},
  {key:'address_street',label:'Logradouro',width:30},
  {key:'address_number',label:'Número',width:12},
  {key:'address_complement',label:'Complemento',width:20},
  {key:'neighborhood',label:'Bairro',width:20},
  {key:'city',label:'Cidade',width:22},
  {key:'state',label:'UF',width:10},
  {key:'ibge_code',label:'Código IBGE',width:16},
  {key:'website',label:'Site',width:30},
  {key:'general_email',label:'E-mail geral',width:28},
  {key:'alternate_emails',label:'E-mails alternativos',multi:true,width:36},
  {key:'phone',label:'Telefone principal',width:20},
  {key:'secondary_phone',label:'Telefone secundário',width:20},
  {key:'linkedin_url',label:'LinkedIn',width:32},
  {key:'instagram',label:'Instagram',width:24},
  {key:'editorial_profile',label:'Perfil editorial',multi:true,width:42},
  {key:'commercial_profile_code',label:'Perfil comercial Radar',commercialProfile:true,width:34},
  {key:'commercial_profile_note',label:'Observação do perfil comercial',width:36},
  {key:'priority',label:'Prioridade',priority:true,width:16},
  {key:'stage_name',label:'Etapa do pipeline',width:24},
  {key:'owner_email',label:'Responsável atual (e-mail)',emailLower:true,width:30},
  {key:'commercial_temperature',label:'Temperatura comercial',temperature:true,width:20},
  {key:'next_action_at',label:'Próxima ação',dateTime:true,width:22},
  {key:'notes',label:'Notas comerciais',width:42},
];

const CONTACT_COLUMNS=[
  {key:'publisher_cnpj',label:'CNPJ da editora',required:true,width:20},
  {key:'contact_kind',label:'Tipo de vínculo',required:true,contactKind:true,width:28},
  {key:'full_name',label:'Nome',required:true,width:28},
  {key:'job_title',label:'Função / cargo',width:28},
  {key:'department',label:'Área / departamento',width:24},
  {key:'email',label:'E-mail',emailLower:true,width:28},
  {key:'phone',label:'Telefone',width:20},
  {key:'mobile',label:'Celular / WhatsApp',width:20},
  {key:'linkedin_url',label:'LinkedIn',width:32},
  {key:'preferred_channel',label:'Canal preferencial',channel:true,width:20},
  {key:'is_decision_maker',label:'É decisor?',boolean:true,width:14},
  {key:'notes',label:'Observações',width:40},
];

const TEMPERATURE_LABELS={cold:'Fria',warm:'Morna',hot:'Quente'};
const CONTACT_KIND_LABELS={legal:'Sócio / responsável legal',contact:'Outro contato'};
const CHANNEL_LABELS={phone:'Telefone',email:'E-mail',whatsapp:'WhatsApp',linkedin:'LinkedIn',other:'Outro'};
const STATUS_LABELS={insert:'Novo',update:'Atualizar',skip:'Já existe',error:'Erro'};

function norm(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
}
function cleanCnpj(value=''){return String(value==null?'':value).replace(/\D/g,'')}
function splitMulti(value=''){
  return String(value==null?'':value).split(/\s*\|\s*|\r?\n/).map(v=>v.trim()).filter(Boolean)
    .filter((v,i,a)=>a.findIndex(x=>norm(x)===norm(v))===i);
}
function ptDateToIso(value=''){
  const text=String(value==null?'':value).trim();
  if(!text)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const m=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m)return text;
  return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
}
function ptDateTimeToIso(value=''){
  const text=String(value==null?'':value).trim();
  if(!text)return '';
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text))return text;
  const m=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if(!m)return text;
  const hh=String(m[4]||'09').padStart(2,'0');
  const mm=String(m[5]||'00').padStart(2,'0');
  return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0')+'T'+hh+':'+mm+':00';
}
function reverseMap(map){
  const out={};
  Object.entries(map).forEach(([value,label])=>{out[norm(value)]=value;out[norm(label)]=value});
  return out;
}
const COMMERCIAL_PROFILE_MAP=reverseMap(PUBLISHER_COMMERCIAL_PROFILE_LABELS);
const PRIORITY_MAP=reverseMap(PRIORITY_LABELS);
const TEMPERATURE_MAP=reverseMap(TEMPERATURE_LABELS);
const CONTACT_KIND_MAP={
  ...reverseMap(CONTACT_KIND_LABELS),
  [norm('socio')]:'legal',
  [norm('sócio')]:'legal',
  [norm('responsavel legal')]:'legal',
  [norm('responsável legal')]:'legal',
  [norm('contato')]:'contact'
};
const CHANNEL_MAP=reverseMap(CHANNEL_LABELS);

function normalizeCell(value,column){
  if(value===null||value===undefined)return column.multi?[]:'';
  if(column.multi)return splitMulti(value);
  if(column.date&&typeof value==='number')return excelSerialToIso(value,false);
  if(column.dateTime&&typeof value==='number')return excelSerialToIso(value,true);
  const text=String(value).trim();
  if(column.date)return ptDateToIso(text);
  if(column.dateTime)return ptDateTimeToIso(text);
  if(column.emailLower)return text.toLowerCase();
  if(column.commercialProfile)return COMMERCIAL_PROFILE_MAP[norm(text)]||text;
  if(column.priority)return PRIORITY_MAP[norm(text)]||text.toLowerCase();
  if(column.temperature)return TEMPERATURE_MAP[norm(text)]||text.toLowerCase();
  if(column.contactKind)return CONTACT_KIND_MAP[norm(text)]||text.toLowerCase();
  if(column.channel)return CHANNEL_MAP[norm(text)]||text.toLowerCase();
  if(column.boolean){
    const n=norm(text);
    if(['sim','yes','true','1','x'].includes(n))return true;
    if(['nao','não','no','false','0',''].includes(n))return false;
    return text;
  }
  if(column.key==='cnpj'||column.key==='publisher_cnpj')return cleanCnpj(text);
  if(column.key==='state')return text.toUpperCase();
  return text;
}

function findSheet(workbook,name){
  const target=norm(name);
  const key=Object.keys(workbook).find(sheet=>norm(sheet)===target);
  return key?workbook[key]:null;
}

function parseSheetRows(matrix,columns,sheetName){
  if(!matrix||!matrix.length)return {rows:[],errors:['A aba '+sheetName+' está vazia.']};
  const header=matrix[0].map(v=>norm(v).replace(/\s*\*$/,''));
  const headerIndex=new Map(header.map((value,index)=>[value,index]));
  const errors=[];
  const mapping={};

  for(const column of columns){
    const aliases=[column.label,column.key,...(column.aliases||[])].map(norm);
    const found=aliases.find(alias=>headerIndex.has(alias));
    if(found)mapping[column.key]=headerIndex.get(found);
    else if(column.required)errors.push('A aba '+sheetName+' não possui a coluna obrigatória “'+column.label+'”.');
  }
  if(errors.length)return {rows:[],errors};

  const rows=[];
  matrix.slice(1).forEach((row,index)=>{
    if(!row.some(value=>String(value==null?'':value).trim()!==''))return;
    const obj={_row:String(index+2)};
    columns.forEach(column=>{
      const colIndex=mapping[column.key];
      if(colIndex===undefined){obj[column.key]=column.multi?[]:'';return}
      obj[column.key]=normalizeCell(row[colIndex],column);
    });
    rows.push(obj);
  });
  return {rows,errors:[]};
}

function localChecks(publishers,contacts){
  const details=[];
  const seenCnpj=new Map();
  for(const row of publishers){
    const missing=PUBLISHER_COLUMNS.filter(c=>c.required && !String(row[c.key]==null?'':row[c.key]).trim());
    if(missing.length)details.push({sheet:'Editoras',row:row._row,name:row.name,status:'error',error:'Campos obrigatórios ausentes: '+missing.map(c=>c.label).join(', ')+'.'});
    const cnpj=cleanCnpj(row.cnpj);
    if(cnpj.length!==14)details.push({sheet:'Editoras',row:row._row,name:row.name,status:'error',error:'CNPJ deve conter 14 dígitos.'});
    else if(seenCnpj.has(cnpj))details.push({sheet:'Editoras',row:row._row,name:row.name,status:'error',error:'CNPJ repetido na aba Editoras (também na linha '+seenCnpj.get(cnpj)+').'});
    else seenCnpj.set(cnpj,row._row);
  }
  const seenPeople=new Map();
  for(const row of contacts){
    const cnpj=cleanCnpj(row.publisher_cnpj);
    if(cnpj.length!==14)details.push({sheet:'Pessoas',row:row._row,name:row.full_name,status:'error',error:'CNPJ da editora deve conter 14 dígitos.'});
    if(!row.full_name)details.push({sheet:'Pessoas',row:row._row,name:'',status:'error',error:'Nome da pessoa é obrigatório.'});
    if(!['legal','contact'].includes(row.contact_kind))details.push({sheet:'Pessoas',row:row._row,name:row.full_name,status:'error',error:'Tipo de vínculo deve ser “Sócio / responsável legal” ou “Outro contato”.'});
    if(row.contact_kind==='legal'&&!row.job_title)details.push({sheet:'Pessoas',row:row._row,name:row.full_name,status:'error',error:'Função / cargo é obrigatória para sócio ou responsável legal.'});
    const key=cnpj+'|'+norm(row.full_name)+'|'+norm(row.email);
    if(seenPeople.has(key))details.push({sheet:'Pessoas',row:row._row,name:row.full_name,status:'error',error:'Pessoa repetida na aba Pessoas (também na linha '+seenPeople.get(key)+').'});
    else seenPeople.set(key,row._row);
  }
  return details;
}

function xlsxCell(value,header=false){
  return header?{value,fontWeight:'bold',backgroundColor:'#E4E7EC'}:{value};
}
function downloadCsv(filename,rows){
  const esc=value=>{
    const s=String(value==null?'':value);
    return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  };
  const text='\uFEFF'+rows.map(row=>row.map(esc).join(';')).join('\n')+'\n';
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);
}

export default function ImportPage(){
  const {supabase,membership,isManager,team}=useCrm();
  const org=membership?.organization_id;
  const [stages,setStages]=useState([]);
  const [fileName,setFileName]=useState('');
  const [publishers,setPublishers]=useState([]);
  const [contacts,setContacts]=useState([]);
  const [structureErrors,setStructureErrors]=useState([]);
  const [mode,setMode]=useState('skip');
  const [reading,setReading]=useState(false);
  const [validating,setValidating]=useState(false);
  const [busy,setBusy]=useState(false);
  const [validation,setValidation]=useState(null);
  const [result,setResult]=useState(null);
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    let active=true;
    async function load(){
      if(!org)return;
      const {data}=await supabase.from('pipeline_stages').select('id,name,position').eq('organization_id',org).eq('active',true).order('position');
      if(active)setStages(data||[]);
    }
    load();
    return()=>{active=false};
  },[org,supabase]);

  const localIssues=useMemo(()=>localChecks(publishers,contacts),[publishers,contacts]);
  const totalLocalErrors=localIssues.filter(item=>item.status==='error').length;
  const importablePublishers=validation?Number(validation.publishers?.inserted||0)+Number(validation.publishers?.updated||0):0;
  const importableContacts=validation?Number(validation.contacts?.inserted||0)+Number(validation.contacts?.updated||0):0;

  if(!isManager)return <div className="page-wrap"><div className="card panel"><h2>Acesso restrito</h2><p className="muted">A importação em massa é exclusiva de administradores e supervisores.</p></div></div>;

  async function downloadTemplate(){
    const header=value=>xlsxCell(value,true);
    const instructions=[
      [header('MODELO DE IMPORTAÇÃO — RADAR CRM')],
      [xlsxCell('Use as abas Editoras e Pessoas. Não renomeie essas duas abas.')],
      [xlsxCell('')],
      [header('ABA EDITORAS')],
      [xlsxCell('Uma linha = uma editora. Os cinco campos obrigatórios são: Nome principal no CRM, Nome comercial / marca, Nome fantasia oficial, Razão social e CNPJ.')],
      [xlsxCell('O CNPJ é a chave da importação. Se já existir, o modo escolhido na tela define se a linha será ignorada ou usada para atualizar o cadastro.')],
      [xlsxCell('Perfil editorial: para vários perfis, separe com |. Ex.: Infantil | Literatura | Paradidático. Perfis novos também são aceitos.')],
      [xlsxCell('E-mails alternativos: separe com |.')],
      [xlsxCell('Datas: prefira dd/mm/aaaa. Próxima ação: dd/mm/aaaa hh:mm.')],
      [xlsxCell('Etapa do pipeline: use exatamente um nome existente no CRM.')],
      [xlsxCell('Responsável atual: informe o e-mail de uma pessoa ativa da equipe Radar.')],
      [xlsxCell('')],
      [header('ABA PESSOAS')],
      [xlsxCell('Uma linha = uma pessoa. Repita o CNPJ da editora para vincular quantas pessoas forem necessárias.')],
      [xlsxCell('Tipo de vínculo: use “Sócio / responsável legal” ou “Outro contato”.')],
      [xlsxCell('Para sócio / responsável legal, Nome e Função / cargo são obrigatórios. Para outro contato, apenas Nome é obrigatório.')],
      [xlsxCell('É decisor?: use Sim ou Não.')],
      [xlsxCell('Canal preferencial: Telefone, E-mail, WhatsApp, LinkedIn ou Outro.')],
      [xlsxCell('')],
      [header('REGRAS IMPORTANTES')],
      [xlsxCell('Radar Score, fits, qualidade dos dados, histórico e auditoria não são importados: o CRM calcula esses dados automaticamente.')],
      [xlsxCell('Células vazias não apagam dados existentes quando o modo “Atualizar” é usado.')],
      [xlsxCell('Sempre use Validar antes de Importar. A validação não altera a base.')],
      [xlsxCell('')],
      [header('ETAPAS ATUAIS DO PIPELINE')],
      [xlsxCell(stages.length?stages.map(s=>s.name).join(' | '):'Consulte o CRM no momento do preenchimento.')],
      [header('E-MAILS ATIVOS DA EQUIPE')],
      [xlsxCell(team.filter(m=>m.active&&m.email).map(m=>m.email).join(' | ')||'Consulte a página Equipe.')],
    ];
    const publisherData=[PUBLISHER_COLUMNS.map(c=>header(c.label+(c.required?' *':'')))];
    const peopleData=[CONTACT_COLUMNS.map(c=>header(c.label+(c.required?' *':'')))];

    await writeExcelFile([
      {data:instructions,sheet:'LEIA-ME',columns:[{width:120}],stickyRowsCount:1,showGridLines:false},
      {data:publisherData,sheet:'Editoras',columns:PUBLISHER_COLUMNS.map(c=>({width:c.width||22})),stickyRowsCount:1},
      {data:peopleData,sheet:'Pessoas',columns:CONTACT_COLUMNS.map(c=>({width:c.width||22})),stickyRowsCount:1},
    ]).toFile('modelo-importacao-editoras-radar.xlsx');
  }

  async function choose(event){
    const file=event.target.files?.[0];
    if(!file)return;
    setReading(true);setNotice('');setValidation(null);setResult(null);setStructureErrors([]);
    try{
      const workbook=await readXlsxWorkbook(file);
      const publisherSheet=findSheet(workbook,'Editoras');
      const peopleSheet=findSheet(workbook,'Pessoas');
      const errors=[];
      if(!publisherSheet)errors.push('A aba “Editoras” não foi encontrada.');
      if(!peopleSheet)errors.push('A aba “Pessoas” não foi encontrada.');
      if(errors.length){
        setFileName(file.name);setPublishers([]);setContacts([]);setStructureErrors(errors);return;
      }
      const p=parseSheetRows(publisherSheet,PUBLISHER_COLUMNS,'Editoras');
      const c=parseSheetRows(peopleSheet,CONTACT_COLUMNS,'Pessoas');
      const structural=[...p.errors,...c.errors];
      setFileName(file.name);setPublishers(p.rows);setContacts(c.rows);setStructureErrors(structural);
      setNotice(structural.length?'O arquivo foi lido, mas a estrutura precisa ser corrigida.':'Arquivo lido. Revise o resumo e valide antes de importar.');
    }catch(error){
      setFileName(file.name);setPublishers([]);setContacts([]);
      setStructureErrors([error.message||'Não foi possível ler o arquivo Excel.']);
    }finally{
      setReading(false);event.target.value='';
    }
  }

  async function validate(){
    if(!org||!publishers.length||structureErrors.length||totalLocalErrors)return;
    setValidating(true);setNotice('');setValidation(null);setResult(null);
    const {data,error}=await supabase.rpc('crm_preview_import_workbook_v3',{
      p_organization_id:org,p_publishers:publishers,p_contacts:contacts,p_mode:mode
    });
    if(error)setNotice(error.message);
    else{
      setValidation(data);
      setNotice(Number(data?.errors||0)>0?'A validação encontrou erros. Corrija a planilha antes de importar.':'Validação concluída. Nenhum dado foi salvo ainda.');
    }
    setValidating(false);
  }

  async function runImport(){
    if(!org||!validation||Number(validation.errors||0)>0)return;
    setBusy(true);setNotice('');setResult(null);
    const {data,error}=await supabase.rpc('crm_import_workbook_v3',{
      p_organization_id:org,p_publishers:publishers,p_contacts:contacts,p_mode:mode,p_source_name:fileName||null
    });
    if(error)setNotice(error.message);
    else{setResult(data);setNotice('Importação concluída. Editoras e pessoas foram processadas conforme a validação.');}
    setBusy(false);
  }

  function reset(){
    setFileName('');setPublishers([]);setContacts([]);setStructureErrors([]);
    setValidation(null);setResult(null);setNotice('');
  }
  function changeMode(value){setMode(value);setValidation(null);setResult(null)}
  function downloadIssues(){
    const details=[...localIssues,...(validation?.details||[])].filter(item=>item.error||item.warning);
    if(!details.length)return;
    downloadCsv('inconsistencias-importacao-editoras.csv',[
      ['Aba','Linha','Registro','Situação','Identificado por','Erro / aviso'],
      ...details.map(item=>[
        item.sheet||'',item.row||'',item.name||'',STATUS_LABELS[item.status]||item.status||'',
        item.matched_by||'',item.error||item.warning||''
      ])
    ]);
  }

  return <div className="page-wrap import-v3-page">
    <div className="page-head">
      <div><div className="eyebrow">Dados em massa</div><h1>Importar editoras</h1><p>Use o mesmo modelo de dados da página Nova editora, com uma aba para editoras e outra para pessoas vinculadas.</p></div>
      <button className="btn secondary" type="button" onClick={downloadTemplate}><Download size={16}/> Baixar modelo Excel</button>
    </div>

    <section className="card panel import-how">
      <div className="panel-head"><div><h2>Como funciona</h2><p>O arquivo padrão é um Excel <b>.xlsx</b> com três abas.</p></div><Info size={20}/></div>
      <div className="import-how-grid">
        <GuideCard number="1" title="LEIA-ME">Explica as regras, formatos e valores aceitos. Não é importada.</GuideCard>
        <GuideCard number="2" title="Editoras">Uma linha por editora. Os cinco campos de identificação e o CNPJ são obrigatórios.</GuideCard>
        <GuideCard number="3" title="Pessoas">Uma linha por pessoa. O CNPJ liga cada pessoa à editora correta.</GuideCard>
      </div>
      <div className="import-rule-strip"><strong>CNPJ é a chave.</strong><span>Um mesmo CNPJ nunca cria uma segunda editora. Na validação você escolhe preservar o cadastro atual ou atualizar somente campos preenchidos.</span></div>
    </section>

    <section className="card panel import-details">
      <details>
        <summary><span>Ver colunas e regras da aba Editoras</span><ChevronDown size={17}/></summary>
        <div className="column-guide">
          <p><b>Obrigatórios:</b> {PUBLISHER_COLUMNS.filter(c=>c.required).map(c=>c.label).join(' · ')}.</p>
          <p><b>Perfil editorial:</b> use <code>|</code> para separar vários perfis. Categorias ainda inexistentes podem ser importadas e passam a aparecer nas opções do CRM.</p>
          <p><b>Etapa do pipeline:</b> precisa corresponder ao nome de uma etapa ativa. <b>Responsável atual:</b> use o e-mail cadastrado na equipe.</p>
          <div className="column-chips">{PUBLISHER_COLUMNS.map(c=><span key={c.key}>{c.label}{c.required?' *':''}</span>)}</div>
        </div>
      </details>
      <details>
        <summary><span>Ver colunas e regras da aba Pessoas</span><ChevronDown size={17}/></summary>
        <div className="column-guide">
          <p>Repita o CNPJ da editora em cada pessoa. Use <b>Sócio / responsável legal</b> ou <b>Outro contato</b> no tipo de vínculo.</p>
          <p>Para sócios/responsáveis legais, <b>Nome</b> e <b>Função / cargo</b> são obrigatórios. Para outros contatos, apenas o nome é obrigatório.</p>
          <div className="column-chips">{CONTACT_COLUMNS.map(c=><span key={c.key}>{c.label}{c.required?' *':''}</span>)}</div>
        </div>
      </details>
    </section>

    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="card panel">
      <div className="panel-head"><div><h2>1. Escolher o arquivo</h2><p>Use o modelo Excel disponibilizado acima. As abas <b>Editoras</b> e <b>Pessoas</b> não devem ser renomeadas.</p></div><FileSpreadsheet size={21}/></div>
      <label className="import-drop-v3">
        <Upload size={25}/><strong>{reading?'Lendo arquivo…':fileName||'Selecionar arquivo .xlsx'}</strong>
        <span>{fileName&&!reading?(publishers.length.toLocaleString('pt-BR')+' editoras · '+contacts.length.toLocaleString('pt-BR')+' pessoas'):'Clique para procurar no computador'}</span>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={reading} onChange={choose}/>
      </label>
      {structureErrors.length>0&&<div className="import-errors-box"><strong>Problemas na estrutura do arquivo</strong>{structureErrors.map((error,index)=><span key={index}>• {error}</span>)}</div>}
    </section>

    {fileName&&structureErrors.length===0&&<>
      <section className="card panel import-summary-card">
        <div className="panel-head"><div><h2>2. Conferir o conteúdo</h2><p>O CRM mostra o que encontrou antes de comparar com a base.</p></div></div>
        <div className="import-summary-grid">
          <SummaryStat icon={<Building2 size={18}/>} value={publishers.length} label="editoras na planilha"/>
          <SummaryStat icon={<Users size={18}/>} value={contacts.length} label="pessoas vinculadas"/>
          <SummaryStat icon={<AlertTriangle size={18}/>} value={totalLocalErrors} label="erros locais"/>
        </div>
        {publishers.length>0&&<PreviewTable title="Amostra da aba Editoras" rows={publishers.slice(0,5)} columns={[
          ['name','Nome principal'],['commercial_name','Nome comercial'],['cnpj','CNPJ'],['editorial_profile','Perfil editorial']
        ]}/>}
        {contacts.length>0&&<PreviewTable title="Amostra da aba Pessoas" rows={contacts.slice(0,5)} columns={[
          ['publisher_cnpj','CNPJ'],['contact_kind','Vínculo'],['full_name','Nome'],['job_title','Função / cargo']
        ]}/>}
        {totalLocalErrors>0&&<IssuesList details={localIssues}/>}
      </section>

      <section className="card panel">
        <div className="panel-head"><div><h2>3. Definir o que fazer com CNPJs já existentes</h2><p>A escolha vale para editoras e pessoas que o CRM reconhecer como já cadastradas.</p></div></div>
        <div className="import-mode-grid">
          <label className={'import-mode-option '+(mode==='skip'?'selected':'')}>
            <input type="radio" name="mode" value="skip" checked={mode==='skip'} onChange={()=>changeMode('skip')}/>
            <div><strong>Ignorar e preservar</strong><span>Se o CNPJ já existir, a editora atual não é alterada. Pessoas já existentes também são preservadas.</span></div>
          </label>
          <label className={'import-mode-option '+(mode==='update'?'selected':'')}>
            <input type="radio" name="mode" value="update" checked={mode==='update'} onChange={()=>changeMode('update')}/>
            <div><strong>Atualizar somente campos preenchidos</strong><span>Células vazias nunca apagam informações. O CNPJ apenas localiza o cadastro correto.</span></div>
          </label>
        </div>
      </section>

      <section className="card panel">
        <div className="panel-head"><div><h2>4. Validar antes de importar</h2><p>A validação verifica obrigatórios, CNPJs, etapas, responsáveis, pessoas e correspondências com a base. <b>Nada é salvo nesta etapa.</b></p></div></div>
        <button className="btn" type="button" disabled={validating||!publishers.length||totalLocalErrors>0} onClick={validate}>
          <CheckCircle2 size={16}/>{validating?'Validando…':'Validar planilha'}
        </button>
        {validation&&<ValidationSummary data={validation} onDownloadIssues={downloadIssues}/>}
      </section>

      {validation&&Number(validation.errors||0)===0&&<section className="card panel import-confirm">
        <div><div className="eyebrow">Pronto para gravar</div><h2>5. Confirmar importação</h2>
          <p>Serão processadas <b>{importablePublishers.toLocaleString('pt-BR')} editoras</b> e <b>{importableContacts.toLocaleString('pt-BR')} pessoas</b>. {mode==='skip'?'Os registros já existentes serão preservados.':'Os registros existentes receberão somente os campos preenchidos.'}</p>
        </div>
        <button className="btn" type="button" disabled={busy||(!importablePublishers&&!importableContacts)} onClick={runImport}><Upload size={16}/>{busy?'Importando…':'Importar agora'}</button>
      </section>}

      {result&&<section className="card panel import-result">
        <CheckCircle2 size={24}/><div><h2>Importação concluída</h2><p>O CRM recalcula automaticamente os indicadores derivados quando os dados relevantes mudam.</p></div>
        <ResultCounters data={result}/>
        <button className="btn secondary" type="button" onClick={reset}><RefreshCw size={15}/> Importar outro arquivo</button>
      </section>}
    </>}

    <style jsx>{`
      .import-how,.import-details{margin-bottom:16px}
      .import-how-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}
      .import-rule-strip{margin-top:12px;padding:12px 14px;border-radius:10px;background:#f9fafb;display:grid;gap:3px;font-size:12px}
      .import-rule-strip span{color:#667085}
      .import-details{padding:0;overflow:hidden}
      .import-details details+details{border-top:1px solid #eaecf0}
      .import-details summary{list-style:none;cursor:pointer;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px}
      .import-details summary::-webkit-details-marker{display:none}
      .column-guide{padding:0 18px 16px;font-size:12px;color:#475467}
      .column-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .column-chips span{padding:5px 8px;border:1px solid #eaecf0;border-radius:999px;background:#fff;font-size:10px;color:#475467}
      .import-drop-v3{margin-top:14px;border:1px dashed #98a2b3;border-radius:12px;min-height:130px;display:grid;place-items:center;align-content:center;gap:5px;cursor:pointer;text-align:center;background:#fcfcfd}
      .import-drop-v3 input{display:none}
      .import-drop-v3 span{font-size:11px;color:#667085}
      .import-errors-box{margin-top:12px;padding:12px;border-radius:10px;background:#fef3f2;border:1px solid #fda29b;color:#912018;display:grid;gap:4px;font-size:11px}
      .import-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
      .import-mode-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .import-mode-option{display:grid!important;grid-template-columns:auto 1fr!important;gap:10px!important;align-items:flex-start;border:1px solid #eaecf0;border-radius:12px;padding:14px;cursor:pointer}
      .import-mode-option.selected{border-color:#84adff;background:#f5f8ff}
      .import-mode-option div{display:grid;gap:4px}
      .import-mode-option span{font-size:11px;color:#667085;font-weight:400}
      .import-confirm{margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:20px}
      .import-confirm h2{margin:4px 0}.import-confirm p{margin:0;color:#667085;font-size:12px}
      .import-result{margin-top:16px;display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start}
      .import-result h2{margin:0 0 3px}.import-result p{margin:0;color:#667085;font-size:12px}
      .import-result :global(.result-counters){grid-column:1/-1}
      .import-result :global(.btn){grid-column:1/-1;justify-self:start}
      @media(max-width:900px){.import-how-grid,.import-summary-grid,.import-mode-grid{grid-template-columns:1fr}.import-confirm{align-items:stretch;flex-direction:column}.import-confirm :global(.btn){width:100%}}
    `}</style>
  </div>;
}

function GuideCard({number,title,children}){
  return <div style={{border:'1px solid #eaecf0',borderRadius:12,padding:13,display:'grid',gap:5}}>
    <span className="badge" style={{justifySelf:'start'}}>{number}</span><strong style={{fontSize:13}}>{title}</strong><span className="muted" style={{fontSize:11}}>{children}</span>
  </div>;
}
function SummaryStat({icon,value,label}){
  return <div style={{border:'1px solid #eaecf0',borderRadius:12,padding:13,display:'flex',gap:10,alignItems:'center'}}>
    {icon&&<span style={{color:'#475467'}}>{icon}</span>}<div><strong style={{display:'block',fontSize:20}}>{Number(value||0).toLocaleString('pt-BR')}</strong><small className="muted">{label}</small></div>
  </div>;
}
function PreviewTable({title,rows,columns}){
  return <div style={{marginTop:14}}><h3 style={{fontSize:12,margin:'0 0 8px'}}>{title}</h3><div style={{overflowX:'auto'}}>
    <table className="data-table"><thead><tr>{columns.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row,index)=><tr key={index}>{columns.map(([key])=><td key={key}>{Array.isArray(row[key])?(row[key].join(' · ')||'—'):(row[key]||'—')}</td>)}</tr>)}</tbody>
    </table>
  </div></div>;
}
function IssuesList({details=[]}){
  const issues=details.filter(item=>item.error||item.warning);
  if(!issues.length)return null;
  return <div style={{marginTop:12}}><h3 style={{fontSize:12}}>Problemas encontrados antes da validação</h3>
    <div style={{display:'grid',gap:6}}>{issues.slice(0,20).map((item,index)=><div key={index} className="notice error" style={{margin:0,fontSize:11}}><b>{item.sheet} · linha {item.row}</b> — {item.error||item.warning}</div>)}</div>
    {issues.length>20&&<p className="muted" style={{fontSize:11}}>Mais {issues.length-20} ocorrência(s) não exibidas aqui.</p>}
  </div>;
}
function ValidationSummary({data,onDownloadIssues}){
  const errors=Number(data?.errors||0),warnings=Number(data?.warnings||0);
  const p=data?.publishers||{},c=data?.contacts||{};
  const details=(data?.details||[]).filter(item=>item.error||item.warning);
  return <div style={{marginTop:14,display:'grid',gap:12}}>
    <div className="result-counters" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
      <SummaryStat value={p.inserted||0} label="editoras novas"/>
      <SummaryStat value={p.updated||0} label="editoras a atualizar"/>
      <SummaryStat value={c.inserted||0} label="pessoas novas"/>
      <SummaryStat value={errors} label="erros"/>
    </div>
    <div className={'notice '+(errors?'error':'')} style={{margin:0}}>
      {errors?<><b>Validação bloqueada.</b> Há {errors} erro(s) que precisam ser corrigidos.</>:<><b>Validação aprovada.</b> {warnings?(warnings+' aviso(s) merecem conferência, mas não bloqueiam a importação.'):'Nenhum erro encontrado.'}</>}
    </div>
    {details.length>0&&<div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Aba</th><th>Linha</th><th>Registro</th><th>Situação</th><th>Mensagem</th></tr></thead>
      <tbody>{details.slice(0,100).map((item,index)=><tr key={index}><td>{item.sheet}</td><td>{item.row}</td><td>{item.name||'—'}</td><td>{STATUS_LABELS[item.status]||item.status}</td><td>{item.error||item.warning}</td></tr>)}</tbody>
    </table></div>}
    {details.length>0&&<button type="button" className="btn secondary small" onClick={onDownloadIssues} style={{justifySelf:'start'}}><Download size={14}/> Baixar inconsistências</button>}
  </div>;
}
function ResultCounters({data}){
  const p=data?.publishers||{},c=data?.contacts||{};
  return <div className="result-counters" style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>
    <SummaryStat value={p.inserted||0} label="editoras criadas"/>
    <SummaryStat value={p.updated||0} label="editoras atualizadas"/>
    <SummaryStat value={p.skipped||0} label="editoras preservadas"/>
    <SummaryStat value={c.inserted||0} label="pessoas criadas"/>
    <SummaryStat value={c.updated||0} label="pessoas atualizadas"/>
    <SummaryStat value={c.skipped||0} label="pessoas preservadas"/>
  </div>;
}
