'use client';

import { Globe2, Mail, MapPin, Phone } from 'lucide-react';
import PublisherHelp from '@/components/PublisherHelp';

function externalHref(value,network='website'){
  if(!value)return'';
  const v=String(value).trim();
  if(/^https?:\/\//i.test(v))return v;
  if(network==='instagram'){
    const handle=v.replace(/^@/,'').replace(/^www\./i,'').replace(/^instagram\.com\//i,'').replace(/^\/+|\/+$/g,'');
    return `https://www.instagram.com/${handle}`;
  }
  if(network==='linkedin'){
    if(/^www\./i.test(v))return `https://${v}`;
    if(/^linkedin\.com\//i.test(v))return `https://${v}`;
    if(/^(company|in)\//i.test(v))return `https://www.linkedin.com/${v}`;
  }
  return `https://${v.replace(/^\/+/, '')}`;
}

function compact(value){
  return String(value||'').trim().replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/\/$/,'');
}

export default function PublisherQuickContact({publisher}){
  if(!publisher)return null;
  const location=[publisher.city,publisher.state].filter(Boolean).join(' · ');
  const fullLocation=[publisher.address_street,publisher.address_number,publisher.city,publisher.state].filter(Boolean).join(', ');
  const website=publisher.website?externalHref(publisher.website):'';
  const instagram=publisher.instagram?externalHref(publisher.instagram,'instagram'):'';
  const linkedin=publisher.linkedin_url?externalHref(publisher.linkedin_url,'linkedin'):'';

  return <section className="publisher-quick-contact card" aria-label="Contato rápido da editora">
    <div className="quick-contact-heading">
      <div><small>Contato rápido</small><strong>Canais da editora</strong></div>
      <PublisherHelp text="Atalhos para os canais institucionais e públicos usados na prospecção."/>
    </div>
    <div className="quick-contact-items">
      {publisher.phone?<a href={`tel:${publisher.phone}`}><Phone size={16}/><span><small>Telefone <PublisherHelp text="Telefone geral da editora disponível para contato rápido."/></small><strong>{publisher.phone}</strong></span></a>:<div className="quick-contact-empty"><Phone size={16}/><span><small>Telefone</small><strong>Não informado</strong></span></div>}
      {publisher.general_email?<a href={`mailto:${publisher.general_email}`}><Mail size={16}/><span><small>E-mail <PublisherHelp text="E-mail geral cadastrado para a editora."/></small><strong>{publisher.general_email}</strong></span></a>:<div className="quick-contact-empty"><Mail size={16}/><span><small>E-mail</small><strong>Não informado</strong></span></div>}
      {website?<a href={website} target="_blank" rel="noreferrer"><Globe2 size={16}/><span><small>Site <PublisherHelp text="Site oficial ou principal endereço web cadastrado da editora."/></small><strong>{compact(publisher.website)}</strong></span></a>:<div className="quick-contact-empty"><Globe2 size={16}/><span><small>Site</small><strong>Não informado</strong></span></div>}
      {instagram?<a href={instagram} target="_blank" rel="noreferrer"><Globe2 size={16}/><span><small>Instagram</small><strong>{compact(publisher.instagram)}</strong></span></a>:<div className="quick-contact-empty"><Globe2 size={16}/><span><small>Instagram</small><strong>Não identificado</strong></span></div>}
      {linkedin?<a href={linkedin} target="_blank" rel="noreferrer"><Globe2 size={16}/><span><small>LinkedIn</small><strong>{compact(publisher.linkedin_url)}</strong></span></a>:<div className="quick-contact-empty"><Globe2 size={16}/><span><small>LinkedIn</small><strong>Não identificado</strong></span></div>}
      <div className="quick-contact-location"><MapPin size={16}/><span><small>Localização <PublisherHelp text="Cidade, estado e endereço disponíveis para referência rápida durante o contato."/></small><strong>{location||'Não informada'}</strong>{fullLocation&&<em>{fullLocation}</em>}</span></div>
    </div>
  </section>;
}
