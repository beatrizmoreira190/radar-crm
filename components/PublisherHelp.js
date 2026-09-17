'use client';

export default function PublisherHelp({text}){
  if(!text)return null;
  return <button type="button" className="publisher-help-dot" aria-label={`Ajuda: ${text}`} data-help={text}>?</button>;
}
