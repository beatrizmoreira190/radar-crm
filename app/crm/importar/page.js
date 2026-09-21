'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Database, Download, FileSpreadsheet, Info, ListChecks, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { BRAZIL_STATES, EDITORIAL_PROFILE_OPTIONS } from '@/lib/constants';

const FIELDS=[
  {key:'',label:'Ignorar coluna',aliases:[]},
  {key:'name',label:'Nome da editora *',aliases:['nome','editora','nome da editora','publisher','empresa']},
  {key:'legal_name',label:'Razão social',aliases:['razao social','razão social','nome empresarial']},
  {key:'trade_name',label:'Nome fantasia',aliases:['nome fantasia','fantasia']},
  {key:'cnpj',label:'CNPJ',aliases:['cnpj','documento']},
  {key:'website',label:'Site',aliases:['site','website','url']},
  {key:'country',label:'País',aliases:['pais','país','country']},
  {key:'city',label:'Cidade',aliases:['cidade','municipio','município','city']},
  {key:'state',label:'UF',aliases:['uf','estado','state']},
  {key:'postal_code',label:'CEP',aliases:['cep','codigo postal','código postal','postal code']},
  {key:'address_type',label:'Tipo de logradouro',aliases:['tipo de logradouro','tipo logradouro']},
  {key:'address_street',label:'Logradouro',aliases:['logradouro','endereco','endereço','rua']},
  {key:'address_number',label:'Número',aliases:['numero','número','nº','no']},
  {key:'address_complement',label:'Complemento',aliases:['complemento']},
  {key:'neighborhood',label:'Bairro',aliases:['bairro']},
  {key:'phone',label:'Telefone',aliases:['telefone','fone','phone','celular']},
  {key:'secondary_phone',label:'Telefone secundário',aliases:['telefone secundario','telefone secundário','fone 2','telefone 2']},
  {key:'general_email',label:'E-mail geral',aliases:['email','e-mail','email geral','e-mail geral']},
  {key:'alternate_emails',label:'E-mails alternativos',aliases:['emails alternativos','e-mails alternativos','outros emails','outros e-mails']},
  {key:'linkedin_url',label:'LinkedIn',aliases:['linkedin','linkedin url','linkedin_url']},
  {key:'instagram',label:'Instagram',aliases:['instagram','instagram url']},
  {key:'ibge_code',label:'Código IBGE',aliases:['codigo ibge','código ibge','ibge']},
  {key:'cnae_primary',label:'CNAE principal',aliases:['cnae principal','cnae primario','cnae primário']},
  {key:'cnae_description',label:'Descrição CNAE',aliases:['descricao cnae','descrição cnae']},
  {key:'cnae_secondary',label:'CNAEs secundários',aliases:['cnae secundario','cnae secundário','cnaes secundarios','cnaes secundários']},
  {key:'matrix_branch',label:'Matriz / filial',aliases:['matriz filial','matriz / filial','matriz ou filial']},
  {key:'registration_status',label:'Situação cadastral',aliases:['situacao cadastral','situação cadastral','status cadastral']},
  {key:'legal_nature',label:'Natureza jurídica',aliases:['natureza juridica','natureza jurídica']},
  {key:'company_size',label:'Porte',aliases:['porte','tamanho','company size']},
  {key:'tax_regime',label:'Regime tributário',aliases:['regime tributario','regime tributário']},
  {key:'share_capital',label:'Capital social',aliases:['capital social']},
  {key:'estimated_revenue',label:'Faturamento estimado',aliases:['faturamento estimado','receita estimada']},
  {key:'employee_range',label:'Faixa de funcionários',aliases:['faixa de funcionarios','faixa de funcionários','funcionarios','funcionários']},
  {key:'owners_names',label:'Sócios / responsáveis',aliases:['socios','sócios','nomes dos socios','nomes dos sócios','responsaveis','responsáveis']},
  {key:'age_range',label:'Faixa de idade da empresa',aliases:['faixa de idade','idade da empresa']},
  {key:'catalog_notes',label:'Notas de catálogo',aliases:['notas de catalogo','notas de catálogo','catalogo','catálogo']},
  {key:'market_segments',label:'Segmentos de atuação',aliases:['segmentos de atuacao','segmentos de atuação','mercados','market segments']},
  {key:'editorial_profile',label:'Perfil editorial',aliases:['perfil editorial','editorial profile']},
  {key:'editorial_profile_status',label:'Status do perfil editorial',aliases:['status do perfil editorial','status perfil editorial']},
  {key:'editorial_profile_confidence',label:'Confiança do perfil editorial',aliases:['confianca do perfil editorial','confiança do perfil editorial','confianca perfil','confiança perfil']},
  {key:'editorial_profile_notes',label:'Notas do perfil editorial',aliases:['notas do perfil editorial','observacoes perfil editorial','observações perfil editorial']},
  {key:'priority',label:'Prioridade',aliases:['prioridade','priority']},
  {key:'stage_name',label:'Etapa do pipeline',aliases:['etapa','etapa do pipeline','status','pipeline','stage']},
  {key:'notes',label:'Observações comerciais',aliases:['observacoes','observações','notas','notes']},
  {key:'source_ref',label:'Referência de origem',aliases:['referencia de origem','referência de origem','source ref','source_ref','id origem','id de origem']}
];
const LABELS=Object.fromEntries(FIELDS.map(f=>[f.key,f.label]));
const LIST_FIELDS=new Set(['alternate_emails','market_segments','editorial_profile']);
const PROFILE_SET=new Set(EDITORIAL_PROFILE_OPTIONS);
const STATUS_LABELS={insert:'Nova',update:'Atualizar',skip:'Já existe',error:'Erro',warning:'Aviso'};

