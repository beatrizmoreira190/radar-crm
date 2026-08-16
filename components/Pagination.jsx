'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function pageItems(current, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, current - 2), end = Math.min(total - 1, current + 2);
  if (start > 2) items.push('…a');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push('…b');
  items.push(total);
  return items;
}

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return <div className="pagination">
    <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page-1)} aria-label="Página anterior"><ChevronLeft size={16}/></button>
    {pageItems(page,totalPages).map((p,i) => typeof p === 'number'
      ? <button key={p} className={`page-btn ${p===page?'active':''}`} onClick={() => onChange(p)}>{p}</button>
      : <span className="page-ellipsis" key={`${p}-${i}`}>…</span>)}
    <button className="page-btn" disabled={page >= totalPages} onClick={() => onChange(page+1)} aria-label="Próxima página"><ChevronRight size={16}/></button>
  </div>;
}
