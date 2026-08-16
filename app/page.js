import Link from 'next/link';
import { ArrowRight, BarChart3, Building2, ClipboardCheck, LockKeyhole, Users } from 'lucide-react';

export default function Landing() {
  return <div className="landing">
    <header className="landing-header"><div className="landing-brand">RADAR <span>—</span> CRM EDITORAS</div><Link className="btn secondary" href="/login">Entrar</Link></header>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow">Prospecção editorial organizada</div><h1>Uma visão única das editoras, contatos, oportunidades e próximos passos.</h1><p>O CRM interno da Radar centraliza a inteligência comercial da equipe para que ninguém duplique abordagens, perca follow-ups ou fique sem saber o histórico de uma editora.</p><div className="hero-actions"><Link className="btn large" href="/login">Acessar o CRM <ArrowRight size={18}/></Link><span><LockKeyhole size={15}/> Acesso restrito à equipe Radar</span></div></div>
      <div className="hero-panel"><div className="hero-panel-top"><span className="dot red"/><span className="dot amber"/><span className="dot green"/></div><div className="mock-card"><div className="mock-label">Hoje</div><strong>Fila comercial da equipe</strong><div className="mock-row"><span>Follow-ups atrasados</span><b>3</b></div><div className="mock-row"><span>Contatos para hoje</span><b>7</b></div><div className="mock-row"><span>Oportunidades abertas</span><b>12</b></div></div><div className="mock-activity"><span className="mock-avatar">BM</span><div><strong>Contato registrado</strong><small>Editora atualizada e próximo passo agendado</small></div></div></div>
    </section>
    <section className="feature-grid">
      <article><Building2/><h3>Editoras e decisores</h3><p>Base compartilhada, histórico centralizado, responsável e Radar Score.</p></article>
      <article><ClipboardCheck/><h3>Follow-ups</h3><p>Fila de hoje, atrasos, tarefas por usuário e próximos passos automáticos.</p></article>
      <article><Users/><h3>Equipe coordenada</h3><p>Autoria visível em cada ação e níveis de acesso por função.</p></article>
      <article><BarChart3/><h3>Gestão comercial</h3><p>Funil, conversão, atividade, oportunidades e desempenho da equipe.</p></article>
    </section>
    <footer className="landing-footer">RADAR — CRM EDITORAS · Uso interno</footer>
  </div>;
}
