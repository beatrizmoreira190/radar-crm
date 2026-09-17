'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { Globe2, Mail, MapPin, Phone } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import PublisherHelp from '@/components/PublisherHelp';

function sectionByHeading(root,label){
  return [...root.children].find(child=>child.querySelector?.('h2')?.textContent?.replace(/\?/g,'').trim()===label)||null;
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
      const overview=document.querySelector('[data-publisher-record-overview="true"]');
      const grid=document.querySelector('.detail-grid');
      const anchor=overview||grid?.previousElementSibling;
      if(!grid){if(attempts++<50)timer=setTimeout(attach,60);return}
      node=document.createElement('div');node.dataset.publisherQuickContact='true';
      if(overview)overview.insertAdjacentElement('afterend',node);else grid.insertAdjacentElement('beforebegin',node);
      setMount(node);
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);if(node?.parentNode)node.parentNode.removeChild(node)};
  },[id]);

  useEffect(()=>{
    let timer=null;let observer=null;
    function apply(){
      const grid=document.querySelector('.detail-grid');const main=grid?.querySelector(':scope > .detail-stack');if(!main)return;
      const data=sectionByHeading(main,'Dados da editora');
      const radar=main.querySelector('[data-radar-intelligence="publisher-detail"]');
      const contacts=sectionByHeading(main,'Contatos');
      const history=sectionByHeading(main,'Histórico de contatos');
      const opps=sectionByHeading(main,'Oportunidades');
      const meetings=main.querySelector('[data-publisher-meetings="commercial-meetings"]');
      const materials=main.querySelector('[data-publisher-materials="commercial-materials"]');
      [[data,0],[radar,10],[contacts,20],[history,30],[opps,40],[meetings,50],[materials,60]].forEach(([el,order])=>{if(el)el.style.order=String(order)});
    }
    timer=setTimeout(apply,180);
    const grid=document.querySelector('.detail-grid');if(grid){observer=new MutationObserver(apply);observer.observe(grid,{childList:true,subtree:true})}
    return()=>{if(timer)clearTimeout(timer);observer?.disconnect()};
  },[id]);

  if(!mount||!publisher)return null;
  const location=[publisher.city,publisher.state].filter(Boolean).join(' · ');
  const fullLocation=[publisher.address_street,publisher.address_number,publisher.city,publisher.state].filter(Boolean).join(', ');
  const website=publisher.website?publisher.website.startsWith('http')?publisher.website:`https://${publisher.website}`:'';

  return createPortal(
    <section className="publisher-quick-contact card" aria-label="Contato rápido da editora">
      <div className="quick-contact-heading">
        <div><small>Contato essencial</small><strong>Fale com a editora sem procurar pela ficha</strong></div>
        <PublisherHelp text="Atalhos diretos para os dados de contato mais usados durante a prospecção."/>
      </div>
      <div className="quick-contact-items">
        {publisher.phone?<a href={`tel:${publisher.phone}`}><Phone size={16}/><span><small>Telefone <PublisherHelp text="Telefone geral da editora disponível para contato rápido."/></small><strong>{publisher.phone}</strong></span></a>:<div className="quick-contact-empty"><Phone size={16}/><span><small>Telefone <PublisherHelp text="Telefone geral da editora disponível para contato rápido."/></small><strong>Não informado</strong></span></div>}
        {publisher.general_email?<a href={`mailto:${publisher.general_email}`}><Mail size={16}/><span><small>E-mail <PublisherHelp text="E-mail geral cadastrado para a editora."/></small><strong>{publisher.general_email}</strong></span></a>:<div className="quick-contact-empty"><Mail size={16}/><span><small>E-mail <PublisherHelp text="E-mail geral cadastrado para a editora."/></small><strong>Não informado</strong></span></div>}
        {website?<a href={website} target="_blank" rel="noreferrer"><Globe2 size={16}/><span><small>Site <PublisherHelp text="Site oficial ou principal endereço web cadastrado da editora."/></small><strong>{publisher.website}</strong></span></a>:<div className="quick-contact-empty"><Globe2 size={16}/><span><small>Site <PublisherHelp text="Site oficial ou principal endereço web cadastrado da editora."/></small><strong>Não informado</strong></span></div>}
        <div className="quick-contact-location"><MapPin size={16}/><span><small>Localização <PublisherHelp text="Cidade, estado e endereço disponíveis para referência rápida durante o contato."/></small><strong>{location||'Não informada'}</strong>{fullLocation&&<em>{fullLocation}</em>}</span></div>
      </div>
    </section>,mount
  );
}
