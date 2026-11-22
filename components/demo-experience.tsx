"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Check,
  ChevronRight,
  Heart,
  LayoutDashboard,
  LoaderCircle,
  MessageCircle,
  Phone,
  Pill,
  ShoppingBasket,
  Utensils,
} from "lucide-react";
import { api } from "@/lib/client";
import {
  demoPhone,
  demoScenarios,
  type DemoScenarioId,
} from "@/lib/demo-scenarios";
import styles from "./demo-experience.module.css";

const icons = {
  feira: ShoppingBasket,
  remedio: Pill,
  consulta: CalendarDays,
  almoco: Utensils,
};
const channels = [
  {
    id: "call",
    label: "Ligação",
    icon: Phone,
    action: "Receber ligação da Lia",
  },
  {
    id: "whatsapp",
    label: "Áudio",
    icon: AudioLines,
    action: "Receber áudio no WhatsApp",
  },
  {
    id: "text",
    label: "Texto",
    icon: MessageCircle,
    action: "Receber texto no WhatsApp",
  },
] as const;
type Channel = (typeof channels)[number]["id"];
type Feedback = { error: boolean; text: string };

export function DemoExperience({
  realAvailable,
  textAvailable,
}: {
  realAvailable: boolean;
  textAvailable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<DemoScenarioId>("feira");
  const [channel, setChannel] = useState<Channel>("call");
  const [phone, setPhone] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [phoneError, setPhoneError] = useState(false);
  const [openingFamily, setOpeningFamily] = useState(false);
  const [familyError, setFamilyError] = useState("");
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  const phoneField = useRef<HTMLInputElement>(null);
  const scenario = demoScenarios.find((s) => s.id === selected)!;
  const delivery = channels.find((c) => c.id === channel)!;
  const textUnavailable = realAvailable && channel === "text" && !textAvailable;

  async function openFamily() {
    setOpeningFamily(true);
    setFamilyError("");
    try {
      await api("/api/demo", { action: "login", persona: "ana" });
      router.push("/familia");
    } catch {
      setFamilyError(
        "Não foi possível abrir o painel de Ana. Tente novamente.",
      );
      setOpeningFamily(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || textUnavailable) return;
    if (!realAvailable) {
      const channelLabel =
        channel === "call"
          ? "Ligação"
          : channel === "text"
            ? "Texto no WhatsApp"
            : "Áudio no WhatsApp";
      setFeedback({
        error: false,
        text: `Simulação: ${channelLabel} para “${scenario.title}”. Nenhum contato foi feito.`,
      });
      return;
    }
    const to = demoPhone(phone);
    if (!to) {
      setPhoneError(true);
      phoneField.current?.focus();
      return;
    }
    setFeedback(null);
    lock.current = true;
    setSending(true);
    const request = () =>
      fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: channel, to, scenario: selected }),
      });
    try {
      let response = await request();
      if (response.status === 401) {
        // Authentication is checked before the bridge can receive the request.
        await api("/api/demo", { action: "login", persona: "ana" });
        response = await request();
      }
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        throw new Error(
          result.message || "O canal está indisponível no momento.",
        );
      }
      const ending = "final " + to.slice(-4);
      setFeedback({
        error: false,
        text:
          channel === "call"
            ? "Ligação solicitada para o número com " +
              ending +
              ". Aguarde a chamada da Lia."
            : "Envio de " +
              (channel === "text" ? "texto" : "áudio") +
              " solicitado para o WhatsApp com " +
              ending +
              ".",
      });
    } catch (error) {
      setFeedback({
        error: true,
        text:
          error instanceof TypeError || !(error instanceof Error)
            ? "Não foi possível confirmar o pedido. Confira seu telefone antes de tentar novamente."
            : error.message,
      });
    } finally {
      lock.current = false;
      setSending(false);
    }
  }

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#experimentar">
        Ir para os cenários
      </a>
      <header className={styles.header}>
        <Link href="/" className="brand" aria-label="CareCircle, início">
          <span className="brand-mark">
            <Heart size={20} />
          </span>
          CareCircle<span className="brand-period">.</span>
        </Link>
        <button
          className={styles.family}
          onClick={openFamily}
          disabled={openingFamily || sending}
        >
          <LayoutDashboard size={17} />{" "}
          {openingFamily ? "Abrindo painel…" : "Painel da família"}{" "}
          <ArrowUpRight size={15} />
        </button>
      </header>
      {familyError && (
        <p role="alert" className={styles.familyError}>
          {familyError}
        </p>
      )}
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="demo-title">
          <div className={styles.intro}>
            <h1 id="demo-title">
              {realAvailable ? (
                <>
                  Receba uma ligação <em>da Lia.</em>
                </>
              ) : (
                <>
                  Experimente <em>uma conversa com a Lia.</em>
                </>
              )}
            </h1>
            <p>
              Entre as mensagens da família, um pedido de companhia pode passar
              despercebido. No CareCircle, Lia conversa com a pessoa idosa e
              ajuda a família a acompanhar o que ela escolhe compartilhar.
            </p>
          </div>
          <div className={styles.portrait}>
            <div className={styles.rings} aria-hidden="true" />
            <Image
              src="/avatars/lia-realista.webp"
              width={768}
              height={768}
              alt=""
              priority
            />
            <span className={styles.signature}>
              <AudioLines size={20} /> Lia <small>Assistente virtual</small>
            </span>
          </div>
        </section>

        <form
          id="experimentar"
          className={styles.experience}
          onSubmit={submit}
          noValidate
        >
          <fieldset
            className={styles.scenarios}
            disabled={sending || openingFamily}
          >
            <legend>Escolha um cenário</legend>
            <div className={styles.cards}>
              {demoScenarios.map((s) => {
                const Icon = icons[s.id];
                return (
                  <label key={s.id} className={styles.card} data-choice={s.id}>
                    <input
                      type="radio"
                      name="scenario"
                      checked={s.id === selected}
                      value={s.id}
                      onChange={() => {
                        setSelected(s.id);
                        setFeedback(null);
                      }}
                    />
                    <span className={styles.cardTop}>
                      <span className={styles.icon}>
                        <Icon size={22} />
                      </span>
                      <span className={styles.check}>
                        <Check size={13} strokeWidth={3} />
                      </span>
                    </span>
                    <strong>{s.title}</strong>
                    <span className={styles.description}>{s.description}</span>
                  </label>
                );
              })}
            </div>
            <div className={styles.sample} aria-live="polite">
              <span>Uma fala da Lia</span>
              <p>“{scenario.message}”</p>
            </div>
          </fieldset>

          {selected === "remedio" ? (
            <section className={styles.contact}>
              <h2>Da dúvida ao retorno</h2>
              <p>
                Faça a pergunta de Helena e acompanhe a resposta de Ana na tela
                da mãe.
              </p>
              <Link className={styles.submit} href="/demo/jejum">
                Abrir cenário de jejum <ChevronRight size={16} />
              </Link>
            </section>
          ) : (
            <section
              className={styles.contact}
              aria-labelledby="contact-heading"
            >
              <h2 id="contact-heading">
                {realAvailable
                  ? "Experimente no seu celular"
                  : "Simule um contato"}
              </h2>
              <fieldset
                disabled={sending || openingFamily}
                className={styles.delivery}
              >
                <legend>
                  {realAvailable
                    ? "Como quer receber?"
                    : "Qual canal quer simular?"}
                </legend>
                <div className={styles.channels}>
                  {channels.map(({ id, label, icon: Icon }) => (
                    <label key={id} className={styles.channel}>
                      <input
                        type="radio"
                        name="channel"
                        value={id}
                        checked={channel === id}
                        aria-label={
                          id === "call" ? label : label + " no WhatsApp"
                        }
                        onChange={() => {
                          setChannel(id);
                          setFeedback(null);
                        }}
                      />
                      <Icon size={19} />
                      {label}
                    </label>
                  ))}
                </div>
                {realAvailable ? (
                  <>
                    <p className={styles.hint}>
                      Envio real somente para números de teste autorizados.
                    </p>
                    <label className={styles.phoneLabel} htmlFor="demo-phone">
                      Seu telefone com DDD
                    </label>
                    <input
                      ref={phoneField}
                      id="demo-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={32}
                      value={phone}
                      required
                      placeholder="(11) 99999-9999"
                      aria-invalid={phoneError}
                      aria-describedby={
                        phoneError ? "phone-error" : "phone-hint"
                      }
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setPhoneError(false);
                        setFeedback(null);
                      }}
                    />
                    {phoneError ? (
                      <p id="phone-error" role="alert" className={styles.error}>
                        Confira o DDD e o número. Para outro país, comece com +
                        e o código do país.
                      </p>
                    ) : (
                      <p id="phone-hint" className={styles.hint}>
                        Brasil (+55). Para outro país, inclua o código com +.
                      </p>
                    )}
                  </>
                ) : (
                  <p className={styles.hint}>
                    Modo simulação. Nenhuma ligação ou mensagem será enviada.
                  </p>
                )}
                <button
                  type="submit"
                  className={styles.submit}
                  disabled={
                    sending ||
                    textUnavailable ||
                    Boolean(feedback && !feedback.error)
                  }
                >
                  {sending ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <delivery.icon size={18} />
                  )}
                  {sending
                    ? "Solicitando…"
                    : realAvailable
                      ? delivery.action
                      : "Simular " + delivery.label.toLowerCase()}
                </button>
              </fieldset>
              {textUnavailable && (
                <p role="status" className={styles.hint}>
                  O envio de texto aguarda a conexão do WhatsApp neste ambiente.
                </p>
              )}
              {feedback && (
                <p
                  role={feedback.error ? "alert" : "status"}
                  className={feedback.error ? styles.error : styles.success}
                >
                  {feedback.text}
                </p>
              )}
            </section>
          )}
        </form>
      </main>
      <footer className={styles.footer}>
        <span>CareCircle · UNMUTE by Agora</span>
        <Link href="/demo/controle">
          Controles da apresentação <ChevronRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
