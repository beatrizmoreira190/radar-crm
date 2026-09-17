'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LockKeyhole, Plus, RefreshCw, Search, UsersRound, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '@/lib/constants';
import { normalizeAvailabilityRule, ruleSummary, timeToMinutes } from '@/lib/meetingAvailability';

const SLOT_MINUTES=30;
const PX_PER_MINUTE=1;
const DAY_NAMES=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

function startOfDay(value){const d=new Date(value);d.setHours(0,0,0,0);return d}
function startOfWeek(value){const d=startOfDay(value);d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
function addDays(value,amount){const d=new Date(value);d.setDate(d.getDate()+amount);return d}
function sameLocalDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function dayKey(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function shortDate(value){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(value)}
function fullDate(value){return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'short'}).format(value)}
function rangeLabel(start,end){const fmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'});return `${fmt.format(start)} — ${fmt.format(end)}`}
function timeLabel(value){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
function localInput(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function minuteOfDay(value){const d=new Date(value);return d.getHours()*60+d.getMinutes()}
function statusClass(status){if(status==='scheduled')return'blue';if(status==='completed')return'green';if(status==='cancelled')return'red';if(status==='no_show')return'amber';return''}
function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function overlaps(startA,endA,startB,endB){return new Date(startA)<new Date(endB)&&new Date(endA)>new Date(startB)}

export default function CommercialAgendaCalendar(){
  const router=useRouter();
  const scrollRef=useRef(null);
  const {supabase,membership,team,teamMap,activityVersion,isManager,hasCommercialFunction}=useCrm();
  const org=membership?.organization_id;
  const canSchedule=isManager||hasCommercialFunction('meeting_scheduling');
  const [focusDate,setFocusDate]=useState(()=>startOfDay(new Date()));
  const [meetings,setMeetings]=useState([]);
  const [participants,setParticipants]=useState([]);
  const [rules,setRules]=useState({});
  const [publishers,setPublishers]=useState([]);
  const [presenterFilter,setPresenterFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('active');
  const [query,setQuery]=useState('');
  const [viewMode,setViewMode]=useState('week');
  const [viewDays,setViewDays]=useState(5);
  const [externalBusy,setExternalBusy]=useState([]);
  const [calendarMessage,setCalendarMessage]=useState('');
  const [calendarLoading,setCalendarLoading]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [quick,setQuick]=useState(null);
  const [publisherQuery,setPublisherQuery]=useState('');
  const [now,setNow]=useState(()=>new Date());

  const weekStart=useMemo(()=>startOfWeek(focusDate),[focusDate]);
  const weekEnd=useMemo(()=>addDays(weekStart,7),[weekStart]);
  const allDays=useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);
  const visibleDays=useMemo(()=>viewMode==='today'?[startOfDay(focusDate)]:allDays.slice(0,viewDays),[viewMode,focusDate,allDays,viewDays]);
  const columnCount=visibleDays.length;

  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{
    if(typeof window==='undefined')return;
    const savedPresenter=window.localStorage.getItem('radar-agenda-presenter');
    const savedDays=Number(window.localStorage.getItem('radar-agenda-days'));
    const savedMode=window.localStorage.getItem('radar-agenda-mode');
    if(savedPresenter)setPresenterFilter(savedPresenter);
    if(savedDays===5||savedDays===7)setViewDays(savedDays);
    if(savedMode==='today'||savedMode==='week')setViewMode(savedMode);
  },[]);
  useEffect(()=>{if(typeof window!=='undefined')window.localStorage.setItem('radar-agenda-presenter',presenterFilter)},[presenterFilter]);
  useEffect(()=>{if(typeof window!=='undefined')window.localStorage.setItem('radar-agenda-days',String(viewDays))},[viewDays]);
  useEffect(()=>{if(typeof window!=='undefined')window.localStorage.setItem('radar-agenda-mode',viewMode)},[viewMode]);

  async function accessToken(){const {data:{session}}=await supabase.auth.getSession();return session?.access_token||''}
  async function calendarAvailability(presenterUserId){
    const token=await accessToken();if(!token)throw new Error('Sua sessão expirou.');
    const response=await fetch('/api/google-calendar',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action:'availability',presenterUserId,timeMin:weekStart.toISOString(),timeMax:weekEnd.toISOString()}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));if(!response.ok){const err=new Error(data.error||'Não foi possível consultar a agenda externa.');err.code=data.code;throw err}return data;
  }

  async function loadCore(){
    if(!org)return;
    setLoading(true);setNotice('');
    const [meetingResult,ruleResult,publisherResult]=await Promise.all([
      supabase.from('meetings').select('id,publisher_id,title,meeting_type,scheduled_start,duration_minutes,status,scheduled_by,presenter_user_id,notes,outcome_notes,google_meet_url,publishers(name)').eq('organization_id',org).gte('scheduled_start',weekStart.toISOString()).lt('scheduled_start',weekEnd.toISOString()).order('scheduled_start',{ascending:true}),
      supabase.from('presenter_availability_rules').select('*').eq('organization_id',org),
      supabase.from('publishers').select('id,name,stage').eq('organization_id',org).order('name').limit(1500)
    ]);
    if(meetingResult.error||ruleResult.error||publisherResult.error)setNotice(meetingResult.error?.message||ruleResult.error?.message||publisherResult.error?.message||'Não foi possível carregar a agenda.');
    const rows=meetingResult.data||[];setMeetings(rows);setRules(Object.fromEntries((ruleResult.data||[]).map(row=>[row.user_id,normalizeAvailabilityRule(row)])));setPublishers(publisherResult.data||[]);
    if(rows.length){
      const people=await supabase.from('meeting_participants').select('meeting_id,full_name,email,job_title').eq('organization_id',org).in('meeting_id',rows.map(row=>row.id)).order('created_at',{ascending:true});
      if(people.error)setNotice(people.error.message);setParticipants(people.data||[]);
    }else setParticipants([]);
    setLoading(false);
  }

  async function loadExternalBusy(presenterId=presenterFilter){
    if(presenterId==='all'){setExternalBusy([]);setCalendarMessage('Selecione um apresentador para sobrepor os bloqueios externos.');return}
    setCalendarLoading(true);
    try{const data=await calendarAvailability(presenterId);setExternalBusy(data.busy||[]);setCalendarMessage(data.calendarEmail?`Google Agenda: ${data.calendarEmail}`:'Google Agenda sincronizado.')}
    catch(error){setExternalBusy([]);setCalendarMessage(error.code==='CALENDAR_NOT_CONNECTED'?'Google Agenda ainda não conectado. A agenda interna continua funcionando.':error.message)}
    finally{setCalendarLoading(false)}
  }

  useEffect(()=>{loadCore()},[org,weekStart.getTime(),activityVersion]);
  useEffect(()=>{loadExternalBusy(presenterFilter)},[presenterFilter,weekStart.getTime()]);

  const participantMap=useMemo(()=>{const out={};for(const person of participants)(out[person.meeting_id]||(out[person.meeting_id]=[])).push(person);return out},[participants]);
  const presenterOptions=useMemo(()=>{const used=new Set(meetings.map(row=>row.presenter_user_id));return team.filter(member=>member.active&&((member.commercial_functions||[]).includes('commercial_presentation')||used.has(member.user_id)))},[team,meetings]);
  useEffect(()=>{if(presenterFilter!=='all'&&!presenterOptions.some(item=>item.user_id===presenterFilter))setPresenterFilter('all')},[presenterOptions,presenterFilter]);

  const selectedRule=useMemo(()=>presenterFilter==='all'?null:normalizeAvailabilityRule(rules[presenterFilter]),[presenterFilter,rules]);
  const calendarStartMinute=useMemo(()=>{if(!selectedRule)return 8*60;return Math.floor(Math.min(8*60,timeToMinutes(selectedRule.work_start))/60)*60},[selectedRule]);
  const calendarEndMinute=useMemo(()=>{if(!selectedRule)return 18*60;return Math.ceil(Math.max(18*60,timeToMinutes(selectedRule.work_end))/60)*60},[selectedRule]);
  const calendarHeight=(calendarEndMinute-calendarStartMinute)*PX_PER_MINUTE;
  const hourMarks=useMemo(()=>{const out=[];for(let m=calendarStartMinute;m<=calendarEndMinute;m+=60)out.push(m);return out},[calendarStartMinute,calendarEndMinute]);
  const slotMarks=useMemo(()=>{const out=[];for(let m=calendarStartMinute;m<calendarEndMinute;m+=SLOT_MINUTES)out.push(m);return out},[calendarStartMinute,calendarEndMinute]);

  useEffect(()=>{
    if(loading||!scrollRef.current)return;
    const hasToday=visibleDays.some(day=>sameLocalDay(day,now));
    const target=hasToday?minuteOfDay(now):(selectedRule?timeToMinutes(selectedRule.work_start):9*60);
    const timer=setTimeout(()=>{if(scrollRef.current)scrollRef.current.scrollTop=Math.max(0,(clamp(target,calendarStartMinute,calendarEndMinute)-calendarStartMinute)*PX_PER_MINUTE-135)},80);
    return()=>clearTimeout(timer);
  },[loading,viewMode,viewDays,focusDate.getTime(),calendarStartMinute,presenterFilter]);

  const filteredMeetings=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return meetings.filter(meeting=>{
      if(presenterFilter!=='all'&&meeting.presenter_user_id!==presenterFilter)return false;
      if(statusFilter==='active'&&meeting.status!=='scheduled')return false;
      if(statusFilter!=='all'&&statusFilter!=='active'&&meeting.status!==statusFilter)return false;
      if(!needle)return true;
      const people=(participantMap[meeting.id]||[]).map(person=>`${person.full_name} ${person.email||''}`).join(' ');
      return `${meeting.title} ${meeting.publishers?.name||''} ${people}`.toLowerCase().includes(needle);
    });
  },[meetings,presenterFilter,statusFilter,query,participantMap]);

  const meetingsByDay=useMemo(()=>{const map=Object.fromEntries(allDays.map(day=>[dayKey(day),[]]));for(const meeting of filteredMeetings){const key=dayKey(meeting.scheduled_start);if(map[key])map[key].push(meeting)}return map},[filteredMeetings,allDays]);
  const presenterScheduled=useMemo(()=>presenterFilter==='all'?[]:meetings.filter(row=>row.presenter_user_id===presenterFilter&&row.status==='scheduled'),[meetings,presenterFilter]);
  const busyByDay=useMemo(()=>{
    const map=Object.fromEntries(allDays.map(day=>[dayKey(day),[]]));
    for(const block of externalBusy){
      const start=new Date(block.start),end=new Date(block.end);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))continue;
      const duplicate=presenterScheduled.some(row=>overlaps(start,end,row.scheduled_start,new Date(new Date(row.scheduled_start).getTime()+Number(row.duration_minutes||30)*60000)));
      if(duplicate)continue;
      for(const day of allDays){const ds=startOfDay(day);const de=addDays(ds,1);if(start<de&&end>ds)map[dayKey(day)].push({start:start>ds?start:ds,end:end<de?end:de})}
    }
    return map;
  },[externalBusy,allDays,presenterScheduled]);

  const scheduledCount=meetings.filter(row=>row.status==='scheduled').length;
  const todayCount=meetings.filter(row=>row.status==='scheduled'&&sameLocalDay(new Date(row.scheduled_start),now)).length;
  const completedCount=meetings.filter(row=>row.status==='completed').length;

  function previousPeriod(){setFocusDate(current=>addDays(current,viewMode==='today'?-1:-7))}
  function nextPeriod(){setFocusDate(current=>addDays(current,viewMode==='today'?1:7))}
  function showToday(){setFocusDate(startOfDay(new Date()));setViewMode('today')}
  function showWeek(){setViewMode('week')}
  async function refreshAll(){await loadCore();await loadExternalBusy()}

  function presenterRule(userId){return normalizeAvailabilityRule(rules[userId])}
  function dayStartAt(day,minutes){const d=startOfDay(day);d.setHours(Math.floor(minutes/60),minutes%60,0,0);return d}
  function slotAllowed(day,minutes){
    if(!canSchedule||!presenterOptions.length)return false;
    const presenterId=presenterFilter!=='all'?presenterFilter:presenterOptions[0].user_id;
    const rule=presenterRule(presenterId);if(!rule.active_days.includes(day.getDay()))return false;
    const duration=rule.default_duration_minutes;const workStart=timeToMinutes(rule.work_start),workEnd=timeToMinutes(rule.work_end);if(minutes<workStart||minutes+duration>workEnd)return false;
    const breakStart=timeToMinutes(rule.break_start),breakEnd=timeToMinutes(rule.break_end);if(Number.isFinite(breakStart)&&Number.isFinite(breakEnd)&&minutes<breakEnd&&minutes+duration>breakStart)return false;
    return true;
  }

  function openQuick(day,minutes=null){
    if(!canSchedule||!presenterOptions.length)return;
    const presenterId=presenterFilter!=='all'?presenterFilter:presenterOptions[0].user_id;
    const rule=presenterRule(presenterId);let startMinutes=minutes??timeToMinutes(rule.work_start);let start=dayStartAt(day,startMinutes);
    if(sameLocalDay(day,now)){const minimum=new Date(now.getTime()+rule.min_notice_minutes*60000);minimum.setMinutes(Math.ceil(minimum.getMinutes()/SLOT_MINUTES)*SLOT_MINUTES,0,0);if(minimum>start)start=minimum}
    setPublisherQuery('');setQuick({publisher_id:'',presenter_user_id:presenterId,scheduled_start:localInput(start),duration_minutes:rule.default_duration_minutes});
  }
  function changeQuickPresenter(presenterId){const rule=presenterRule(presenterId);const current=quick?.scheduled_start?new Date(quick.scheduled_start):now;setQuick(value=>({...value,presenter_user_id:presenterId,duration_minutes:rule.default_duration_minutes,scheduled_start:localInput(current)}))}
  function continueQuick(){
    if(!quick?.publisher_id){setNotice('Escolha a editora antes de continuar.');return}
    const start=new Date(quick.scheduled_start);if(Number.isNaN(start.getTime())){setNotice('Informe data e horário válidos.');return}
    const params=new URLSearchParams({schedule:'1',presenter:quick.presenter_user_id,start:start.toISOString(),duration:String(quick.duration_minutes||30)});router.push(`/app/editoras/${quick.publisher_id}?${params.toString()}`);
  }

  const publisherChoices=useMemo(()=>{const needle=publisherQuery.trim().toLowerCase();return (needle?publishers.filter(item=>String(item.name||'').toLowerCase().includes(needle)):publishers).slice(0,80)},[publishers,publisherQuery]);
  const quickRule=quick?presenterRule(quick.presenter_user_id):null;

  function eventGeometry(meeting){const start=minuteOfDay(meeting.scheduled_start);const rawEnd=start+Number(meeting.duration_minutes||30);const visibleStart=clamp(start,calendarStartMinute,calendarEndMinute);const visibleEnd=clamp(rawEnd,calendarStartMinute,calendarEndMinute);return{top:(visibleStart-calendarStartMinute)*PX_PER_MINUTE,height:Math.max(24,(visibleEnd-visibleStart)*PX_PER_MINUTE)}}
  function presenterLane(meeting){if(presenterFilter!=='all')return{left:'4px',right:'4px'};const count=Math.max(1,presenterOptions.length);const index=Math.max(0,presenterOptions.findIndex(item=>item.user_id===meeting.presenter_user_id));const width=100/count;return{left:`calc(${index*width}% + 3px)`,width:`calc(${width}% - 6px)`}}
  const periodLabel=viewMode==='today'?fullDate(focusDate):rangeLabel(weekStart,addDays(weekStart,viewDays-1));

  return <div className="page-wrap agenda-v2">
    <header className="agenda-v2-head"><div><div className="eyebrow">Agenda comercial</div><h1>Agenda da equipe</h1><p>Horários, reuniões Radar e indisponibilidades externas na mesma linha do tempo.</p></div><button className="btn secondary" type="button" onClick={refreshAll}><RefreshCw size={15}/> Atualizar</button></header>
    {notice&&<div className="notice-bar"><span>{notice}</span><button type="button" onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="agenda-control card">
      <div className="week-switcher"><button className="icon-btn" type="button" onClick={previousPeriod}><ChevronLeft size={18}/></button><div><small>{viewMode==='today'?'Dia':'Semana'}</small><strong>{periodLabel}</strong></div><button className="icon-btn" type="button" onClick={nextPeriod}><ChevronRight size={18}/></button></div>
      <div className="agenda-control-filters">
        <div className="mode-toggle"><button type="button" className={viewMode==='today'?'active':''} onClick={showToday}>Hoje</button><button type="button" className={viewMode==='week'?'active':''} onClick={showWeek}>Semana</button></div>
        <select value={presenterFilter} onChange={e=>setPresenterFilter(e.target.value)}><option value="all">Toda a equipe</option>{presenterOptions.map(member=><option key={member.user_id} value={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select>
        {viewMode==='week'&&<div className="day-toggle"><button type="button" className={viewDays===5?'active':''} onClick={()=>setViewDays(5)}>5 dias</button><button type="button" className={viewDays===7?'active':''} onClick={()=>setViewDays(7)}>7 dias</button></div>}
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="active">Agendadas</option><option value="all">Todos os status</option>{Object.entries(MEETING_STATUS_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
        <div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar reunião, editora ou participante"/></div>
        {canSchedule&&<button className="btn small" type="button" onClick={()=>openQuick(viewMode==='today'?focusDate:new Date())}><Plus size={14}/> Reunião</button>}
      </div>
    </section>

    <div className="agenda-status-line"><span><strong>{scheduledCount}</strong> agendada{scheduledCount===1?'':'s'} · <strong>{todayCount}</strong> hoje · <strong>{completedCount}</strong> realizada{completedCount===1?'':'s'} na semana</span><span className={calendarLoading?'syncing':''}>{calendarLoading&&<RefreshCw size={11}/>} {calendarMessage}</span></div>
    {selectedRule&&<div className="agenda-rule-line"><Clock3 size={12}/>{ruleSummary(selectedRule)}</div>}

    {loading?<section className="card table-empty">Carregando agenda…</section>:<section className={`calendar-shell card ${viewMode==='today'?'today-mode':''}`}>
      <div className="calendar-header" style={{gridTemplateColumns:`58px repeat(${columnCount},minmax(${viewMode==='today'?420:150}px,1fr))`}}><div></div>{visibleDays.map(day=><button type="button" key={dayKey(day)} className={`day-heading ${sameLocalDay(day,now)?'today':''}`} onClick={()=>openQuick(day)} disabled={!canSchedule}><span>{DAY_NAMES[day.getDay()]}</span><strong>{shortDate(day)}</strong>{sameLocalDay(day,now)&&<small>Hoje</small>}</button>)}</div>
      <div className="calendar-scroll" ref={scrollRef}>
        <div className="calendar-grid" style={{gridTemplateColumns:`58px repeat(${columnCount},minmax(${viewMode==='today'?420:150}px,1fr))`,height:calendarHeight,minWidth:viewMode==='today'?560:860}}>
          <div className="time-gutter">{hourMarks.slice(0,-1).map(minutes=><span key={minutes} style={{top:(minutes-calendarStartMinute)*PX_PER_MINUTE-7}}>{String(Math.floor(minutes/60)).padStart(2,'0')}:00</span>)}</div>
          {visibleDays.map(day=>{
            const key=dayKey(day);const rows=meetingsByDay[key]||[];const busyRows=presenterFilter==='all'?[]:(busyByDay[key]||[]);const rule=selectedRule;const allowed=!rule||rule.active_days.includes(day.getDay());const breakStart=rule?.break_start?timeToMinutes(rule.break_start):null;const breakEnd=rule?.break_end?timeToMinutes(rule.break_end):null;const workStart=rule?timeToMinutes(rule.work_start):null;const workEnd=rule?timeToMinutes(rule.work_end):null;
            return <div className={`day-column ${allowed?'':'disabled-day'}`} key={key}>
              {hourMarks.slice(0,-1).map(minutes=><div className="hour-line" key={minutes} style={{top:(minutes-calendarStartMinute)*PX_PER_MINUTE}}/>)}
              {slotMarks.map(minutes=><button aria-label={`Agendar ${DAY_NAMES[day.getDay()]} ${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`} className="slot-button" type="button" key={minutes} disabled={!slotAllowed(day,minutes)} onClick={()=>openQuick(day,minutes)} style={{top:(minutes-calendarStartMinute)*PX_PER_MINUTE,height:SLOT_MINUTES*PX_PER_MINUTE}}/>)}
              {rule&&allowed&&workStart>calendarStartMinute&&<div className="off-hours" style={{top:0,height:(workStart-calendarStartMinute)*PX_PER_MINUTE}}/>}
              {rule&&allowed&&workEnd<calendarEndMinute&&<div className="off-hours" style={{top:(workEnd-calendarStartMinute)*PX_PER_MINUTE,height:(calendarEndMinute-workEnd)*PX_PER_MINUTE}}/>}
              {rule&&allowed&&breakStart!=null&&breakEnd!=null&&breakEnd>calendarStartMinute&&breakStart<calendarEndMinute&&<div className="break-block" style={{top:(clamp(breakStart,calendarStartMinute,calendarEndMinute)-calendarStartMinute)*PX_PER_MINUTE,height:(clamp(breakEnd,calendarStartMinute,calendarEndMinute)-clamp(breakStart,calendarStartMinute,calendarEndMinute))*PX_PER_MINUTE}}><span>Intervalo</span></div>}
              {busyRows.map((block,index)=>{const start=minuteOfDay(block.start),end=minuteOfDay(block.end);const top=(clamp(start,calendarStartMinute,calendarEndMinute)-calendarStartMinute)*PX_PER_MINUTE;const height=Math.max(20,(clamp(end,calendarStartMinute,calendarEndMinute)-clamp(start,calendarStartMinute,calendarEndMinute))*PX_PER_MINUTE);return <div className="external-busy-block" key={`${block.start}-${index}`} style={{top,height}}><LockKeyhole size={11}/><span>Indisponível</span><small>{timeLabel(block.start)}–{timeLabel(block.end)}</small></div>})}
              {rows.map(meeting=>{const geo=eventGeometry(meeting);const lane=presenterLane(meeting);const people=participantMap[meeting.id]||[];const presenter=teamMap[meeting.presenter_user_id];return <button type="button" className={`calendar-event ${meeting.status}`} key={meeting.id} style={{top:geo.top,height:geo.height,...lane}} onClick={()=>router.push(`/app/editoras/${meeting.publisher_id}`)}><div><strong>{timeLabel(meeting.scheduled_start)}</strong><span className={`badge ${statusClass(meeting.status)}`}>{MEETING_STATUS_LABELS[meeting.status]||meeting.status}</span></div><b>{meeting.publishers?.name||meeting.title}</b><small>{MEETING_TYPE_LABELS[meeting.meeting_type]||meeting.meeting_type}{presenterFilter==='all'?` · ${presenter?.full_name||presenter?.email||'Equipe'}`:''}</small>{people.length>0&&geo.height>=50&&<em><UsersRound size={10}/>{people.slice(0,2).map(item=>item.full_name).join(', ')}{people.length>2?` +${people.length-2}`:''}</em>}</button>})}
              {sameLocalDay(day,now)&&minuteOfDay(now)>=calendarStartMinute&&minuteOfDay(now)<=calendarEndMinute&&<div className="now-line" style={{top:(minuteOfDay(now)-calendarStartMinute)*PX_PER_MINUTE}}><i/><span>{timeLabel(now)}</span></div>}
              {!allowed&&<div className="disabled-overlay"><span>Fora da disponibilidade</span></div>}
            </div>
          })}
        </div>
      </div>
    </section>}

    {quick&&<div className="modal-backdrop"><div className="modal quick-agenda-modal"><div className="modal-head"><div><h3>Agendar reunião</h3><p>Defina o contexto e continue para a ficha da editora, onde participantes e materiais serão confirmados.</p></div><button type="button" onClick={()=>setQuick(null)}><X/></button></div><div className="form-grid">
      <label className="span-2">Editora<div className="search-box quick-publisher-search"><Search size={14}/><input value={publisherQuery} onChange={e=>setPublisherQuery(e.target.value)} placeholder="Buscar editora"/></div><select size={Math.min(6,Math.max(3,publisherChoices.length))} value={quick.publisher_id} onChange={e=>setQuick(x=>({...x,publisher_id:e.target.value}))}>{publisherChoices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Apresentador<select value={quick.presenter_user_id} onChange={e=>changeQuickPresenter(e.target.value)}>{presenterOptions.map(member=><option key={member.user_id} value={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select></label>
      <label>Duração<select value={quick.duration_minutes} onChange={e=>setQuick(x=>({...x,duration_minutes:Number(e.target.value)}))}><option value={20}>20 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hora</option><option value={90}>1h30</option></select></label>
      <label className="span-2">Data e horário<input className="input" type="datetime-local" value={quick.scheduled_start} onChange={e=>setQuick(x=>({...x,scheduled_start:e.target.value}))}/></label>
      {quickRule&&<div className="span-2 quick-rule"><Clock3 size={13}/><span>{ruleSummary(quickRule)}</span></div>}
    </div><div className="modal-actions"><button className="btn secondary" type="button" onClick={()=>setQuick(null)}>Cancelar</button><button className="btn" type="button" onClick={continueQuick}>Continuar para a editora</button></div></div></div>}

    <style jsx>{`
      .agenda-v2{max-width:none}.agenda-v2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:14px}.agenda-v2-head h1{margin:4px 0 5px}.agenda-v2-head p{margin:0;color:#667085}.agenda-control{position:sticky;top:0;z-index:15;padding:10px 12px;margin-bottom:7px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(255,255,255,.96);backdrop-filter:blur(9px)}.week-switcher{display:flex;align-items:center;gap:6px;white-space:nowrap}.week-switcher>div{display:grid;text-align:center;min-width:155px}.week-switcher small{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#98a2b3;font-weight:800}.week-switcher strong{font-size:11px;color:#344054;text-transform:capitalize}.agenda-control-filters{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}.agenda-control-filters select{min-width:140px}.agenda-control-filters .search-box{min-width:230px}.day-toggle,.mode-toggle{display:flex;background:#f2f4f7;border-radius:8px;padding:2px}.day-toggle button,.mode-toggle button{border:0;background:transparent;padding:6px 8px;border-radius:6px;font-size:10px;font-weight:700;color:#667085;cursor:pointer}.day-toggle button.active,.mode-toggle button.active{background:white;color:#101828;box-shadow:0 1px 2px rgba(16,24,40,.08)}.agenda-status-line,.agenda-rule-line{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10px;color:#667085;padding:0 3px 8px}.agenda-status-line strong{color:#344054}.agenda-status-line span:last-child{display:flex;align-items:center;gap:4px}.agenda-status-line .syncing svg{animation:spin 1s linear infinite}.agenda-rule-line{justify-content:flex-start;padding-top:0}@keyframes spin{to{transform:rotate(360deg)}}
      .calendar-shell{padding:0;overflow:hidden}.calendar-header{display:grid;border-bottom:1px solid #e4e7ec;background:#fcfcfd;position:sticky;top:55px;z-index:10}.day-heading{border:0;border-left:1px solid #eaecf0;background:transparent;padding:9px 8px;display:flex;align-items:baseline;justify-content:center;gap:6px;cursor:pointer;color:#667085}.day-heading:hover{background:#f9fafb}.day-heading span{font-size:10px;font-weight:700}.day-heading strong{font-size:11px;color:#344054}.day-heading small{font-size:8px;text-transform:uppercase;background:#eef4ff;color:#3538cd;border-radius:999px;padding:2px 5px}.day-heading.today{background:#f8f9fc}.calendar-scroll{overflow:auto;max-height:calc(100vh - 255px);min-height:520px;scroll-behavior:smooth}.calendar-grid{display:grid;position:relative}.time-gutter{position:relative;border-right:1px solid #eaecf0;background:#fcfcfd}.time-gutter span{position:absolute;right:8px;font-size:9px;color:#98a2b3}.day-column{position:relative;border-right:1px solid #eaecf0;background:#fff;overflow:hidden}.day-column:last-child{border-right:0}.hour-line{position:absolute;left:0;right:0;border-top:1px solid #f0f1f3;pointer-events:none}.slot-button{position:absolute;left:0;right:0;border:0;border-top:1px dotted rgba(234,236,240,.55);background:transparent;cursor:pointer;z-index:1}.slot-button:not(:disabled):hover{background:rgba(242,244,247,.62)}.slot-button:disabled{cursor:default}.off-hours{position:absolute;left:0;right:0;background:rgba(249,250,251,.78);z-index:2;pointer-events:none}.break-block{position:absolute;left:0;right:0;background:repeating-linear-gradient(135deg,#f9fafb,#f9fafb 6px,#f2f4f7 6px,#f2f4f7 12px);border-top:1px dashed #d0d5dd;border-bottom:1px dashed #d0d5dd;z-index:3;display:grid;place-items:center;pointer-events:none}.break-block span{font-size:8px;text-transform:uppercase;color:#98a2b3;font-weight:800}.external-busy-block{position:absolute;left:4px;right:4px;border:1px dashed #cfd4dc;background:rgba(249,250,251,.96);border-radius:7px;padding:5px 6px;z-index:4;color:#667085;display:grid;align-content:start;gap:2px;overflow:hidden}.external-busy-block>span{font-size:9px;font-weight:800}.external-busy-block small{font-size:8px}.calendar-event{position:absolute;border:1px solid #c7d7fe;background:#eef4ff;border-radius:8px;padding:5px 6px;text-align:left;z-index:5;cursor:pointer;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.08);color:#344054}.calendar-event:hover{filter:brightness(.98);box-shadow:0 2px 5px rgba(16,24,40,.12)}.calendar-event.completed{background:#ecfdf3;border-color:#abefc6}.calendar-event.cancelled,.calendar-event.no_show{background:#f9fafb;border-color:#d0d5dd;opacity:.72}.calendar-event>div{display:flex;align-items:center;gap:5px}.calendar-event>div strong{font-size:9px}.calendar-event :global(.badge){font-size:7px;padding:1px 4px;margin-left:auto}.calendar-event>b{display:block;font-size:10px;line-height:1.2;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calendar-event>small{display:block;font-size:8px;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.calendar-event>em{display:flex;align-items:center;gap:3px;font-style:normal;font-size:8px;color:#667085;margin-top:4px;white-space:nowrap;overflow:hidden}.now-line{position:absolute;left:0;right:0;border-top:1px solid #d92d20;z-index:8;pointer-events:none}.now-line i{position:absolute;width:7px;height:7px;border-radius:50%;background:#d92d20;left:-3px;top:-4px}.now-line span{position:absolute;right:4px;top:-9px;font-size:8px;font-weight:800;color:#d92d20;background:#fff;padding:0 3px}.disabled-day{background:#f9fafb}.disabled-overlay{position:absolute;inset:0;background:rgba(249,250,251,.54);z-index:7;display:grid;place-items:start center;pointer-events:none}.disabled-overlay span{margin-top:12px;font-size:8px;text-transform:uppercase;color:#98a2b3;font-weight:800}.quick-agenda-modal{max-width:620px}.quick-rule{display:flex;gap:6px;align-items:flex-start;background:#f2f4f7;border-radius:8px;padding:9px;font-size:10px;color:#475467}.quick-publisher-search{margin-bottom:6px}
      @media(max-width:1150px){.agenda-control{align-items:flex-start;flex-direction:column}.agenda-control-filters{justify-content:flex-start;width:100%}.agenda-control-filters .search-box{flex:1}.calendar-scroll{max-height:calc(100vh - 315px)}}@media(max-width:700px){.agenda-v2-head{align-items:flex-start;flex-direction:column}.agenda-control-filters{display:grid;grid-template-columns:1fr 1fr}.agenda-control-filters .search-box,.agenda-control-filters>select,.agenda-control-filters>.btn{grid-column:span 2;width:100%;min-width:0}.week-switcher{width:100%;justify-content:space-between}.agenda-status-line{align-items:flex-start;flex-direction:column}.calendar-header,.calendar-grid{min-width:560px!important}.mode-toggle,.day-toggle{justify-content:center}}
    `}</style>
  </div>;
}
