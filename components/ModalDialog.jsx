'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function ModalDialog({title,description,onClose,onSubmit,busy=false,children,className=''}) {
  const titleId=useId();
  const descriptionId=useId();
  const dialogRef=useRef(null);
  const restoreFocusRef=useRef(null);
  const busyRef=useRef(busy);

  useEffect(()=>{busyRef.current=busy},[busy]);

  useEffect(()=>{
    restoreFocusRef.current=document.activeElement;
    const dialog=dialogRef.current;
    const focusables=()=>Array.from(dialog?.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    )||[]).filter(el=>!el.hasAttribute('hidden'));
    const preferred=dialog?.querySelector('[autofocus]');
    (preferred||focusables()[0]||dialog)?.focus();

    function onKeyDown(event){
      if(event.key==='Escape'&&!busyRef.current){
        event.preventDefault();
        onClose();
        return;
      }
      if(event.key!=='Tab')return;
      const items=focusables();
      if(!items.length){
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first=items[0];
      const last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){
        event.preventDefault();
        last.focus();
      }else if(!event.shiftKey&&document.activeElement===last){
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown',onKeyDown);
    return ()=>{
      document.removeEventListener('keydown',onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  },[onClose]);

  function requestClose(){
    if(!busyRef.current)onClose();
  }

  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)requestClose()}}>
    <form
      ref={dialogRef}
      className={`modal ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description?descriptionId:undefined}
      aria-busy={busy}
      tabIndex={-1}
      onSubmit={onSubmit}
    >
      <div className="modal-head">
        <div>
          <h3 id={titleId}>{title}</h3>
          {description&&<p id={descriptionId}>{description}</p>}
        </div>
        <button type="button" aria-label="Fechar" disabled={busy} onClick={requestClose}><X/></button>
      </div>
      {children}
    </form>
  </div>;
}
