'use client';

import { useEffect } from 'react';

function normalize(value=''){return value.replace(/\s+/g,' ').trim().toLowerCase()}

export default function PublisherMeetingActionsPolish(){
  useEffect(()=>{
    let observer=null;let timer=null;
    const created=new Set();const hidden=new Set();

    function apply(){
      document.querySelectorAll('.publisher-meetings-card .meeting-actions').forEach(actions=>{
        if(actions.querySelector('[data-meeting-more-actions]'))return;
        const buttons=[...actions.querySelectorAll(':scope > button')];
        const secondary=buttons.filter(button=>{
          const text=normalize(button.textContent);
          return text.includes('não compareceu')||text.includes('cancelar');
        });
        if(!secondary.length)return;
        secondary.forEach(button=>{button.dataset.polishPreviousDisplay=button.style.display||'';button.style.display='none';hidden.add(button)});

        const details=document.createElement('details');details.className='meeting-more-actions';details.dataset.meetingMoreActions='true';
        const summary=document.createElement('summary');summary.title='Mais ações';summary.setAttribute('aria-label','Mais ações');summary.textContent='•••';
        const menu=document.createElement('div');menu.className='meeting-more-menu';
        secondary.forEach(original=>{
          const item=document.createElement('button');item.type='button';item.textContent=original.textContent?.replace(/\s+/g,' ').trim()||'Ação';
          if(normalize(item.textContent).includes('cancelar'))item.className='danger';
          item.addEventListener('click',()=>{details.removeAttribute('open');original.click()});
          menu.appendChild(item);
        });
        details.append(summary,menu);actions.appendChild(details);created.add(details);
      });
    }

    timer=setTimeout(apply,120);
    observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(apply,50)});
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer?.disconnect();if(timer)clearTimeout(timer);created.forEach(node=>node.remove());hidden.forEach(button=>{if(button.isConnected)button.style.display=button.dataset.polishPreviousDisplay||''})};
  },[]);
  return null;
}
