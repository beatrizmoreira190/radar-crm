'use client';

import { Globe2, Mail, MapPin, Phone } from 'lucide-react';
import PublisherHelp from '@/components/PublisherHelp';

export default function PublisherQuickContact({publisher}){
  if(!publisher)return null;
  const location=[publisher.city,publisher.state].filter(Boolean).join(' · ');
  const fullLocation=[publisher.address_street,publisher.address_number,publisher.city,publisher.state].filter(Boolean).join(', ');
  const website=publisher.website?publisher.website.startsWith('http')?publisher.website:`https://${publisher.website}`:'';

  return <section className="publisher-quick-contact card" aria-label="Contato rápido da editora">
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
  </section>;
}
