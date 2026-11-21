import Link from "next/link";
import {
  ArrowUpRight,
  AudioLines,
  Check,
  Heart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Heart size={20} />
          </span>
          CareCircle<span className="brand-period">.</span>
        </Link>
        <nav>
          <Link href="#como-funciona">Como funciona</Link>
          <Link href="/demo" className="button button-small">
            Conhecer a demonstração <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div>
            <span className="eyebrow">
              <span className="little-line" /> MAIS PRESENÇA. MENOS DISTÂNCIA.
            </span>
            <h1>
              O cuidado começa
              <br />
              com uma <em>conversa.</em>
            </h1>
            <p className="hero-description">
              Lia escuta. A família se conecta. Pequenos pedidos viram ações
              compartilhadas, com a autonomia de quem você ama sempre em
              primeiro lugar.
            </p>
            <div className="landing-actions">
              <Link href="/demo" className="button">
                Entrar na demonstração <ArrowUpRight size={18} />
              </Link>
              <Link href="/idoso" className="text-link">
                Conhecer a Lia
              </Link>
            </div>
            <p className="fine-print">
              <ShieldCheck size={15} /> Pessoas fictícias. Compartilhamento só
              com autorização.
            </p>
          </div>
          <div
            className="hero-art"
            aria-label="Uma conversa conecta Helena, Lia e a família"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-label label-helena">
              <span className="avatar peach">H</span>
              <div>
                Dona Helena<small>Seu tempo. Sua voz.</small>
              </div>
            </div>
            <div className="lia-art">
              <AudioLines size={54} strokeWidth={1.4} />
              <span>Lia</span>
              <small>Um novo jeito de estar perto</small>
            </div>
            <div className="art-label label-ana">
              <span className="avatar sage">A</span>
              <div>
                Ana<small>Parte do círculo</small>
              </div>
              <Heart size={16} />
            </div>
            <div className="art-note">
              <Check size={16} />
              <span>
                Um pedido ouvido.
                <br />
                <strong>Um cuidado compartilhado.</strong>
              </span>
            </div>
            <span className="art-caption">
              ILUSTRAÇÃO DO FLUXO · NÃO É UMA SESSÃO AO VIVO
            </span>
          </div>
        </section>
        <section id="como-funciona" className="how-section">
          <div className="section-intro">
            <span className="eyebrow">TECNOLOGIA COM DELICADEZA</span>
            <h2>
              Voz que aproxima.
              <br />
              Informação que ajuda.
            </h2>
            <p>
              Coordenação familiar, sem transformar a vida em um prontuário.
            </p>
          </div>
          <div className="feature">
            <AudioLines />
            <h3>Uma conversa natural</h3>
            <p>
              Helena entra por vontade própria e conversa com Lia pela
              infraestrutura de voz da Agora.
            </p>
          </div>
          <div className="feature">
            <ShieldCheck />
            <h3>Autonomia em primeiro lugar</h3>
            <p>
              Cada pedido é revisado antes de compartilhar. Conversas completas
              ficam fora do histórico.
            </p>
          </div>
          <div className="feature">
            <Sparkles />
            <h3>O próximo passo, claro</h3>
            <p>
              A família acompanha relatos autorizados e organiza quem pode
              ajudar.
            </p>
          </div>
        </section>
        <section className="landing-bottom">
          <Heart size={26} />
          <h2>Cuidar é estar em círculo.</h2>
          <Link href="/demo" className="button">
            Explorar o CareCircle <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <span>CareCircle · UNMUTE by Agora</span>
        <span>Assistente de coordenação. Não é monitoramento clínico.</span>
      </footer>
    </div>
  );
}
