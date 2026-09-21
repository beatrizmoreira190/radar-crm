'use client';

import { useEffect, useState } from 'react';

function isoDateToBr(value=''){
  const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:'';
}

function maskBrDate(value=''){
  const digits=String(value).replace(/\D/g,'').slice(0,8);
  if(digits.length<=2)return digits;
  if(digits.length<=4)return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
}

function brDateToIso(value=''){
  const match=String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!match)return '';
  const day=Number(match[1]);
  const month=Number(match[2]);
  const year=Number(match[3]);
  const date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return '';
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function PtBrDateField({value='',onChange,required=false,disabled=false,className='',ariaLabel='Data'}){
  const [text,setText]=useState(()=>isoDateToBr(value));
  const [invalid,setInvalid]=useState(false);

  useEffect(()=>{setText(isoDateToBr(value));setInvalid(false)},[value]);

  function change(raw){
    const next=maskBrDate(raw);
    setText(next);
    setInvalid(false);
    if(!next){onChange?.('');return}
    const iso=brDateToIso(next);
    if(iso)onChange?.(iso);
  }

  function blur(){
    if(!text){setInvalid(required);return}
    setInvalid(!brDateToIso(text));
  }

  return <div className="ptbr-date-wrap">
    <input
      className={`input ${className}`.trim()}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      value={text}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid||undefined}
      onChange={event=>change(event.target.value)}
      onBlur={blur}
    />
    {invalid&&<small className="field-error">Use uma data válida no formato dd/mm/aaaa.</small>}
  </div>;
}

export function PtBrDateTimeField({value='',onChange,required=false,disabled=false,ariaLabel='Data e horário'}){
  const initialDate=isoDateToBr(value);
  const initialTime=String(value).match(/T(\d{2}:\d{2})/)?.[1]||'';
  const [dateText,setDateText]=useState(initialDate);
  const [timeText,setTimeText]=useState(initialTime);
  const [invalid,setInvalid]=useState(false);

  useEffect(()=>{
    setDateText(isoDateToBr(value));
    setTimeText(String(value).match(/T(\d{2}:\d{2})/)?.[1]||'');
    setInvalid(false);
  },[value]);

  function emit(nextDate,nextTime){
    if(!nextDate){onChange?.('');return}
    const iso=brDateToIso(nextDate);
    if(iso&&nextTime)onChange?.(`${iso}T${nextTime}`);
  }

  function changeDate(raw){
    const next=maskBrDate(raw);
    setDateText(next);
    setInvalid(false);
    emit(next,timeText);
  }

  function changeTime(next){
    setTimeText(next);
    setInvalid(false);
    emit(dateText,next);
  }

  function blurDate(){
    if(!dateText){setInvalid(required);return}
    setInvalid(!brDateToIso(dateText));
  }

  return <div className="ptbr-datetime-field" aria-label={ariaLabel}>
    <div className="ptbr-date-wrap">
      <input
        className="input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        value={dateText}
        required={required}
        disabled={disabled}
        aria-label={`${ariaLabel} — data`}
        aria-invalid={invalid||undefined}
        onChange={event=>changeDate(event.target.value)}
        onBlur={blurDate}
      />
      {invalid&&<small className="field-error">Use uma data válida no formato dd/mm/aaaa.</small>}
    </div>
    <input
      className="input"
      type="time"
      value={timeText}
      required={required}
      disabled={disabled}
      aria-label={`${ariaLabel} — horário`}
      onChange={event=>changeTime(event.target.value)}
    />
  </div>;
}