function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ')}
function detectDelimiter(text){const line=(text.split(/\r?\n/).find(Boolean)||'');const counts={',':0,';':0,'\t':0};let quoted=false;for(let i=0;i<line.length;i++){if(line[i]==='"')quoted=!quoted;else if(!quoted&&Object.prototype.hasOwnProperty.call(counts,line[i]))counts[line[i]]++}return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]}
function parseDelimited(text,delimiter){const out=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(ch===delimiter&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>String(v).trim()!==''))out.push(row);row=[]}else cell+=ch}row.push(cell);if(row.some(v=>String(v).trim()!==''))out.push(row);return out}
function autoMap(headers){const used=new Set();return headers.map(h=>{const n=norm(h);for(const field of FIELDS){if(!field.key||used.has(field.key))continue;if(field.aliases.some(a=>norm(a)===n)){used.add(field.key);return field.key}}return ''})}
function splitMulti(value=''){return String(value).split(/\s*\|\s*|\s*,\s*/).map(v=>v.trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i)}
function cleanCnpj(value=''){return String(value).replace(/\D/g,'')}
function isBrazil(country=''){const n=norm(country||'Brasil');return !n||n==='brasil'||n==='brazil'}
function csvEscape(value=''){const s=Array.isArray(value)?value.join(' | '):String(value??'');return /[;"\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function downloadText(filename,text){const blob=new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href)}
function displayValue(value){return Array.isArray(value)?(value.join(' · ')||'—'):(value||'—')}

function localCheck(rows){
  const errors=[];const warnings=[];const seenSource=new Map();const seenCnpj=new Map();const nameUf=new Map();
  for(const row of rows){
    const rowNo=row._row;const name=String(row.name||'').trim();const cnpj=cleanCnpj(row.cnpj);const sourceRef=String(row.source_ref||'').trim();const state=String(row.state||'').trim().toUpperCase();const hasStrong=Boolean(sourceRef||cnpj);
    if(!name)errors.push({row:rowNo,name:'',status:'error',error:'Nome da editora é obrigatório.'});else if(isSuspiciousPublisherName(name))errors.push({row:rowNo,name,status:'error',error:'Nome da editora contém trecho técnico/HTML e precisa ser revisado antes da importação.'});
    if(row.cnpj&&cnpj.length!==14)errors.push({row:rowNo,name,status:'error',error:'CNPJ deve conter 14 dígitos.'});
    if(state&&isBrazil(row.country)&&!BRAZIL_STATES.includes(state))errors.push({row:rowNo,name,status:'error',error:`UF inválida: ${state}.`});
    if(sourceRef){if(seenSource.has(sourceRef))errors.push({row:rowNo,name,status:'error',error:`Referência de origem repetida no arquivo (também na linha ${seenSource.get(sourceRef)}).`});else seenSource.set(sourceRef,rowNo)}
    if(cnpj.length===14){if(seenCnpj.has(cnpj))errors.push({row:rowNo,name,status:'error',error:`CNPJ repetido no arquivo (também na linha ${seenCnpj.get(cnpj)}).`});else seenCnpj.set(cnpj,rowNo)}
    if(name&&state){const k=`${norm(name)}|${state}`;const list=nameUf.get(k)||[];list.push({row:rowNo,name,hasStrong});nameUf.set(k,list)}
    if(Array.isArray(row.editorial_profile)){const unknown=row.editorial_profile.filter(v=>!PROFILE_SET.has(v));if(unknown.length)warnings.push({row:rowNo,name,status:'warning',warning:`Perfil editorial fora da taxonomia atual: ${unknown.join(', ')}. O valor será importado, mas pode não pontuar no Radar Score.`})}
  }
  for(const list of nameUf.values()){if(list.length>1&&list.some(x=>!x.hasStrong)){for(const item of list.filter(x=>!x.hasStrong))errors.push({row:item.row,name:item.name,status:'error',error:'Há outra linha com o mesmo Nome + UF e esta linha não possui CNPJ nem referência de origem. Informe uma chave forte ou remova a duplicidade.'})}}
  return {errors:new Set(errors.map(x=>x.row)).size,warnings:new Set(warnings.map(x=>x.row)).size,details:[...errors,...warnings]};
}

export default function ImportPage(){
  const {supabase,membership,isManager}=useCrm();const org=membership?.organization_id;
  const [fileName,setFileName]=useState('');const [headers,setHeaders]=useState([]);const [rawRows,setRawRows]=useState([]);const [mapping,setMapping]=useState([]);
  const [mode,setMode]=useState('skip');const [validating,setValidating]=useState(false);const [validationProgress,setValidationProgress]=useState(0);const [validation,setValidation]=useState(null);
  const [progress,setProgress]=useState(0);const [busy,setBusy]=useState(false);const [result,setResult]=useState(null);const [notice,setNotice]=useState('');const [guideOpen,setGuideOpen]=useState(true);

  const transformed=useMemo(()=>rawRows.map((row,idx)=>{const obj={_row:String(idx+2)};mapping.forEach((key,i)=>{if(!key)return;const value=String(row[i]??'').trim();obj[key]=LIST_FIELDS.has(key)?splitMulti(value):value});return obj}),[rawRows,mapping]);
  const nameMapped=mapping.includes('name');
  const mappedKeys=mapping.filter(Boolean);
  const importCount=validation?Number(validation.inserted||0)+Number(validation.updated||0):0;

  if(!isManager)return <div className="page-wrap"><div className="card panel"><h2>Acesso restrito</h2><p className="muted">A importação de dados cadastrais é exclusiva de administradores e supervisores.</p></div></div>;

  function resetValidation(){setValidation(null);setResult(null);setValidationProgress(0);setProgress(0)}
  async function choose(e){const file=e.target.files?.[0];if(!file)return;setNotice('');setResult(null);setValidation(null);const text=await file.text();const delimiter=detectDelimiter(text);const matrix=parseDelimited(text,delimiter);if(matrix.length<2){setNotice('O arquivo precisa ter uma linha de cabeçalho e pelo menos uma linha de dados.');return}const hs=matrix[0].map((h,i)=>String(h).replace(/^\uFEFF/,'').trim()||`Coluna ${i+1}`);setFileName(file.name);setHeaders(hs);setRawRows(matrix.slice(1).filter(r=>r.some(v=>String(v).trim())));setMapping(autoMap(hs));setProgress(0);setValidationProgress(0)}
  function setMap(index,value){setMapping(m=>m.map((x,i)=>i===index?value:(value&&x===value?'':x)));resetValidation()}
  function changeMode(value){setMode(value);resetValidation()}

  async function runValidation(){
    if(!nameMapped||!transformed.length||!org)return;
    setNotice('');setResult(null);setValidating(true);setValidationProgress(0);
    const local=localCheck(transformed);
    if(local.errors){setValidation({inserted:0,updated:0,skipped:0,errors:local.errors,warnings:local.warnings,details:local.details,localOnly:true});setNotice('Há problemas no arquivo que precisam ser corrigidos antes da comparação com a base.');setValidating(false);return}
    const totals={inserted:0,updated:0,skipped:0,errors:0,warnings:local.warnings,details:[...local.details]};const BATCH=300;
    for(let i=0;i<transformed.length;i+=BATCH){
      const batch=transformed.slice(i,i+BATCH);
      const {data,error}=await supabase.rpc('crm_preview_import_publishers_v2',{p_organization_id:org,p_rows:batch,p_mode:mode});
      if(error){setNotice(`A validação parou no lote ${Math.floor(i/BATCH)+1}: ${error.message}`);setValidating(false);return}
      totals.inserted+=Number(data?.inserted||0);totals.updated+=Number(data?.updated||0);totals.skipped+=Number(data?.skipped||0);totals.errors+=Number(data?.errors||0);totals.warnings+=Number(data?.warnings||0);totals.details.push(...(data?.details||[]));
      setValidationProgress(Math.min(100,Math.round((Math.min(i+BATCH,transformed.length)/transformed.length)*100)));
    }
    setValidation(totals);setNotice(totals.errors?'A validação encontrou registros que precisam ser corrigidos.':'Validação concluída. Nenhum dado foi salvo ainda.');setValidating(false);
  }

  async function runImport(){
    if(!validation||validation.errors||!importCount)return;
    setBusy(true);setNotice('');setResult(null);setProgress(0);const totals={inserted:0,updated:0,skipped:0,errors:0,warnings:0,details:[]};const BATCH=200;
    for(let i=0;i<transformed.length;i+=BATCH){
      const batch=transformed.slice(i,i+BATCH);
      const {data,error}=await supabase.rpc('crm_import_publishers_v2',{p_organization_id:org,p_rows:batch,p_mode:mode,p_source_name:fileName||null});
      if(error){setNotice(`A importação parou no lote ${Math.floor(i/BATCH)+1}: ${error.message}`);setBusy(false);return}
      totals.inserted+=Number(data?.inserted||0);totals.updated+=Number(data?.updated||0);totals.skipped+=Number(data?.skipped||0);totals.errors+=Number(data?.errors||0);totals.warnings+=Number(data?.warnings||0);totals.details.push(...(data?.details||[]));setProgress(Math.min(100,Math.round((Math.min(i+BATCH,transformed.length)/transformed.length)*100)));
    }
    setResult(totals);setNotice(totals.errors?'Importação concluída com alguns erros. Confira o resultado abaixo.':'Importação concluída. O Radar Score é recalculado automaticamente quando dados relevantes mudam.');setBusy(false);
  }

  function downloadTemplate(){
    const header=['Nome da editora','Razão social','Nome fantasia','CNPJ','Site','País','Cidade','UF','CEP','Logradouro','Número','Complemento','Bairro','Telefone','Telefone secundário','E-mail geral','E-mails alternativos','LinkedIn','Instagram','CNAE principal','Descrição CNAE','CNAEs secundários','Situação cadastral','Natureza jurídica','Porte','Faturamento estimado','Faixa de funcionários','Sócios / responsáveis','Segmentos de atuação','Perfil editorial','Status do perfil editorial','Confiança do perfil editorial','Notas do perfil editorial','Prioridade','Etapa do pipeline','Observações','Referência de origem'];
    const example=['Editora Exemplo Ltda','Editora Exemplo Ltda','Editora Exemplo','00000000000000','https://exemplo.com','Brasil','São Paulo','SP','00000-000','Rua Exemplo','100','','Centro','(11) 0000-0000','','contato@exemplo.com','comercial@exemplo.com | financeiro@exemplo.com','','@editoraexemplo','','','','ATIVA','','Médio','','','Ana Exemplo','Escolar | Trade/Livrarias','Literatura | Infantil','Confirmado','Alta','Classificação revisada pela equipe.','Média','A prospectar','Linha de exemplo','fonte-0001'];
    downloadText('modelo-importacao-editoras-v2.csv',header.map(csvEscape).join(';')+'\n'+example.map(csvEscape).join(';')+'\n');
  }
  function downloadIssues(){
    const details=(validation?.details||[]).filter(d=>d.error||d.warning);if(!details.length)return;
    const rows=[['Linha','Editora','Situação','Identificada por','Erro / aviso'],...details.map(d=>[d.row,d.name,STATUS_LABELS[d.status]||d.status||'',d.matched_by||'',d.error||d.warning||''])];
    downloadText('inconsistencias-importacao-editoras.csv',rows.map(r=>r.map(csvEscape).join(';')).join('\n')+'\n');
  }

  return <div className="page-wrap">
    <div className="page-head"><div><div className="eyebrow">Dados em massa</div><h1>Importar editoras</h1><p>Valide a planilha, compare com a base e só depois confirme a gravação. Campos vazios nunca apagam dados existentes.</p></div><button className="btn secondary" onClick={downloadTemplate}><Download size={16}/> Baixar modelo atualizado</button></div>
    <ImportGuide open={guideOpen} onToggle={()=>setGuideOpen(v=>!v)} onDownloadTemplate={downloadTemplate}/>
    {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="card panel import-upload">
      <div className="panel-head"><div><h2>1. Escolher arquivo</h2><p>Use um CSV com cabeçalho. Em campos com vários valores, use <strong>|</strong> para separar cada item. Ex.: <strong>Literatura | Infantil | Educação</strong>.</p></div><FileSpreadsheet size={21}/></div>
      <label className="import-drop"><Upload size={25}/><strong>{fileName||'Selecionar arquivo CSV'}</strong><span>{fileName?`${rawRows.length.toLocaleString('pt-BR')} linhas encontradas`:'Clique para procurar no computador'}</span><input type="file" accept=".csv,text/csv,text/plain" onChange={choose}/></label>
    </section>

    {headers.length>0&&<>
      <section className="card panel" style={{marginTop:16}}>
        <div className="panel-head"><div><h2>2. Mapear colunas</h2><p>Associe as colunas da planilha aos campos atuais do CRM. Score e indicadores Radar não podem ser importados: eles são calculados automaticamente.</p></div><span className={`badge ${nameMapped?'green':'red'}`}>{nameMapped?'Nome mapeado':'Mapeie o nome'}</span></div>
        <div className="mapping-grid">{headers.map((h,i)=><label key={`${h}-${i}`}><span>{h}</span><select value={mapping[i]||''} onChange={e=>setMap(i,e.target.value)}>{FIELDS.map(field=><option key={field.key||'ignore'} value={field.key}>{field.label}</option>)}</select></label>)}</div>
      </section>

      <section className="card panel" style={{marginTop:16}}>
        <div className="panel-head"><div><h2>3. Conferir amostra</h2><p>Veja como as primeiras linhas serão interpretadas antes da validação.</p></div><span className="badge">{mappedKeys.length} campo{mappedKeys.length===1?'':'s'} mapeado{mappedKeys.length===1?'':'s'}</span></div>
        <div className="import-preview-wrap"><table className="data-table import-preview"><thead><tr>{mapping.map((key,i)=>key?<th key={`${key}-${i}`}>{LABELS[key]||key}</th>:null)}</tr></thead><tbody>{transformed.slice(0,8).map((r,idx)=><tr key={idx}>{mapping.map((key,i)=>key?<td key={`${key}-${i}`}>{displayValue(r[key])}</td>:null)}</tr>)}</tbody></table></div>
        {transformed.length>8&&<p className="muted import-preview-note">Mostrando 8 de {transformed.length.toLocaleString('pt-BR')} linhas.</p>}
      </section>

      <section className="card panel" style={{marginTop:16}}>
        <div className="panel-head"><div><h2>4. Validar antes de salvar</h2><p>O CRM verifica formato, duplicidades e correspondência com editoras já existentes. Esta etapa não altera a base.</p></div><ShieldCheck size={22}/></div>
        <div className="form-grid" style={{marginTop:10}}>
          <label className="span-2">Quando a editora já existir<select value={mode} onChange={e=>changeMode(e.target.value)}><option value="skip">Ignorar e preservar todo o cadastro atual</option><option value="update">Atualizar somente os campos preenchidos no CSV</option></select></label>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',marginTop:14,flexWrap:'wrap'}}><button className="btn" disabled={validating||!nameMapped||!transformed.length} onClick={runValidation}>{validating?`Validando… ${validationProgress}%`:<><ShieldCheck size={16}/> Validar {transformed.length.toLocaleString('pt-BR')} registros</>}</button>{validation?.details?.some(d=>d.error||d.warning)&&<button className="btn secondary" onClick={downloadIssues}><Download size={15}/> Baixar inconsistências</button>}</div>
        {validating&&<div className="import-progress" style={{marginTop:12}}><div style={{width:`${validationProgress}%`}}/></div>}
        {validation&&<div style={{marginTop:16}}>
          <div className="import-result-grid"><Result label="Novas" value={validation.inserted}/><Result label="Atualizações" value={validation.updated}/><Result label="Já existentes" value={validation.skipped}/><Result label="Erros" value={validation.errors}/><Result label="Avisos" value={validation.warnings}/></div>
          {!validation.errors&&<div className="notice-bar" style={{marginTop:12}}><span><CheckCircle2 size={15}/> Validação aprovada. Você ainda não salvou nenhuma alteração.</span></div>}
          {validation.errors>0&&<div className="notice error" style={{marginTop:12}}><AlertTriangle size={15}/> Corrija os erros antes de importar.</div>}
          {validation.details?.length>0&&<ValidationTable details={validation.details}/>}
        </div>}
      </section>

      <section className="card panel import-confirm" style={{marginTop:16}}>
        <div><h2>5. Importar</h2><p>{validation?validation.errors?'A importação está bloqueada até a correção dos erros.':`Prontos para gravar ${importCount.toLocaleString('pt-BR')} registros. Editoras existentes serão ${mode==='update'?'atualizadas somente nos campos preenchidos':'preservadas'}.`:'Faça a validação acima antes de liberar a importação.'}</p></div>
        <button className="btn" disabled={busy||!validation||validation.errors>0||!importCount} onClick={runImport}>{busy?`Importando… ${progress}%`:<><Upload size={16}/> Confirmar importação{importCount?` · ${importCount.toLocaleString('pt-BR')}`:''}</>}</button>
        {busy&&<div className="import-progress"><div style={{width:`${progress}%`}}/></div>}
      </section>
    </>}

    {result&&<section className="card panel import-result" style={{marginTop:16}}>
      <div className="panel-head"><div><h2>Resultado da importação</h2><p>Confira o que foi efetivamente gravado. Alterações em dados relevantes disparam o recálculo automático do Radar Score.</p></div><CheckCircle2 size={24}/></div>
      <div className="import-result-grid"><Result label="Inseridas" value={result.inserted}/><Result label="Atualizadas" value={result.updated}/><Result label="Ignoradas" value={result.skipped}/><Result label="Erros" value={result.errors}/><Result label="Avisos" value={result.warnings}/></div>
      {result.details?.length>0&&<ValidationTable details={result.details}/>}
    </section>}
  </div>
}


function ImportGuide({open,onToggle,onDownloadTemplate}){
  return <section className="card panel import-guide">
    <div className="import-guide-head">
      <div className="import-guide-heading">
        <div className="import-guide-icon"><BookOpen size={22}/></div>
        <div><div className="import-guide-kicker">Guia de preenchimento</div><h2>Como preparar uma importação sem colocar a base em risco</h2><p>Este roteiro foi pensado para quem vai administrar a base no futuro. Siga a ordem abaixo e use o modelo sempre que possível.</p></div>
      </div>
      <button className="btn secondary small" type="button" onClick={onToggle}>{open?'Ocultar guia':'Abrir guia completo'} {open?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>
    </div>

    <div className="import-guide-steps">
      <GuideStep number="1" title="Baixe o modelo" text="Comece pelo modelo atualizado para já ter os nomes de colunas que o CRM reconhece."/>
      <GuideStep number="2" title="Preencha a planilha" text="Nome da editora é obrigatório. Os demais campos podem ficar vazios quando a informação não estiver disponível."/>
      <GuideStep number="3" title="Separe listas com |" text="Perfil editorial, segmentos de atuação e e-mails alternativos aceitam vários valores na mesma célula."/>
      <GuideStep number="4" title="Valide antes de importar" text="A validação compara com a base e mostra novas, duplicadas, atualizações, avisos e erros sem salvar nada."/>
    </div>

    {open&&<div className="import-guide-body">
      <div className="import-guide-highlight">
        <div className="import-guide-highlight-copy"><Info size={18}/><div><strong>A regra mais importante para campos com vários valores</strong><p>Use a barra vertical <b>|</b> entre os itens. Cada trecho vira um valor separado dentro do CRM.</p></div></div>
        <div className="import-guide-code"><code>Literatura | Infantil | Educação</code><span>O CRM grava 3 perfis editoriais diferentes.</span></div>
      </div>

      <div className="import-guide-examples">
        <GuideExample title="Perfil editorial" example="Literatura | Infantil | Cultura afro-brasileira" text="Descreve o que a editora publica. Use, de preferência, os termos exatos da taxonomia do Radar Score."/>
        <GuideExample title="Segmentos de atuação" example="Escolar | Universitário | Trade/Livrarias" text="Descreve os mercados em que a editora atua. Não é a mesma coisa que perfil editorial."/>
        <GuideExample title="E-mails alternativos" example="comercial@editora.com | financeiro@editora.com" text="Use para contatos institucionais adicionais. O e-mail principal continua em “E-mail geral”."/>
      </div>

      <div className="import-guide-section">
        <div className="section-title"><div><h3>Regras que evitam os erros mais comuns</h3><p className="muted">O importador faz algumas proteções automaticamente, mas a qualidade da planilha continua fazendo diferença.</p></div></div>
        <div className="import-guide-rules">
          <GuideRule icon={<Database size={17}/>} title="Como o CRM identifica uma editora existente">
            Primeiro procura pela <b>Referência de origem</b>; depois pelo <b>CNPJ</b>; e, quando não há uma chave forte, por <b>Nome + UF</b>. Se CNPJ e referência apontarem para editoras diferentes, a linha é bloqueada para revisão.
          </GuideRule>
          <GuideRule icon={<RefreshCw size={17}/>} title="Atualizar não significa apagar">
            No modo <b>Atualizar somente os campos preenchidos</b>, célula vazia preserva o dado que já existe. Ex.: se o CSV não tiver telefone, o telefone atual da editora continua intacto.
          </GuideRule>
          <GuideRule icon={<ListChecks size={17}/>} title="Status, confiança, prioridade e pipeline">
            Prioridade: <b>Baixa, Média, Alta ou Urgente</b>. Status do perfil: <b>Confirmado, Parcial, Não identificado ou Revisar</b>. Confiança: <b>Baixa, Média ou Alta</b>. A etapa do pipeline precisa ter o mesmo nome de uma etapa ativa do CRM.
          </GuideRule>
          <GuideRule icon={<ShieldCheck size={17}/>} title="Radar Score nunca é digitado na planilha">
            Score, Radar Fit, potencial comercial, qualidade dos dados, aderência por produto e melhor produto são calculados pelo sistema. Quando dados relevantes mudam, o CRM recalcula esses indicadores automaticamente.
          </GuideRule>
        </div>
      </div>

      <details className="import-guide-details">
        <summary>Dicionário rápido dos campos mais importantes</summary>
        <div className="import-guide-field-table">
          <GuideField field="Nome da editora" format="Texto — obrigatório" example="Editora Horizonte" note="Sem este campo a linha não pode ser importada."/>
          <GuideField field="CNPJ" format="14 dígitos, com ou sem pontuação" example="12.345.678/0001-90" note="É uma das principais chaves para localizar duplicatas."/>
          <GuideField field="Referência de origem" format="Código estável da fonte" example="base-2026-00451" note="Se a mesma fonte for importada de novo, mantenha a mesma referência. Não crie um código novo para a mesma editora."/>
          <GuideField field="Perfil editorial" format="Lista separada por |" example="Literatura | Infantil" note="Influência diretamente a aderência editorial no Radar Score. Use a taxonomia oficial sempre que possível."/>
          <GuideField field="Status do perfil editorial" format="Confirmado / Parcial / Não identificado / Revisar" example="Confirmado" note="Se houve pesquisa suficiente, indique o status. Se ainda não houve classificação, pode deixar em branco."/>
          <GuideField field="Confiança do perfil editorial" format="Alta / Média / Baixa" example="Alta" note="Indica a segurança da classificação. Se o perfil ainda não foi pesquisado, deixe em branco."/>
          <GuideField field="Segmentos de atuação" format="Lista separada por |" example="Escolar | Trade/Livrarias" note="Mercado de atuação comercial; não confundir com o conteúdo publicado."/>
          <GuideField field="Prioridade" format="Baixa / Média / Alta / Urgente" example="Média" note="Em uma editora já existente, deixar em branco preserva a prioridade atual."/>
          <GuideField field="Etapa do pipeline" format="Nome de etapa ativa" example="A prospectar" note="Se o nome não existir no CRM, a etapa é ignorada e aparece como aviso."/>
          <GuideField field="E-mails alternativos" format="Lista separada por |" example="comercial@editora.com | financeiro@editora.com" note="Use somente para e-mails adicionais. O principal deve ficar em E-mail geral."/>
        </div>
      </details>

      <details className="import-guide-details">
        <summary>Ver os perfis editoriais reconhecidos pelo Radar Score</summary>
        <p className="muted">Para evitar aviso e garantir que a classificação participe corretamente do Radar Score, copie os nomes abaixo exatamente como aparecem.</p>
        <div className="import-guide-taxonomy">{EDITORIAL_PROFILE_OPTIONS.map(item=><span className="badge blue" key={item}>{item}</span>)}</div>
      </details>

      <div className="import-guide-bottom">
        <div><strong>Checklist antes de confirmar</strong><span>1) Nome preenchido · 2) CNPJ conferido · 3) listas separadas por | · 4) perfis editoriais padronizados · 5) validação sem erros.</span></div>
        <button className="btn secondary" type="button" onClick={onDownloadTemplate}><Download size={15}/> Baixar modelo</button>
      </div>
    </div>}
  </section>
}

