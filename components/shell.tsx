"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  CalendarDays,
  CheckCheck,
  CircleHelp,
  Heart,
  LayoutDashboard,
  Play,
  ShieldCheck,
} from "lucide-react";
const links = [
  { href: "/familia", label: "Visão do círculo", icon: LayoutDashboard },
  { href: "/familia/agenda", label: "Agenda de conversas", icon: CalendarDays },
  {
    href: "/familia/tarefas",
    label: "Tarefas compartilhadas",
    icon: CheckCheck,
  },
  { href: "/idoso", label: "Conversar com a assistente", icon: AudioLines },
  { href: "/demo", label: "Sala de demonstração", icon: Play },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <a href="#conteudo" className="skip-link">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Heart size={20} />
          </span>
          CareCircle<span className="brand-period">.</span>
        </Link>
        <div className="sidebar-circle">
          <span className="avatar peach">H</span>
          <div>
            Círculo da Helena<small>FAMÍLIA FICTÍCIA</small>
          </div>
        </div>
        <p className="nav-caption">ESPAÇO DO CUIDADO</p>
        <nav>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "active" : ""}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <ShieldCheck size={23} />
          <strong>Cuidado com autonomia</strong>
          <p>Helena escolhe o que compartilhar e com quem.</p>
          <Link href="/idoso#privacidade">
            Entenda a privacidade <CircleHelp size={14} />
          </Link>
        </div>
        <div className="powered">
          VOZ CONECTADA POR <strong>agora</strong>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>Seu círculo, mais perto.</span>
          <span className="demo-badge">DEMO · PESSOAS FICTÍCIAS</span>
        </header>
        <main id="conteudo" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          Coordenação familiar com consentimento. Sem diagnóstico ou
          monitoramento clínico.<span>CareCircle · UNMUTE 2026</span>
        </footer>
      </div>
    </div>
  );
}
