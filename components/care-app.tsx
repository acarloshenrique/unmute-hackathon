"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Heart,
  Leaf,
  LoaderCircle,
  MessageCircle,
  PhoneCall,
  Pill,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  api,
  displayDate,
  displayTime,
  localInput,
  statusLabel,
  type CopilotResult,
  type Data,
  type Proposal,
  type Routine,
  type Task,
} from "@/lib/client";
import { ChartShortcut, FamilyChart } from "./family-chart";
import { Shell } from "./shell";
import { VoicePanel } from "./voice-panel";
import { CaregiverPicker } from "./caregiver-picker";
type View = "chart" | "dashboard" | "agenda" | "tasks" | "elder" | "demo";
type Action = (name: string, input: unknown) => Promise<void>;
function Badge({ status }: { status: string }) {
  return (
    <span className={`status status-${status}`}>
      {statusLabel[status] || status}
    </span>
  );
}
function Login({
  onLogin,
}: {
  onLogin: (persona: "ana" | "helena" | "pedro") => Promise<void>;
}) {
  return (
    <section className="login-card card">
      <span className="section-icon">
        <Heart />
      </span>
      <span className="eyebrow">BEM-VINDO AO CÍRCULO</span>
      <h1>
        Entre na história
        <br />
        da família Helena.
      </h1>
      <p>
        Escolha uma pessoa fictícia para explorar. Os dados são persistidos
        localmente e identificados como simulação.
      </p>
      <div className="persona-options">
        {(["ana", "helena", "pedro"] as const).map((p) => (
          <button
            key={p}
            onClick={() => void onLogin(p)}
            className="persona-button"
          >
            <span className={`avatar ${p === "helena" ? "peach" : "sage"}`}>
              {p[0].toUpperCase()}
            </span>
            <strong>
              {p === "helena" ? "Dona Helena" : p === "ana" ? "Ana" : "Pedro"}
            </strong>
            <small>
              {p === "helena"
                ? "Conversar e decidir"
                : p === "ana"
                  ? "Acompanhar e organizar"
                  : "Ajudar nas tarefas"}
            </small>
          </button>
        ))}
      </div>
      <p className="fine-print">
        <ShieldCheck size={16} /> Login fictício exclusivo de localhost. Não
        utilize dados reais.
      </p>
    </section>
  );
}
export function CareApp({ view }: { view: View }) {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(false),
    [editing, setEditing] = useState<Routine | undefined>();
  const refresh = useCallback(async () => {
    try {
      setData(await api<Data>("/api/snapshot"));
    } catch (e) {
      if (e instanceof Error && e.message.includes("Entre na demonstração"))
        setData(null);
      else setError(e instanceof Error ? e.message : "Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  const login = async (persona: "ana" | "helena" | "pedro") => {
    setError("");
    try {
      await api("/api/demo", { action: "login", persona });
      await refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };
  const act: Action = async (name, input) => {
    setError("");
    try {
      await api(`/api/actions/${name}`, input);
      await refresh();
      setNotice("Alteração salva no círculo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      throw e;
    }
  };
  const safely = (promise: Promise<unknown>) => void promise.catch(() => {});
  const demo = async (action: string, minutes?: number) => {
    setError("");
    try {
      await api("/api/demo", { action, minutes });
      await refresh();
      setNotice(
        action === "trigger"
          ? "Disparo de teste executado. Consulte o registro de ocorrências."
          : "Demonstração atualizada.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na demonstração.");
    }
  };
  const titles: Record<View, string> = {
    chart: "Prontuário familiar",
    dashboard: "Um olhar para o seu círculo.",
    agenda: "Tempo para estar presente.",
    tasks: "Pequenos gestos. Cuidado compartilhado.",
    elder: "Olá, dona Helena.",
    demo: "Uma história de cuidado, ao vivo.",
  };
  return (
    <Shell>
      {error && (
        <div role="alert" className="alert error">
          {error}
          <button aria-label="Fechar erro" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading">
          <LoaderCircle className="spin" /> Abrindo seu círculo…
        </div>
      ) : !data ? (
        <Login onLogin={login} />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {view === "elder"
                  ? "ESSE ESPAÇO É SEU"
                  : `OLÁ, ${data.actor.display_name.toUpperCase()}`}
              </span>
              <h1>{titles[view]}</h1>
              <p>
                {view === "elder"
                  ? "Uma conversa, no seu ritmo. Você decide o que compartilhar."
                  : view === "chart"
                    ? "Acompanhamento de medicamentos, atendimentos e orientações da equipe de cuidado."
                    : "Presença nos detalhes que importam. Com a autonomia da Helena."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="actor-pill">
                <span className="avatar tiny sage">
                  {data.actor.display_name[0]}
                </span>
                {data.actor.display_name} · fictícia
              </span>
              {data.actor.role === "relative" &&
                view !== "elder" &&
                view !== "chart" && (
                  <button
                    className="button"
                    onClick={() => {
                      setEditing(undefined);
                      setModal(true);
                    }}
                  >
                    <Plus size={17} /> Agendar conversa
                  </button>
                )}
            </div>
          </div>
          <div className="context-strip">
            <span>
              <Leaf size={16} /> Círculo da Helena{" "}
              <span className="muted">· Dados de demonstração</span>
            </span>
            <span>
              <Clock3 size={15} /> São Paulo ·{" "}
              {view === "chart"
                ? "atualização a cada 8 s"
                : "atualização a cada 2 s"}
            </span>
          </div>
          {view === "chart" &&
            (data.can_manage_chart ? (
              <FamilyChart
                key={data.actor.id + data.profile.id}
                context={data}
                copilot={<Copilot data={data} act={act} />}
              />
            ) : (
              <section className="card empty">
                <ShieldCheck />
                <h2>Acesso ao prontuário</h2>
                <p>
                  A pessoa acompanhada escolhe os familiares que podem consultar
                  e atualizar a ficha.
                </p>
                <Link className="text-link" href="/idoso#privacidade">
                  Ver autorizações
                </Link>
              </section>
            ))}
          {view === "dashboard" && (
            <Dashboard data={data} act={act} schedule={() => setModal(true)} />
          )}{" "}
          {view === "agenda" && (
            <div className="card">
              <div className="card-heading">
                <div>
                  <h2>Agenda de conversas</h2>
                  <p>Convites entre 8h e 21h · America/Sao_Paulo</p>
                </div>
                <CalendarDays className="muted" />
              </div>
              <RoutineList
                data={data}
                act={act}
                edit={(r) => {
                  setEditing(r);
                  setModal(true);
                }}
              />
            </div>
          )}
          {view === "tasks" && (
            <div className="card">
              <div className="card-heading">
                <div>
                  <h2>Quem pode ajudar?</h2>
                  <p>Cada pedido é compartilhado por escolha da Helena.</p>
                </div>
                <CheckCheck className="muted" />
              </div>
              <TaskList data={data} act={act} />
            </div>
          )}
          {view === "elder" &&
            (data.actor.role === "elder" ? (
              <Elder data={data} act={act} refresh={refresh} />
            ) : (
              <div className="card empty">
                <ShieldCheck />
                <h2>Este é o espaço da Helena.</h2>
                <p>
                  Entre como Helena fictícia para conversar e revisar
                  autorizações.
                </p>
                <button className="button" onClick={() => void login("helena")}>
                  Entrar como Helena fictícia
                </button>
              </div>
            ))}
          {view === "demo" && (
            <>
              <section className="demo-banner">
                <span className="demo-badge">DEMONSTRAÇÃO CONTROLADA</span>
                <h2>Conversa → autorização → ação.</h2>
                <p>
                  O relógio abaixo afeta somente o disparo manual de teste. O
                  worker usa o relógio real.
                </p>
                <div className="demo-clock">
                  <Clock3 />
                  <strong>{displayDate(data.demo_clock)}</strong>
                  <button
                    className="button button-light"
                    onClick={() => void demo("advance", 2)}
                  >
                    Avançar 2 minutos
                  </button>
                  <button
                    className="button"
                    onClick={() => void demo("trigger")}
                  >
                    Disparar agora · teste
                  </button>
                </div>
              </section>
              <div className="demo-grid">
                <div className="card">
                  <h2>Prepare a apresentação</h2>
                  <ol className="demo-steps">
                    <li>
                      Entre como Helena e autorize compartilhar pedidos com
                      Pedro.
                    </li>
                    <li>
                      Inicie a conversa Agora e diga: “Lia, pede pro Pedro me
                      acompanhar à feira sábado.”
                    </li>
                    <li>
                      Corrija: “às dez da manhã”. Confira o rascunho atualizado.
                    </li>
                    <li>Revise e toque em Confirmar e compartilhar.</li>
                    <li>
                      Entre como Pedro e toque em Posso ajudar. Recarregue para
                      conferir o aceite.
                    </li>
                    <li>
                      Em outro teste, cancele o rascunho: nenhum cartão deve ser
                      enviado.
                    </li>
                  </ol>
                  <div className="button-row">
                    <button
                      className="button button-light"
                      onClick={() => void login("ana")}
                    >
                      Ana fictícia
                    </button>
                    <button
                      className="button button-light"
                      onClick={() => void login("helena")}
                    >
                      Helena fictícia
                    </button>
                    <button
                      className="button button-light"
                      onClick={() => void login("pedro")}
                    >
                      Pedro fictício
                    </button>
                  </div>
                  <div className="button-row">
                    <Link className="text-link" href="/familia">
                      Abrir painel da família
                    </Link>
                    <Link className="text-link" href="/idoso">
                      Abrir conversa com {data.caregiver.name}
                    </Link>
                  </div>
                </div>
                <div className="card">
                  <h2>Prontidão técnica</h2>
                  <div className="readiness">
                    <span>Chave OpenAI no servidor</span>
                    <Badge
                      status={data.openai_configured ? "confirmed" : "pending"}
                    />
                  </div>
                  <div className="readiness">
                    <span>Configuração Agora + HTTPS</span>
                    <Badge
                      status={data.agora_configured ? "confirmed" : "pending"}
                    />
                  </div>
                  <p className="callout">
                    Configuração presente não comprova áudio. Valide microfone,
                    agente no canal, resposta audível e encerramento antes da
                    apresentação.
                  </p>
                  <h3>Sessões desta identidade</h3>
                  {data.sessions.length ? (
                    data.sessions.map((s) => (
                      <div className="readiness" key={s.id}>
                        <span>{displayTime(s.started_at)}</span>
                        <Badge status={s.status} />
                      </div>
                    ))
                  ) : (
                    <p className="muted">Nenhuma sessão de voz iniciada.</p>
                  )}
                </div>
                <div className="card">
                  <h2>Ocorrências persistidas</h2>
                  {data.runs.length ? (
                    data.runs.map((r) => (
                      <div className="readiness" key={r.id}>
                        <span>{displayDate(r.scheduled_at)}</span>
                        <Badge status={r.status} />
                      </div>
                    ))
                  ) : (
                    <Empty text="Agende e dispare uma conversa para ver a ocorrência real no banco." />
                  )}
                </div>
                <div className="card">
                  <h2>Registro de ações e ferramentas</h2>
                  <div className="audit-log">
                    {data.audit.map((a) => (
                      <div key={a.id}>
                        <time>{displayTime(a.timestamp)}</time>
                        <code>{a.action}</code>
                      </div>
                    ))}
                  </div>
                  <details>
                    <summary>Reiniciar os dados fictícios</summary>
                    <p>
                      Remove tarefas e eventos da demonstração local. Encerre as
                      sessões de voz primeiro.
                    </p>
                    <button
                      className="button danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Apagar os dados fictícios locais e reiniciar a demonstração?",
                          )
                        )
                          safely(demo("reset"));
                      }}
                    >
                      Reiniciar demonstração
                    </button>
                  </details>
                </div>
              </div>
            </>
          )}
          {modal && (
            <ScheduleModal
              data={data}
              existing={editing}
              close={() => setModal(false)}
              act={act}
            />
          )}
        </>
      )}
    </Shell>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf size={24} />
      </span>
      <p>{text}</p>
    </div>
  );
}
function Dashboard({
  data,
  act,
  schedule,
}: {
  data: Data;
  act: Action;
  schedule: () => void;
}) {
  const reported = data.events.filter(
      (e) => e.evidence_type === "reported",
    ).length,
    waiting = data.runs.filter((r) => r.status === "invited").length,
    pending = data.tasks.filter((t) =>
      ["pending", "accepted"].includes(t.status),
    ).length;
  return (
    <>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="welcome-card">
            <div>
              <span className="eyebrow">PRESENÇA QUE VIRA CUIDADO</span>
              <h2>
                O dia da Helena,
                <br />
                <em>no tempo dela.</em>
              </h2>
              <p>
                Acompanhe o que ela escolheu compartilhar.
                <br />
                Cada relato tem uma fonte. Cada ajuda, um próximo passo.
              </p>
              <button className="button button-light" onClick={schedule}>
                <CalendarDays size={17} /> Combinar uma conversa
              </button>
            </div>
            <div className="circle-portrait">
              <span>H</span>
              <Heart size={20} />
              <small>Dona Helena</small>
            </div>
          </section>
          {data.can_manage_chart && <ChartShortcut key={data.actor.id} />}
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-icon">
                <MessageCircle size={19} />
              </span>
              <strong>{reported}</strong>
              <span>Relatos compartilhados</span>
            </div>
            <div className="stat">
              <span className="stat-icon amber">
                <Clock3 size={19} />
              </span>
              <strong>{waiting}</strong>
              <span>Convites aguardando</span>
            </div>
            <div className="stat">
              <span className="stat-icon teal">
                <CheckCheck size={19} />
              </span>
              <strong>{pending}</strong>
              <span>Tarefas em aberto</span>
            </div>
          </div>
          {data.actor.role === "relative" && (
            <FamilyCheckinReportCard report={data.checkin_report} />
          )}
          <section className="card timeline-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">O QUE FOI COMPARTILHADO</span>
                <h2>Pequenas notícias do círculo</h2>
              </div>
              <span className="soft-label">Com fonte e contexto</span>
            </div>
            {data.events.length ? (
              <div className="timeline">
                {data.events.map((e) => (
                  <article className="timeline-item" key={e.id}>
                    <span className="timeline-dot">
                      <MessageCircle size={15} />
                    </span>
                    <div className="timeline-time">
                      <time>{displayTime(e.event_time)}</time>
                      <small>{displayDate(e.event_time).split(",")[0]}</small>
                    </div>
                    <div className="timeline-body">
                      <div className="button-row">
                        <Badge status={e.evidence_type} />
                        {!!e.simulated && (
                          <span className="fixture-label">SIMULAÇÃO</span>
                        )}
                      </div>
                      <p>{e.summary}</p>
                      <small>
                        Fonte: evento autorizado · {e.id.slice(0, 8)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty text="Ainda não há relatos autorizados. Sem registros, não podemos afirmar como Helena está." />
            )}
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>Tarefas compartilhadas</h2>
              <Link href="/familia/tarefas" className="text-link">
                Ver todas
              </Link>
            </div>
            <TaskList data={data} act={act} />
          </section>
        </div>
        <aside className="dashboard-rail">
          {data.actor.role === "relative" && (
            <CaregiverPicker
              data={data}
              save={(caregiver_id) =>
                act("select_caregiver", {
                  care_profile_id: data.profile.id,
                  caregiver_id,
                })
              }
            />
          )}
          <Copilot
            key={data.actor.id + String(data.can_manage_chart)}
            data={data}
            act={act}
          />
          <Channels />
          <MedsCard />
          <AgendaCard />
          <section className="card">
            <div className="card-heading">
              <h2>Próximas conversas</h2>
              <CalendarDays size={20} />
            </div>
            <RoutineList data={data} compact />
            <button className="subtle-button" onClick={schedule}>
              <Plus size={16} /> Agendar uma conversa
            </button>
          </section>
          <section className="privacy-note">
            <ShieldCheck size={21} />
            <div>
              <strong>Ela decide. Você acompanha.</strong>
              <p>
                Exibimos relatos autorizados, sem guardar conversas completas.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
function FamilyCheckinReportCard({
  report,
}: {
  report: Data["checkin_report"];
}) {
  return (
    <section className="card" aria-labelledby="family-checkin-report-heading">
      <div className="card-heading">
        <div>
          <span className="eyebrow">ACOMPANHAMENTO FAMILIAR</span>
          <h2 id="family-checkin-report-heading">Resumo de acompanhamento</h2>
        </div>
        {report?.source.simulated && (
          <span className="fixture-label">SIMULAÇÃO</span>
        )}
      </div>
      {!report ? (
        <Empty text="Não há registros autorizados para resumir. Isso não informa como a pessoa está." />
      ) : (
        <>
          <dl className="checkin-report-fields">
            <div>
              <dt>Situação</dt>
              <dd>
                {report.situation} · {displayDate(report.source.at)}
              </dd>
            </div>
            {report.context && (
              <div>
                <dt>Contexto</dt>
                <dd>Convite na agenda: {report.context}</dd>
              </div>
            )}
            <div>
              <dt>O que foi relatado ou registrado</dt>
              <dd>
                {report.observation ?? "Não há relato para este registro."}
              </dd>
            </div>
            <div>
              <dt>O que ficou sem confirmação</dt>
              <dd>{report.verification}</dd>
            </div>
            <div>
              <dt>Próximo passo</dt>
              <dd>
                {report.nextStep ? (
                  <>
                    <span>
                      {report.nextStep.title} · {report.nextStep.responsible}
                    </span>{" "}
                    <span className={`status status-${report.nextStep.status}`}>
                      Status:{" "}
                      {statusLabel[report.nextStep.status] ||
                        report.nextStep.status}
                    </span>
                  </>
                ) : (
                  "Nenhuma tarefa vinculada a este registro."
                )}
              </dd>
            </div>
          </dl>
          <p className="fine-print">
            Fonte: registro autorizado · {report.source.id.slice(0, 8)}. Este
            resumo não avalia a saúde nem altera o plano de acompanhamento.
          </p>
        </>
      )}
    </section>
  );
}
function Channels() {
  const [num, setNum] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(""),
    [note, setNote] = useState(""),
    [err, setErr] = useState("");
  async function go(kind: "whatsapp" | "call", to?: string, text?: string) {
    setBusy(kind);
    setErr("");
    setNote("");
    try {
      const r = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, to: to ?? num, message: text ?? msg }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha no envio.");
      setNote(
        kind === "whatsapp"
          ? "Enviado — a pessoa recebe uma nota de voz da Lia no WhatsApp."
          : "Ligando — a Lia chama e fala a mensagem ao vivo.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="card">
      <div className="card-heading">
        <h2>Canais reais</h2>
        <PhoneCall size={20} />
      </div>
      <p className="soft-label">
        A Lia alcança a família onde ela já está — mensagem vira nota de voz,
        ligação fala ao vivo.
      </p>
      <label>
        Número
        <input
          value={num}
          onChange={(e) => setNum(e.target.value)}
          placeholder="5511..."
          inputMode="tel"
        />
      </label>
      <label>
        Mensagem
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Lembrete da consulta de sexta de manhã"
          maxLength={400}
        />
      </label>
      <div className="button-row">
        <button
          className="button button-small"
          disabled={!!busy || !num || !msg}
          onClick={() => void go("whatsapp")}
        >
          {busy === "whatsapp" ? "Enviando…" : "WhatsApp"}
        </button>
        <button
          className="button button-small"
          disabled={!!busy || !num || !msg}
          onClick={() => void go("call")}
        >
          {busy === "call" ? "Ligando…" : "Ligar"}
        </button>
        <button
          className="button button-small"
          disabled={!!busy}
          onClick={() =>
            void go(
              "call",
              "5511951684260",
              "Oi Carlos, aqui é a Lia do CareCircle. Tô ligando ao vivo da demonstração pra mostrar que eu alcanço a família por telefone também.",
            )
          }
        >
          {busy === "call" ? "Ligando…" : "Ligar pro Carlos"}
        </button>
      </div>
      {note && <p className="callout">{note}</p>}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
    </section>
  );
}
type LiaMed = {
  name: string;
  freq_h: number | null;
  obs: string;
  estoque: number | null;
  por_vez: number;
  proximo: number | null;
};
type LiaContact = { nome: string; papel: string; number: string };
type LiaData = {
  meds: LiaMed[];
  contacts: LiaContact[];
  family: { name: string; persona: string }[];
};
function MedsCard() {
  const [meds, setMeds] = useState<LiaMed[] | null>(null),
    [busy, setBusy] = useState(""),
    [note, setNote] = useState(""),
    [err, setErr] = useState("");
  const load = useCallback(
    () => api<LiaData>("/api/lia-data").then(
      data => {
        setMeds(data.meds);
        setErr("");
      },
      (error: unknown) => {
        setErr(error instanceof Error ? error.message : "Não consegui consultar a Lia agora.");
      },
    ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function tomei(name: string) {
    setBusy(name);
    setNote("");
    setErr("");
    try {
      const j = await api<{ result?: string }>("/api/lia-data", {
        action: "tomei",
        name,
      });
      setNote(j.result || "Dose registrada.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Remédios da Lia · WhatsApp</h2>
          <small>
            Estoque e tomadas registrados no canal da Lia. O prontuário mantém
            os lançamentos feitos pela família.
          </small>
        </div>
        <Pill size={20} />
      </div>
      {meds === null ? (
        <p className="muted">Consultando a Lia…</p>
      ) : meds.length === 0 ? (
        <p className="muted">
          Nenhum remédio cadastrado — cadastre pela Lia no WhatsApp
        </p>
      ) : (
        meds.map((m) => (
          <div className="readiness" key={m.name}>
            <span>
              {m.name}{" "}
              <small>
                a cada {m.freq_h}h{m.obs ? ` · ${m.obs}` : ""}
                {m.estoque !== null ? ` · estoque ${m.estoque}` : ""}
              </small>
            </span>
            <button
              className="button button-small"
              disabled={busy === m.name}
              onClick={() => void tomei(m.name)}
            >
              {busy === m.name ? "Registrando…" : "Tomei"}
            </button>
          </div>
        ))
      )}
      {note && <p className="callout">{note}</p>}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
    </section>
  );
}
const PAPEL_LABEL: Record<string, string> = {
  medico: "Médico",
  exame: "Exame",
  farmacia: "Farmácia",
  util: "Útil",
  emergencia: "Emergência",
};
function AgendaCard() {
  const [data, setData] = useState<LiaData | null>(null),
    [pedirFor, setPedirFor] = useState(""),
    [pedido, setPedido] = useState(""),
    [busy, setBusy] = useState(""),
    [note, setNote] = useState(""),
    [err, setErr] = useState("");
  useEffect(() => {
    api<LiaData>("/api/lia-data")
      .then(setData)
      .catch((e) =>
        setErr(e instanceof Error ? e.message : "Indisponível agora."),
      );
  }, []);
  async function pedir(c: LiaContact) {
    setBusy(c.nome);
    setNote("");
    setErr("");
    try {
      const j = await api<{ result?: string }>("/api/lia-data", {
        action: "marca",
        contact: c.nome,
        request: pedido.trim(),
      });
      setNote(j.result || "Lia enviou o pedido em áudio.");
      setPedirFor("");
      setPedido("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível pedir agora.");
    } finally {
      setBusy("");
    }
  }
  const byKind: Record<string, LiaContact[]> = {};
  for (const c of data?.contacts ?? [])
    (byKind[c.papel || "outro"] ??= []).push(c);
  const order = ["medico", "exame", "farmacia", "util"];
  const kinds = [
    ...order.filter((k) => byKind[k]?.length),
    ...Object.keys(byKind).filter((k) => !order.includes(k)),
  ];
  return (
    <section className="card">
      <div className="card-heading">
        <h2>Agenda do círculo</h2>
        <Users size={20} />
      </div>
      {data === null ? (
        <p className="muted">Consultando a Lia…</p>
      ) : (
        <>
          {data.family.length > 0 && (
            <div className="readiness">
              <span>
                Família no círculo{" "}
                <small>{data.family.map((f) => f.name).join(", ")}</small>
              </span>
              <strong>
                {data.family.length}{" "}
                {data.family.length === 1 ? "pessoa" : "pessoas"}
              </strong>
            </div>
          )}
          {kinds.length === 0 ? (
            <p className="muted">
              Agenda vazia — cadastre contatos pela Lia no WhatsApp
            </p>
          ) : (
            kinds.map((k) => (
              <div key={k}>
                <span className="eyebrow">
                  {(PAPEL_LABEL[k] || k).toUpperCase()}
                </span>
                {byKind[k].map((c) => (
                  <div key={`${c.papel}-${c.nome}`}>
                    <div className="readiness">
                      <span>
                        {c.nome} <small>{c.number}</small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setPedirFor(c.nome);
                          setPedido("");
                          setNote("");
                          setErr("");
                        }}
                      >
                        Pedir agendamento
                      </button>
                    </div>
                    {pedirFor === c.nome && (
                      <div className="agenda-ask">
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={pedido}
                          onChange={(e) => setPedido(e.target.value)}
                          placeholder="Ex.: consulta de rotina sexta de manhã"
                        />
                        <div className="button-row">
                          <button
                            className="button button-small"
                            disabled={!!busy || !pedido.trim()}
                            onClick={() => void pedir(c)}
                          >
                            {busy === c.nome ? "Enviando…" : "Confirmar"}
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setPedirFor("")}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}
      {note && <p className="callout">{note}</p>}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
    </section>
  );
}
function TaskList({ data, act }: { data: Data; act: Action }) {
  return data.tasks.length ? (
    <div className="task-list">
      {data.tasks.map((t: Task) => (
        <article className="task" key={t.id}>
          <span className="task-check">
            <CheckCheck size={20} />
          </span>
          <div className="task-body">
            <h3>{t.title}</h3>
            <p>
              {t.items
                .map((i) => (i.quantity ? `${i.quantity} ${i.label}` : i.label))
                .join(" · ") || "Pedido sem itens adicionais."}
            </p>
            <small>
              {data.members.find((m) => m.id === t.assigned_to)?.display_name} ·{" "}
              {displayDate(t.updated_at)}
            </small>
            <div className="button-row">
              <Badge status={t.status} />
              {data.actor.role === "relative" && t.status === "pending" && (
                <button
                  className="button button-small"
                  onClick={() =>
                    void act("update_task", {
                      task_id: t.id,
                      changes: { status: "accepted" },
                    }).catch(() => {})
                  }
                >
                  Posso ajudar
                </button>
              )}
              {data.actor.role === "relative" && t.status === "accepted" && (
                <button
                  className="button button-small"
                  onClick={() =>
                    void act("update_task", {
                      task_id: t.id,
                      changes: { status: "completed" },
                    }).catch(() => {})
                  }
                >
                  Marcar como concluída
                </button>
              )}
              {!["completed", "cancelled"].includes(t.status) && (
                <button
                  className="text-button"
                  onClick={() =>
                    void act("update_task", {
                      task_id: t.id,
                      changes: { status: "cancelled" },
                    }).catch(() => {})
                  }
                >
                  Cancelar tarefa
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <Empty text="Nenhuma tarefa compartilhada por aqui. Os pedidos aparecem após a autorização da Helena." />
  );
}
function RoutineList({
  data,
  act,
  edit,
  compact = false,
}: {
  data: Data;
  act?: Action;
  edit?: (r: Routine) => void;
  compact?: boolean;
}) {
  const routines = compact
    ? data.routines.filter((r) => r.enabled && !r.cancelled_at).slice(0, 3)
    : data.routines;
  return routines.length ? (
    <div className="routine-list">
      {routines.map((r) => (
        <article className="routine" key={r.id}>
          <div className="routine-date">
            <strong>{displayTime(r.next_run_at)}</strong>
            <small>
              {r.schedule_expression === "once" ? "Uma vez" : "Diária"}
            </small>
          </div>
          <div className="routine-body">
            <h3>{r.title}</h3>
            <p>{r.prompt}</p>
            <small>
              {displayDate(r.next_run_at)} ·{" "}
              {r.cancelled_at
                ? "Cancelada"
                : r.enabled
                  ? "Agendada"
                  : "Pausada ou já disparada"}
            </small>
            {!compact && !r.cancelled_at && act && (
              <div className="button-row">
                <button className="text-button" onClick={() => edit?.(r)}>
                  Editar horário
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void act("change_routine", {
                      routine_id: r.id,
                      operation: r.enabled ? "pause" : "resume",
                    }).catch(() => {})
                  }
                >
                  {r.enabled ? "Pausar" : "Retomar"}
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void act("change_routine", {
                      routine_id: r.id,
                      operation: "cancel",
                    }).catch(() => {})
                  }
                >
                  Cancelar
                </button>
                {data.runs.some(
                  (rr) => rr.routine_id === r.id && rr.status === "failed",
                ) && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void act("change_routine", {
                        routine_id: r.id,
                        operation: "retry",
                      }).catch(() => {})
                    }
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  ) : (
    <Empty text="Há espaço para uma boa conversa. Agende o próximo convite." />
  );
}
function ScheduleModal({
  data,
  existing,
  close,
  act,
}: {
  data: Data;
  existing?: Routine;
  close: () => void;
  act: Action;
}) {
  const [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState("");
  const key = useRef(crypto.randomUUID());
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog ref={dialog} className="schedule-dialog" onCancel={close}>
      <div className="card-heading">
        <div>
          <span className="eyebrow">UM TEMPO PARA CONVERSAR</span>
          <h2>{existing ? "Editar conversa" : "Agendar conversa"}</h2>
        </div>
        <button
          aria-label="Fechar agendamento"
          className="icon-button"
          onClick={close}
        >
          <X />
        </button>
      </div>
      <p>
        Helena receberá um convite. O microfone só será ligado se ela escolher
        entrar.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setLocalError("");
          const f = new FormData(e.currentTarget);
          const input = {
            title: f.get("title"),
            prompt: f.get("prompt"),
            local_datetime: f.get("local_datetime"),
            repeat: f.get("repeat") || "once",
            idempotency_key: key.current,
          };
          try {
            await act(
              existing ? "change_routine" : "create_routine",
              existing
                ? { ...input, routine_id: existing.id, operation: "update" }
                : input,
            );
            close();
          } catch (err) {
            setLocalError(
              err instanceof Error ? err.message : "Não foi possível agendar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Título
          <input
            name="title"
            defaultValue={
              existing?.title || `Uma conversa com ${data.caregiver.name}`
            }
            required
            maxLength={160}
          />
        </label>
        <label>
          Quando? · horário de São Paulo
          <input
            name="local_datetime"
            type="datetime-local"
            defaultValue={
              existing
                ? localInput(existing.next_run_at)
                : `${localInput(data.demo_clock).slice(0, 10)}T16:00`
            }
            required
          />
        </label>
        {!existing && (
          <label>
            Repetição
            <select name="repeat">
              <option value="once">Somente uma vez</option>
              <option value="daily">Todos os dias</option>
            </select>
          </label>
        )}
        <label>
          O que {data.caregiver.name} deve perguntar?
          <textarea
            name="prompt"
            defaultValue={
              existing?.prompt ||
              "Pergunte se a dona Helena precisa de alguma coisa."
            }
            required
            maxLength={500}
          />
        </label>
        <p className="fine-print">Horário silencioso: das 21h às 8h.</p>
        {localError && (
          <p role="alert" className="form-error">
            {localError}
          </p>
        )}
        <div className="button-row">
          <button className="button" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}{" "}
            Confirmar agendamento
          </button>
          <button type="button" className="text-button" onClick={close}>
            Agora não
          </button>
        </div>
      </form>
    </dialog>
  );
}
function Copilot({ data, act }: { data: Data; act: Action }) {
  const [question, setQuestion] = useState(""),
    [reply, setReply] = useState<CopilotResult | null>(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  const key = useRef(crypto.randomUUID());
  async function ask(q: string) {
    setBusy(true);
    setErr("");
    try {
      setReply(await api<CopilotResult>("/api/copilot", { question: q }));
      setQuestion("");
      key.current = crypto.randomUUID();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível consultar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="copilot-card">
      <div className="card-heading">
        <div className="copilot-title">
          <span className="copilot-icon">
            <Sparkles size={21} />
          </span>
          <div>
            <h2>Care Copilot</h2>
            <small>INFORMAÇÃO COM CONTEXTO</small>
          </div>
        </div>
      </div>
      <p>O que você gostaria de saber sobre o círculo da Helena?</p>
      <div className="suggestions">
        {[
          "Como foi o dia da minha mãe?",
          "Tem alguma solicitação pendente?",
          "Quando foi a última conversa?",
          ...(data.can_manage_chart
            ? [
                "Como está o estoque de medicamentos?",
                "Qual o preparo do próximo exame?",
                "Qual é o objetivo do plano familiar?",
              ]
            : []),
        ].map((q) => (
          <button key={q} disabled={busy} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>
      {reply && (
        <div className="copilot-answer" aria-live="polite">
          <span className="eyebrow">
            {reply.mode === "ai_tools"
              ? "CONSULTA POR FERRAMENTAS"
              : "CONSULTA AOS REGISTROS"}
          </span>
          <p>{reply.answer}</p>
          {reply.notice && <small>{reply.notice}</small>}
          {reply.sources.length > 0 && (
            <details>
              <summary>Ver fontes ({reply.sources.length})</summary>
              {reply.sources.map((s) => (
                <p className="source" key={s.id}>
                  {displayDate(s.event_time)} ·{" "}
                  {statusLabel[s.status] || s.status}
                  <br />
                  <code>{s.id.slice(0, 8)}</code>
                </p>
              ))}
            </details>
          )}
          {reply.requires_confirmation && reply.routine && (
            <div className="proposed-routine">
              <strong>{reply.routine.prompt}</strong>
              <p>{reply.routine.local_datetime} · São Paulo</p>
              <button
                className="button button-small"
                onClick={() =>
                  void act("create_routine", {
                    ...reply.routine,
                    idempotency_key: key.current,
                  })
                    .then(() =>
                      setReply({
                        ...reply,
                        requires_confirmation: false,
                        answer:
                          "Agendamento salvo. Helena receberá um convite no horário escolhido.",
                      }),
                    )
                    .catch(() => {})
                }
              >
                Confirmar agendamento
              </button>
            </div>
          )}
        </div>
      )}
      {err && (
        <p role="alert" className="form-error">
          {err}
        </p>
      )}
      <form
        className="copilot-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          aria-label="Pergunta ao Care Copilot"
          placeholder="Pergunte ao seu círculo…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={800}
          required
        />
        <button
          disabled={busy || !question.trim()}
          aria-label="Enviar pergunta"
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
      <span className="copilot-source">
        <ShieldCheck size={13} /> Apenas registros autorizados. Sem suposições.
      </span>
      {!data.openai_configured && (
        <small>Modo de consulta direta: OpenAI não configurada.</small>
      )}
    </section>
  );
}
function Elder({
  data,
  act,
  refresh,
}: {
  data: Data;
  act: Action;
  refresh: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [messages, setMessages] = useState<
      { role: "user" | "assistant"; content: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fastingReturn = data.notifications.find(n => n.type === "fasting_return");
  return (
    <div className="elder-layout">
      <div>
        {fastingReturn && <section className="card fasting-dialog fasting-return" aria-live="polite">
          <p className="eyebrow">LIA DE VOLTA PARA HELENA</p><h2>Café, remédio e jejum</h2><p>{fastingReturn.message}</p>
          <button className="button button-light" onClick={()=>{if(window.speechSynthesis){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(fastingReturn.message);u.lang="pt-BR";window.speechSynthesis.speak(u)}}}>Ouvir o retorno da Lia</button>
        </section>}
        <VoicePanel
          key={
            data.consents.some((c) => c.scope === "checkins")
              ? "allowed"
              : "revoked"
          }
          configured={data.agora_configured}
          caregiver={data.caregiver}
          invitation={data.notifications.find(
            (n) => n.type === "invitation" && n.status === "delivered",
          )}
          consented={data.consents.some((c) => c.scope === "checkins")}
          onChange={refresh}
        />
        <Link className="text-link" href="/demo/jejum">Cenário 2 · Perguntar sobre café em jejum</Link>
        {data.proposals.length > 0 && (
          <section className="card proposals">
            <span className="eyebrow">VOCÊ DECIDE</span>
            <h2>Podemos compartilhar?</h2>
            {data.proposals.map((p: Proposal) => (
              <div className="proposal" key={p.id}>
                <h3>
                  {p.payload.title ||
                    p.payload.changes?.title ||
                    (p.kind === "update_task"
                      ? "Corrigir meu pedido"
                      : "Compartilhar meu relato")}
                </h3>
                <p>{p.payload.response}</p>
                {p.payload._realtime && (
                  <p role="status">
                    Pedido atualizado · revise os detalhes antes de
                    compartilhar.
                  </p>
                )}
                <ul>
                  {(p.payload.items || p.payload.changes?.items || []).map(
                    (i) => (
                      <li key={i.label}>
                        {i.label} {i.quantity || ""}
                      </li>
                    ),
                  )}
                </ul>
                <p>
                  Destinatário:{" "}
                  {data.members.find((m) => m.id === p.payload.assignee_id)
                    ?.display_name || "familiar responsável pelo pedido"}
                  . Confira os itens e a autorização abaixo.
                </p>
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() =>
                      void act("confirm_proposal", {
                        proposal_id: p.id,
                        revision: p.payload._realtime?.revision,
                        confirmed: true,
                      }).catch(() => {})
                    }
                  >
                    <Check size={18} /> Confirmar e compartilhar
                  </button>
                  <button
                    className="button button-light"
                    onClick={() =>
                      void act("confirm_proposal", {
                        proposal_id: p.id,
                        revision: p.payload._realtime?.revision,
                        confirmed: false,
                      }).catch(() => {})
                    }
                  >
                    Não compartilhar
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
        <section className="card">
          <h2>Pedidos que você compartilhou</h2>
          <TaskList data={data} act={act} />
        </section>
        <details className="card text-test">
          <summary>Testar o fluxo por texto · sem voz Agora</summary>
          <p>
            Este teste chama a IA por texto. Não inicia áudio nem representa uma
            sessão Agora.
          </p>
          <div className="text-messages">
            {messages.map((m, i) => (
              <p key={i}>
                <strong>{m.role === "user" ? "Helena" : "Lia"}:</strong>{" "}
                {m.content}
              </p>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const next = [
                ...messages,
                { role: "user" as const, content: text },
              ].slice(-15);
              setMessages(next);
              setText("");
              try {
                const result = await api<{ answer: string }>(
                  "/api/voice/text",
                  { messages: next },
                );
                setMessages([
                  ...next,
                  { role: "assistant", content: result.answer },
                ]);
                await refresh();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Falha no teste.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Mensagem para Lia
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1500}
                required
                placeholder="Pede pro Pedro me acompanhar à feira sábado."
              />
            </label>
            <button className="button button-small" disabled={busy}>
              Enviar mensagem de teste
            </button>
          </form>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </details>
      </div>
      <aside>
        <section className="card privacy-card" id="privacidade">
          <span className="section-icon">
            <ShieldCheck />
          </span>
          <h2>
            O cuidado começa
            <br />
            com a sua escolha.
          </h2>
          <p>
            Você decide quem recebe seus pedidos e relatos. Não guardamos a
            conversa completa.
          </p>
          <label className="consent-toggle">
            <input
              type="checkbox"
              checked={data.consents.some((c) => c.scope === "checkins")}
              onChange={(e) =>
                void act("change_consent", {
                  scope: "checkins",
                  granted: e.target.checked,
                }).catch(() => {})
              }
            />
            <span>
              Quero receber convites para conversar com {data.caregiver.name}
            </span>
          </label>
          {data.members
            .filter((m) => m.role === "relative")
            .map((m) => (
              <label key={m.id} className="consent-toggle">
                <input
                  type="checkbox"
                  checked={data.consents.some(
                    (c) =>
                      c.scope === "family_updates" && c.recipient_id === m.id,
                  )}
                  onChange={(e) =>
                    void act("change_consent", {
                      scope: "family_updates",
                      recipient_id: m.id,
                      granted: e.target.checked,
                    }).catch(() => {})
                  }
                />
                <span>
                  Permitir compartilhar pedidos e relatos revisados com{" "}
                  {m.display_name}
                </span>
              </label>
            ))}
          {data.members
            .filter((m) => m.role === "relative")
            .map((m) => (
              <label className="consent-toggle" key={"chart" + m.id}>
                <input
                  type="checkbox"
                  checked={data.chart_readers.includes(m.id)}
                  onChange={(e) => {
                    setError("");
                    void api("/api/prontuario", {
                      action: "access",
                      memberId: m.id,
                      granted: e.target.checked,
                    })
                      .then(refresh)
                      .catch((err) => setError(err.message));
                  }}
                />
                <span>
                  Permitir que {m.display_name} consulte e atualize meu
                  prontuário familiar, medicamentos e agenda de saúde
                </span>
              </label>
            ))}
          <p className="privacy-boundary">
            {data.caregiver.name} é uma assistente virtual. Não realiza
            diagnóstico, aconselhamento médico ou monitoramento de emergências.
          </p>
        </section>
        <ManualRequest data={data} refresh={refresh} />
      </aside>
    </div>
  );
}
function ManualRequest({
  data,
  refresh,
}: {
  data: Data;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  return (
    <details className="card">
      <summary>Prefiro escrever meu pedido</summary>
      <p>Alternativa acessível por formulário. Não é uma conversa de voz.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const form = e.currentTarget,
            f = new FormData(form);
          try {
            await api("/api/proposals", {
              task: {
                care_profile_id: data.profile.id,
                title: String(f.get("title")),
                items: String(f.get("items"))
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((label) => ({ label })),
                assignee_id: f.get("assignee"),
                idempotency_key: key.current,
              },
            });
            key.current = crypto.randomUUID();
            form.reset();
            await refresh();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Não foi possível preparar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Meu pedido
          <input
            name="title"
            defaultValue="Companhia para ir à feira no sábado"
            required
            maxLength={160}
          />
        </label>
        <label>
          Itens, separados por vírgula
          <input name="items" placeholder="Sábado, às 10:00" maxLength={500} />
        </label>
        <label>
          Para quem?
          <select name="assignee">
            {data.members
              .filter((m) => m.role === "relative")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy} className="button button-small">
          Revisar antes de compartilhar
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
