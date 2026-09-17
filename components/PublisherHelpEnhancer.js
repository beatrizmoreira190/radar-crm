'use client';

import { useEffect } from 'react';

const HELP={
  'Dados da editora':'Reúne os dados cadastrais e editoriais da empresa. Use estas informações para identificar corretamente a editora antes de iniciar ou retomar a prospecção.',
  'Razão social':'Nome jurídico registrado da empresa.',
  'CNPJ':'Cadastro Nacional da Pessoa Jurídica usado para identificar legalmente a empresa.',
  'Localização':'Endereço, cidade e estado cadastrados para a editora.',
  'Perfil cadastral':'Classificação administrativa ou cadastral usada na base do CRM.',
  'Segmentos de atuação':'Mercados em que a editora atua. É diferente do perfil editorial, que descreve os tipos de obra publicados.',
  'Porte':'Faixa de tamanho estimada da empresa, usada como contexto para a prospecção.',
  'Perfil editorial':'Temas, segmentos e tipos de publicação identificados no catálogo da editora.',
  'Radar Score detalhado':'Explica a pontuação comercial da editora, os fatores que formam o score e a leitura prática para prospecção.',
  'Score':'Pontuação geral calculada pelo CRM a partir de sinais cadastrais, comerciais e de aderência.',
  'Melhor oportunidade':'Produto ou frente comercial da Radar que apresenta maior aderência para esta editora segundo as regras do CRM.',
  'Aderência':'Pontuação que representa o quanto o perfil da editora combina com as frentes comerciais da Radar.',
  'Dados':'Indicador de qualidade e completude dos dados disponíveis sobre a editora.',
  'Contatos':'Pessoas ligadas à editora que podem ser acionadas durante a prospecção. Priorize decisores e interlocutores relevantes.',
  'Histórico de contatos':'Linha do tempo das interações registradas com a editora, como ligações, e-mails, mensagens e reuniões.',
  'Oportunidades':'Negócios concretos vinculados à editora, com estágio, valor, probabilidade e próximo passo.',
  'Reuniões':'Reuniões comerciais vinculadas à editora, incluindo preparação, participantes, resultado e próximos passos.',
  'Materiais comerciais':'Apresentações, projetos, propostas, curadorias e outros materiais preparados para esta editora.',
  'Acompanhamento':'Situação comercial atual da conta: etapa, prioridade, responsável, próxima ação e notas.',
  'Etapa':'Ponto atual da editora no processo de prospecção.',
  'Prioridade':'Nível de atenção que esta conta deve receber na rotina comercial.',
  'Responsável':'Pessoa da equipe encarregada de conduzir a prospecção desta editora.',
  'Próxima ação':'Data e horário previstos para o próximo retorno ou movimento comercial.',
  'Notas':'Contexto duradouro sobre a conta. Use para informações que precisam permanecer visíveis ao longo do relacionamento.',
  'Tarefas':'Pendências e próximos passos operacionais associados à editora.',
  'Telefone':'Telefone geral da editora disponível para contato rápido.',
  'E-mail':'E-mail geral da editora disponível para contato rápido.',
  'Site':'Site oficial ou principal endereço web cadastrado da editora.',
  'Cidade / UF':'Localização resumida da editora para referência rápida.',
  'Apresentação:':'Pessoa responsável por conduzir a apresentação ou reunião comercial.',
  'Agendada por:':'Pessoa da equipe que criou o agendamento no CRM.',
  'Material pronto':'Existe pelo menos um material comercial pronto para apoiar esta reunião.',
  'Sem material pronto':'Ainda não há material marcado como pronto para apoiar esta reunião.',
  'Status':'Situação atual deste item no fluxo comercial.',
  'Tipo':'Categoria usada para organizar este item no CRM.',
  'Último contato':'Data da interação comercial mais recente registrada nesta editora.',
  'Oportunidade ativa':'Negócio em andamento que ainda não foi ganho, perdido ou encerrado.',
  'Próxima reunião':'Próxima reunião comercial agendada para esta editora.'
};

function normalized(text=''){
  return String(text).replace(/\s+/g,' ').trim();
}

function helpFor(text){
  const value=normalized(text);
  if(HELP[value])return HELP[value];
  const prefix=Object.keys(HELP).find(key=>value.startsWith(key));
  return prefix?HELP[prefix]:'';
}

function addHelp(target,text){
  if(!(target instanceof HTMLElement))return;
  if(target.querySelector(':scope > .help-tip, :scope > .publisher-help-dot'))return;
  const help=helpFor(text||target.textContent);
  if(!help)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='publisher-help-dot';
  button.textContent='?';
  button.dataset.help=help;
  button.setAttribute('aria-label',`Ajuda: ${help}`);
  target.appendChild(button);
}

function scan(root){
  if(!(root instanceof HTMLElement))return;
  root.querySelectorAll('h2,h3,.info-item small,.quick-contact-items small,.quick-contact-heading strong,.radar-intelligence-summary-line span,.meeting-people b,.meeting-material,.stat-row > span,.stat-row > strong').forEach(node=>{
    const ownText=[...node.childNodes].filter(item=>item.nodeType===Node.TEXT_NODE).map(item=>item.textContent).join(' ')||node.textContent;
    addHelp(node,ownText);
  });
  const chips=root.querySelectorAll('.page-head .chips .badge');
  if(chips[0])addHelp(chips[0],'Score');
  if(chips[1])addHelp(chips[1],'Etapa');
}

export default function PublisherHelpEnhancer(){
  useEffect(()=>{
    let observer=null;let timer=null;let attempts=0;
    function attach(){
      const root=document.querySelector('.page-wrap');
      if(!root){if(attempts++<40)timer=setTimeout(attach,60);return}
      scan(root);
      observer=new MutationObserver(()=>scan(root));
      observer.observe(root,{childList:true,subtree:true});
    }
    attach();
    return()=>{if(timer)clearTimeout(timer);observer?.disconnect()};
  },[]);
  return null;
}
