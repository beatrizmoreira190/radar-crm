export const DEFAULT_AVAILABILITY_RULE={
  timezone:'America/Sao_Paulo',
  active_days:[1,2,3,4,5],
  work_start:'09:00',
  work_end:'18:00',
  break_start:'12:00',
  break_end:'13:00',
  buffer_minutes:15,
  min_notice_minutes:60,
  default_duration_minutes:30,
};

export const AVAILABILITY_DAY_OPTIONS=[
  {value:1,label:'Seg'},
  {value:2,label:'Ter'},
  {value:3,label:'Qua'},
  {value:4,label:'Qui'},
  {value:5,label:'Sex'},
  {value:6,label:'Sáb'},
  {value:0,label:'Dom'},
];

function hhmm(value,fallback){
  const text=String(value||fallback||'').slice(0,5);
  return /^\d{2}:\d{2}$/.test(text)?text:(fallback||'');
}

export function normalizeAvailabilityRule(row){
  return {
    ...DEFAULT_AVAILABILITY_RULE,
    ...(row||{}),
    active_days:Array.isArray(row?.active_days)?row.active_days.map(Number):DEFAULT_AVAILABILITY_RULE.active_days,
    work_start:hhmm(row?.work_start,DEFAULT_AVAILABILITY_RULE.work_start),
    work_end:hhmm(row?.work_end,DEFAULT_AVAILABILITY_RULE.work_end),
    break_start:row?.break_start===null?'':hhmm(row?.break_start,DEFAULT_AVAILABILITY_RULE.break_start),
    break_end:row?.break_end===null?'':hhmm(row?.break_end,DEFAULT_AVAILABILITY_RULE.break_end),
    buffer_minutes:Number(row?.buffer_minutes??DEFAULT_AVAILABILITY_RULE.buffer_minutes),
    min_notice_minutes:Number(row?.min_notice_minutes??DEFAULT_AVAILABILITY_RULE.min_notice_minutes),
    default_duration_minutes:Number(row?.default_duration_minutes??DEFAULT_AVAILABILITY_RULE.default_duration_minutes),
  };
}

export function timeToMinutes(value){
  const [h,m]=String(value||'').split(':').map(Number);
  return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:NaN;
}

export function availabilityRuleCheck(ruleValue,startValue,durationMinutes,nowValue=new Date()){
  const rule=normalizeAvailabilityRule(ruleValue);
  const start=new Date(startValue);
  const now=new Date(nowValue);
  const duration=Number(durationMinutes)||0;
  if(Number.isNaN(start.getTime())||duration<=0)return {allowed:false,reason:'Informe uma data, horário e duração válidos.'};

  const day=start.getDay();
  if(!rule.active_days.includes(day))return {allowed:false,reason:'Este dia da semana está fora da disponibilidade configurada do apresentador.'};

  const startMinutes=start.getHours()*60+start.getMinutes();
  const endMinutes=startMinutes+duration;
  const workStart=timeToMinutes(rule.work_start);
  const workEnd=timeToMinutes(rule.work_end);
  if(startMinutes<workStart||endMinutes>workEnd)return {allowed:false,reason:`O horário deve ficar dentro da janela ${rule.work_start}–${rule.work_end}.`};

  const breakStart=timeToMinutes(rule.break_start);
  const breakEnd=timeToMinutes(rule.break_end);
  if(Number.isFinite(breakStart)&&Number.isFinite(breakEnd)&&startMinutes<breakEnd&&endMinutes>breakStart){
    return {allowed:false,reason:`O horário cruza o intervalo ${rule.break_start}–${rule.break_end}.`};
  }

  const noticeMinutes=Math.floor((start.getTime()-now.getTime())/60000);
  if(noticeMinutes<rule.min_notice_minutes)return {allowed:false,reason:`É necessário agendar com pelo menos ${rule.min_notice_minutes} min de antecedência.`};

  return {allowed:true,reason:''};
}

export function overlapsWithBuffer(startMs,endMs,item,bufferMinutes=0){
  const itemStart=new Date(item?.start).getTime()-Number(bufferMinutes||0)*60000;
  const itemEnd=new Date(item?.end).getTime()+Number(bufferMinutes||0)*60000;
  return Number.isFinite(itemStart)&&Number.isFinite(itemEnd)&&startMs<itemEnd&&endMs>itemStart;
}

export function ruleSummary(ruleValue){
  const rule=normalizeAvailabilityRule(ruleValue);
  const labels=AVAILABILITY_DAY_OPTIONS.filter(day=>rule.active_days.includes(day.value)).map(day=>day.label).join(', ');
  const breakText=rule.break_start&&rule.break_end?` · intervalo ${rule.break_start}–${rule.break_end}`:'';
  return `${labels||'Sem dias'} · ${rule.work_start}–${rule.work_end}${breakText} · ${rule.buffer_minutes} min entre reuniões`;
}
