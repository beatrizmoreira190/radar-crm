'use client';

import { RADAR_PRODUCT_LABELS } from '@/lib/constants';

const FIT_FIELDS = {
  pnld_literario: 'fit_pnld_literario',
  pnld_didatico: 'fit_pnld_didatico',
  pnld_tecnico_metodologico: 'fit_pnld_tecnico_metodologico',
  radar_licitacoes: 'fit_radar_licitacoes',
  radar_oportunidades: 'fit_radar_oportunidades',
};

function clamp(value){
  const n=Number(value);
  if(Number.isNaN(n))return 0;
  return Math.max(0,Math.min(100,n));
}

function tone(value){
  const n=clamp(value);
  if(n>=80)return {fg:'#067647',bg:'#ecfdf3',bar:'#12b76a'};
  if(n>=60)return {fg:'#175cd3',bg:'#eff8ff',bar:'#2e90fa'};
  if(n>=40)return {fg:'#b54708',bg:'#fffaeb',bar:'#f79009'};
  return {fg:'#b42318',bg:'#fff1f2',bar:'#f04438'};
}

function bestFit(publisher){
  const key=publisher?.best_product;
  return key&&FIT_FIELDS[key]?clamp(publisher[FIT_FIELDS[key]]):0;
}

function reasonText(reason){
  if(!reason)return '';
  if(typeof reason==='string')return reason;
  if(Array.isArray(reason))return reason.map(item=>{
    if(typeof item==='string')return item;
    if(item?.label)return item.label;
    if(item?.reason)return item.reason;
    if(item?.code)return String(item.code).replaceAll('_',' ');
    return '';
  }).filter(Boolean).join(' · ');
  if(typeof reason==='object')return reason.label||reason.reason||reason.summary||'';
  return '';
}

export function productFit(publisher,key){
  return FIT_FIELDS[key]?clamp(publisher?.[FIT_FIELDS[key]]):0;
}

export function BestProductBadge({publisher,compact=false}){
  const key=publisher?.best_product;
  const label=RADAR_PRODUCT_LABELS[key]||'Oportunidade não identificada';
  const fit=bestFit(publisher);
  const colors=tone(fit);
  return <span title={`${label} · fit ${fit}`} style={{display:'inline-flex',alignItems:'center',gap:6,borderRadius:999,padding:compact?'3px 7px':'5px 9px',fontSize:compact?10:11,fontWeight:800,color:colors.fg,background:colors.bg,whiteSpace:'nowrap'}}>{compact?label.replace('Radar de ','Radar '):label}<strong>{fit}</strong></span>;
}

function Metric({label,value,description}){
  const n=clamp(value); const colors=tone(n);
  return <div style={{border:'1px solid #eaecf0',borderRadius:12,padding:12,minWidth:0}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'baseline'}}><span style={{fontSize:11,fontWeight:800,color:'#475467'}}>{label}</span><strong style={{fontSize:20,color:colors.fg}}>{n}</strong></div>
    <div style={{height:7,borderRadius:999,overflow:'hidden',background:'#f2f4f7',marginTop:8}}><div style={{width:`${n}%`,height:'100%',borderRadius:999,background:colors.bar}}/></div>
    {description&&<p style={{fontSize:10,color:'#667085',margin:'7px 0 0',lineHeight:1.4}}>{description}</p>}
  </div>;
}

function ProductRow({label,value,best}){
  const n=clamp(value); const colors=tone(n);
  return <div style={{display:'grid',gridTemplateColumns:'minmax(145px,1fr) minmax(90px,1.4fr) 38px',gap:10,alignItems:'center',padding:'8px 0',borderTop:'1px solid #f2f4f7'}}>
    <span style={{fontSize:12,fontWeight:best?800:700,color:best?'#101828':'#475467'}}>{label}{best&&<span style={{marginLeft:6,fontSize:9,fontWeight:900,color:'#175cd3',textTransform:'uppercase'}}>melhor</span>}</span>
    <div style={{height:8,borderRadius:999,overflow:'hidden',background:'#f2f4f7'}}><div style={{width:`${n}%`,height:'100%',borderRadius:999,background:colors.bar}}/></div>
    <strong style={{fontSize:12,textAlign:'right',color:colors.fg}}>{n}</strong>
  </div>;
}

