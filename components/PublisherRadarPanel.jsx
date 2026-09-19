'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { RADAR_PRODUCT_LABELS } from '@/lib/constants';
import PublisherRadarIntelligence from '@/components/PublisherRadarIntelligence';
import PublisherHelp from '@/components/PublisherHelp';

export default function PublisherRadarPanel({publisher,contacts=[],interactions=[]}){
  const {supabase,membership,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [guidance,setGuidance]=useState(null);

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      if(!org||!publisher?.id)return;
      const {data}=await supabase.rpc('crm_publisher_guidance',{p_organization_id:org,p_publisher_id:publisher.id});
      if(!cancelled)setGuidance(data||null);
    }
    load();
    return()=>{cancelled=true};
  },[org,publisher?.id,activityVersion,supabase]);

  if(!publisher)return null;
  const score=guidance?.score??publisher.score??0;
  const bestLabel=RADAR_PRODUCT_LABELS[guidance?.best_product]||'Ainda não identificada';
  const fit=guidance?.radar_fit_score??publisher.radar_fit_score??0;
  const quality=guidance?.data_quality_score??publisher.data_quality_score??0;

  return <details className="card panel radar-intelligence-collapsible publisher-score-card">
    <summary className="radar-intelligence-summary">
      <div className="radar-intelligence-summary-main">
        <div className="eyebrow">Inteligência comercial</div>
        <div className="help-heading"><h2>Radar Score detalhado</h2><PublisherHelp text="Explica a pontuação comercial da editora, os fatores que formam o score e a leitura prática para prospecção."/></div>
        <div className="radar-intelligence-summary-line">
          <span><strong>Score {score}</strong></span>
          <span>Melhor oportunidade: <strong>{bestLabel}</strong></span>
          <span>Aderência: <strong>{fit}</strong></span>
          <span>Dados: <strong>{quality}</strong></span>
        </div>
      </div>
      <ChevronDown className="radar-intelligence-chevron" size={22}/>
    </summary>
    <div className="radar-intelligence-content">
      <PublisherRadarIntelligence publisher={publisher} guidance={guidance} contacts={contacts} interactions={interactions}/>
    </div>
    <style jsx>{`
      .radar-intelligence-collapsible{padding:0;overflow:hidden}
      .radar-intelligence-summary{list-style:none;cursor:pointer;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:18px;user-select:none}
      .radar-intelligence-summary::-webkit-details-marker{display:none}
      .radar-intelligence-summary-main{min-width:0}
      .radar-intelligence-summary h2{margin:5px 0 6px}
      .radar-intelligence-summary-line{display:flex;gap:8px 16px;flex-wrap:wrap;font-size:11px;color:#667085}
      .radar-intelligence-summary-line strong{color:#344054}
      .radar-intelligence-chevron{flex:0 0 auto;color:#667085;transition:transform .18s ease}
      .radar-intelligence-collapsible[open] .radar-intelligence-chevron{transform:rotate(180deg)}
      .radar-intelligence-content{padding:0 20px 20px;border-top:1px solid #eaecf0}
      :global(.radar-intelligence-content > .card.panel){border:0!important;box-shadow:none!important;padding:18px 0 0!important;background:transparent!important}
      @media(max-width:700px){.radar-intelligence-summary{padding:16px}.radar-intelligence-content{padding:0 16px 16px}.radar-intelligence-summary-line{display:grid;gap:5px}}
    `}</style>
  </details>;
}
