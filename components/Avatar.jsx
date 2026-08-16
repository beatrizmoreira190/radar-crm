import { initials } from '@/lib/constants';
export default function Avatar({ member, size = 34 }) {
  const name = member?.full_name || member?.email || 'Usuário';
  if (member?.avatar_url) return <img className="avatar" src={member.avatar_url} alt={name} style={{width:size,height:size}} />;
  return <div className="avatar avatar-fallback" style={{width:size,height:size,fontSize:Math.max(10,Math.floor(size*.34))}}>{initials(name).toUpperCase()}</div>;
}
