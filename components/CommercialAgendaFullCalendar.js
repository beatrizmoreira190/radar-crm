'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import { ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '@/lib/constants';
import { availabilityRuleCheck, normalizeAvailabilityRule, ruleSummary } from '@/lib/meetingAvailability';

const DEFAULT_RANGE={start:null,end:null};
const ALLOWED_DURATIONS=[20,30,45,60,90];

function addMinutes(value,minutes){return new Date(new Date(value).getTime()+Number(minutes||0)*60000)}
function overlaps(aStart,aEnd,bStart,bEnd){return new Date(aStart)<new Date(bEnd)&&new Date(aEnd)>new Date(bStart)}
function localInput(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function dateKey(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function periodLabel(start,end,mode){
  if(!start)return '—';
  if(mode==='day')return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'short'}).format(new Date(start));
  if(mode==='month')return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(start));
  const last=new Date(end);last.setDate(last.getDate()-1);
  const fmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'});
  return `${fmt.format(new Date(start))} — ${fmt.format(last)}`;
}
function dayHeader(info){
  const date=info.date;
  if(info.view?.type==='dayGridMonth'){
    return <div className="radar-fc-day-head month"><strong>{new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(date)}</strong></div>;
  }
  return <div className="radar-fc-day-head"><strong>{new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(date).replace('.','')}</strong><span>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(date)}</span>{dateKey(date)===dateKey(new Date())&&<em>Hoje</em>}</div>;
}
function meetingStatusClass(status){return `meeting-${status||'scheduled'}`}
function normalizedDuration(minutes){
  const value=Math.max(15,Number(minutes)||30);
  return ALLOWED_DURATIONS.reduce((best,item)=>Math.abs(item-value)<Math.abs(best-value)?item:best,ALLOWED_DURATIONS[0]);
}

