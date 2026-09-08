'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { useCrm } from '@/components/CrmProvider';
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
  return createPortal(<PublisherRadarIntelligence publisher={publisher} guidance={guidance} contacts={contacts} interactions={interactions}/>,mount);
}
