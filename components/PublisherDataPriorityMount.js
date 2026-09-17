'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { Globe2, Mail, MapPin, Phone } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';

function sectionByHeading(root,label){
  return [...root.children].find(child=>child.querySelector?.('h2')?.textContent?.trim()===label)||null;
}

export default function PublisherDataPriorityMount(){
  const {id}=useParams();
  const {supabase,membership,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [publisher,setPublisher]=useState(null);
  const [mount,setMount]=useState(null);

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      if(!org||!id)return;
      const {data}=await supabase.from('publishers')
        .select('id,name,trade_name,legal_name,cnpj,general_email,phone,website,city,state,address_street,address_number')
        .eq('organization_id',org).eq('id',id).maybeSingle();
      if(!cancelled)setPublisher(data||null);
    }
    load();
    return()=>{cancelled=true};
  },[org,id,activityVersion,supabase]);

  useEffect(()=>{
    let node=null;let timer=null;let attempts=0;
    function attach(){
      const command=document.querySelector('.publisher-command-center');
      if(!command){if(attempts++<50)timer=setTimeout(attach,60);return}
      node=document.createElement('div');
      node.dataset.publisherQuickContact='true';
      command.insertAdjacentElement('afterend',node);
      setMount(node);
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);if(node?.parentNode)node.parentNode.removeChild(node)};
  },[id]);

  useEffect(()=>{
    let timer=null;let observer=null;
    function apply(){
      const grid=document.querySelector('.detail-grid');
      const main=grid?.querySelector(':scope > .detail-stack');
      if(!main)return;
      const data=sectionByHeading(main,'Dados da editora');
      const radar=main.querySelector('[data-radar-intelligence="publisher-detail"]');
      const contacts=sectionByHeading(main,'Contatos');
      const history=sectionByHeading(main,'Histórico de contatos');
      const opps=sectionByHeading(main,'Oportunidades');
      const meetings=main.querySelector('[data-publisher-meetings="commercial-meetings"]');
      const materials=main.querySelector('[data-publisher-materials="commercial-materials"]');
      [[data,-10],[radar,0],[contacts,10],[history,20],[opps,30],[meetings,40],[materials,50]].forEach(([el,order])=>{if(el)el.style.order=String(order)});
      const nav=document.querySelector('.publisher-section-nav');
      if(nav){
        const dataButton=[...nav.querySelectorAll('button')].find(button=>button.textContent?.trim()==='Dados');
        if(dataButton&&nav.firstElementChild!==dataButton)nav.prepend(dataButton);
      }
    }
    timer=setTimeout(apply,180);
    const grid=document.querySelector('.detail-grid');
    if(grid){observer=new MutationObserver(apply);observer.observe(grid,{childList:true,subtree:true})}
    return()=>{if(timer)clearTimeout(timer);observer?.disconnect()};
  },[id]);

  if(!mount||!publisher)return null;
  const location=[publisher.city,publisher.state].filter(Boolean).join(' · ');
  const website=publisher.website?publisher.website.startsWith('http')?publisher.website:`https://${publisher.website}`:'';

  return createPortal(
    <section className="publisher-quick-contact card" aria-label="Contato rápido da editora">
      <div className="quick-contact-heading">
        <div><small>Dados essenciais</small><strong>Contato rápido</strong></div>
        {location&&<span><MapPin size={13}/>{location}</span>}
      </div>
      <div className="quick-contact-items">
        {publisher.phone?<a href={`tel:${publisher.phone}`}><Phone size={15}/><span><small>Telefone</small><strong>{publisher.phone}</strong></span></a>:<div className="quick-contact-empty"><Phone size={15}/><span><small>Telefone</small><strong>Não informado</strong></span></div>}
        {publisher.general_email?<a href={`mailto:${publisher.general_email}`}><Mail size={15}/><span><small>E-mail</small><strong>{publisher.general_email}</strong></span></a>:<div className="quick-contact-empty"><Mail size={15}/><span><small>E-mail</small><strong>Não informado</strong></span></div>}
        {website?<a href={website} target="_blank" rel="noreferrer"><Globe2 size={15}/><span><small>Site</small><strong>{publisher.website}</strong></span></a>:<div className="quick-contact-empty"><Globe2 size={15}/><span><small>Site</small><strong>Não informado</strong></span></div>}
      </div>
      <style jsx>{`
        .publisher-quick-contact{margin:-7px 0 14px;padding:12px 14px;display:flex;align-items:center;gap:18px;box-shadow:0 1px 2px rgba(16,24,40,.025)}
        .quick-contact-heading{min-width:150px;display:flex;align-items:center;justify-content:space-between;gap:10px}.quick-contact-heading>div{display:grid;gap:1px}.quick-contact-heading small,.quick-contact-items small{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#98a2b3;font-weight:800}.quick-contact-heading strong{font-size:13px;color:#101828}.quick-contact-heading>span{display:none;align-items:center;gap:4px;font-size:9px;color:#667085}
        .quick-contact-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;flex:1;min-width:0}.quick-contact-items a,.quick-contact-empty{min-width:0;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #eaecf0;border-radius:9px;background:#fcfcfd;color:#475467}.quick-contact-items a:hover{border-color:#d0d5dd;background:#fff}.quick-contact-items span{min-width:0;display:grid}.quick-contact-items strong{font-size:10px;color:#344054;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.quick-contact-empty{opacity:.68}
        @media(max-width:900px){.publisher-quick-contact{align-items:flex-start;flex-direction:column}.quick-contact-heading{width:100%}.quick-contact-heading>span{display:flex}.quick-contact-items{width:100%}}
        @media(max-width:650px){.quick-contact-items{grid-template-columns:1fr}.publisher-quick-contact{margin-top:0}}
      `}</style>
    </section>,mount
  );
}
