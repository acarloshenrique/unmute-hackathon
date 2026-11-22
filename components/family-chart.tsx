"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  History,
  MapPin,
  NotebookPen,
  Package,
  Pill,
  Plus,
} from "lucide-react";
import { api, displayDate, displayTime, type Data } from "@/lib/client";
import {
  type ChartData,
  type Intake,
  type Visit,
  historyLabels,
  calendarDay,
  planStages,
  quantityLabel,
  stockDays,
} from "@/lib/chart-model";
import { visitCalendar } from "@/lib/chart-calendar";
import { ChartForm, type Editor } from "./chart-form";

const sections = [
  { key: "resumo", title: "Resumo", icon: BookOpen },
  { key: "plano", title: "Plano e cotidiano", icon: HeartPulse },
  { key: "medicamentos", title: "Medicamentos", icon: Pill },
  { key: "agenda", title: "Agenda e preparo", icon: CalendarDays },
  { key: "historico", title: "Histórico", icon: History },
] as const;
type Section = (typeof sections)[number]["key"];
function useChart(day?: string) {
  const [data, setData] = useState<ChartData | null>(null),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const nextSequence = useCallback(() => ++sequence.current, []);
  const refresh = useCallback(async () => {
    const n = nextSequence();
    try {
      const result = await api<ChartData>(
        "/api/prontuario" + (day ? "?day=" + encodeURIComponent(day) : ""),
      );
      if (n === sequence.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (n === sequence.current) {
        setData(null);
        setError(
          e instanceof Error ? e.message : "Não foi possível atualizar.",
        );
      }
    }
  }, [day, nextSequence]);
  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0),
      timer = setInterval(() => void refresh(), 8000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      nextSequence();
    };
  }, [refresh, nextSequence]);
  return { data, error, refresh };
}
function dueReminders(data: ChartData) {
  const notices: {
    key: string;
    text: string;
    time: string;
    section: Section;
    dateOnly?: boolean;
  }[] = [];
  if (
    data.plan &&
    data.plan.stage !== planStages[2] &&
    data.plan.review_on <= data.today
  )
    notices.push({
      key: data.plan.version_id,
      text: "Rever o objetivo com a pessoa acompanhada",
      time: data.plan.review_on,
      dateOnly: true,
      section: "plano",
    });
  for (const dose of data.doses)
    if (!dose.status && dose.scheduled_at <= data.asOf)
      notices.push({
        key: dose.regimen_id + dose.scheduled_at,
        text: dose.name + " · tomada sem registro",
        time: dose.scheduled_at,
        section: "medicamentos",
      });
  for (const v of data.visits) {
    if (v.reminder_at <= data.asOf)
      notices.push({
        key: v.id,
        text: v.title + " · " + displayDate(v.scheduled_at),
        time: v.reminder_at,
        section: "agenda",
      });
    for (const s of v.steps)
      if (!s.completed_at && s.due_at <= data.asOf)
        notices.push({
          key: s.id,
          text: v.title + " · " + s.instruction,
          time: s.due_at,
          section: "agenda",
        });
  }
  return notices.sort((a, b) => a.time.localeCompare(b.time));
}
export function ChartShortcut() {
  const { data, error } = useChart();
  const reminders = data ? dueReminders(data) : [];
  return (
    <section className="card chart-shortcut">
      <div className="card-heading">
        <div>
          <h2>Prontuário familiar</h2>
          <p>Medicamentos, preparos e atendimentos.</p>
        </div>
        <ClipboardList size={23} />
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <p aria-live="polite">
          <Bell size={16} />{" "}
          {reminders.length
            ? `${reminders.length} lembrete(s) para conferir`
            : "Nenhum lembrete vencido no painel"}
          {reminders.length > 0 && <small>{reminders[0].text}</small>}
        </p>
      )}
      <Link className="text-link" href="/familia/prontuario">
        Abrir prontuário <ArrowRight size={16} />
      </Link>
    </section>
  );
}
function DoseList({
  doses,
  now,
  edit,
}: {
  doses: Intake[];
  now: string;
  edit: (v: Editor) => void;
}) {
  if (!doses.length)
    return (
      <p className="chart-empty">
        Nenhuma tomada prevista para a data selecionada.
      </p>
    );
  return (
    <div>
      {doses.map((d) => (
        <div className="chart-line" key={d.regimen_id + d.scheduled_at}>
          <time>{displayTime(d.scheduled_at)}</time>
          <div>
            <strong>{d.name}</strong>
            <small>
              {d.dose} ·{" "}
              {d.status === "taken"
                ? "Tomada relatada"
                : d.status === "skipped"
                  ? "Não tomou, segundo relato"
                  : d.scheduled_at <= now
                    ? "Sem registro"
                    : "Prevista"}
              {d.reporter ? " · " + d.reporter : ""}
            </small>
          </div>
          {d.scheduled_at <= now && (
            <button
              className="subtle-button"
              onClick={() => edit({ kind: "intake", dose: d })}
            >
              {d.status ? "Corrigir relato" : "Registrar"}
            </button>
          )}
          {d.status === "taken" && (
            <Check size={17} aria-label="Tomada relatada" />
          )}
        </div>
      ))}
    </div>
  );
}
function VisitCard({
  v,
  edit,
  confirmStep,
  busy,
}: {
  v: Visit;
  edit: (v: Editor) => void;
  confirmStep: (id: string) => void;
  busy: boolean;
}) {
  return (
    <article className="card chart-visit">
      <div className="chart-section-heading">
        <div>
          <span className="chart-tag">{v.kind}</span>
          <h3>{v.title}</h3>
        </div>
        <button
          className="subtle-button"
          onClick={() => edit({ kind: "visit_status", visit: v })}
        >
          Atualizar situação
        </button>
      </div>
      <p className="chart-icon-text">
        <CalendarDays size={17} />
        {displayDate(v.scheduled_at)} <span>·</span> <MapPin size={16} />
        {v.location}
      </p>
      <p className="chart-icon-text">
        <Bell size={16} />
        Lembrete no painel em {displayDate(v.reminder_at)}
      </p>
      <div className="chart-prep">
        <h4>
          Preparo{" "}
          <small>
            {v.steps.filter((s) => s.completed_at).length} de {v.steps.length}{" "}
            etapas concluídas
          </small>
        </h4>
        {v.steps.length ? (
          v.steps.map((s) => (
            <div className="chart-line" key={s.id}>
              <div>
                <strong>{s.instruction}</strong>
                <small>
                  {displayDate(s.due_at)}
                  {s.completed_at
                    ? " · Concluída em " + displayDate(s.completed_at)
                    : " · A fazer"}
                </small>
              </div>
              {s.completed_at ? (
                <Check size={17} />
              ) : (
                <button
                  className="subtle-button"
                  disabled={busy}
                  onClick={() => confirmStep(s.id)}
                >
                  Concluir etapa
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="muted">Sem instruções de preparo registradas.</p>
        )}
      </div>
      <div className="chart-section-heading">
        <small>Fonte · {v.source}</small>
        <a
          className="text-link"
          download="lembretes-do-atendimento.ics"
          href={
            "data:text/calendar;charset=utf-8," +
            encodeURIComponent(visitCalendar(v, new Date().toISOString()))
          }
        >
          <CalendarDays size={16} /> Baixar lembretes para o calendário (.ics)
        </a>
      </div>
    </article>
  );
}
export function FamilyChart({
  context,
  copilot,
}: {
  context: Data;
  copilot: ReactNode;
}) {
  const [section, setSection] = useState<Section>("resumo"),
    [day, setDay] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [message, setMessage] = useState(""),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = section === "medicamentos" ? day : undefined;
  const { data, error, refresh } = useChart(selected);
  useEffect(() => {
    const sync = () => {
      const tab = sections.find((s) => s.key === window.location.hash.slice(1));
      setSection(tab?.key ?? "resumo");
      setMessage("");
      setActionError("");
    };
    const first = setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => {
      clearTimeout(first);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  const updateStep = async (stepId: string) => {
    setBusy(true);
    setActionError("");
    try {
      await api("/api/prontuario", {
        action: "prep",
        stepId,
        requestId: stepId,
      });
      await refresh();
      setMessage("Etapa de preparo concluída.");
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Falha ao salvar o preparo.",
      );
    } finally {
      setBusy(false);
    }
  };
  const edit = (v: Editor) => {
    setActionError("");
    setMessage("");
    setEditor(v);
  };
  if (error)
    return (
      <p role="alert" className="alert error">
        {error}
      </p>
    );
  if (!data) return <p role="status">Carregando o prontuário…</p>;
  const isDayReady = selected ? data.day === selected : data.day === data.today;
  const low = data.medications.filter((m) => stockDays(m) <= 3);
  const next = data.visits.find((v) => v.scheduled_at >= data.asOf);
  const notices = dueReminders(data);
  return (
    <div className="family-chart">
      <nav className="chart-tabs" aria-label="Seções do prontuário">
        {sections.map(({ key, title, icon: Icon }) => (
          <a
            href={"#" + key}
            key={key}
            aria-current={section === key ? "page" : undefined}
          >
            <Icon size={17} />
            {title}
          </a>
        ))}
      </nav>
      {message && (
        <p role="status" className="chart-feedback">
          {message}
        </p>
      )}
      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}
      {section === "resumo" && (
        <>
          <section className="chart-hero">
            <div>
              <span className="chart-hero-label">
                <HeartPulse size={17} /> Pessoa acompanhada
              </span>
              <h2>{context.profile.display_name}</h2>
              <p>
                {data.profile?.reference ||
                  "Pessoa de referência ainda não informada"}
              </p>
            </div>
            <span className="chart-hero-monogram" aria-hidden="true">
              {context.profile.display_name
                .replace(/^Dona\s+/i, "")
                .slice(0, 1)}
            </span>
          </section>
          <section className="card">
            <div className="chart-section-heading">
              <div>
                <h2>O que importa para {context.profile.display_name}</h2>
                <p>
                  {data.plan
                    ? data.plan.goal
                    : "O familiar pode registrar um objetivo nas palavras da pessoa."}
                </p>
                {data.plan && (
                  <small>
                    {data.plan.stage} · revisão em{" "}
                    {calendarDay(data.plan.review_on)}
                  </small>
                )}
              </div>
              <a className="text-link" href="#plano">
                Abrir plano familiar <ChevronRight size={15} />
              </a>
            </div>
          </section>
          <div className="chart-metrics">
            <a href="#medicamentos">
              <Pill />
              <strong>
                {isDayReady
                  ? data.doses.filter((d) => d.status === "taken").length
                  : "…"}{" "}
                <small>/ {isDayReady ? data.doses.length : "…"} hoje</small>
              </strong>
              <span>Tomadas relatadas</span>
            </a>
            <a href="#medicamentos">
              <Package />
              <strong>
                {low.length}{" "}
                <small>
                  {low.length === 1 ? "medicamento" : "medicamentos"}
                </small>
              </strong>
              <span>Estoque para até 3 dias</span>
            </a>
            <a href="#agenda">
              <CalendarDays />
              <strong>
                {next ? displayTime(next.scheduled_at) : "—"}{" "}
                <small>
                  {next
                    ? displayDate(next.scheduled_at).split(",")[0]
                    : "sem data"}
                </small>
              </strong>
              <span>{next ? next.title : "Próximo atendimento"}</span>
            </a>
          </div>
          <div className="chart-columns">
            <div className="chart-stack">
              <section className="card">
                <div className="chart-section-heading">
                  <h2>Ficha de cuidado</h2>
                  <button
                    className="text-link"
                    onClick={() =>
                      edit({ kind: "profile", profile: data.profile })
                    }
                  >
                    Editar ficha
                  </button>
                </div>
                <dl className="chart-facts">
                  {(
                    [
                      ["allergies", "Alergias registradas"],
                      ["conditions", "Condições documentadas"],
                      ["preferences", "Preferências e apoio"],
                      ["reference", "Pessoa ou serviço de referência"],
                    ] as const
                  ).map(([k, label]) => (
                    <div key={k}>
                      <dt>{label}</dt>
                      <dd>
                        {data.profile?.[k] || "Sem informação registrada"}
                      </dd>
                    </div>
                  ))}
                </dl>
                {data.profile && <small>Fonte · {data.profile.source}</small>}
              </section>
              <section className="card">
                <div className="chart-section-heading">
                  <h2>Últimos registros</h2>
                  <a className="text-link" href="#historico">
                    Ver histórico <ChevronRight size={15} />
                  </a>
                </div>
                {data.history.slice(0, 3).map((h) => (
                  <div className="chart-history-row" key={h.request_id}>
                    <span className="chart-tag">{historyLabels[h.kind]}</span>
                    <p>{h.detail}</p>
                    <small>
                      {displayDate(h.at)} · {h.author}
                    </small>
                  </div>
                ))}
              </section>
            </div>
            <aside className="chart-stack">
              <section className="card">
                <div className="chart-section-heading">
                  <h2>Lembretes no painel</h2>
                  <Bell size={20} />
                </div>
                {isDayReady &&
                  (notices.length ? (
                    notices.map((n) => (
                      <a
                        href={"#" + n.section}
                        key={n.key}
                        className="chart-reminder"
                      >
                        <small>
                          {n.dateOnly
                            ? calendarDay(n.time)
                            : displayDate(n.time)}
                        </small>
                        <span>{n.text}</span>
                      </a>
                    ))
                  ) : (
                    <p className="chart-empty">
                      Nenhum lembrete pendente neste momento.
                    </p>
                  ))}
              </section>
              {copilot}
            </aside>
          </div>
        </>
      )}
      {section === "plano" && (
        <>
          <section className="card">
            <div className="chart-section-heading">
              <h2>Objetivo e apoio combinado</h2>
              <button
                className="button"
                onClick={() =>
                  edit({ kind: "plan", plan: data.plan, today: data.today })
                }
              >
                {data.plan ? "Rever objetivo" : "Registrar objetivo"}
              </button>
            </div>
            {data.plan ? (
              <>
                <dl className="chart-facts">
                  <div>
                    <dt>O que importa para a pessoa</dt>
                    <dd>{data.plan.goal}</dd>
                  </div>
                  <div>
                    <dt>Situação</dt>
                    <dd>{data.plan.stage}</dd>
                  </div>
                  <div>
                    <dt>Próximo passo</dt>
                    <dd>{data.plan.next_step}</dd>
                  </div>
                  <div>
                    <dt>Quem pode ajudar</dt>
                    <dd>{data.plan.helper}</dd>
                  </div>
                  <div>
                    <dt>Data de revisão</dt>
                    <dd>{calendarDay(data.plan.review_on)}</dd>
                  </div>
                </dl>
                <small>
                  Registrado por {data.plan.author} em{" "}
                  {displayDate(data.plan.at)}
                </small>
              </>
            ) : (
              <p className="chart-empty">
                Converse sobre algo que a pessoa quer manter ou voltar a fazer.
                Registre o próximo passo e quando vocês vão conversar sobre ele
                de novo.
              </p>
            )}
          </section>
          <section className="card">
            <div className="chart-section-heading">
              <div>
                <h2>Relatos do cotidiano</h2>
                <p>
                  Mudanças percebidas pela pessoa, pela família ou pela equipe e
                  apoios pedidos por quem cuida.
                </p>
              </div>
              <button
                className="button button-light"
                onClick={() => edit({ kind: "observation", today: data.today })}
              >
                Registrar relato
              </button>
            </div>
            {data.observations.length ? (
              data.observations.map((h) => (
                <article className="chart-history-row" key={h.request_id}>
                  <p>{h.detail}</p>
                  <small>
                    Registrado por {h.author} em {displayDate(h.at)}
                  </small>
                </article>
              ))
            ) : (
              <p className="chart-empty">Ainda não há relatos do cotidiano.</p>
            )}
          </section>
          <small>
            Referência para a organização do cuidado familiar ·{" "}
            <a
              className="text-link"
              href="https://www.who.int/publications/i/item/9789240103726"
              target="_blank"
              rel="noreferrer"
            >
              Manual ICOPE da OMS, 2ª edição
            </a>
          </small>
        </>
      )}
      {section === "medicamentos" && (
        <>
          <div className="chart-section-heading">
            <div>
              <h2>Medicamentos</h2>
              <p>Prescrições vigentes e saldo do estoque familiar.</p>
            </div>
            <button
              className="button"
              onClick={() => edit({ kind: "medicine" })}
            >
              <Plus size={17} /> Cadastrar medicamento
            </button>
          </div>
          <section className="card">
            <div className="chart-section-heading">
              <h3>Tomadas previstas</h3>
              <label className="chart-date">
                Data{" "}
                <input
                  aria-label="Data das tomadas"
                  type="date"
                  value={day || data.today}
                  onChange={(e) => setDay(e.target.value)}
                />
              </label>
            </div>
            {isDayReady ? (
              <DoseList doses={data.doses} edit={edit} now={data.asOf} />
            ) : (
              <p>Atualizando os horários…</p>
            )}
          </section>
          <div className="chart-med-grid">
            {data.medications.map((m) => (
              <article key={m.id} className="card chart-med">
                <div className="chart-section-heading">
                  <Pill size={22} />
                  <span
                    className={
                      "chart-tag" + (stockDays(m) <= 3 ? " amber" : "")
                    }
                  >
                    {m.stock < 0
                      ? "Conferir saldo"
                      : stockDays(m) <= 3
                        ? "Reposição próxima"
                        : "Em estoque"}
                  </span>
                </div>
                <h3>{m.name}</h3>
                <p>
                  {m.dose} · {m.times.replaceAll(",", ", ")}
                </p>
                <div className="stock-box">
                  <Package size={20} />
                  <div>
                    <strong>
                      {quantityLabel(m.stock)} {m.unit}
                    </strong>
                    <small>
                      {m.stock < 0
                        ? "O consumo relatado excedeu o saldo lançado."
                        : `Estimativa de ${stockDays(m)} dia(s) completos · ${quantityLabel(m.quantity)} ${m.unit} por tomada`}
                    </small>
                  </div>
                </div>
                <small>Prescrição · {m.source}</small>
                <div className="chart-actions">
                  <button
                    className="button button-small"
                    onClick={() => edit({ kind: "stock", med: m })}
                  >
                    Repor estoque
                  </button>
                  <button
                    className="text-link"
                    onClick={() => edit({ kind: "revision", med: m })}
                  >
                    Alterar prescrição
                  </button>
                  <button
                    className="text-link"
                    onClick={() => edit({ kind: "stop", med: m })}
                  >
                    Encerrar plano
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!data.medications.length && (
            <p className="chart-empty">Nenhuma prescrição vigente.</p>
          )}
        </>
      )}
      {section === "agenda" && (
        <>
          <div className="chart-section-heading">
            <div>
              <h2>Agenda e preparo</h2>
              <p>
                Consultas, exames e procedimentos em aberto. Horários de São
                Paulo.
              </p>
            </div>
            <button className="button" onClick={() => edit({ kind: "visit" })}>
              <Plus size={17} /> Agendar atendimento
            </button>
          </div>
          <details className="card">
            <summary>Resumo para a consulta</summary>
            <h3>Objetivo familiar</h3>
            <p>
              {data.plan
                ? data.plan.goal + " · " + data.plan.stage
                : "Objetivo ainda não registrado."}
            </p>
            <h3>Medicamentos registrados pela família</h3>
            {data.medications.length ? (
              <ul>
                {data.medications.map((m) => (
                  <li key={m.id}>
                    <strong>{m.name}</strong> · {m.dose} ·{" "}
                    {m.times.replaceAll(",", ", ")} · Fonte: {m.source}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum medicamento vigente no prontuário.</p>
            )}
            <h3>Observações recentes para conversar com a equipe</h3>
            {data.observations.length ? (
              <ul>
                {data.observations.slice(0, 3).map((o) => (
                  <li key={o.request_id}>
                    {o.detail} · Registrado por {o.author}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Ainda não há relatos do cotidiano.</p>
            )}
          </details>
          {!data.visits.length && (
            <p className="chart-empty">Nenhum atendimento agendado.</p>
          )}
          {data.visits.map((v) => (
            <VisitCard
              key={v.id}
              v={v}
              edit={edit}
              busy={busy}
              confirmStep={(id) => void updateStep(id)}
            />
          ))}
        </>
      )}
      {section === "historico" && (
        <>
          <div className="chart-section-heading">
            <div>
              <h2>Histórico familiar</h2>
              <p>
                Últimos 150 registros do prontuário e relatos recentes
                compartilhados com você.
              </p>
            </div>
            <button className="button" onClick={() => edit({ kind: "note" })}>
              <NotebookPen size={17} /> Anotar no histórico
            </button>
          </div>
          <section className="card">
            {[
              ...data.history.map((h) => ({
                key: h.request_id,
                time: h.at,
                label: historyLabels[h.kind],
                text: h.detail,
                author: h.author,
              })),
              ...context.events.map((e) => ({
                key: e.id,
                time: e.event_time,
                label: "Relato compartilhado",
                text: e.summary,
                author: e.simulated
                  ? "Evento de demonstração"
                  : "Evento autorizado",
              })),
            ]
              .sort((a, b) => b.time.localeCompare(a.time))
              .map((h) => (
                <article key={h.key} className="chart-history-row">
                  <span className="chart-tag">{h.label}</span>
                  <p>{h.text}</p>
                  <small>
                    {displayDate(h.time)} · {h.author}
                  </small>
                </article>
              ))}
          </section>
        </>
      )}
      {editor && (
        <ChartForm
          editor={editor}
          close={() => setEditor(null)}
          saved={() => {
            setEditor(null);
            setMessage("Registro salvo no prontuário.");
            void refresh();
          }}
        />
      )}
    </div>
  );
}
