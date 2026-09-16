'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, LockKeyhole, Plus, RefreshCw, Search, UsersRound, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '@/lib/constants';
import { normalizeAvailabilityRule, ruleSummary, timeToMinutes } from '@/lib/meetingAvailability';

const DAY_NAMES=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
function startOfWeek(value){const d=new Date(value);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
function addDays(value,amount){const d=new Date(value);d.setDate(d.getDate()+amount);return d}
function sameLocalDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function dayKey(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dayLabel(value){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(value)}
function longRange(start,end){const fmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'});return `${fmt.format(start)} — ${fmt.format(end)}`}
function timeLabel(value){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
function localInput(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function statusClass(status){if(status==='scheduled')return 'blue';if(status==='completed')return 'green';if(status==='cancelled')return 'red';if(status==='no_show')return 'amber';return ''}
function overlaps(startA,endA,startB,endB){return new Date(startA)<new Date(endB)&&new Date(endA)>new Date(startB)}

export default function AgendaPage(){
  const router=useRouter();
  const {supabase,membership,team,teamMap,activityVersion,isManager,hasCommercialFunction}=useCrm();
  const org=membership?.organization_id;
  const canSchedule=isManager||hasCommercialFunction('meeting_scheduling');
  const [weekStart,setWeekStart]=useState(()=>startOfWeek(new Date()));
  const [meetings,setMeetings]=useState([]);
  const [participants,setParticipants]=useState([]);
  const [presenterFilter,setPresenterFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('active');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [externalBusy,setExternalBusy]=useState([]);
  const [availabilityState,setAvailabilityState]=useState({loading:false,message:''});
  const [rules,setRules]=useState({});
  const [publishers,setPublishers]=useState([]);
  const [quick,setQuick]=useState(null);
  const [publisherQuery,setPublisherQuery]=useState('');

  const weekEnd=useMemo(()=>addDays(weekStart,7),[weekStart]);
  const days=useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);

  async function accessToken(){const {data:{session}}=await supabase.auth.getSession();return session?.access_token||''}
  async function calendarAvailability(presenterUserId){
    const token=await accessToken();if(!token)throw new Error('Sua sessão expirou.');
    const response=await fetch('/api/google-calendar',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action:'availability',presenterUserId,timeMin:weekStart.toISOString(),timeMax:weekEnd.toISOString()}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Não foi possível consultar a disponibilidade.');return data;
  }

  async function loadMeetings(){
    if(!org)return;
    setLoading(true);setNotice('');
    const {data,error}=await supabase.from('meetings')
      .select('id,publisher_id,title,meeting_type,scheduled_start,duration_minutes,status,scheduled_by,presenter_user_id,notes,outcome_notes,calendar_sync_status,google_event_url,google_meet_url,created_at,publishers(name)')
      .eq('organization_id',org).gte('scheduled_start',weekStart.toISOString()).lt('scheduled_start',weekEnd.toISOString()).order('scheduled_start',{ascending:true});
    if(error){setNotice(error.message);setMeetings([]);setParticipants([]);setLoading(false);return}
    const rows=data||[];setMeetings(rows);
    if(rows.length){
      const {data:people,error:peopleError}=await supabase.from('meeting_participants')
        .select('meeting_id,full_name,email,job_title').eq('organization_id',org).in('meeting_id',rows.map(row=>row.id)).order('created_at',{ascending:true});
      if(peopleError)setNotice(peopleError.message);setParticipants(people||[]);
    }else setParticipants([]);
    setLoading(false);
  }

  async function loadRulesAndPublishers(){
    if(!org)return;
    const [ruleResult,publisherResult]=await Promise.all([
      supabase.from('presenter_availability_rules').select('*').eq('organization_id',org),
      supabase.from('publishers').select('id,name,stage').eq('organization_id',org).order('name').limit(1500)
    ]);
    if(ruleResult.error)setNotice(ruleResult.error.message);else setRules(Object.fromEntries((ruleResult.data||[]).map(row=>[row.user_id,normalizeAvailabilityRule(row)])));
    if(publisherResult.error)setNotice(publisherResult.error.message);else setPublishers(publisherResult.data||[]);
  }

  async function loadExternalBusy(presenterId=presenterFilter){
    if(presenterId==='all'){setExternalBusy([]);setAvailabilityState({loading:false,message:'Selecione um apresentador para ver também os bloqueios do Google Agenda.'});return}
    setAvailabilityState({loading:true,message:'Consultando Google Agenda…'});
    try{const data=await calendarAvailability(presenterId);setExternalBusy(data.busy||[]);setAvailabilityState({loading:false,message:data.calendarEmail?`Disponibilidade sincronizada com ${data.calendarEmail}.`:'Disponibilidade Google sincronizada.'})}
    catch(error){setExternalBusy([]);setAvailabilityState({loading:false,message:error.message})}
  }

  useEffect(()=>{loadMeetings()},[org,weekStart.getTime(),activityVersion]);
  useEffect(()=>{loadRulesAndPublishers()},[org,team.length]);

  const participantMap=useMemo(()=>{const out={};for(const person of participants){(out[person.meeting_id]||(out[person.meeting_id]=[])).push(person)}return out},[participants]);
  const presenterOptions=useMemo(()=>{const ids=new Set(meetings.map(m=>m.presenter_user_id));return team.filter(member=>member.active&&((member.commercial_functions||[]).includes('commercial_presentation')||ids.has(member.user_id)))},[team,meetings]);

  useEffect(()=>{if(presenterFilter==='all'&&presenterOptions.length===1)setPresenterFilter(presenterOptions[0].user_id)},[presenterOptions.length]);
  useEffect(()=>{loadExternalBusy(presenterFilter)},[presenterFilter,weekStart.getTime()]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return meetings.filter(meeting=>{
      if(presenterFilter!=='all'&&meeting.presenter_user_id!==presenterFilter)return false;
      if(statusFilter==='active'&&meeting.status!=='scheduled')return false;
      if(statusFilter!=='all'&&statusFilter!=='active'&&meeting.status!==statusFilter)return false;
      if(!needle)return true;
      const people=(participantMap[meeting.id]||[]).map(p=>`${p.full_name} ${p.email||''}`).join(' ');
      return `${meeting.title} ${meeting.publishers?.name||''} ${teamMap[meeting.presenter_user_id]?.full_name||teamMap[meeting.presenter_user_id]?.email||''} ${people}`.toLowerCase().includes(needle);
    });
  },[meetings,presenterFilter,statusFilter,query,participantMap,teamMap]);

  const groupedMeetings=useMemo(()=>{const map=Object.fromEntries(days.map(day=>[dayKey(day),[]]));for(const meeting of filtered){const key=dayKey(meeting.scheduled_start);if(map[key])map[key].push(meeting)}return map},[filtered,days]);
  const rawPresenterMeetings=useMemo(()=>meetings.filter(m=>presenterFilter!=='all'&&m.presenter_user_id===presenterFilter&&m.status!=='cancelled'),[meetings,presenterFilter]);

  const groupedBusy=useMemo(()=>{
    const map=Object.fromEntries(days.map(day=>[dayKey(day),[]]));
    for(const block of externalBusy){
      const start=new Date(block.start),end=new Date(block.end);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))continue;
      for(const day of days){
        const ds=new Date(day);ds.setHours(0,0,0,0);const de=addDays(ds,1);
        if(start<de&&end>ds){
          const clippedStart=start>ds?start:ds;const clippedEnd=end<de?end:de;
          const duplicate=rawPresenterMeetings.some(m=>overlaps(clippedStart,clippedEnd,m.scheduled_start,new Date(new Date(m.scheduled_start).getTime()+m.duration_minutes*60000)));
          if(!duplicate)map[dayKey(day)].push({start:clippedStart.toISOString(),end:clippedEnd.toISOString()});
        }
      }
    }
    return map;
  },[externalBusy,days,rawPresenterMeetings]);

  const today=new Date();
  const todayCount=meetings.filter(m=>sameLocalDay(new Date(m.scheduled_start),today)&&m.status==='scheduled').length;
  const scheduledCount=meetings.filter(m=>m.status==='scheduled').length;
  const completedCount=meetings.filter(m=>m.status==='completed').length;
  const externalCount=externalBusy.length;

  function previousWeek(){setWeekStart(current=>addDays(current,-7))}
  function nextWeek(){setWeekStart(current=>addDays(current,7))}
  function currentWeek(){setWeekStart(startOfWeek(new Date()))}
  async function refreshAll(){await loadMeetings();await loadRulesAndPublishers();await loadExternalBusy()}

  function defaultStartForDay(day,presenterId){
    const rule=normalizeAvailabilityRule(rules[presenterId]);
    const start=new Date(day);const mins=timeToMinutes(rule.work_start);start.setHours(Math.floor(mins/60),mins%60,0,0);
    if(sameLocalDay(start,new Date())&&start<new Date()){
      const now=new Date(Date.now()+rule.min_notice_minutes*60000);now.setMinutes(Math.ceil(now.getMinutes()/30)*30,0,0);
      if(now>start)start.setHours(now.getHours(),now.getMinutes(),0,0);
    }
    return start;
  }

  function openQuick(day){
    if(!canSchedule||!presenterOptions.length)return;
    const presenterId=presenterFilter!=='all'?presenterFilter:presenterOptions[0].user_id;
    const rule=normalizeAvailabilityRule(rules[presenterId]);
    setPublisherQuery('');
    setQuick({publisher_id:'',presenter_user_id:presenterId,scheduled_start:localInput(defaultStartForDay(day,presenterId)),duration_minutes:rule.default_duration_minutes});
  }

  function changeQuickPresenter(presenterId){
    const currentDate=quick?.scheduled_start?new Date(quick.scheduled_start):new Date();
    const rule=normalizeAvailabilityRule(rules[presenterId]);
    setQuick(current=>({...current,presenter_user_id:presenterId,scheduled_start:localInput(defaultStartForDay(currentDate,presenterId)),duration_minutes:rule.default_duration_minutes}));
  }

  function continueQuick(){
    if(!quick?.publisher_id){setNotice('Escolha a editora antes de continuar.');return}
    if(!quick?.presenter_user_id||!quick?.scheduled_start){setNotice('Informe apresentador, data e horário.');return}
    const start=new Date(quick.scheduled_start);if(Number.isNaN(start.getTime())){setNotice('Data e horário inválidos.');return}
    const params=new URLSearchParams({schedule:'1',presenter:quick.presenter_user_id,start:start.toISOString(),duration:String(quick.duration_minutes||30)});
    router.push(`/app/editoras/${quick.publisher_id}?${params.toString()}`);
  }

  const publisherChoices=useMemo(()=>{const needle=publisherQuery.trim().toLowerCase();return (needle?publishers.filter(p=>String(p.name||'').toLowerCase().includes(needle)):publishers).slice(0,80)},[publishers,publisherQuery]);
  const quickRule=quick?normalizeAvailabilityRule(rules[quick.presenter_user_id]):null;

  return <div className="page-wrap agenda-page">
    <div className="page-head"><div><div className="eyebrow">Agenda comercial</div><h1>Reuniões da equipe</h1><p>Reuniões Radar e bloqueios externos do Google Agenda em uma única visão. Compromissos pessoais aparecem somente como “Indisponível”.</p></div><button className="btn secondary" type="button" onClick={refreshAll}><RefreshCw size={15}/> Atualizar</button></div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button type="button" onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="agenda-summary-grid">
      <article className="card agenda-summary"><small>Agendadas na semana</small><strong>{scheduledCount}</strong><span>reuniões Radar</span></article>
      <article className="card agenda-summary"><small>Hoje</small><strong>{todayCount}</strong><span>compromissos Radar</span></article>
      <article className="card agenda-summary"><small>Realizadas</small><strong>{completedCount}</strong><span>nesta semana</span></article>
      <article className="card agenda-summary"><small>Bloqueios Google</small><strong>{presenterFilter==='all'?'—':externalCount}</strong><span>{presenterFilter==='all'?'selecione um apresentador':'blocos externos'}</span></article>
    </section>

    <section className="card panel agenda-toolbar-card">
      <div className="agenda-week-nav"><button className="icon-btn" type="button" onClick={previousWeek}><ChevronLeft size={18}/></button><div><small>Semana</small><strong>{longRange(weekStart,addDays(weekStart,6))}</strong></div><button className="icon-btn" type="button" onClick={nextWeek}><ChevronRight size={18}/></button><button className="btn secondary small" type="button" onClick={currentWeek}>Hoje</button></div>
      <div className="agenda-filters"><div className="search-box"><Search size={16}/><input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar editora, participante ou reunião"/></div><select value={presenterFilter} onChange={e=>setPresenterFilter(e.target.value)}><option value="all">Todos os apresentadores</option>{presenterOptions.map(member=><option value={member.user_id} key={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="active">Agendadas</option><option value="all">Todos os status</option>{Object.entries(MEETING_STATUS_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></div>
    </section>
    <div className={`agenda-sync-note ${availabilityState.loading?'loading':''}`}><span>{availabilityState.loading&&<RefreshCw size={12}/>} {availabilityState.message}</span>{presenterFilter!=='all'&&<span className="privacy-note"><LockKeyhole size={12}/> Google: apenas livre/ocupado</span>}</div>

    {loading?<section className="card table-empty">Carregando agenda…</section>:<section className="agenda-week-scroll"><div className="agenda-week-grid">{days.map((day,index)=>{
      const key=dayKey(day);const rows=groupedMeetings[key]||[];const busyRows=groupedBusy[key]||[];const isToday=sameLocalDay(day,today);
      const activePresenter=presenterFilter!=='all'?presenterFilter:null;const activeRule=activePresenter?normalizeAvailabilityRule(rules[activePresenter]):null;const dayAllowed=!activeRule||activeRule.active_days.includes(day.getDay());
      const items=[...rows.map(meeting=>({kind:'meeting',start:new Date(meeting.scheduled_start),meeting})),...busyRows.map(block=>({kind:'busy',start:new Date(block.start),block}))].sort((a,b)=>a.start-b.start);
      return <article className={`agenda-day card ${isToday?'today':''} ${dayAllowed?'':'rule-disabled'}`} key={key}><header><div><span>{DAY_NAMES[index]}</span><strong>{dayLabel(day)}</strong></div><div className="agenda-day-actions">{isToday&&<b>Hoje</b>}{canSchedule&&<button type="button" className="agenda-add" title="Agendar neste dia" disabled={!dayAllowed} onClick={()=>openQuick(day)}><Plus size={13}/></button>}</div></header><div className="agenda-day-body">{items.length?items.map((item,itemIndex)=>item.kind==='busy'?<div className="agenda-google-busy" key={`busy-${item.block.start}-${itemIndex}`}><div className="agenda-meeting-time"><LockKeyhole size={13}/><strong>{timeLabel(item.block.start)}–{timeLabel(item.block.end)}</strong></div><span>Indisponível</span><small>Google Agenda</small></div>:<MeetingCard key={item.meeting.id} meeting={item.meeting} teamMap={teamMap} participantMap={participantMap}/>):<button type="button" className="agenda-day-empty" disabled={!canSchedule||!dayAllowed} onClick={()=>openQuick(day)}><CalendarDays size={18}/><span>{canSchedule&&dayAllowed?'Clique para agendar':'Sem bloqueios'}</span></button>}</div>{activeRule&&!dayAllowed&&<div className="rule-day-note">Fora dos dias configurados</div>}</article>
    })}</div></section>}

    {quick&&<div className="modal-backdrop"><div className="modal quick-modal"><div className="modal-head"><div><h3>Agendar pela Agenda</h3><p>Escolha a editora e confirme o horário. O CRM abrirá o mesmo agendador usado na ficha da editora.</p></div><button type="button" onClick={()=>setQuick(null)}><X/></button></div><div className="form-grid">
      <label className="span-2">Buscar editora<input className="input" value={publisherQuery} onChange={e=>setPublisherQuery(e.target.value)} placeholder="Digite parte do nome da editora"/></label>
      <label className="span-2">Editora<select value={quick.publisher_id} onChange={e=>setQuick(current=>({...current,publisher_id:e.target.value}))}><option value="">Selecione</option>{publisherChoices.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>Apresentador<select value={quick.presenter_user_id} onChange={e=>changeQuickPresenter(e.target.value)}>{presenterOptions.map(member=><option value={member.user_id} key={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select></label>
      <label>Data e horário<input className="input" type="datetime-local" value={quick.scheduled_start} onChange={e=>setQuick(current=>({...current,scheduled_start:e.target.value}))}/></label>
      <label>Duração<select value={quick.duration_minutes} onChange={e=>setQuick(current=>({...current,duration_minutes:Number(e.target.value)}))}><option value={20}>20 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hora</option><option value={90}>1h30</option></select></label>
      {quickRule&&<div className="span-2 quick-rule"><Clock3 size={14}/><span>{ruleSummary(quickRule)}</span></div>}
    </div><div className="modal-actions"><button className="btn secondary" type="button" onClick={()=>setQuick(null)}>Cancelar</button><button className="btn" type="button" onClick={continueQuick}>Continuar <ArrowRight size={15}/></button></div></div></div>}

    <style jsx>{`
      .agenda-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.agenda-summary{padding:15px 17px;display:grid;gap:3px}.agenda-summary small{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#667085;font-weight:700}.agenda-summary strong{font-size:27px;line-height:1.05;color:#101828}.agenda-summary span{font-size:11px;color:#667085}
      .agenda-toolbar-card{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:8px}.agenda-week-nav{display:flex;align-items:center;gap:8px;min-width:max-content}.agenda-week-nav>div{display:grid;gap:1px;min-width:135px;text-align:center}.agenda-week-nav small{font-size:9px;text-transform:uppercase;color:#98a2b3;font-weight:700}.agenda-week-nav strong{font-size:12px;color:#344054}.agenda-filters{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;min-width:0}.agenda-filters .search-box{min-width:280px;flex:1}.agenda-filters select{min-width:175px}
      .agenda-sync-note{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 2px 10px;font-size:10px;color:#667085}.agenda-sync-note span{display:flex;align-items:center;gap:4px}.privacy-note{white-space:nowrap}.agenda-sync-note.loading svg{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      .agenda-week-scroll{overflow-x:auto;padding-bottom:5px}.agenda-week-grid{display:grid;grid-template-columns:repeat(7,minmax(190px,1fr));gap:9px;min-width:1370px}.agenda-day{padding:0;overflow:hidden;min-height:360px;position:relative}.agenda-day.today{outline:2px solid var(--accent,#344054);outline-offset:-2px}.agenda-day.rule-disabled{opacity:.72}.agenda-day header{padding:11px 12px;border-bottom:1px solid #eaecf0;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fcfcfd}.agenda-day header>div:first-child{display:flex;align-items:baseline;gap:6px}.agenda-day header span{font-size:11px;color:#667085;font-weight:700}.agenda-day header strong{font-size:12px;color:#101828}.agenda-day-actions{display:flex;align-items:center;gap:5px}.agenda-day-actions>b{font-size:9px;text-transform:uppercase;background:#f2f4f7;border-radius:999px;padding:3px 6px;color:#344054}.agenda-add{width:25px;height:25px;border:1px solid #d0d5dd;background:white;border-radius:7px;display:grid;place-items:center;cursor:pointer;color:#344054}.agenda-add:disabled{opacity:.35;cursor:not-allowed}.agenda-day-body{padding:8px;display:grid;align-content:start;gap:8px}.agenda-day-empty{min-height:110px;border:0;background:transparent;display:grid;place-items:center;align-content:center;gap:7px;color:#98a2b3;font-size:11px;text-align:center;cursor:pointer;border-radius:8px}.agenda-day-empty:not(:disabled):hover{background:#f9fafb;color:#475467}.agenda-day-empty:disabled{cursor:default}.rule-day-note{font-size:9px;color:#98a2b3;text-align:center;padding:7px;border-top:1px dashed #eaecf0}
      .agenda-google-busy{border:1px dashed #d0d5dd;background:#f9fafb;border-radius:10px;padding:9px;display:grid;gap:4px;color:#667085}.agenda-google-busy>span{font-size:11px;font-weight:700;color:#475467}.agenda-google-busy>small{font-size:9px;color:#98a2b3}.agenda-meeting-time{display:flex;align-items:center;gap:5px;color:#475467;font-size:10px}.agenda-meeting-time strong{font-size:11px;color:#101828}
      .quick-modal{max-width:620px}.quick-rule{display:flex;align-items:flex-start;gap:7px;background:#f2f4f7;border-radius:8px;padding:9px;font-size:10px;color:#475467}
      @media(max-width:1050px){.agenda-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.agenda-toolbar-card{align-items:flex-start;flex-direction:column}.agenda-filters{width:100%;justify-content:flex-start}.agenda-filters .search-box{min-width:220px}}@media(max-width:650px){.agenda-summary-grid{gap:8px}.agenda-summary{padding:12px}.agenda-summary strong{font-size:23px}.agenda-filters{display:grid;grid-template-columns:1fr}.agenda-filters .search-box,.agenda-filters select{min-width:0;width:100%}.agenda-week-nav{width:100%;justify-content:space-between}.agenda-sync-note{align-items:flex-start;flex-direction:column}}
    `}</style>
  </div>;
}

function MeetingCard({meeting,teamMap,participantMap}){
  const presenter=teamMap[meeting.presenter_user_id];const scheduler=teamMap[meeting.scheduled_by];const people=participantMap[meeting.id]||[];
  return <div className={`agenda-meeting ${meeting.status}`}><div className="agenda-meeting-time"><Clock3 size={13}/><strong>{timeLabel(meeting.scheduled_start)}</strong><span>{meeting.duration_minutes} min</span></div><div className="agenda-meeting-title"><strong>{meeting.title}</strong><span className={`badge ${statusClass(meeting.status)}`}>{MEETING_STATUS_LABELS[meeting.status]||meeting.status}</span></div><Link href={`/app/editoras/${meeting.publisher_id}`} className="agenda-publisher">{meeting.publishers?.name||'Abrir editora'}</Link><div className="agenda-meeting-meta"><span>{MEETING_TYPE_LABELS[meeting.meeting_type]||meeting.meeting_type}</span><span>Apresentação: <b>{presenter?.full_name||presenter?.email||'Equipe'}</b></span><span>Agendou: {scheduler?.full_name||scheduler?.email||'Equipe'}</span>{meeting.calendar_sync_status==='synced'&&<span>Google: sincronizado</span>}{meeting.calendar_sync_status==='error'&&<span>Google: erro de sincronização</span>}</div>{people.length>0&&<div className="agenda-participants"><UsersRound size={13}/><span>{people.slice(0,2).map(p=>p.full_name).join(', ')}{people.length>2?` +${people.length-2}`:''}</span></div>}<style jsx>{`.agenda-meeting{border:1px solid #eaecf0;border-radius:10px;padding:9px;background:white;display:grid;gap:6px}.agenda-meeting.cancelled{opacity:.62}.agenda-meeting-time{display:flex;align-items:center;gap:5px;color:#475467;font-size:10px}.agenda-meeting-time strong{font-size:11px;color:#101828}.agenda-meeting-time span{margin-left:auto;color:#98a2b3}.agenda-meeting-title{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}.agenda-meeting-title>strong{font-size:11px;line-height:1.35;color:#101828}.agenda-meeting-title :global(.badge){font-size:8px;white-space:nowrap;padding:2px 5px}.agenda-publisher{font-size:11px;font-weight:700;color:#344054;text-decoration:none;line-height:1.35}.agenda-publisher:hover{text-decoration:underline}.agenda-meeting-meta{display:grid;gap:2px;font-size:9px;line-height:1.35;color:#667085}.agenda-meeting-meta b{color:#475467}.agenda-participants{display:flex;align-items:center;gap:5px;font-size:9px;color:#667085;padding-top:5px;border-top:1px solid #f2f4f7}`}</style></div>;
}
