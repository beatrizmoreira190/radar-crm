import { unzipSync } from 'fflate';

const decoder=new TextDecoder('utf-8');

function textFile(files,path){
  const bytes=files[path];
  if(!bytes)return '';
  return decoder.decode(bytes);
}

function elementsByLocalName(node,name){
  if(typeof node?.getElementsByTagNameNS==='function'){
    const matches=node.getElementsByTagNameNS('*',name);
    if(matches.length)return Array.from(matches);
  }
  return Array.from(node?.getElementsByTagName?.('*')||[])
    .filter(element=>element.localName===name||element.nodeName===name);
}

function parseXml(text,label){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(elementsByLocalName(doc,'parsererror').length){
    throw new Error(`Não foi possível ler ${label} do arquivo Excel.`);
  }
  return doc;
}

function normalizeTarget(target=''){
  const clean=String(target).replace(/^\/+/, '');
  if(clean.startsWith('xl/'))return clean;
  return 'xl/'+clean.replace(/^\.\//,'');
}

function columnIndex(ref=''){
  const letters=(String(ref).match(/^[A-Z]+/i)?.[0]||'').toUpperCase();
  let index=0;
  for(const char of letters)index=index*26+(char.charCodeAt(0)-64);
  return Math.max(0,index-1);
}

function collectText(node){
  return elementsByLocalName(node,'t').map(t=>t.textContent||'').join('');
}

function parseSharedStrings(files){
  const source=textFile(files,'xl/sharedStrings.xml');
  if(!source)return [];
  const doc=parseXml(source,'os textos compartilhados');
  return elementsByLocalName(doc,'si').map(collectText);
}

function parseCell(cell,sharedStrings){
  const type=cell.getAttribute('t')||'';
  if(type==='inlineStr')return collectText(cell);
  const valueNode=elementsByLocalName(cell,'v')[0];
  const raw=valueNode?.textContent??'';
  if(type==='s')return sharedStrings[Number(raw)]??'';
  if(type==='b')return raw==='1';
  if(type==='str')return raw;
  if(raw==='')return '';
  const num=Number(raw);
  return Number.isFinite(num)?num:raw;
}

function parseSheet(files,path,sharedStrings){
  const source=textFile(files,path);
  if(!source)throw new Error(`A planilha interna ${path} não foi encontrada.`);
  const doc=parseXml(source,'uma das abas');
  const rows=[];
  for(const row of elementsByLocalName(doc,'row')){
    const out=[];
    for(const cell of elementsByLocalName(row,'c')){
      const ref=cell.getAttribute('r')||'';
      out[columnIndex(ref)]=parseCell(cell,sharedStrings);
    }
    while(out.length&&out[out.length-1]===undefined)out.pop();
    rows.push(out.map(value=>value===undefined?'':value));
  }
  return rows;
}

export async function readXlsxWorkbook(file){
  let files;
  try{
    files=unzipSync(new Uint8Array(await file.arrayBuffer()));
  }catch{
    throw new Error('O arquivo não parece ser um Excel .xlsx válido.');
  }

  const workbookSource=textFile(files,'xl/workbook.xml');
  const relsSource=textFile(files,'xl/_rels/workbook.xml.rels');
  if(!workbookSource||!relsSource)throw new Error('O arquivo não possui a estrutura esperada de um Excel .xlsx.');

  const workbook=parseXml(workbookSource,'a estrutura do arquivo');
  const rels=parseXml(relsSource,'as relações das abas');
  const relationships=new Map(
    elementsByLocalName(rels,'Relationship').map(rel=>[
      rel.getAttribute('Id'),
      normalizeTarget(rel.getAttribute('Target')||'')
    ])
  );
  const sharedStrings=parseSharedStrings(files);
  const sheets={};

  for(const sheet of elementsByLocalName(workbook,'sheet')){
    const name=sheet.getAttribute('name')||'';
    const relationId=sheet.getAttribute('r:id')||sheet.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'
    );
    const target=relationships.get(relationId);
    if(name&&target)sheets[name]=parseSheet(files,target,sharedStrings);
  }

  return sheets;
}

export function excelSerialToIso(value,withTime=false){
  const number=Number(value);
  if(!Number.isFinite(number))return '';
  const whole=Math.floor(number);
  const fraction=number-whole;
  const epoch=Date.UTC(1899,11,30);
  const date=new Date(epoch+whole*86400000+Math.round(fraction*86400000));
  if(Number.isNaN(date.getTime()))return '';
  const yyyy=date.getUTCFullYear();
  const mm=String(date.getUTCMonth()+1).padStart(2,'0');
  const dd=String(date.getUTCDate()).padStart(2,'0');
  if(!withTime)return `${yyyy}-${mm}-${dd}`;
  const hh=String(date.getUTCHours()).padStart(2,'0');
  const min=String(date.getUTCMinutes()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}
