'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Bell, CalendarClock, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, FileText, UserRoundCheck, X } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useCrm } from '@/components/CrmProvider';
import { formatDate, timeAgo } from '@/lib/constants';

const PAGE_SIZE=30;

const TYPE_META={
  mention:{label:'Menção',icon:AtSign},
  responsibility_assigned:{label:'Responsabilidade',icon:UserRoundCheck},
  responsibility_transferred:{label:'Responsabilidade',icon:UserRoundCheck},
  meeting_assigned:{label:'Reunião',icon:CalendarClock},
  meeting_rescheduled:{label:'Reunião',icon:CalendarClock},
  meeting_cancelled:{label:'Reunião',icon:CalendarClock},
  task_assigned:{label:'Tarefa',icon:ClipboardList},
  followup_assigned:{label:'Follow-up',icon:ClipboardList},
  material_assigned:{label:'Material',icon:FileText},
  task_overdue:{label:'Tarefa',icon:ClipboardList},
  task_due:{label:'Tarefa',icon:ClipboardList},
  publisher_followup:{label:'Próxima ação',icon:Bell}
};

function pages(current,total){
  if(total<=7)return Array.from({length:total},(_,i)=>i+1);
  const nums=[1,total,current-1,current,current+1].filter(n=>n>=1&&n<=total);
  const uniq=[...new Set(nums)].sort((a,b)=>a-b);
  const out=[];
  uniq.forEach((n,i)=>{if(i&&n-uniq[i-1]>1)out.push('…'+i);out.push(n)});
  return out;
}

