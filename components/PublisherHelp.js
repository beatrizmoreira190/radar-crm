'use client';

export default function PublisherHelp({text}){
  if(!text)return null;
  function stop(event){event.preventDefault();event.stopPropagation()}
  function key(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation()}}
  return <span role="button" tabIndex={0} className="publisher-help-dot" aria-label={`Ajuda: ${text}`} data-help={text} onClick={stop} onKeyDown={key}>?</span>;
}
