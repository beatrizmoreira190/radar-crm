'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { RADAR_PRODUCT_LABELS } from '@/lib/constants';
import PublisherRadarIntelligence from '@/components/PublisherRadarIntelligence';

export default function PublisherRadarDetailMount(){
  const {id}=useParams();
  const {supabase,membership,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [mount,setMount]=useState(null);
  const [publisher,setPublisher]=useState(null);
  const [contacts,setContacts]=useState([]);
  const [interactions,setInteractions]=useState([]);
  const [guidance,setGuidance]=useState(null);

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      if(!org||!id)return;
      const [p,c,i,g]=await Promise.all([
        supabase.from('publishers').select('*').eq('organization_id',org).eq('id',id).maybeSingle(),
        supabase.from('contacts').select('*').eq('organization_id',org).eq('publisher_id',id).eq('active',true).order('is_decision_maker',{ascending:false}).order('full_name'),
        supabase.from('interactions').select('*').eq('organization_id',org).eq('publisher_id',id).order('occurred_at',{ascending:false}).limit(30),
        supabase.rpc('crm_publisher_guidance',{p_organization_id:org,p_publisher_id:id})
      ]);
      if(cancelled)return;
      setPublisher(p.data||null);
      setContacts(c.data||[]);
      setInteractions(i.data||[]);
      setGuidance(g.data||null);
    }
    load();
    return()=>{cancelled=true};
  },[org,id,activityVersion,supabase]);

  useEffect(()=>{
    let node=null;let timer=null;let attempts=0;
    function attach(){
      const stack=document.querySelector('.detail-stack');
      if(!stack){if(attempts++<20)timer=setTimeout(attach,50);return;}
      node=document.createElement('div');
      node.dataset.radarIntelligence='publisher-detail';
      if(stack.children[1])stack.insertBefore(node,stack.children[1]);else stack.appendChild(node);
      setMount(node);
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);if(node?.parentNode)node.parentNode.removeChild(node)};
  },[id]);

  if(!mount||!publisher)return null;

  const score=guidance?.score??publisher.score??0;
  const bestLabel=RADAR_PRODUCT_LABELS[guidance?.best_product]||'Ainda não identificada';
  const fit=guidance?.radar_fit_score??publisher.radar_fit_score??0;
  const quality=guidance?.data_quality_score??publisher.data_quality_score??0;

  return createPortal(
    <details className="card panel radar-intelligence-collapsible">
      <summary className="radar-intelligence-summary">
        <div className="radar-intelligence-summary-main">
          <div className="eyebrow">Inteligência comercial</div>
          <h2>Radar Score detalhado</h2>
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
    </details>,mount
  );
}