export default function NotificationsPage(){
  const router=useRouter();
  const {supabase,membership,user,teamMap,activityVersion}=useCrm();
  const org=membership?.organization_id;
  const [rows,setRows]=useState([]);
  const [status,setStatus]=useState('unread');
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [unread,setUnread]=useState(0);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');

  async function load(){
    if(!org||!user?.id)return;
    setLoading(true);
    setNotice('');
    const {error:refreshError}=await supabase.rpc('crm_refresh_notifications',{p_organization_id:org});
    if(refreshError)setNotice(refreshError.message);

    let query=supabase.from('notifications')
      .select('id,user_id,type,severity,title,body,href,source_type,source_id,actor_user_id,metadata,read_at,created_at',{count:'exact'})
      .eq('organization_id',org)
      .eq('user_id',user.id)
      .is('resolved_at',null);
    if(status==='unread')query=query.is('read_at',null);
    const from=(page-1)*PAGE_SIZE;
    const [{data,error,count},{count:unreadCount,error:unreadError}]=await Promise.all([
      query.order('created_at',{ascending:false}).range(from,from+PAGE_SIZE-1),
      supabase.from('notifications').select('id',{count:'exact',head:true})
        .eq('organization_id',org).eq('user_id',user.id).is('resolved_at',null).is('read_at',null)
    ]);
    if(error||unreadError){
      setNotice(error?.message||unreadError?.message||'Não foi possível carregar as notificações.');
      setRows([]);setTotal(0);
    }else{
      const nextTotal=Number(count||0);
      const maxPage=Math.max(1,Math.ceil(nextTotal/PAGE_SIZE));
      if(page>maxPage){setPage(maxPage);setLoading(false);return}
      setRows(data||[]);
      setTotal(nextTotal);
      setUnread(Number(unreadCount||0));
    }
    setLoading(false);
  }

  useEffect(()=>{load()},[org,user?.id,status,page,activityVersion]);

  async function markRead(id){
    const now=new Date().toISOString();
    const {error}=await supabase.from('notifications')
      .update({read_at:now,updated_at:now})
      .eq('organization_id',org).eq('user_id',user.id).eq('id',id);
    if(error){setNotice(error.message);return false}
    window.dispatchEvent(new Event('crm-notifications-changed'));
    return true;
  }

  async function openNotification(item){
    if(!item.read_at)await markRead(item.id);
    if(item.href)router.push(item.href);
    else load();
  }

  async function markAll(){
    const now=new Date().toISOString();
    const {error}=await supabase.from('notifications')
      .update({read_at:now,updated_at:now})
      .eq('organization_id',org).eq('user_id',user.id).is('resolved_at',null).is('read_at',null);
    if(error)setNotice(error.message);
    else{
      window.dispatchEvent(new Event('crm-notifications-changed'));
      setUnread(0);load();
    }
  }

  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const first=total?((page-1)*PAGE_SIZE)+1:0;
  const last=Math.min(page*PAGE_SIZE,total);
  const actorFor=item=>teamMap[item.actor_user_id]||{full_name:item.actor_user_id?'Pessoa da equipe':'Sistema'};

  return <div className="page-wrap">
    <div className="page-head">
      <div><div className="eyebrow">Caixa de entrada</div><h1>Notificações</h1><p>Menções, reuniões, transferências de responsabilidade, tarefas, follow-ups e materiais que pedem sua atenção.</p></div>
      {unread>0&&<button className="btn secondary" type="button" onClick={markAll}><CheckCheck size={15}/> Marcar todas como lidas</button>}
    </div>

    {notice&&<div className="notice-bar"><span>{notice}</span><button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={15}/></button></div>}

    <div className="toolbar notification-toolbar">
      <div className="chips">
        <button className={'chip '+(status==='unread'?'active':'')} onClick={()=>{setPage(1);setStatus('unread')}}>Não lidas {unread>0&&<b>{unread}</b>}</button>
        <button className={'chip '+(status==='all'?'active':'')} onClick={()=>{setPage(1);setStatus('all')}}>Todas</button>
      </div>
      <span className="notification-count">{total.toLocaleString('pt-BR')} nesta visão</span>
    </div>

    <section className="card panel notification-panel" aria-busy={loading}>
      {loading?<div className="table-empty">Carregando notificações…</div>:rows.length?<div className="notification-list">{rows.map(item=>{
        const meta=TYPE_META[item.type]||{label:'Notificação',icon:Bell};
        const Icon=meta.icon;
        const actor=actorFor(item);
        return <button key={item.id} type="button" className={'notification-row '+(!item.read_at?'unread':'')} onClick={()=>openNotification(item)}>
          <div className="notification-icon"><Icon size={18}/></div>
          <Avatar member={actor} size={34}/>
          <div className="notification-main">
            <div className="notification-title-line"><strong>{item.title}</strong><span className="badge">{meta.label}</span>{!item.read_at&&<i aria-label="Não lida"/>}</div>
            {item.body&&<p>{item.body}</p>}
            <small>{actor.full_name||actor.email||'Sistema'} · {timeAgo(item.created_at)} · {formatDate(item.created_at,true)}</small>
          </div>
        </button>;
      })}</div>:<div className="empty-state"><Bell/><strong>{status==='unread'?'Nenhuma notificação não lida.':'Nenhuma notificação nesta visão.'}</strong><p>Quando alguém mencionar você ou atribuir uma ação, ela aparecerá aqui.</p></div>}

      {!loading&&total>0&&<div className="notification-pagination">
        <span><strong>{first.toLocaleString('pt-BR')}–{last.toLocaleString('pt-BR')}</strong> de {total.toLocaleString('pt-BR')}</span>
        <div className="notification-page-buttons">
          <button className="icon-btn" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} aria-label="Página anterior"><ChevronLeft size={16}/></button>
          {pages(page,totalPages).map(item=>typeof item==='number'?<button key={item} className={'notification-page-number '+(item===page?'active':'')} onClick={()=>setPage(item)} aria-current={item===page?'page':undefined}>{item}</button>:<span className="notification-page-ellipsis" key={item}>…</span>)}
          <button className="icon-btn" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} aria-label="Próxima página"><ChevronRight size={16}/></button>
        </div>
        <small>Página {page} de {totalPages}</small>
      </div>}
    </section>
  </div>;
}
