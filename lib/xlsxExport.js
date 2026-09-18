const enc = new TextEncoder();

export const XLSX_STYLE = Object.freeze({
  normal:0,title:1,section:2,header:3,integer:4,decimal:5,percent:6,currency:7,datetime:8,date:9,wrap:10,meta:11
});

export function xcell(value, style=XLSX_STYLE.normal, type=null){return {value,style,type};}

function xmlEscape(value=''){
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function colName(index){let n=index+1,s='';while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function excelDate(value){const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?null:d.getTime()/86400000+25569}
function normalizeCell(input){if(input&&typeof input==='object'&&Object.prototype.hasOwnProperty.call(input,'value'))return input;return {value:input,style:0,type:null}}
function cellXml(input,row,col){const cell=normalizeCell(input);const ref=`${colName(col)}${row}`;const s=Number(cell.style)||0;const sv=s?` s="${s}"`:'';const v=cell.value;if(v===null||v===undefined||v==='')return s?`<c r="${ref}"${sv}/>`:'';
  if(cell.type==='date'||cell.type==='datetime'||v instanceof Date){const n=excelDate(v);return n===null?'':`<c r="${ref}"${sv}><v>${n}</v></c>`}
  if(cell.type==='number'||typeof v==='number'){const n=Number(v);return Number.isFinite(n)?`<c r="${ref}"${sv}><v>${n}</v></c>`:''}
  if(typeof v==='boolean')return `<c r="${ref}"${sv} t="b"><v>${v?1:0}</v></c>`;
  const text=String(v);return `<c r="${ref}"${sv} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}
function sheetXml(sheet){const rows=sheet.rows||[];const maxCols=Math.max(1,...rows.map(r=>r?.length||0),sheet.widths?.length||0);const lastRow=Math.max(1,rows.length);const dim=`A1:${colName(maxCols-1)}${lastRow}`;const widths=(sheet.widths||[]).map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.max(3,Math.min(60,Number(w)||10))}" customWidth="1"/>`).join('');const freeze=Math.max(0,Number(sheet.freezeRows)||0);const views=freeze?`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freeze+1}" sqref="A${freeze+1}"/></sheetView></sheetViews>`:'<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const rowXml=rows.map((r,ri)=>{const cells=(r||[]).map((c,ci)=>cellXml(c,ri+1,ci)).join('');return `<row r="${ri+1}">${cells}</row>`}).join('');
  const merges=(sheet.merges||[]);const mergeXml=merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:'';
  const filter=sheet.autoFilter?`<autoFilter ref="${sheet.autoFilter}"/>`:'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/>${views}${widths?`<cols>${widths}</cols>`:''}<sheetData>${rowXml}</sheetData>${filter}${mergeXml}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}
function stylesXml(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R<numFmts count="3"><numFmt numFmtId="164" formatCode='"R$" #,##0.00'/>quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FF101828"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF344054"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111827"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1F0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`}
function dosDateTime(date=new Date()){const y=Math.max(1980,date.getFullYear());const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);const d=((y-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();return {time,date:d}}
const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
function crc32(bytes){let c=0xFFFFFFFF;for(const b of bytes)c=CRC_TABLE[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function zipStore(files){
  const now=dosDateTime();const locals=[];const centrals=[];let offset=0;
  for(const file of files){
    const name=enc.encode(file.name);const data=typeof file.data==='string'?enc.encode(file.data):file.data;const crc=crc32(data);
    const local=new Uint8Array(30+name.length+data.length);const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,now.time,true);lv.setUint16(12,now.date,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);local.set(name,30);local.set(data,30+name.length);locals.push(local);
    const central=new Uint8Array(46+name.length);const cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,now.time,true);cv.setUint16(14,now.date,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,offset,true);central.set(name,46);centrals.push(central);offset+=local.length;
  }
  const centralSize=centrals.reduce((a,b)=>a+b.length,0);const end=new Uint8Array(22);const ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
  const total=offset+centralSize+end.length;const out=new Uint8Array(total);let pos=0;for(const p of locals){out.set(p,pos);pos+=p.length}for(const p of centrals){out.set(p,pos);pos+=p.length}out.set(end,pos);return out
}
function workbookXml(sheets){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xmlEscape(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`}
function workbookRels(sheets){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`}
function contentTypes(sheets){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats.org/officeDocument/2006/styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`}
function rootRels(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`}
function coreProps(){const now=new Date().toISOString();return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Radar CRM</dc:creator><cp:lastModifiedBy>Radar CRM</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`}
function appProps(sheets){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Radar CRM</Application><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map(s=>`<vt:lpstr>${xmlEscape(s.name.slice(0,31))}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`}
export function buildXlsx(sheets){const files=[{name:'[Content_Types].xml',data:contentTypes(sheets)},{name:'_rels/.rels',data:rootRels()},{name:'docProps/core.xml',data:coreProps()},{name:'docProps/app.xml',data:appProps(sheets)},{name:'xl/workbook.xml',data:workbookXml(sheets)},{name:'xl/_rels/workbook.xml.rels',data:workbookRels(sheets)},{name:'xl/styles.xml',data:stylesXml()}];sheets.forEach((s,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(s)}));return zipStore(files)}
export function downloadXlsx(filename,sheets){const bytes=buildXlsx(sheets);const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
