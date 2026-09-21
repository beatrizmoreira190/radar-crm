'use client';

import { useMemo, useRef, useState } from 'react';
import { AtSign } from 'lucide-react';

function memberLabel(member){
  return member?.full_name||member?.email||'Pessoa da equipe';
}

export default function MentionTextarea({
  value='',
  onChange,
  team=[],
  mentions=[],
  onMentionsChange,
  rows=4,
  placeholder='',
  required=false,
  disabled=false,
  className=''
}){
  const ref=useRef(null);
  const [mentionState,setMentionState]=useState(null);
  const [activeIndex,setActiveIndex]=useState(0);

  const activeTeam=useMemo(()=>team.filter(member=>member.active),[team]);
  const suggestions=useMemo(()=>{
    if(!mentionState)return[];
    const q=mentionState.query.toLowerCase();
    return activeTeam
      .filter(member=>{
        const text=[member.full_name,member.email].filter(Boolean).join(' ').toLowerCase();
        return !q||text.includes(q);
      })
      .slice(0,6);
  },[activeTeam,mentionState]);

  function syncMentions(nextText,currentMentions=mentions){
    if(!onMentionsChange)return;
    const kept=(currentMentions||[]).filter(id=>{
      const member=activeTeam.find(item=>item.user_id===id);
      return member&&nextText.includes('@'+memberLabel(member));
    });
    if(kept.length!==(currentMentions||[]).length)onMentionsChange(kept);
  }

  function inspect(nextText,caret){
    const before=nextText.slice(0,caret);
    const match=before.match(/@([^@\n]{0,40})$/);
    if(!match){setMentionState(null);return}
    setMentionState({
      start:caret-match[0].length,
      end:caret,
      query:match[1].trim()
    });
    setActiveIndex(0);
  }

  function handleChange(event){
    const next=event.target.value;
    const caret=event.target.selectionStart??next.length;
    onChange?.(next);
    syncMentions(next);
    inspect(next,caret);
  }

  function choose(member){
    if(!mentionState)return;
    const label=memberLabel(member);
    const next=value.slice(0,mentionState.start)+'@'+label+' '+value.slice(mentionState.end);
    const nextMentions=[...new Set([...(mentions||[]),member.user_id])];
    onChange?.(next);
    onMentionsChange?.(nextMentions);
    setMentionState(null);
    requestAnimationFrame(()=>{
      const position=mentionState.start+label.length+2;
      ref.current?.focus();
      ref.current?.setSelectionRange(position,position);
    });
  }

  function keyDown(event){
    if(!mentionState||!suggestions.length)return;
    if(event.key==='ArrowDown'){
      event.preventDefault();
      setActiveIndex(index=>(index+1)%suggestions.length);
    }else if(event.key==='ArrowUp'){
      event.preventDefault();
      setActiveIndex(index=>(index-1+suggestions.length)%suggestions.length);
    }else if(event.key==='Enter'){
      event.preventDefault();
      choose(suggestions[activeIndex]||suggestions[0]);
    }else if(event.key==='Escape'){
      setMentionState(null);
    }
  }

  return <div className="mention-textarea-wrap">
    <textarea
      ref={ref}
      className={className}
      rows={rows}
      value={value}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      onChange={handleChange}
      onKeyDown={keyDown}
      onClick={event=>inspect(value,event.currentTarget.selectionStart??value.length)}
      onKeyUp={event=>{
        if(['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key))return;
        inspect(value,event.currentTarget.selectionStart??value.length);
      }}
    />
    {mentionState&&<div className="mention-suggestions" role="listbox" aria-label="Mencionar pessoa da equipe">
      <div className="mention-suggestions-head"><AtSign size={13}/> Mencionar</div>
      {suggestions.length?suggestions.map((member,index)=><button
        key={member.user_id}
        type="button"
        className={index===activeIndex?'active':''}
        onMouseDown={event=>event.preventDefault()}
        onClick={()=>choose(member)}
        role="option"
        aria-selected={index===activeIndex}
      ><strong>{memberLabel(member)}</strong>{member.email&&member.full_name&&<small>{member.email}</small>}</button>):<span className="mention-empty">Nenhuma pessoa encontrada.</span>}
    </div>}
  </div>;
}