export default function RadarCompatibility({publisher}){
  if(!publisher)return null;
  const fit=clamp(publisher.radar_fit_score);
  const quality=clamp(publisher.data_quality_score);
  const potential=clamp(publisher.commercial_potential_score);
  const score=clamp(publisher.score);
  const best=publisher.best_product;
  const explanation=reasonText(publisher.score_reason);
  const qualityNote=fit>=75&&quality<60
    ? 'Alta aderência comercial. A qualidade dos dados está mais baixa, então vale prospectar e, em paralelo, enriquecer contatos e informações da editora.'
    : fit<50
      ? 'A aderência aos serviços da Radar é baixa neste momento. Priorize outras editoras, salvo quando houver uma oportunidade comercial específica.'
      : quality<50
        ? 'A oportunidade é válida, mas faltam dados para uma prospecção mais eficiente. Enriquecer contatos pode aumentar a chance de abordagem.'
        : 'A combinação entre aderência, potencial comercial e dados disponíveis sustenta a prioridade atual desta editora.';

  return <section className="card panel" style={{borderColor:'#d0d5dd'}}>
    <div className="section-title" style={{alignItems:'flex-start'}}><div><div className="eyebrow">Inteligência comercial</div><h2 style={{marginTop:4}}>Compatibilidade com a Radar</h2><p className="muted" style={{margin:'4px 0 0',fontSize:12}}>O Radar Score mede prioridade comercial. Qualidade dos dados é exibida separadamente da aderência editorial.</p></div><BestProductBadge publisher={publisher}/></div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10,marginTop:14}} className="radar-metrics-grid">
      <Metric label="Radar Score" value={score} description="Prioridade comercial geral"/>
      <Metric label="Aderência à Radar" value={fit} description="70% da lógica do score"/>
      <Metric label="Potencial comercial" value={potential} description="20% da lógica do score"/>
      <Metric label="Qualidade dos dados" value={quality} description="10% · prospectabilidade"/>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.15fr) minmax(260px,.85fr)',gap:18,marginTop:18}} className="radar-detail-grid">
      <div>
        <div style={{fontSize:11,fontWeight:900,textTransform:'uppercase',letterSpacing:'.05em',color:'#667085',marginBottom:3}}>Compatibilidade por produto</div>
        {Object.entries(RADAR_PRODUCT_LABELS).map(([key,label])=><ProductRow key={key} label={label} value={productFit(publisher,key)} best={best===key}/>)}
      </div>
      <div style={{background:'#f9fafb',border:'1px solid #eaecf0',borderRadius:12,padding:14}}>
        <div style={{fontSize:11,fontWeight:900,textTransform:'uppercase',letterSpacing:'.05em',color:'#667085'}}>Leitura para prospecção</div>
        <p style={{fontSize:13,fontWeight:700,color:'#344054',lineHeight:1.55,margin:'8px 0'}}>{qualityNote}</p>
        {explanation&&<p style={{fontSize:11,color:'#667085',lineHeight:1.55,margin:'10px 0 0',paddingTop:10,borderTop:'1px solid #eaecf0'}}>{explanation}</p>}
        {publisher.score_version&&<div style={{fontSize:9,color:'#98a2b3',marginTop:10}}>Modelo: {publisher.score_version}</div>}
      </div>
    </div>

    <style jsx>{`@media (max-width: 900px){.radar-metrics-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.radar-detail-grid{grid-template-columns:1fr!important}}@media (max-width: 520px){.radar-metrics-grid{grid-template-columns:1fr!important}}`}</style>
  </section>;
}
