"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  ListTodo,
  LogIn,
  Mic,
  Phone,
  Radio,
  Stethoscope,
} from "lucide-react";
import styles from "./obs.module.css";

type ObsEvent = { ts: string; kind: string; title: string; detail: string };
type VoiceSession = {
  started_at: string;
  ended_at: string | null;
  status: string;
  duration_s: number | null;
};
type Call = { file: string; at: string; lines: string[] };
type Payload = {
  now: string;
  counters: Record<string, number>;
  events: ObsEvent[];
  voice_sessions: VoiceSession[];
  calls: Call[];
};

function iconFor(kind: string) {
  if (kind.startsWith("event:") || kind === "task_created")
    return <Stethoscope size={15} />;
  if (kind.startsWith("rate:demo_outreach")) return <Phone size={15} />;
  if (kind.startsWith("voice") || kind === "rate:voice_start")
    return <Mic size={15} />;
  if (kind === "demo_login") return <LogIn size={15} />;
  if (kind === "notification") return <Bell size={15} />;
  if (kind.startsWith("task") || kind.includes("task"))
    return <ListTodo size={15} />;
  return <Activity size={15} />;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const dur = (s: number | null) =>
  s == null ? "ao vivo" : s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;

export function ObsBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let stop = false;
    const tick = () =>
      fetch("/api/obs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((j) => {
          if (stop) return;
          setData(j);
          setErr(false);
        })
        .catch(() => {
          if (!stop) setErr(true);
        });
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const c = data?.counters ?? {};
  const live = (data?.counters.voice_open ?? 0) > 0;
  const cards: [string, number | string, string][] = [
    ["Entradas na demo · 24h", c.logins_24h ?? "—", `${c.sessions ?? 0} sessões`],
    ["Conversas de voz · 24h", c.voice_24h ?? "—", `${c.voice_sessions ?? 0} total`],
    ["Disparos reais · 24h", c.outreach_24h ?? "—", `${c.outreach ?? 0} total`],
    ["Eventos de cuidado", c.care_events ?? "—", "linha do círculo"],
    ["Tarefas", c.tasks ?? "—", `${c.notifications ?? 0} notificações`],
    ["Ligações registradas", data?.calls.length ?? "—", "transcripts"],
  ];

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <Radio size={18} />
          <span>
            CareCircle<span className={styles.dim}>.obs</span>
          </span>
        </div>
        <div className={`${styles.pulse} ${live ? styles.live : ""}`}>
          <span className={styles.dot} />
          {live ? "VOZ AO VIVO" : err ? "sem dados" : "monitorando"}
        </div>
        <div className={styles.clock}>
          {data ? fmt(data.now) : "--:--:--"} BRT
        </div>
      </header>

      <section className={styles.cards}>
        {cards.map(([label, value, sub]) => (
          <div key={label} className={styles.card}>
            <div className={styles.cardLabel}>{label}</div>
            <div className={styles.cardValue}>{value}</div>
            <div className={styles.cardSub}>{sub}</div>
          </div>
        ))}
      </section>

      <main className={styles.grid}>
        <section className={styles.panel}>
          <h2>Linha do tempo</h2>
          <ul className={styles.feed}>
            {(data?.events ?? []).map((e, i) => (
              <li key={`${e.ts}-${i}`} className={styles.feedItem}>
                <span className={styles.feedIcon}>{iconFor(e.kind)}</span>
                <div>
                  <div className={styles.feedTitle}>
                    {e.title}
                    <time>{fmt(e.ts)}</time>
                  </div>
                  {e.detail && <div className={styles.feedDetail}>{e.detail}</div>}
                </div>
              </li>
            ))}
            {data && !data.events.length && (
              <li className={styles.empty}>sem eventos ainda</li>
            )}
          </ul>
        </section>

        <div className={styles.side}>
          <section className={styles.panel}>
            <h2>Sessões de voz</h2>
            <ul className={styles.voiceList}>
              {(data?.voice_sessions ?? []).map((v, i) => (
                <li key={i}>
                  <Mic size={13} />
                  <span>{fmt(v.started_at)}</span>
                  <b>{dur(v.duration_s)}</b>
                  <i className={v.ended_at ? "" : styles.liveTag}>
                    {v.ended_at ? v.status : "aberta"}
                  </i>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel}>
            <h2>Ligações reais</h2>
            <ul className={styles.callList}>
              {(data?.calls ?? []).map((call) => (
                <li key={call.file} className={styles.call}>
                  <div className={styles.callHead}>
                    <Phone size={13} />
                    <time>{fmt(call.at)}</time>
                  </div>
                  {call.lines.map((l, i) => (
                    <p key={i} className={styles.callLine}>
                      {l.replaceAll("**", "")}
                    </p>
                  ))}
                </li>
              ))}
              {data && !data.calls.length && (
                <li className={styles.empty}>sem transcripts neste host</li>
              )}
            </ul>
          </section>
        </div>
      </main>

      <footer className={styles.foot}>
        dados sintéticos de demonstração · atualiza a cada 5s · /api/obs
      </footer>
    </div>
  );
}
