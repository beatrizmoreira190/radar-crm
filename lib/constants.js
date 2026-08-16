export const ROLE_LABELS = { owner: 'Administrador geral', admin: 'Administrador', supervisor: 'Supervisor', member: 'Prospectador' };
export const PRIORITY_LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
export const CHANNEL_LABELS = { phone: 'Ligação', email: 'E-mail', whatsapp: 'WhatsApp', linkedin: 'LinkedIn', meeting: 'Reunião', other: 'Outro' };
export const RESULT_LABELS = {
  no_answer: 'Sem resposta', left_message: 'Deixou recado', connected: 'Falamos', replied: 'Respondeu',
  meeting_scheduled: 'Reunião marcada', not_interested: 'Sem interesse', follow_up: 'Follow-up necessário',
  wrong_contact: 'Contato errado', asked_email: 'Pediu e-mail/apresentação', callback_scheduled: 'Retorno agendado',
  proposal_requested: 'Pediu proposta', qualified: 'Oportunidade qualificada', busy: 'Ocupado / falar depois',
  contact_updated: 'Contato atualizado', other: 'Outro'
};
export const INTEREST_LABELS = { none: 'Sem interesse', low: 'Baixo', medium: 'Médio', high: 'Alto' };
export const TASK_TYPE_LABELS = { call:'Ligação',email:'E-mail',meeting:'Reunião',follow_up:'Follow-up',proposal:'Proposta',research:'Pesquisa',whatsapp:'WhatsApp',linkedin:'LinkedIn',other:'Outro' };
export const OPPORTUNITY_STAGE_LABELS = { identified:'Identificada',qualified:'Qualificada',proposal:'Proposta',negotiation:'Negociação',won:'Ganha',lost:'Perdida',on_hold:'Em espera' };
export const EDITORIAL_PROFILE_OPTIONS = [
  'Acadêmico/Científico','Acupuntura','Autoconhecimento','Bilíngue/Idiomas','Ciências sociais','Concursos/Preparatórios','Contabilidade/Tributário','Desenvolvimento pessoal','Didático','Direito','Discipulado','Educação','Educação infantil','Enfermagem','Engenharia','Espiritualidade','Espiritualidade/Espiritismo','Família','Fantasia','Ficção científica','Filosofia','Folclore','Formação de professores','Generalista','Graphic novel','História/Humanidades','Infantil','Infantojuvenil','Literatura','Literatura brasileira','Medicina','Medicina chinesa','Negócios/Administração','Não ficção','Nutrição','Obras de referência','Odontologia','Palavras cruzadas','Paradidático','Passatempos/Atividades','Pediatria','Poesia','Psicologia','Quadrinhos/HQ','Religioso','Religioso/Cristão','Romance','RPG/Jogos','Saúde','Serviço Social','Tecnologia','Teologia','Terror/Horror','Trabalho/Previdência','Veterinária','Vestibular/ENEM'
];
export const EDITORIAL_PROFILE_STATUS_LABELS = { pending:'Pendente',confirmed:'Confirmado',partial:'Parcial',not_identified:'Não identificado',review:'Revisar cadastro' };
export const EDITORIAL_PROFILE_CONFIDENCE_LABELS = { low:'Baixa',medium:'Média',high:'Alta' };
export const BRAZIL_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export function formatDate(value, withTime=false) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('pt-BR', withTime ? {dateStyle:'short',timeStyle:'short'} : {dateStyle:'short'}); } catch { return '—'; }
}
export function timeAgo(value) {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  const min = Math.floor(ms/60000); if (min < 1) return 'agora'; if (min < 60) return `há ${min} min`;
  const h = Math.floor(min/60); if (h < 24) return `há ${h}h`;
  const d = Math.floor(h/24); if (d < 30) return `há ${d} dia${d===1?'':'s'}`;
  return formatDate(value);
}
export function initials(name='') {
  const parts = name.trim().split(/\s+/).filter(Boolean); return (parts[0]?.[0]||'?') + (parts.length>1 ? parts[parts.length-1][0] : '');
}
export function currency(value) {
  if (value == null || value === '') return '—';
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
}
