'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, RefreshCw, Search, UsersRound, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from '@/lib/constants';

const DAY_NAMES=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function startOfWeek(value){
  const d=new Date(value);
  d.setHours(0,0,0,0);
  const offset=(d.getDay()+6)%7;
  d.setDate(d.getDate()-offset);
  return d;
}
function addDays(value,amount){const d=new Date(value);d.setDate(d.getDate()+amount);return d}
function sameLocalDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function dayKey(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dayLabel(value){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(value)}
function longRange(start,end){const fmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'});return `${fmt.format(start)} — ${fmt.format(end)}`}
function timeLabel(value){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
function statusClass(status){if(status==='scheduled')return 'blue';if(status==='completed')return 'green';if(status==='cancelled')return 'red';if(status==='no_show')return 'amber';return ''}

export default function AgendaPage(){
  const {supabase,membership,user,team,teamMap,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [weekStart,setWeekStart]=useState(()=>startOfWeek(new Date()));
  const [meetings,setMeetings]=useState([]);
  const [participants,setParticipants]=useState([]);
  const [presenterFilter,setPresenterFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('active');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');

  const weekEnd=useMemo(()=>addDays(weekStart,7),[weekStart]);
  const days=useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);

  async function load(){
    if(!org)return;
    setLoading(true);setNotice('');
    const {data,error}=await supabase.from('meetings')
      .select('id,publisher_id,title,meeting_type,scheduled_start,duration_minutes,status,scheduled_by,presenter_user_id,notes,outcome_notes,created_at,publishers(name)')
      .eq('organization_id',org)
      .gte('scheduled_start',weekStart.toISOString())
      .lt('scheduled_start',weekEnd.toISOString())
      .order('scheduled_start',{ascending:true});
    if(error){setNotice(error.message);setMeetings([]);setParticipants([]);setLoading(false);return}
    const rows=data||[];setMeetings(rows);
    if(rows.length){
      const {data:people,error:peopleError}=await supabase.from('meeting_participants')
        .select('meeting_id,full_name,email,job_title')
        .eq('organization_id',org)
        .in('meeting_id',rows.map(row=>row.id))
        .order('created_at',{ascending:true});
      if(peopleError)setNotice(peopleError.message);
      setParticipants(people||[]);
    }else setParticipants([]);
    setLoading(false);
  }

  useEffect(()=>{load()},[org,weekStart.getTime(),activityVersion]);

  const participantMap=useMemo(()=>{
    const out={};
    for(const person of participants){(out[person.meeting_id]||(out[person.meeting_id]=[])).push(person)}
    return out;
  },[participants]);

  const presenterOptions=useMemo(()=>{
    const ids=new Set(meetings.map(m=>m.presenter_user_id));
    return team.filter(member=>member.active&&((member.commercial_functions||[]).includes('commercial_presentation')||ids.has(member.user_id)));
  },[team,meetings]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return meetings.filter(meeting=>{
      if(presenterFilter!=='all'&&meeting.presenter_user_id!==presenterFilter)return false;
      if(statusFilter==='active'&&meeting.status!=='scheduled')return false;
      if(statusFilter!=='all'&&statusFilter!=='active'&&meeting.status!==statusFilter)return false;
      if(!needle)return true;
      const people=(participantMap[meeting.id]||[]).map(p=>`${p.full_name} ${p.email||''}`).join(' ');
      const hay=`${meeting.title} ${meeting.publishers?.name||''} ${teamMap[meeting.presenter_user_id]?.full_name||teamMap[meeting.presenter_user_id]?.email||''} ${people}`.toLowerCase();
      return hay.includes(needle);
    });
  },[meetings,presenterFilter,statusFilter,query,participantMap,teamMap]);

  const grouped=useMemo(()=>{
    const map=Object.fromEntries(days.map(day=>[dayKey(day),[]]));
    for(const meeting of filtered){const key=dayKey(meeting.scheduled_start);if(map[key])map[key].push(meeting)}
    return map;
  },[filtered,days]);

  const today=new Date();
  const todayCount=meetings.filter(m=>sameLocalDay(new Date(m.scheduled_start),today)&&m.status==='scheduled').length;
  const scheduledCount=meetings.filter(m=>m.status==='scheduled').length;
  const completedCount=meetings.filter(m=>m.status==='completed').length;
  const presentersCount=new Set(meetings.filter(m=>m.status!=='cancelled').map(m=>m.presenter_user_id)).size;

  function previousWeek(){setWeekStart(current=>addDays(current,-7))}
  function nextWeek(){setWeekStart(current=>addDays(current,7))}
  function currentWeek(){setWeekStart(startOfWeek(new Date()))}

  return <div className="page-wrap agenda-page">
    <div className="page-head">
      <div><div className="eyebrow">Agenda comercial</div><h1>Reuniões da equipe</h1><p>Visão semanal das apresentações e reuniões vinculadas às editoras. O agendamento continua sendo feito na ficha da editora.</p></div>
      <button className="btn secondary" type="button" onClick={load}><RefreshCw size={15}/> Atualizar</button>
    </div>
    {notice&&<div className="notice-bar"><span>{notice}</span><button type="button" onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <section className="agenda-summary-grid">
      <article className="card agenda-summary"><small>Agendadas na semana</small><strong>{scheduledCount}</strong><span>reunião{scheduledCount===1?'':'ões'} futura{scheduledCount===1?'':'s'}</span></article>
      <article className="card agenda-summary"><small>Hoje</small><strong>{todayCount}</strong><span>compromisso{todayCount===1?'':'s'} agendado{todayCount===1?'':'s'}</span></article>
      <article className="card agenda-summary"><small>Realizadas</small><strong>{completedCount}</strong><span>nesta semana</span></article>
      <article className="card agenda-summary"><small>Apresentadores</small><strong>{presentersCount}</strong><span>com reunião na semana</span></article>
    </section>

    <section className="card panel agenda-toolbar-card">
      <div className="agenda-week-nav">
        <button className="icon-btn" type="button" onClick={previousWeek} title="Semana anterior"><ChevronLeft size={18}/></button>
        <div><small>Semana</small><strong>{longRange(weekStart,addDays(weekStart,6))}</strong></div>
        <button className="icon-btn" type="button" onClick={nextWeek} title="Próxima semana"><ChevronRight size={18}/></button>
        <button className="btn secondary small" type="button" onClick={currentWeek}>Hoje</button>
      </div>
      <div className="agenda-filters">
        <div className="search-box"><Search size={16}/><input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar editora, participante ou reunião"/></div>
        <select value={presenterFilter} onChange={e=>setPresenterFilter(e.target.value)} aria-label="Filtrar por apresentador"><option value="all">Todos os apresentadores</option>{presenterOptions.map(member=><option value={member.user_id} key={member.user_id}>{member.full_name||member.email||'Equipe'}</option>)}</select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filtrar por status"><option value="active">Agendadas</option><option value="all">Todos os status</option>{Object.entries(MEETING_STATUS_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select>
      </div>
    </section>

    {loading?<section className="card table-empty">Carregando agenda…</section>:<section className="agenda-week-scroll" aria-label="Agenda semanal"><div className="agenda-week-grid">{days.map((day,index)=>{
      const rows=grouped[dayKey(day)]||[];const isToday=sameLocalDay(day,today);
      return <article className={`agenda-day card ${isToday?'today':''}`} key={dayKey(day)}>
        <header><div><span>{DAY_NAMES[index]}</span><strong>{dayLabel(day)}</strong></div>{isToday&&<b>Hoje</b>}</header>
        <div className="agenda-day-body">{rows.length?rows.map(meeting=>{
          const presenter=teamMap[meeting.presenter_user_id];
          const scheduler=teamMap[meeting.scheduled_by];
          const people=participantMap[meeting.id]||[];
          return <div className={`agenda-meeting ${meeting.status}`} key={meeting.id}>
            <div className="agenda-meeting-time"><Clock3 size={13}/><strong>{timeLabel(meeting.scheduled_start)}</strong><span>{meeting.duration_minutes} min</span></div>
            <div className="agenda-meeting-title"><strong>{meeting.title}</strong><span className={`badge ${statusClass(meeting.status)}`}>{MEETING_STATUS_LABELS[meeting.status]||meeting.status}</span></div>
            <Link href={`/app/editoras/${meeting.publisher_id}`} className="agenda-publisher">{meeting.publishers?.name||'Abrir editora'}</Link>
            <div className="agenda-meeting-meta"><span>{MEETING_TYPE_LABELS[meeting.meeting_type]||meeting.meeting_type}</span><span>Apresentação: <b>{presenter?.full_name||presenter?.email||'Equipe'}</b></span><span>Agendou: {scheduler?.full_name||scheduler?.email||'Equipe'}</span></div>
            {people.length>0&&<div className="agenda-participants"><UsersRound size={13}/><span>{people.slice(0,2).map(p=>p.full_name).join(', ')}{people.length>2?` +${people.length-2}`:''}</span></div>}
          </div>
        }):<div className="agenda-day-empty"><CalendarDays size={18}/><span>Sem reuniões</span></div>}</div>
      </article>
    })}</div></section>}

    {!loading&&filtered.length===0&&meetings.length>0&&<div className="muted" style={{fontSize:12,marginTop:10}}>Nenhuma reunião corresponde aos filtros atuais.</div>}

    <style jsx>{`
      .agenda-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
      .agenda-summary{padding:15px 17px;display:grid;gap:3px}
      .agenda-summary small{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#667085;font-weight:700}
      .agenda-summary strong{font-size:27px;line-height:1.05;color:#101828}
      .agenda-summary span{font-size:11px;color:#667085}
      .agenda-toolbar-card{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:14px}
      .agenda-week-nav{display:flex;align-items:center;gap:8px;min-width:max-content}
      .agenda-week-nav>div{display:grid;gap:1px;min-width:135px;text-align:center}
      .agenda-week-nav small{font-size:9px;text-transform:uppercase;color:#98a2b3;font-weight:700}
      .agenda-week-nav strong{font-size:12px;color:#344054}
      .agenda-filters{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;min-width:0}
      .agenda-filters .search-box{min-width:280px;flex:1}
      .agenda-filters select{min-width:175px}
      .agenda-week-scroll{overflow-x:auto;padding-bottom:5px}
      .agenda-week-grid{display:grid;grid-template-columns:repeat(7,minmax(190px,1fr));gap:9px;min-width:1370px}
      .agenda-day{padding:0;overflow:hidden;min-height:360px}
      .agenda-day.today{outline:2px solid var(--accent,#344054);outline-offset:-2px}
      .agenda-day header{padding:11px 12px;border-bottom:1px solid #eaecf0;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fcfcfd}
      .agenda-day header>div{display:flex;align-items:baseline;gap:6px}
      .agenda-day header span{font-size:11px;color:#667085;font-weight:700}
      .agenda-day header strong{font-size:12px;color:#101828}
      .agenda-day header>b{font-size:9px;text-transform:uppercase;background:#f2f4f7;border-radius:999px;padding:3px 6px;color:#344054}
      .agenda-day-body{padding:8px;display:grid;align-content:start;gap:8px}
      .agenda-day-empty{min-height:110px;display:grid;place-items:center;align-content:center;gap:7px;color:#98a2b3;font-size:11px;text-align:center}
      .agenda-meeting{border:1px solid #eaecf0;border-radius:10px;padding:9px;background:white;display:grid;gap:6px}
      .agenda-meeting.cancelled{opacity:.62}
      .agenda-meeting-time{display:flex;align-items:center;gap:5px;color:#475467;font-size:10px}
      .agenda-meeting-time strong{font-size:11px;color:#101828}
      .agenda-meeting-time span{margin-left:auto;color:#98a2b3}
      .agenda-meeting-title{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}
      .agenda-meeting-title>strong{font-size:11px;line-height:1.35;color:#101828;min-width:0}
      .agenda-meeting-title :global(.badge){font-size:8px;white-space:nowrap;padding:2px 5px}
      .agenda-publisher{font-size:11px;font-weight:700;color:#344054;text-decoration:none;line-height:1.35}
      .agenda-publisher:hover{text-decoration:underline}
      .agenda-meeting-meta{display:grid;gap:2px;font-size:9px;line-height:1.35;color:#667085}
      .agenda-meeting-meta b{color:#475467}
      .agenda-participants{display:flex;align-items:center;gap:5px;font-size:9px;color:#667085;padding-top:5px;border-top:1px solid #f2f4f7}
      @media(max-width:1050px){.agenda-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.agenda-toolbar-card{align-items:flex-start;flex-direction:column}.agenda-filters{width:100%;justify-content:flex-start}.agenda-filters .search-box{min-width:220px}}
      @media(max-width:650px){.agenda-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.agenda-summary{padding:12px}.agenda-summary strong{font-size:23px}.agenda-filters{display:grid;grid-template-columns:1fr}.agenda-filters .search-box,.agenda-filters select{min-width:0;width:100%}.agenda-week-nav{width:100%;justify-content:space-between}.agenda-week-nav>div{min-width:110px}}
    `}</style>
  </div>;
}
