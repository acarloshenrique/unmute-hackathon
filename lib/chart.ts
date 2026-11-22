import { DateTime } from "luxon";
import { z } from "zod";
import {
  type Actor,
  DomainError,
  hash,
  profileFor,
  relativeOnly,
} from "./auth";
import { audit, id, now, one, rows, run, transaction } from "./db";
import { formatTime, localToUtc, ZONE } from "./time";
import {
  type ChartData,
  type FamilyPlan,
  planStages,
  everydayTopics,
  observationSources,
  calendarDay,
  type ChartEvent,
  type ChartProfile,
  type Intake,
  type Medicine,
  type Prep,
  type Visit,
  quantityLabel,
  visitTypes,
} from "./chart-model";

const uuid = z.uuid();
const short = z.string().trim().min(1).max(150);
const memo = z.string().trim().max(700);
const quantity = z.number().positive().max(100000).multipleOf(0.01);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const local = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
const date = z.iso.date();
const regimen = {
  dose: short,
  quantity,
  times: z
    .array(clock)
    .min(1)
    .max(12)
    .refine((t) => new Set(t).size === t.length),
  source: short,
};
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"),
    revision: z.number().int().nonnegative(),
    allergies: memo,
    conditions: memo,
    preferences: memo,
    reference: memo,
    source: short,
  }),
  z.object({
    action: z.literal("plan"),
    goal: memo.min(1),
    next_step: memo.min(1),
    helper: short,
    review_on: date,
    stage: z.enum(planStages),
    previous: uuid.nullable(),
  }),
  z.object({
    action: z.literal("observation"),
    topic: z.enum(everydayTopics),
    account: memo.min(1),
    source: z.enum(observationSources),
    observed_on: date,
  }),
  z.object({ action: z.literal("note"), note: memo.min(1) }),
  z.object({
    action: z.literal("medicine"),
    name: short,
    unit: short,
    stock: z.number().nonnegative().max(100000).multipleOf(0.01),
    ...regimen,
  }),
  z.object({ action: z.literal("revision"), regimenId: uuid, ...regimen }),
  z.object({ action: z.literal("stop"), regimenId: uuid, source: short }),
  z.object({ action: z.literal("stock"), medicineId: uuid, amount: quantity }),
  z.object({
    action: z.literal("intake"),
    regimenId: uuid,
    scheduledAt: z.iso.datetime(),
    previousRecord: uuid.nullable().default(null),
    status: z.enum(["taken", "skipped"]),
    reporter: z.enum([
      "Relato da pessoa acompanhada",
      "Observação do familiar",
    ]),
  }),
  z.object({
    action: z.literal("visit"),
    kind: z.enum(visitTypes),
    title: short,
    location: short,
    scheduled: local,
    reminder: local,
    source: short,
    steps: z.array(z.object({ instruction: memo.min(1), due: local })).max(20),
  }),
  z.object({ action: z.literal("prep"), stepId: uuid }),
  z.object({
    action: z.literal("visit_status"),
    visitId: uuid,
    status: z.enum(["done", "cancelled"]),
  }),
]);
const conflict = (message: string) => new DomainError("CONFLICT", message, 409);
const missing = () =>
  new DomainError("NOT_FOUND", "Registro não encontrado.", 404);
export const chartAccess = (profile: string, member: string) =>
  !!one(
    "SELECT 1 FROM record_access WHERE profile_id=? AND member_id=?",
    profile,
    member,
  );
function authorized(actor: Actor) {
  relativeOnly(actor);
  const p = String(profileFor(actor).id);
  if (!chartAccess(p, actor.id))
    throw new DomainError(
      "FORBIDDEN",
      "O prontuário precisa de autorização da pessoa acompanhada.",
      403,
    );
  return p;
}
export function setChartAccess(actor: Actor, input: unknown) {
  const d = z.object({ memberId: uuid, granted: z.boolean() }).parse(input);
  const p = profileFor(actor);
  if (
    actor.role !== "elder" ||
    !one(
      "SELECT id FROM members WHERE id=? AND family_id=? AND role='relative'",
      d.memberId,
      actor.family_id,
    )
  )
    throw new DomainError(
      "FORBIDDEN",
      "Somente a pessoa acompanhada pode autorizar um familiar do círculo.",
      403,
    );
  return transaction(() => {
    if (d.granted)
      run("INSERT OR IGNORE INTO record_access VALUES(?,?)", p.id, d.memberId);
    else
      run(
        "DELETE FROM record_access WHERE profile_id=? AND member_id=?",
        p.id,
        d.memberId,
      );
    audit(
      actor.id,
      d.granted ? "chart_access_granted" : "chart_access_revoked",
      "care_profiles",
      String(p.id),
      { member: d.memberId },
    );
  });
}
const medicineSelect = `SELECT m.id,m.name,m.unit,m.stock,r.id AS regimen_id,r.dose,r.quantity,r.times,r.source,r.starts_at,r.ends_at
  FROM chart_medicines m JOIN chart_regimens r ON r.medicine_id=m.id`;