function GuideStep({number,title,text}){return <div className="import-guide-step"><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>}
function GuideExample({title,example,text}){return <div className="import-guide-example"><strong>{title}</strong><code>{example}</code><p>{text}</p></div>}
function GuideRule({icon,title,children}){return <div className="import-guide-rule"><div className="import-guide-rule-icon">{icon}</div><div><strong>{title}</strong><p>{children}</p></div></div>}
function GuideField({field,format,example,note}){return <div className="import-guide-field-row"><strong>{field}</strong><span>{format}</span><code>{example}</code><p>{note}</p></div>}

function ValidationTable({details}){
  const visible=details.filter(d=>d.error||d.warning||d.status==='skip'||d.status==='update').slice(0,30);
  if(!visible.length)return null;
  return <div className="import-preview-wrap" style={{marginTop:14}}><table className="data-table import-preview"><thead><tr><th>Linha</th><th>Editora</th><th>Situação</th><th>Identificada por</th><th>Observação</th></tr></thead><tbody>{visible.map((d,i)=><tr key={`${d.row}-${i}`}><td>{d.row}</td><td>{d.name||'—'}</td><td><span className={`badge ${d.status==='error'?'red':d.status==='update'?'amber':d.status==='skip'?'':'green'}`}>{STATUS_LABELS[d.status]||d.status||'—'}</span></td><td>{d.matched_by||'—'}</td><td>{d.error||d.warning||'—'}</td></tr>)}</tbody></table>{details.length>30&&<p className="muted import-preview-note">Mostrando 30 de {details.length.toLocaleString('pt-BR')} ocorrências. Use “Baixar inconsistências” para revisar o arquivo completo.</p>}</div>
}
function Result({label,value}){return <div><span>{label}</span><strong>{Number(value||0).toLocaleString('pt-BR')}</strong></div>}
