import writeExcelFile from 'write-excel-file/browser';

export const XLSX_STYLE=Object.freeze({
  normal:0,title:1,section:2,header:3,integer:4,decimal:5,percent:6,currency:7,datetime:8,date:9,wrap:10,meta:11
});

export function xcell(value,style=XLSX_STYLE.normal,type=null){
  return {value,style,type};
}

const STYLE_MAP={
  [XLSX_STYLE.normal]:{},
  [XLSX_STYLE.title]:{fontWeight:'bold',fontSize:16,textColor:'#101828'},
  [XLSX_STYLE.section]:{fontWeight:'bold',textColor:'#344054',backgroundColor:'#FFF1F0',borderColor:'#D0D5DD',borderStyle:'thin'},
  [XLSX_STYLE.header]:{fontWeight:'bold',textColor:'#FFFFFF',backgroundColor:'#111827',align:'center',alignVertical:'center',wrap:true,borderColor:'#D0D5DD',borderStyle:'thin'},
  [XLSX_STYLE.integer]:{format:'#,##0'},
  [XLSX_STYLE.decimal]:{format:'#,##0.00'},
  [XLSX_STYLE.percent]:{format:'0%'},
  [XLSX_STYLE.currency]:{format:'"R$" #,##0.00'},
  [XLSX_STYLE.datetime]:{format:'dd/mm/yyyy hh:mm'},
  [XLSX_STYLE.date]:{format:'dd/mm/yyyy'},
  [XLSX_STYLE.wrap]:{wrap:true,alignVertical:'top'},
  [XLSX_STYLE.meta]:{fontWeight:'bold',textColor:'#344054',backgroundColor:'#F2F4F7'}
};

function columnIndex(name){
  let value=0;
  for(const ch of name)value=value*26+(ch.charCodeAt(0)-64);
  return value-1;
}

function mergeMap(merges=[]){
  const map=new Map();
  for(const ref of merges){
    const match=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
    if(!match||match[2]!==match[4])continue;
    const start=columnIndex(match[1]);
    const end=columnIndex(match[3]);
    if(end>start)map.set(`${Number(match[2])-1}:${start}`,end-start+1);
  }
  return map;
}

function convertCell(input,rowIndex,columnIndexValue,merges){
  if(input===null||input===undefined)return null;
  const normalized=input&&typeof input==='object'&&Object.prototype.hasOwnProperty.call(input,'value')
    ? input
    : {value:input,style:XLSX_STYLE.normal,type:null};
  const span=merges.get(`${rowIndex}:${columnIndexValue}`);
  const style=STYLE_MAP[Number(normalized.style)||0]||{};
  let value=normalized.value;
  const cell={value,...style};

  if(normalized.type==='date'||normalized.type==='datetime'){
    const date=value instanceof Date?value:new Date(value);
    cell.value=Number.isNaN(date.getTime())?null:date;
    cell.type=Date;
  }else if(normalized.type==='number'){
    const number=Number(value);
    cell.value=Number.isFinite(number)?number:null;
    cell.type=Number;
  }else if(value instanceof Date){
    cell.type=Date;
  }else if(typeof value==='number'){
    cell.type=Number;
  }else if(typeof value==='boolean'){
    cell.type=Boolean;
  }else{
    cell.type=String;
    cell.value=value===null||value===undefined?'':String(value);
  }

  if(span)cell.columnSpan=span;
  return cell;
}

function convertSheet(sheet){
  const merges=mergeMap(sheet.merges||[]);
  const mergedCovered=new Set();
  for(const ref of sheet.merges||[]){
    const match=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
    if(!match||match[2]!==match[4])continue;
    const row=Number(match[2])-1;
    const start=columnIndex(match[1]);
    const end=columnIndex(match[3]);
    for(let col=start+1;col<=end;col++)mergedCovered.add(`${row}:${col}`);
  }

  return {
    data:(sheet.rows||[]).map((row,rowIndex)=>(row||[]).map((cell,colIndex)=>{
      if(mergedCovered.has(`${rowIndex}:${colIndex}`))return null;
      return convertCell(cell,rowIndex,colIndex,merges);
    })),
    sheet:String(sheet.name||'Planilha').slice(0,31),
    columns:(sheet.widths||[]).map(width=>({width:Math.max(3,Math.min(60,Number(width)||10))})),
    stickyRowsCount:Math.max(0,Number(sheet.freezeRows)||0),
    showGridLines:sheet.showGridLines!==false,
    zoomScale:sheet.zoomScale||undefined,
    images:Array.isArray(sheet.images)?sheet.images:undefined,
    dateFormat:'dd/mm/yyyy'
  };
}

export async function downloadXlsx(filename,sheets){
  const workbook=writeExcelFile(
    sheets.map(convertSheet),
    {fontFamily:'Aptos',fontSize:10}
  );
  await workbook.toFile(filename);
}