function getRegimen(p: string, rid: string) {
  const m = one<Medicine & { ends_at: string | null }>(
    medicineSelect + " WHERE m.profile_id=? AND r.id=?",
    p,
    rid,
  );
  if (!m) throw missing();
  return m;
}
function createRegimen(
  mid: string,
  d: { dose: string; quantity: number; times: string[]; source: string },
  at: string,
) {
  run(
    "INSERT INTO chart_regimens VALUES(?,?,?,?,?,?,?,NULL)",
    id(),
    mid,
    d.dose,
    d.quantity,
    [...d.times].sort().join(","),
    d.source,
    at,
  );
}
function log(
  p: string,
  actor: string,
  key: string,
  kind: string,
  fingerprint: string,
  detail: string,
  at: string,
) {
  run(
    "INSERT INTO chart_history VALUES(?,?,?,?,?,?,?)",
    key,
    p,
    actor,
    kind,
    at,
    detail,
    fingerprint,
  );
}
export function writeChart(actor: Actor, input: unknown, at = now()) {
  const d = command.parse(input);
  const { requestId } = z.object({ requestId: uuid }).parse(input);
  const fingerprint = hash(JSON.stringify(d));
  return transaction(() => {
    const p = authorized(actor);
    const previous = one(
      "SELECT profile_id,actor_id,fingerprint FROM chart_history WHERE request_id=?",
      requestId,
    );
    if (previous) {
      if (
        previous.profile_id === p &&
        previous.actor_id === actor.id &&
        previous.fingerprint === fingerprint
      )
        return;
      throw conflict("Este registro já foi processado.");
    }
    let detail: string;
    switch (d.action) {
      case "profile": {
        const result = one<ChartProfile>(
          "SELECT * FROM family_charts WHERE profile_id=?",
          p,
        );
        if ((result?.revision ?? 0) !== d.revision)
          throw conflict(
            "A ficha mudou. Reabra o formulário com os dados atuais.",
          );
        run(
          `INSERT INTO family_charts VALUES(?,?,?,?,?,?,?) ON CONFLICT(profile_id) DO UPDATE SET allergies=excluded.allergies,
          conditions=excluded.conditions,preferences=excluded.preferences,reference=excluded.reference,source=excluded.source,revision=excluded.revision`,
          p,
          d.allergies,
          d.conditions,
          d.preferences,
          d.reference,
          d.source,
          d.revision + 1,
        );
        detail =
          [
            ["Alergias", d.allergies],
            ["Condições", d.conditions],
            ["Preferências", d.preferences],
            ["Referência", d.reference],
          ]
            .map(([k, v]) => k + ": " + (v || "sem informação"))
            .join(" · ") +
          " · Fonte: " +
          d.source;
        break;
      }
      case "plan": {
        const previousPlan = one<{ version_id: string }>(
          "SELECT version_id FROM chart_family_plans WHERE profile_id=?",
          p,
        );
        if ((previousPlan?.version_id ?? null) !== d.previous)
          throw conflict(
            "Outra pessoa atualizou o plano. Reabra o formulário para conferir a versão atual.",
          );
        run(
          `INSERT INTO chart_family_plans(profile_id,goal,next_step,helper,review_on,stage,version_id) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(profile_id) DO UPDATE SET goal=excluded.goal,next_step=excluded.next_step,helper=excluded.helper,review_on=excluded.review_on,stage=excluded.stage,version_id=excluded.version_id`,
          p,
          d.goal,
          d.next_step,
          d.helper,
          d.review_on,
          d.stage,
          requestId,
        );
        detail = [
          d.stage,
          d.goal,
          "Próximo passo: " + d.next_step,
          "Apoio: " + d.helper,
          "Revisão: " + calendarDay(d.review_on),
        ].join(" · ");
        break;
      }
      case "observation": {
        if (d.observed_on > DateTime.fromISO(at, { zone: ZONE }).toISODate()!)
          throw new DomainError(
            "INVALID_TIME",
            "A data do relato precisa ser hoje ou anterior.",
          );
        detail = [
          d.topic,
          calendarDay(d.observed_on),
          d.source,
          d.account,
        ].join(" · ");
        break;
      }
      case "note":
        detail = d.note;
        break;
      case "medicine": {
        const mid = id();
        run(
          "INSERT INTO chart_medicines VALUES(?,?,?,?,?)",
          mid,
          p,
          d.name,
          d.unit,
          d.stock,
        );
        createRegimen(mid, d, at);
        detail = `${d.name} · ${d.dose} · ${d.times.join(", ")} · ${quantityLabel(d.quantity)} ${d.unit} por tomada. Estoque inicial: ${quantityLabel(d.stock)} ${d.unit}. Fonte: ${d.source}.`;
        break;
      }
      case "revision":
      case "stop": {
        const m = getRegimen(p, d.regimenId);
        if (m.ends_at)
          throw conflict("A prescrição já mudou. Confira a versão vigente.");
        run("UPDATE chart_regimens SET ends_at=? WHERE id=?", at, d.regimenId);
        if (d.action === "revision") createRegimen(m.id, d, at);
        const before = `${m.dose} · ${m.times} · ${quantityLabel(m.quantity)} ${m.unit} por tomada`;
        detail =
          d.action === "revision"
            ? `${m.name}: de ${before} para ${d.dose} · ${d.times.join(", ")} · ${quantityLabel(d.quantity)} ${m.unit} por tomada. Fonte: ${d.source}.`
            : `${m.name}: encerrado o plano ${before}. Fonte: ${d.source}.`;
        break;
      }
      case "stock": {
        const m = one<{ name: string; unit: string }>(
          "SELECT name,unit FROM chart_medicines WHERE profile_id=? AND id=?",
          p,
          d.medicineId,
        );
        if (!m) throw missing();
        run(
          "UPDATE chart_medicines SET stock=ROUND(stock+?,2) WHERE id=?",
          d.amount,
          d.medicineId,
        );
        detail = `Reposição de ${quantityLabel(d.amount)} ${m.unit} · ${m.name}.`;
        break;
      }
      case "intake": {
        const m = getRegimen(p, d.regimenId);
        const scheduled = DateTime.fromISO(d.scheduledAt, { zone: ZONE });
        const instant = scheduled.toUTC().toISO()!;
        if (
          instant > at ||
          instant < m.starts_at ||
          (m.ends_at && instant >= m.ends_at) ||
          scheduled.second !== 0 ||
          scheduled.millisecond !== 0 ||
          !m.times.split(",").includes(scheduled.toFormat("HH:mm"))
        )
          throw conflict(
            "O horário informado não corresponde a uma tomada prevista já vencida.",
          );
        const prior = one<{ status: string; version_id: string }>(
          "SELECT status,version_id FROM chart_intakes WHERE regimen_id=? AND scheduled_at=?",
          m.regimen_id,
          instant,
        );
        if ((prior?.version_id ?? null) !== d.previousRecord)
          throw conflict(
            "O relato deste horário já mudou. Atualize o painel antes de corrigir.",
          );
        run(
          `INSERT INTO chart_intakes VALUES(?,?,?,?,?,?) ON CONFLICT(regimen_id,scheduled_at) DO UPDATE SET status=excluded.status,reporter=excluded.reporter,recorded_at=excluded.recorded_at,version_id=excluded.version_id`,
          m.regimen_id,
          instant,
          d.status,
          d.reporter,
          at,
          requestId,
        );
        const consumed =
          (Number(d.status === "taken") - Number(prior?.status === "taken")) *
          m.quantity;
        if (consumed)
          run(
            "UPDATE chart_medicines SET stock=ROUND(stock-?,2) WHERE id=?",
            consumed,
            m.id,
          );
        detail = `${prior ? "Correção de relato · " : ""}${m.name} · ${m.dose} · previsto para ${formatTime(instant)}. ${d.status === "taken" ? "Tomada relatada" : "Não tomou, segundo relato"}. ${d.reporter}.`;
        break;
      }
      case "visit": {
        const scheduled = localToUtc(d.scheduled),
          reminder = localToUtc(d.reminder);
        if (scheduled <= at || reminder > scheduled)
          throw new DomainError(
            "INVALID_TIME",
            "Escolha um compromisso futuro e um lembrete até o horário agendado.",
          );
        const vid = id();
        run(
          "INSERT INTO chart_visits VALUES(?,?,?,?,?,?,?,?,'scheduled')",
          vid,
          p,
          d.kind,
          d.title,
          scheduled,
          d.location,
          reminder,
          d.source,
        );
        for (const step of d.steps) {
          const due = localToUtc(step.due);
          if (due > scheduled)
            throw new DomainError(
              "INVALID_TIME",
              "O preparo deve ocorrer até o horário do compromisso.",
            );
          run(
            "INSERT INTO chart_prep VALUES(?,?,?,?,NULL)",
            id(),
            vid,
            step.instruction,
            due,
          );
        }
        detail = `${d.kind} · ${d.title}, ${formatTime(scheduled)} · ${d.location}. Fonte: ${d.source}.`;
        break;
      }
      case "prep": {
        const step = one(
          "SELECT s.*,v.title,v.status FROM chart_prep s JOIN chart_visits v ON v.id=s.visit_id WHERE v.profile_id=? AND s.id=?",
          p,
          d.stepId,
        );
        if (!step) throw missing();
        if (step.completed_at || step.status !== "scheduled")
          throw conflict("Esta etapa já foi encerrada.");
        run("UPDATE chart_prep SET completed_at=? WHERE id=?", at, d.stepId);
        detail = `${step.title} · preparo confirmado: ${step.instruction}.`;
        break;
      }
      case "visit_status": {
        const v = one(
          "SELECT title,status,scheduled_at FROM chart_visits WHERE profile_id=? AND id=?",
          p,
          d.visitId,
        );
        if (!v) throw missing();
        if (v.status !== "scheduled")
          throw conflict("O compromisso já foi encerrado.");
        if (d.status === "done" && String(v.scheduled_at) > at)
          throw conflict("O horário do compromisso ainda não chegou.");
        run("UPDATE chart_visits SET status=? WHERE id=?", d.status, d.visitId);
        detail = `${v.title} · ${d.status === "done" ? "comparecimento informado" : "compromisso cancelado"}.`;
        break;
      }
    }
    log(p, actor.id, requestId, d.action, fingerprint, detail, at);
  });
}
export function readChart(
  actor: Actor,
  selectedDay?: string | null,
): ChartData {
  const p = authorized(actor),
    asOf = now();
  const today = DateTime.fromISO(asOf, { zone: ZONE }).toISODate()!;
  const day = date.parse(selectedDay ?? today);
  const start = DateTime.fromISO(day, { zone: ZONE });
  const from = start.toUTC().toISO()!,
    until = start.plus({ days: 1 }).toUTC().toISO()!;
  const meds = rows<Medicine>(
    medicineSelect +
      " WHERE m.profile_id=? AND r.ends_at IS NULL ORDER BY m.name",
    p,
  );
  const plans = rows<Medicine & { ends_at: string | null }>(
    medicineSelect +
      " WHERE m.profile_id=? AND r.starts_at<? AND (r.ends_at IS NULL OR r.ends_at>?)",
    p,
    until,
    from,
  );
  const intakes = rows<Intake>(
    "SELECT i.* FROM chart_intakes i JOIN chart_regimens r ON r.id=i.regimen_id JOIN chart_medicines m ON m.id=r.medicine_id WHERE m.profile_id=? AND i.scheduled_at>=? AND i.scheduled_at<?",
    p,
    from,
    until,
  );
  const doses = plans
    .flatMap((m) =>
      m.times.split(",").flatMap((time) => {
        const instant = localToUtc(day + "T" + time);
        if (instant < m.starts_at || (m.ends_at && instant >= m.ends_at))
          return [];
        const record = intakes.find(
          (i) => i.regimen_id === m.regimen_id && i.scheduled_at === instant,
        );
        return [
          {
            name: m.name,
            dose: m.dose,
            regimen_id: m.regimen_id,
            scheduled_at: instant,
            status: record?.status ?? null,
            reporter: record?.reporter ?? null,
            version_id: record?.version_id ?? null,
          },
        ];
      }),
    )
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const steps = rows<Prep & { visit_id: string }>(
    "SELECT s.* FROM chart_prep s JOIN chart_visits v ON v.id=s.visit_id WHERE v.profile_id=? AND v.status='scheduled' ORDER BY s.due_at",
    p,
  );
  const visits = rows<Visit>(
    "SELECT * FROM chart_visits WHERE profile_id=? AND status='scheduled' ORDER BY scheduled_at",
    p,
  ).map((v) => ({ ...v, steps: steps.filter((s) => s.visit_id === v.id) }));
  return {
    profile:
      one<ChartProfile>("SELECT * FROM family_charts WHERE profile_id=?", p) ??
      null,
    plan:
      one<FamilyPlan>(
        "SELECT f.goal,f.next_step,f.helper,f.review_on,f.stage,f.version_id,h.at,m.display_name AS author FROM chart_family_plans f JOIN chart_history h ON h.request_id=f.version_id JOIN members m ON m.id=h.actor_id WHERE f.profile_id=?",
        p,
      ) ?? null,
    observations: rows<ChartEvent>(
      "SELECT h.request_id,h.at,h.kind,h.detail,m.display_name AS author FROM chart_history h JOIN members m ON m.id=h.actor_id WHERE h.profile_id=? AND h.kind='observation' ORDER BY h.at DESC,h.rowid DESC LIMIT 10",
      p,
    ),
    medications: meds,
    doses,
    visits,
    history: rows<ChartEvent>(
      "SELECT h.request_id,h.at,h.kind,h.detail,m.display_name AS author FROM chart_history h JOIN members m ON m.id=h.actor_id WHERE h.profile_id=? ORDER BY h.at DESC,h.rowid DESC LIMIT 150",
      p,
    ),
    day,
    today,
    asOf,
  };
}