export default function CommercialAgendaFullCalendar(){
  const router=useRouter();
  const calendarRef=useRef(null);
  const {supabase,membership,team,teamMap,activityVersion,isManager,hasCommercialFunction}=useCrm();
  const org=membership?.organization_id;
  const canSchedule=isManager||hasCommercialFunction('meeting_scheduling');

  const [range,setRange]=useState(DEFAULT_RANGE);
  const [periodAnchor,setPeriodAnchor]=useState(null);
  const [viewMode,setViewMode]=useState('week');
  const [viewDays,setViewDays]=useState(5);
  const [meetings,setMeetings]=useState([]);
  const [participants,setParticipants]=useState([]);
  const [rules,setRules]=useState({});
  const [publishers,setPublishers]=useState([]);
  const [presenterFilter,setPresenterFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('scheduled');
  const [query,setQuery]=useState('');
  const [externalBusy,setExternalBusy]=useState([]);
  const [calendarMessage,setCalendarMessage]=useState('');
  const [loading,setLoading]=useState(true);
  const [externalLoading,setExternalLoading]=useState(false);
  const [notice,setNotice]=useState('');
  const [quick,setQuick]=useState(null);
  const [publisherQuery,setPublisherQuery]=useState('');

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const p=window.localStorage.getItem('radar-agenda-presenter');
    const days=Number(window.localStorage.getItem('radar-agenda-days'));
    const mode=window.localStorage.getItem('radar-agenda-mode');
    if(p)setPresenterFilter(p);
    if(days===5||days===7)setViewDays(days);
    if(mode==='day'||mode==='week'||mode==='month')setViewMode(mode);
  },[]);
  useEffect(()=>{if(typeof window!=='undefined')window.localStorage.setItem('radar-agenda-presenter',presenterFilter)},[presenterFilter]);
  useEffect(()=>{if(typeof window!=='undefined')window.localStorage.setItem('radar-agenda-days',String(viewDays))},[viewDays]);
  useEffect(()=>{if(typeof window!=='undefined')window.localStorage.setItem('radar-agenda-mode',viewMode)},[viewMode]);

  async function accessToken(){const {data:{session}}=await supabase.auth.getSession();return session?.access_token||''}

  async function loadStatic(){
    if(!org)return;
    const [ruleResult,publisherResult]=await Promise.all([
      supabase.from('presenter_availability_rules').select('*').eq('organization_id',org),
      supabase.from('publishers').select('id,name').eq('organization_id',org).eq('archived',false).order('name').limit(1500),
    ]);
    if(ruleResult.error||publisherResult.error)setNotice(ruleResult.error?.message||publisherResult.error?.message||'Não foi possível carregar os dados da agenda.');
    setRules(Object.fromEntries((ruleResult.data||[]).map(row=>[row.user_id,normalizeAvailabilityRule(row)])));
    setPublishers(publisherResult.data||[]);
  }

  async function loadRange(start=range.start,end=range.end,silent=false){
    if(!org||!start||!end)return;
    if(!silent)setLoading(true);setNotice('');
    const meetingResult=await supabase.from('meetings').select('id,publisher_id,title,meeting_type,scheduled_start,duration_minutes,status,scheduled_by,presenter_user_id,notes,outcome_notes,google_meet_url,publishers(name)').eq('organization_id',org).gte('scheduled_start',start).lt('scheduled_start',end).order('scheduled_start',{ascending:true});
    if(meetingResult.error){setNotice(meetingResult.error.message);setMeetings([]);setParticipants([]);if(!silent)setLoading(false);return}
    const rows=meetingResult.data||[];setMeetings(rows);
    if(rows.length){
      const people=await supabase.from('meeting_participants').select('meeting_id,full_name,email,job_title').eq('organization_id',org).in('meeting_id',rows.map(row=>row.id)).order('created_at',{ascending:true});
      if(people.error)setNotice(people.error.message);
      setParticipants(people.data||[]);
    }else setParticipants([]);
    if(!silent)setLoading(false);
  }

  async function fetchExternalBusy(presenterId,start,end){
    if(!presenterId||presenterId==='all'||!start||!end)return {busy:[],notConnected:true};
    const token=await accessToken();if(!token)throw new Error('Sua sessão expirou.');
    const startDate=new Date(start),endDate=new Date(end);
    if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime())||endDate<=startDate)throw new Error('Intervalo de agenda inválido.');
    const chunks=[];let cursor=new Date(startDate);
    const MAX_CHUNK_MS=28*24*60*60*1000;
    while(cursor<endDate){
      const chunkEnd=new Date(Math.min(endDate.getTime(),cursor.getTime()+MAX_CHUNK_MS));
      chunks.push([cursor.toISOString(),chunkEnd.toISOString()]);
      cursor=chunkEnd;
    }
    const responses=await Promise.all(chunks.map(async ([timeMin,timeMax])=>{
      const response=await fetch('/api/google-calendar',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action:'availability',presenterUserId:presenterId,timeMin,timeMax}),cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(data.error||'Não foi possível consultar a agenda externa.');error.code=data.code;throw error}
      return data;
    }));
    const first=responses[0]||{};
    return {...first,busy:responses.flatMap(item=>item.busy||[])};
  }

  async function loadExternal(presenterId=presenterFilter,start=range.start,end=range.end,silent=false){
    if(!start||!end){setExternalBusy([]);return}
    if(!silent)setExternalLoading(true);
    try{
      if(presenterId==='all'){
        const presenters=team.filter(member=>member.active&&(member.commercial_functions||[]).includes('commercial_presentation'));
        const results=await Promise.all(presenters.map(async presenter=>{
          try{
            const data=await fetchExternalBusy(presenter.user_id,start,end);
            return {presenter,data};
          }catch(error){
            if(error.code==='CALENDAR_NOT_CONNECTED')return null;
            throw error;
          }
        }));
        const connected=results.filter(Boolean);
        const rows=connected.flatMap(({presenter,data})=>(data.busy||[]).map(block=>({
          ...block,
          presenterUserId:presenter.user_id,
          presenterName:presenter.full_name||presenter.email||'Equipe'
        })));
        setExternalBusy(rows);
        setCalendarMessage(connected.length?`${connected.length} agenda${connected.length===1?'':'s'} externa${connected.length===1?'':'s'} sincronizada${connected.length===1?'':'s'}.`:'Nenhuma agenda externa conectada para os apresentadores.');
      }else{
        const data=await fetchExternalBusy(presenterId,start,end);
        const presenter=team.find(member=>member.user_id===presenterId);
        setExternalBusy((data.busy||[]).map(block=>({
          ...block,
          presenterUserId:presenterId,
          presenterName:presenter?.full_name||presenter?.email||'Equipe'
        })));
        setCalendarMessage(data.calendarEmail?`Google Agenda: ${data.calendarEmail}`:'Google Agenda sincronizado.');
      }
    }catch(error){
      setExternalBusy([]);
      setCalendarMessage(error.code==='CALENDAR_NOT_CONNECTED'?'Google Agenda ainda não conectado.':'Agenda externa indisponível no momento.');
    }finally{if(!silent)setExternalLoading(false)}
  }

  useEffect(()=>{loadStatic()},[org]);
  useEffect(()=>{loadRange()},[org,range.start,range.end,activityVersion]);
  useEffect(()=>{loadExternal()},[presenterFilter,range.start,range.end,team]);
  useEffect(()=>{
    if(!org||!range.start||!range.end)return;
    const timer=setInterval(()=>{
      loadRange(range.start,range.end,true);
      loadExternal(presenterFilter,range.start,range.end,true);
    },60000);
    return()=>clearInterval(timer);
  },[org,range.start,range.end,presenterFilter,team,activityVersion]);

  const participantMap=useMemo(()=>{const out={};for(const person of participants)(out[person.meeting_id]||(out[person.meeting_id]=[])).push(person);return out},[participants]);
  const presenterOptions=useMemo(()=>{
    const used=new Set(meetings.map(row=>row.presenter_user_id));
    return team.filter(member=>member.active&&((member.commercial_functions||[]).includes('commercial_presentation')||used.has(member.user_id)));
  },[team,meetings]);
  useEffect(()=>{if(presenterFilter!=='all'&&!presenterOptions.some(item=>item.user_id===presenterFilter))setPresenterFilter('all')},[presenterOptions,presenterFilter]);

  const selectedRule=useMemo(()=>presenterFilter==='all'?null:normalizeAvailabilityRule(rules[presenterFilter]),[presenterFilter,rules]);
  const businessHours=useMemo(()=>selectedRule?selectedRule.active_days.map(day=>({daysOfWeek:[day],startTime:selectedRule.work_start,endTime:selectedRule.work_end})):false,[selectedRule]);

  const filteredMeetings=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return meetings.filter(meeting=>{
      if(presenterFilter!=='all'&&meeting.presenter_user_id!==presenterFilter)return false;
      if(statusFilter!=='all'&&meeting.status!==statusFilter)return false;
      if(!needle)return true;
      const people=(participantMap[meeting.id]||[]).map(person=>`${person.full_name} ${person.email||''}`).join(' ');
      return `${meeting.title||''} ${meeting.publishers?.name||''} ${people}`.toLowerCase().includes(needle);
    });
  },[meetings,presenterFilter,statusFilter,query,participantMap]);

  const visibleExternal=useMemo(()=>{
    return externalBusy.filter(block=>{
      const presenterId=block.presenterUserId||presenterFilter;
      const scheduledForPresenter=meetings.filter(meeting=>meeting.presenter_user_id===presenterId&&meeting.status==='scheduled');
      return !scheduledForPresenter.some(meeting=>overlaps(block.start,block.end,meeting.scheduled_start,addMinutes(meeting.scheduled_start,meeting.duration_minutes)));
    });
  },[externalBusy,meetings,presenterFilter]);

  const calendarEvents=useMemo(()=>{
    const radar=filteredMeetings.map(meeting=>({
      id:`radar-${meeting.id}`,
      title:meeting.publishers?.name||meeting.title||'Reunião Radar',
      start:meeting.scheduled_start,
      end:addMinutes(meeting.scheduled_start,meeting.duration_minutes).toISOString(),
      backgroundColor:'#dceaff',
      borderColor:'#3b73c5',
      textColor:'#172b4d',
      classNames:['radar-calendar-event',meetingStatusClass(meeting.status)],
      extendedProps:{kind:'radar',meeting,publisherId:meeting.publisher_id,presenter:teamMap[meeting.presenter_user_id],participants:participantMap[meeting.id]||[]},
    }));
    const external=visibleExternal.map((block,index)=>({
      id:`external-${block.presenterUserId||'presenter'}-${index}-${block.start}`,
      title:block.title||'Compromisso no Google Agenda',start:block.start,end:block.end,
      backgroundColor:'#e7eaee',
      borderColor:'#667085',
      textColor:'#1f2937',
      editable:false,overlap:false,classNames:['radar-calendar-external'],
      extendedProps:{kind:'external',presenterName:block.presenterName||'',presenterUserId:block.presenterUserId||''},
    }));
    const breaks=[];
    if(selectedRule?.break_start&&selectedRule?.break_end&&range.start&&range.end){
      const cursor=new Date(range.start),limit=new Date(range.end);
      while(cursor<limit){
        if(selectedRule.active_days.includes(cursor.getDay())){
          const y=cursor.getFullYear(),m=cursor.getMonth(),d=cursor.getDate();
          const [sh,sm]=selectedRule.break_start.split(':').map(Number);const [eh,em]=selectedRule.break_end.split(':').map(Number);
          breaks.push({id:`break-${dateKey(cursor)}`,start:new Date(y,m,d,sh,sm).toISOString(),end:new Date(y,m,d,eh,em).toISOString(),display:'background',classNames:['radar-calendar-break'],extendedProps:{kind:'break'}});
        }
        cursor.setDate(cursor.getDate()+1);
      }
    }
    return [...radar,...external,...breaks];
  },[filteredMeetings,visibleExternal,selectedRule,range.start,range.end,participantMap,teamMap]);

  const scheduledCount=meetings.filter(row=>row.status==='scheduled').length;
  const completedCount=meetings.filter(row=>row.status==='completed').length;
  const todayCount=meetings.filter(row=>row.status==='scheduled'&&dateKey(row.scheduled_start)===dateKey(new Date())).length;

  function api(){return calendarRef.current?.getApi?.()}
  function previous(){api()?.prev()}
  function next(){api()?.next()}
  function today(){api()?.today()}
  function setMode(mode){setViewMode(mode);api()?.changeView(mode==='day'?'timeGridDay':mode==='month'?'dayGridMonth':'timeGridWeek')}

  function slotValidation(presenterId,start,duration,busyOverride=null){
    const rule=normalizeAvailabilityRule(rules[presenterId]);
    const check=availabilityRuleCheck(rule,start,duration,new Date());if(!check.allowed)return check;
    const startMs=new Date(start).getTime(),endMs=startMs+duration*60000;
    const conflict=meetings.find(row=>row.presenter_user_id===presenterId&&row.status==='scheduled'&&startMs<addMinutes(row.scheduled_start,row.duration_minutes+rule.buffer_minutes).getTime()&&endMs>addMinutes(row.scheduled_start,-rule.buffer_minutes).getTime());
    if(conflict)return {allowed:false,reason:'Esse horário conflita com outra reunião do apresentador.'};
    const busyRows=busyOverride??(presenterId===presenterFilter?externalBusy:[]);
    const external=busyRows.find(block=>startMs<new Date(block.end).getTime()&&endMs>new Date(block.start).getTime());
    if(external)return {allowed:false,reason:'Esse horário está bloqueado na agenda externa do apresentador.'};
    return {allowed:true,reason:''};
  }

  function openQuick(startValue,durationValue=null){
    if(!canSchedule||!presenterOptions.length)return;
    const presenterId=presenterFilter!=='all'?presenterFilter:presenterOptions[0].user_id;
    const rule=normalizeAvailabilityRule(rules[presenterId]);const duration=normalizedDuration(durationValue||rule.default_duration_minutes||30);
    const check=slotValidation(presenterId,startValue,duration);
    if(!check.allowed){setNotice(check.reason);return}
    setPublisherQuery('');setQuick({publisher_id:'',presenter_user_id:presenterId,scheduled_start:localInput(startValue),duration_minutes:duration});
  }

  function handleDateClick(info){
    if(viewMode!=='month'){openQuick(info.date);return}
    const presenterId=presenterFilter!=='all'?presenterFilter:presenterOptions[0]?.user_id;
    const rule=normalizeAvailabilityRule(rules[presenterId]);
    const start=new Date(info.date);
    const [hour,minute]=String(rule.work_start||'09:00').split(':').map(Number);
    start.setHours(Number.isFinite(hour)?hour:9,Number.isFinite(minute)?minute:0,0,0);
    openQuick(start);
  }
  function handleSelect(info){const duration=normalizedDuration(Math.round((info.end.getTime()-info.start.getTime())/60000));openQuick(info.start,duration);api()?.unselect()}
  function handleEventClick(info){if(info.event.extendedProps.kind==='radar')router.push(`/app/editoras/${info.event.extendedProps.publisherId}`)}
  function handleDatesSet(info){setRange({start:info.start.toISOString(),end:info.end.toISOString()});setPeriodAnchor((info.view?.currentStart||info.start).toISOString())}

  function changeQuickPresenter(presenterId){
    const rule=normalizeAvailabilityRule(rules[presenterId]);setQuick(value=>({...value,presenter_user_id:presenterId,duration_minutes:rule.default_duration_minutes||30}));
  }
  async function continueQuick(){
    if(!quick?.publisher_id){setNotice('Escolha a editora antes de continuar.');return}
    const start=new Date(quick.scheduled_start);if(Number.isNaN(start.getTime())){setNotice('Informe data e horário válidos.');return}
    let busyRows=quick.presenter_user_id===presenterFilter?externalBusy:[];
    if(quick.presenter_user_id!==presenterFilter){
      try{
        const end=addMinutes(start,Number(quick.duration_minutes||30));
        const data=await fetchExternalBusy(quick.presenter_user_id,addMinutes(start,-1).toISOString(),addMinutes(end,1).toISOString());
        busyRows=data.busy||[];
      }catch(error){if(error.code!=='CALENDAR_NOT_CONNECTED'){setNotice('Não foi possível confirmar a agenda externa desse apresentador. Tente novamente.');return}}
    }
    const check=slotValidation(quick.presenter_user_id,start,Number(quick.duration_minutes||30),busyRows);if(!check.allowed){setNotice(check.reason);return}
    const params=new URLSearchParams({schedule:'1',presenter:quick.presenter_user_id,start:start.toISOString(),duration:String(quick.duration_minutes||30)});
    router.push(`/app/editoras/${quick.publisher_id}?${params.toString()}`);
  }

  const publisherChoices=useMemo(()=>{const needle=publisherQuery.trim().toLowerCase();return (needle?publishers.filter(item=>String(item.name||'').toLowerCase().includes(needle)):publishers).slice(0,80)},[publishers,publisherQuery]);
  const period=periodLabel(periodAnchor||range.start,range.end,viewMode);
  const scrollHour=Math.max(0,new Date().getHours()-1);
  const scrollTime=`${String(scrollHour).padStart(2,'0')}:00:00`;

  function renderEventContent(info){
    const month=info.view?.type==='dayGridMonth';
    if(info.event.extendedProps.kind==='external'){
      const presenter=info.event.extendedProps.presenterName;
      if(month)return <div className="radar-fc-month-event external"><span className="radar-fc-month-time">{info.timeText}</span><strong>{info.event.title}</strong>{presenterFilter==='all'&&presenter&&<span className="radar-fc-presenter">{presenter}</span>}</div>;
      return <div className="radar-fc-external-content"><span className="radar-fc-event-time">{info.timeText}</span><strong>{info.event.title}</strong>{presenterFilter==='all'&&presenter&&<span className="radar-fc-presenter">{presenter}</span>}</div>;
    }
    const meeting=info.event.extendedProps.meeting;const presenter=info.event.extendedProps.presenter;
    if(month)return <div className="radar-fc-month-event radar"><span className="radar-fc-month-time">{info.timeText}</span><strong>{info.event.title}</strong>{presenterFilter==='all'&&presenter&&<span className="radar-fc-presenter">{presenter.full_name||presenter.email||'Equipe'}</span>}</div>;
    return <div className="radar-fc-event-content"><div><strong>{info.timeText}</strong><span>{MEETING_STATUS_LABELS[meeting?.status]||meeting?.status}</span></div><b>{info.event.title}</b><small>{MEETING_TYPE_LABELS[meeting?.meeting_type]||meeting?.meeting_type}{presenterFilter==='all'&&presenter?` · ${presenter.full_name||presenter.email||'Equipe'}`:''}</small></div>;
  }

  return <div className="page-wrap radar-agenda-page">
    <header className="radar-agenda-head">
      <div><div className="eyebrow">Agenda comercial</div><h1>Agenda da equipe</h1><p>Reuniões Radar e indisponibilidades externas em um calendário estável e integrado.</p></div>
      <button className="btn secondary" type="button" onClick={()=>{loadRange();loadExternal()}}><RefreshCw size={15}/> Atualizar</button>
    </header>

    {notice&&<div className="notice-bar"><span>{notice}</span><button type="button" onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="radar-agenda-toolbar card">
      <div className="radar-agenda-nav">
        <button className="icon-btn" type="button" onClick={previous} aria-label="Período anterior"><ChevronLeft size={17}/></button>
        <div><small>{viewMode==='day'?'Dia':viewMode==='month'?'Mês':'Semana'}</small><strong>{period}</strong></div>
        <button className="icon-btn" type="button" onClick={next} aria-label="Próximo período"><ChevronRight size={17}/></button>
        <button className="btn secondary small" type="button" onClick={today}>Hoje</button>
      </div>
      <div className="radar-agenda-filters">
        <div className="agenda-segmented"><button type="button" className={viewMode==='day'?'active':''} onClick={()=>setMode('day')}>Dia</button><button type="button" className={viewMode==='week'?'active':''} onClick={()=>setMode('week')}>Semana</button><button type="button" className={viewMode==='month'?'active':''} onClick={()=>setMode('month')}>Mês</button></div>
        <select value={presenterFilter} onChange={e=>setPresenterFilter(e.target.value)}><option value="all">Toda a equipe</option>{presenterOptions.map(member=><option key={member.user_id} value={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select>
        {viewMode==='week'&&<div className="agenda-segmented"><button type="button" className={viewDays===5?'active':''} onClick={()=>setViewDays(5)}>5 dias</button><button type="button" className={viewDays===7?'active':''} onClick={()=>setViewDays(7)}>7 dias</button></div>}
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="scheduled">Agendadas</option><option value="all">Todos os status</option>{Object.entries(MEETING_STATUS_LABELS).filter(([key])=>key!=='scheduled').map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
        <div className="radar-agenda-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar reunião, editora ou participante"/></div>
        {canSchedule&&<button className="btn small" type="button" onClick={()=>openQuick(new Date())}><Plus size={14}/> Reunião</button>}
      </div>
    </section>

    <div className="radar-agenda-meta"><span><strong>{scheduledCount}</strong> agendada{scheduledCount===1?'':'s'} · <strong>{todayCount}</strong> hoje · <strong>{completedCount}</strong> realizada{completedCount===1?'':'s'}</span><span className="agenda-legend"><i className="radar"/>Radar <i className="google"/>Google Agenda</span><span>{externalLoading?'Consultando agenda externa…':calendarMessage} · atualização automática a cada 1 min</span></div>
    {selectedRule&&<div className="radar-agenda-rule"><Clock3 size={12}/>{ruleSummary(selectedRule)}</div>}

    <section className="radar-fullcalendar-card card" aria-busy={loading}>
      {loading&&<div className="radar-calendar-loading">Atualizando reuniões…</div>}
      <FullCalendar
        ref={calendarRef}
        plugins={[classicThemePlugin,timeGridPlugin,dayGridPlugin,interactionPlugin]}
        themeSystem="classic"
        initialView={viewMode==='day'?'timeGridDay':viewMode==='month'?'dayGridMonth':'timeGridWeek'}
        headerToolbar={false}
        firstDay={1}
        weekends={viewMode==='week'?viewDays===7:true}
        allDaySlot={viewMode==='month'?true:false}
        slotMinTime="08:00:00"
        slotMaxTime="19:00:00"
        slotDuration="00:30:00"
        slotHeaderInterval="01:00:00"
        slotHeaderFormat={{hour:'2-digit',minute:'2-digit',hour12:false}}
        eventTimeFormat={{hour:'2-digit',minute:'2-digit',hour12:false}}
        dayHeaderContent={dayHeader}
        nowIndicator={true}
        businessHours={businessHours}
        scrollTime={scrollTime}
        scrollTimeReset={false}
        selectable={canSchedule&&viewMode!=='month'}
        selectMirror={true}
        selectOverlap={false}
        dateClick={handleDateClick}
        select={handleSelect}
        eventClick={handleEventClick}
        datesSet={handleDatesSet}
        events={calendarEvents}
        eventClassNames={arg=>arg.event.extendedProps.kind==='external'?['radar-calendar-external']:arg.event.extendedProps.kind==='break'?['radar-calendar-break']:['radar-calendar-event',meetingStatusClass(arg.event.extendedProps.meeting?.status)]}
        eventContent={renderEventContent}
        eventMinHeight={26}
        eventShortHeight={34}
        slotEventOverlap={false}
        height={viewMode==='month'?'auto':'calc(100vh - 245px)'}
        expandRows={true}
      />
    </section>

    {quick&&<div className="modal-backdrop"><div className="modal quick-agenda-modal"><div className="modal-head"><div><h3>Agendar reunião</h3><p>Defina o contexto e continue para a ficha da editora.</p></div><button type="button" onClick={()=>setQuick(null)}><X/></button></div><div className="form-grid">
      <label className="span-2">Editora<div className="search-box quick-publisher-search"><Search size={14}/><input value={publisherQuery} onChange={e=>setPublisherQuery(e.target.value)} placeholder="Buscar editora"/></div><select size={Math.min(6,Math.max(3,publisherChoices.length))} value={quick.publisher_id} onChange={e=>setQuick(x=>({...x,publisher_id:e.target.value}))}>{publisherChoices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Apresentador<select value={quick.presenter_user_id} onChange={e=>changeQuickPresenter(e.target.value)}>{presenterOptions.map(member=><option key={member.user_id} value={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select></label>
      <label>Duração<select value={quick.duration_minutes} onChange={e=>setQuick(x=>({...x,duration_minutes:Number(e.target.value)}))}>{ALLOWED_DURATIONS.map(value=><option value={value} key={value}>{value===60?'1 hora':value===90?'1h30':`${value} min`}</option>)}</select></label>
      <label className="span-2">Data e horário<input className="input" type="datetime-local" value={quick.scheduled_start} onChange={e=>setQuick(x=>({...x,scheduled_start:e.target.value}))}/></label>
    </div><div className="modal-actions"><button className="btn secondary" type="button" onClick={()=>setQuick(null)}>Cancelar</button><button className="btn" type="button" onClick={continueQuick}>Continuar para a editora</button></div></div></div>}
  </div>;
}
