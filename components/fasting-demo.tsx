"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Phone, Volume2, Mic } from "lucide-react";
import {
  fasting,
  returns,
  answerLabels,
  type FastingState,
} from "@/lib/fasting-script";
import { demoPhone } from "@/lib/demo-scenarios";
import { api } from "@/lib/client";
type Stage = "intro" | "ready" | FastingState;
type Recognition = {
  lang: string;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};
const savedKey = "carecircle-fasting-call";
function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  u.rate = 0.94;
  window.speechSynthesis.speak(u);
}
export function FastingDemo({ live }: { live: boolean }) {
  const [stage, setStage] = useState<Stage>("intro"),
    [phone, setPhone] = useState(""),
    [request, setRequest] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false);
  const lock = useRef(false),
    mic = useRef<Recognition | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const id = live ? sessionStorage.getItem(savedKey) : null;
      if (id) {
        setRequest(id);
        setStage("waiting");
      }
    }, 0);
    return () => {
      clearTimeout(t);
      mic.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, [live]);
  useEffect(() => {
    if (!live || stage !== "waiting" || !request) return;
    let done = false,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch("/api/jejum/" + request, { cache: "no-store" });
        if (done) return;
        if (r.status === 404 || r.status === 401) {
          setError(
            "Abra esta demonstração com a sessão de Helena para recuperar o pedido.",
          );
          return;
        }
        if (!r.ok) throw new Error();
        const value = (await r.json()) as { state: FastingState };
        if (done) return;
        setError("");
        if (value.state !== "waiting") {
          setStage(value.state);
          speak(returns[value.state]);
          return;
        }
      } catch {
        if (!done)
          setError(
            "Conexão interrompida. Consultando o mesmo pedido novamente.",
          );
      }
      if (!done) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [request, stage, live]);
  function ask() {
    mic.current?.abort();
    setListening(false);
    setError("");
    setStage("ready");
    speak(fasting.hold);
  }
  function hear() {
    const w = window as Window & {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Engine = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Engine) {
      setError("Para usar este navegador, toque em Usar a pergunta de Helena.");
      return;
    }
    const rec = new Engine();
    mic.current = rec;
    rec.lang = "pt-BR";
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (/jejum/.test(text) && /cafe/.test(text)) ask();
      else
        setError(
          "Nesta cena Helena pergunta sobre café durante o jejum. Repita a pergunta ou use o texto da tela.",
        );
    };
    rec.onerror = () =>
      setError(
        "O microfone não captou a pergunta. Use a pergunta escrita ou tente de novo.",
      );
    rec.onend = () => setListening(false);
    setListening(true);
    setError("");
    try {
      rec.start();
    } catch {
      setListening(false);
      setError("O microfone está indisponível. Use a pergunta escrita.");
    }
  }
  async function dial() {
    if (lock.current) return;
    if (!live) {
      setStage("waiting");
      speak(fasting.ask);
      return;
    }
    const to = demoPhone(phone);
    if (!to) {
      setError("Digite um telefone com DDD.");
      return;
    }
    setError("");
    lock.current = true;
    setBusy(true);
    const id = sessionStorage.getItem(savedKey) || crypto.randomUUID();
    try {
      await api("/api/demo", { action: "login", persona: "helena" });
      sessionStorage.setItem(savedKey, id);
      const response = await fetch("/api/jejum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, to }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (
          (response.status >= 400 && response.status < 500) ||
          response.status === 503
        )
          sessionStorage.removeItem(savedKey);
        throw new Error(data.message || "O serviço não confirmou o pedido.");
      }
      setRequest(id);
      setStage(data.state);
      if (data.state in returns)
        speak(returns[data.state as keyof typeof returns]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Falha de conexão. Tente recuperar o mesmo pedido.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function simulate(outcome: keyof typeof returns) {
    if (live || stage !== "waiting") return;
    setStage(outcome);
    speak(returns[outcome]);
  }
  return (
    <main className="fasting-demo">
      <header>
        <Link href="/demo">← Voltar aos cenários</Link>
        <span>CareCircle · Cenário 2</span>
      </header>
      <section className="fasting-hero">
        <div>
          <p className="eyebrow">CÍRCULO DE HELENA</p>
          <h1>Café, remédio e jejum</h1>
          <p>
            Helena pergunta. Lia consulta Ana, sua filha, e traz a resposta para
            Helena.
          </p>
        </div>
        <Image
          src="/avatars/lia-realista.webp"
          alt="Lia"
          width={100}
          height={100}
        />
      </section>
      <p className="fasting-mode">
        {live
          ? "Ligação real · número de teste autorizado"
          : "Ensaio guiado · respostas simuladas, sem ligação telefônica"}
      </p>
      <section className="card fasting-dialog" aria-live="polite">
        <p className="eyebrow">HELENA · MÃE</p>
        <h2>“{fasting.question}”</h2>
        {stage === "intro" ? (
          <div className="button-row">
            <button className="button" onClick={hear} disabled={listening}>
              <Mic size={18} />
              {listening ? "Ouvindo…" : "Falar a pergunta"}
            </button>
            <button className="button button-light" onClick={ask}>
              Usar a pergunta de Helena
            </button>
          </div>
        ) : (
          <>
            <p className="eyebrow">LIA PARA HELENA</p>
            <p>{fasting.hold}</p>
          </>
        )}
      </section>
      {stage !== "intro" && (
        <section className="card fasting-dialog">
          <p className="eyebrow">LIA PARA ANA · FILHA</p>
          <h2>{fasting.ask}</h2>
          {stage === "ready" && (
            <>
              {live && (
                <label>
                  Telefone de teste de Ana com DDD
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              )}
              <button className="button" disabled={busy} onClick={dial}>
                <Phone size={18} />
                {busy
                  ? "Solicitando…"
                  : live
                    ? "Autorizar e ligar para Ana"
                    : "Simular ligação para Ana"}
              </button>
            </>
          )}
          {stage === "waiting" && (
            <>
              <p role="status">Aguardando a resposta de Ana.</p>
              {!live && (
                <div className="button-row">
                  {(
                    Object.entries(answerLabels) as [
                      keyof typeof answerLabels,
                      string,
                    ][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      className="button button-light"
                      onClick={() => simulate(id)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    className="text-button"
                    onClick={() => simulate("unanswered")}
                  >
                    Sem resposta
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {stage in returns && (
        <section
          className="card fasting-dialog fasting-return"
          aria-live="polite"
        >
          <p className="eyebrow">LIA DE VOLTA PARA HELENA</p>
          <h2>{returns[stage as keyof typeof returns]}</h2>
          <div className="button-row">
            <button
              className="button"
              onClick={() => speak(returns[stage as keyof typeof returns])}
            >
              <Volume2 size={18} />
              Ouvir o retorno
            </button>
            <button
              className="button button-light"
              onClick={() => {
                window.speechSynthesis?.cancel();
                sessionStorage.removeItem(savedKey);
                setRequest("");
                setStage("intro");
                setError("");
              }}
            >
              Recomeçar o cenário
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
