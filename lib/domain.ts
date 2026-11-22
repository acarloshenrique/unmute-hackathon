import { chartAccess } from "./chart";
import { z } from "zod";
import { id, now, one, rows, run, transaction, audit, type Row } from "./db";
import {
  type Actor,
  DomainError,
  profileFor,
  relativeOnly,
  requireDemo,
} from "./auth";
import {
  CAREGIVER_IDS,
  caregiverProfile,
  invitationMessage,
  type CaregiverId,
} from "./caregivers";
import { familyCheckinReport } from "./checkin-report";
import { formatTime, isQuiet, localToUtc, nextDaily, ZONE } from "./time";
const uuid = z.string().uuid();
const title = z.string().trim().min(1).max(160);
export const itemSchema = z.object({
  label: z.string().trim().min(1).max(100),
  quantity: z.string().max(40).optional(),
});
const itemsSchema = z.array(itemSchema).max(30);
export const routineSchema = z.object({
  title,
  prompt: z.string().trim().min(1).max(500),
  local_datetime: z.string(),
  repeat: z.enum(["once", "daily"]).default("once"),
  idempotency_key: uuid,
});
export const taskSchema = z.object({
  care_profile_id: uuid,
  title,
  items: itemsSchema,
  assignee_id: uuid,
  idempotency_key: uuid,
});
export const updateTaskSchema = z.object({
  task_id: uuid,
  changes: z.object({
    title: title.optional(),
    items: itemsSchema.optional(),
    status: z.enum(["accepted", "completed", "cancelled"]).optional(),
  }),
});
export const labels: Record<string, string> = {
  confirmed: "Confirmado",
  reported: "Relatado",
  unanswered: "Sem resposta",
  pending: "Pendente",
  completed: "Concluído",
  accepted: "Aceita",
  cancelled: "Cancelada",
  invited: "Convite enviado",
  answered: "Respondido",
  failed: "Falhou",
};
export function consent(profileId: string, scope: string, recipient?: string) {
  return !!one(
    `SELECT id FROM consents WHERE care_profile_id=? AND scope=? AND revoked_at IS NULL AND ${recipient ? "recipient_id=?" : "recipient_id IS NULL"}`,
    profileId,
    scope,
    ...(recipient ? [recipient] : []),
  );
}
export function getCaregiver(profileId: string) {
  const preference = one(
    "SELECT caregiver_id FROM caregiver_preferences WHERE care_profile_id=?",
    profileId,
  );
  return caregiverProfile((preference?.caregiver_id || "lia") as CaregiverId);
}
export function selectCaregiver(actor: Actor, input: unknown) {
  relativeOnly(actor);
  const d = z
    .object({ care_profile_id: uuid, caregiver_id: z.enum(CAREGIVER_IDS) })
    .strict()
    .parse(input);
  const p = profileFor(actor, d.care_profile_id);
  if (!consent(String(p.id), "family_updates", actor.id))
    throw new DomainError(
      "FORBIDDEN",
      "Somente um familiar autorizado por esta pessoa pode escolher o estilo.",
      403,
    );
  return transaction(() => {
    run(
      "INSERT INTO caregiver_preferences(care_profile_id,caregiver_id,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(care_profile_id) DO UPDATE SET caregiver_id=excluded.caregiver_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
      p.id,
      d.caregiver_id,
      actor.id,
      now(),
    );
    // Pending invitations may reflect a new choice; active sessions are untouched.
    for (const n of rows(
      "SELECT n.id,r.prompt FROM notifications n JOIN care_events e ON e.id=n.event_id JOIN routine_runs rr ON rr.id=e.routine_run_id JOIN routines r ON r.id=rr.routine_id WHERE e.care_profile_id=? AND n.type='invitation' AND n.status='delivered' AND rr.status='invited'",
      p.id,
    ))
      run(
        "UPDATE notifications SET message=? WHERE id=?",
        invitationMessage(d.caregiver_id, String(n.prompt)),
        n.id,
      );
    audit(actor.id, "caregiver_selected", "care_profiles", String(p.id), {
      caregiver_id: d.caregiver_id,
    });
    return getCaregiver(String(p.id));
  });
}
function invitationFor(actor: Actor, notificationId: string) {
  if (actor.role !== "elder")
    throw new DomainError(
      "FORBIDDEN",
      "O convite deve ser respondido pela pessoa convidada.",
      403,
    );
  const p = profileFor(actor);
  const invitation = one(
    "SELECT n.*,e.routine_run_id,rr.status AS run_status FROM notifications n JOIN care_events e ON e.id=n.event_id JOIN routine_runs rr ON rr.id=e.routine_run_id WHERE n.id=? AND n.recipient_id=? AND e.care_profile_id=? AND n.type='invitation'",
    notificationId,
    actor.id,
    p.id,
  );
  if (!invitation)
    throw new DomainError("FORBIDDEN", "Convite não autorizado.", 403);
  return invitation;
}
export function acceptedInvitation(actor: Actor, notificationId: string) {
  const invitation = invitationFor(actor, notificationId);
  if (invitation.status !== "accepted" || invitation.run_status !== "invited")
    throw new DomainError(
      "INVITATION_CLOSED",
      "Este convite não está disponível. Atualize a tela.",
      409,
    );
  return invitation;
}
export function respondInvitation(actor: Actor, input: unknown) {
  const d = z
    .object({ notification_id: uuid, accepted: z.boolean() })
    .strict()
    .parse(input);
  return transaction(() => {
    const n = invitationFor(actor, d.notification_id);
    if (n.status === "declined" && !d.accepted) return { status: "declined" };
    if (n.status === "declined" || n.run_status !== "invited")
      throw new DomainError(
        "INVITATION_CLOSED",
        "Este convite já foi encerrado.",
        409,
      );
    if (
      one(
        "SELECT id FROM voice_sessions WHERE routine_run_id=? AND status IN ('starting','active','stop_failed')",
        n.routine_run_id,
      )
    )
      throw new DomainError(
        "SESSION_EXISTS",
        "A conversa já está em andamento.",
        409,
      );
    const status = d.accepted ? "accepted" : "declined";
    run(
      "UPDATE notifications SET status=?,read_at=? WHERE id=?",
      status,
      now(),
      n.id,
    );
    if (!d.accepted)
      run(
        "UPDATE routine_runs SET status='cancelled',completed_at=?,error_message='DECLINED' WHERE id=? AND status='invited'",
        now(),
        n.routine_run_id,
      );
    audit(
      actor.id,
      `invitation_${status}`,
      "routine_runs",
      String(n.routine_run_id),
    );
    return { status };
  });
}
export function changeConsent(actor: Actor, input: unknown) {
  const data = z
    .object({
      scope: z.enum(["checkins", "family_updates"]),
      recipient_id: uuid.optional(),
      granted: z.boolean(),
    })
    .parse(input);
  const profile = profileFor(actor);
  if (actor.role !== "elder")
    throw new DomainError(
      "ELDER_REQUIRED",
      "Somente Helena pode autorizar ou revogar. Esta identidade é fictícia na demonstração.",
      403,
    );
  if (data.scope === "family_updates" && !data.recipient_id)
    throw new DomainError(
      "RECIPIENT_REQUIRED",
      "Escolha quem receberá as informações.",
    );
  if (
    data.recipient_id &&
    !one(
      "SELECT id FROM members WHERE id=? AND family_id=? AND role=?",
      data.recipient_id,
      actor.family_id,
      "relative",
    )
  )
    throw new DomainError("FORBIDDEN", "Destinatário não autorizado.", 403);
  const active = one(
    `SELECT id FROM consents WHERE care_profile_id=? AND scope=? AND revoked_at IS NULL AND ${data.recipient_id ? "recipient_id=?" : "recipient_id IS NULL"}`,
    profile.id,
    data.scope,
    ...(data.recipient_id ? [data.recipient_id] : []),
  );
  if (data.granted && !active)
    run(
      "INSERT INTO consents VALUES(?,?,?,?,?,?,NULL)",
      id(),
      profile.id,
      actor.id,
      data.scope,
      data.recipient_id ?? null,
      now(),
    );
  if (!data.granted && active)
    run("UPDATE consents SET revoked_at=? WHERE id=?", now(), active.id);
  if (!data.granted && data.scope === "checkins")
    run(
      "UPDATE voice_sessions SET status='stop_failed',capability_hash=NULL WHERE actor_id=? AND status IN ('starting','active')",
      actor.id,
    );
  audit(
    actor.id,
    data.granted ? "consent_granted" : "consent_revoked",
    "care_profiles",
    String(profile.id),
    { scope: data.scope, recipient_id: data.recipient_id },
  );
  return { granted: data.granted };
}
export function visibleEvents(actor: Actor, profileId?: string, limit = 30) {
  const p = profileFor(actor, profileId);
  if (actor.role === "elder")
    return rows(
      "SELECT * FROM care_events WHERE care_profile_id=? ORDER BY event_time DESC LIMIT ?",
      p.id,
      limit,
    );
  if (!consent(String(p.id), "family_updates", actor.id)) return [];
  return rows(
    "SELECT * FROM care_events WHERE care_profile_id=? AND visibility_scope='family' AND (recipient_id=? OR recipient_id IS NULL) ORDER BY event_time DESC LIMIT ?",
    p.id,
    actor.id,
    limit,
  );
}
type TaskRecord = {
  id: string;
  care_profile_id: string;
  title: string;
  status: string;
  assigned_to: string;
  created_by: string;
  updated_at: string;
  created_at: string;
};
export function pendingTasks(actor: Actor, profileId?: string, all = false) {
  const p = profileFor(actor, profileId);
  if (
    actor.role === "relative" &&
    !consent(String(p.id), "family_updates", actor.id)
  )
    return [];
  return rows<TaskRecord>(
    `SELECT * FROM tasks WHERE care_profile_id=? ${actor.role === "relative" ? "AND assigned_to=?" : ""} ${all ? "" : "AND status IN ('pending','accepted')"} ORDER BY created_at DESC`,
    p.id,
    ...(actor.role === "relative" ? [actor.id] : []),
  ).map((t) => ({
    ...t,
    items: rows("SELECT label,quantity FROM task_items WHERE task_id=?", t.id),
  }));
}
function notify(
  recipient: string,
  eventId: string | null,
  taskId: string | null,
  type: string,
  message: string,
) {
  run(
    "INSERT INTO notifications(id,recipient_id,event_id,task_id,type,message,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
    id(),
    recipient,
    eventId,
    taskId,
    type,
    message,
    "delivered",
    now(),
  );
}
function event(
  actor: Actor,
  p: string,
  type: string,
  summary: string,
  evidence: string,
  recipient: string | null,
  session: string | null = null,
  runId: string | null = null,
) {
  const e = id();
  run(
    "INSERT INTO care_events(id,care_profile_id,routine_run_id,event_type,summary,evidence_type,event_time,source_session_id,visibility_scope,recipient_id,created_at,simulated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    e,
    p,
    runId,
    type,
    summary,
    evidence,
    now(),
    session,
    recipient ? "family" : "private",
    recipient,
    now(),
    process.env.CARECIRCLE_DEMO === "true" ? 1 : 0,
  );
  audit(actor.id, type, "care_events", e);
  return e;
}
export function createTask(
  actor: Actor,
  input: unknown,
  sessionId: string | null = null,
) {
  const d = taskSchema.parse(input);
  const p = profileFor(actor, d.care_profile_id);
  if (actor.role !== "elder")
    throw new DomainError(
      "ELDER_REQUIRED",
      "O compartilhamento precisa ser confirmado por Helena.",
      403,
    );
  if (!consent(String(p.id), "family_updates", d.assignee_id))
    throw new DomainError(
      "CONSENT_REQUIRED",
      "Autorize o compartilhamento com esse familiar antes de enviar.",
      403,
    );
  if (
    !one(
      "SELECT id FROM members WHERE id=? AND family_id=? AND role=?",
      d.assignee_id,
      actor.family_id,
      "relative",
    )
  )
    throw new DomainError("FORBIDDEN", "Familiar não autorizado.", 403);
  return transaction(() => {
    const existing = one(
      "SELECT * FROM tasks WHERE idempotency_key=?",
      d.idempotency_key,
    );
    if (existing) {
      if (existing.care_profile_id !== p.id || existing.created_by !== actor.id)
        throw new DomainError("FORBIDDEN", "Operação não autorizada.", 403);
      return existing;
    }
    const t = id(),
      time = now();
    run(
      "INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      t,
      p.id,
      d.title,
      "pending",
      d.assignee_id,
      actor.id,
      null,
      time,
      time,
      d.idempotency_key,
      sessionId,
    );
    for (const item of d.items)
      run(
        "INSERT INTO task_items VALUES(?,?,?,?)",
        id(),
        t,
        item.label,
        item.quantity ?? null,
      );
    const e = event(
      actor,
      String(p.id),
      "task_created",
      `Helena autorizou compartilhar o pedido: ${d.title}${d.items.length ? ` (${d.items.map((i) => i.label).join(", ")})` : ""}.`,
      "pending",
      d.assignee_id,
      sessionId,
    );
    notify(
      d.assignee_id,
      e,
      t,
      "task",
      "Helena compartilhou um pedido com você.",
    );
    audit(actor.id, "create_task", "tasks", t, { item_count: d.items.length });
    return one("SELECT * FROM tasks WHERE id=?", t)!;
  });
}
export function updateTask(actor: Actor, input: unknown) {
  const d = updateTaskSchema.parse(input);
  const task = one("SELECT * FROM tasks WHERE id=?", d.task_id);
  if (!task) throw new DomainError("NOT_FOUND", "Tarefa não encontrada.", 404);
  const p = profileFor(actor, String(task.care_profile_id));
  if (!consent(String(p.id), "family_updates", String(task.assigned_to)))
    throw new DomainError(
      "CONSENT_REQUIRED",
      "Compartilhamento revogado.",
      403,
    );
  if (actor.role === "relative" && task.assigned_to !== actor.id)
    throw new DomainError(
      "FORBIDDEN",
      "A tarefa pertence a outro familiar.",
      403,
    );
  if (actor.role === "relative" && (d.changes.items || d.changes.title))
    throw new DomainError(
      "FORBIDDEN",
      "Somente Helena pode corrigir o pedido.",
      403,
    );
  const status = d.changes.status;
  if (status === "accepted" && actor.role !== "relative")
    throw new DomainError(
      "FORBIDDEN",
      "Somente o familiar responsável pode aceitar.",
      403,
    );
  if (["completed", "cancelled"].includes(String(task.status))) {
    if (status === task.status && !d.changes.items && !d.changes.title)
      return task;
    throw new DomainError("FINAL_STATE", "Essa tarefa já foi encerrada.");
  }
  if (status === "completed" && task.status !== "accepted")
    throw new DomainError(
      "INVALID_STATE",
      "Aceite a tarefa antes de concluir.",
    );
  return transaction(() => {
    run(
      "UPDATE tasks SET title=?,status=?,updated_at=? WHERE id=?",
      d.changes.title ?? task.title,
      status ?? task.status,
      now(),
      task.id,
    );
    if (d.changes.items) {
      run("DELETE FROM task_items WHERE task_id=?", task.id);
      for (const item of d.changes.items)
        run(
          "INSERT INTO task_items VALUES(?,?,?,?)",
          id(),
          task.id,
          item.label,
          item.quantity ?? null,
        );
    }
    const e = event(
      actor,
      String(p.id),
      "task_updated",
      `${actor.display_name} ${status === "accepted" ? "aceitou" : status === "completed" ? "concluiu" : status === "cancelled" ? "cancelou" : "atualizou"} a tarefa “${d.changes.title ?? task.title}”.`,
      status === "completed"
        ? "completed"
        : status === "accepted"
          ? "confirmed"
          : "pending",
      String(task.assigned_to),
    );
    notify(
      actor.role === "elder"
        ? String(task.assigned_to)
        : String(p.elder_member_id),
      e,
      String(task.id),
      "task_updated",
      "Uma tarefa do círculo foi atualizada.",
    );
    audit(actor.id, "update_task", "tasks", String(task.id));
    return one("SELECT * FROM tasks WHERE id=?", task.id)!;
  });
}
export function createRoutine(actor: Actor, input: unknown) {
  relativeOnly(actor);
  const d = routineSchema.parse(input),
    p = profileFor(actor);
  if (!consent(String(p.id), "checkins"))
    throw new DomainError(
      "CONSENT_REQUIRED",
      "Helena ainda não autorizou convites de conversa.",
      403,
    );
  const next = localToUtc(d.local_datetime);
  if (isQuiet(next))
    throw new DomainError(
      "QUIET_HOURS",
      "Escolha um horário entre 8h e 21h em São Paulo.",
    );
  const existing = one(
    "SELECT * FROM routines WHERE idempotency_key=?",
    d.idempotency_key,
  );
  if (existing) {
    if (existing.created_by !== actor.id)
      throw new DomainError("FORBIDDEN", "Rotina não autorizada.", 403);
    return existing;
  }
  const r = id();
  run(
    "INSERT INTO routines VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    r,
    p.id,
    actor.id,
    d.title,
    d.prompt,
    d.repeat === "daily" ? `daily:${d.local_datetime.slice(11, 16)}` : "once",
    ZONE,
    1,
    next,
    null,
    d.idempotency_key,
  );
  audit(actor.id, "create_routine", "routines", r);
  return one("SELECT * FROM routines WHERE id=?", r)!;
}
export function changeRoutine(actor: Actor, input: unknown) {
  relativeOnly(actor);
  const d = z
    .object({
      routine_id: uuid,
      operation: z.enum(["pause", "resume", "cancel", "update", "retry"]),
      title: title.optional(),
      prompt: z.string().min(1).max(500).optional(),
      local_datetime: z.string().optional(),
    })
    .parse(input);
  const r = one("SELECT * FROM routines WHERE id=?", d.routine_id);
  if (!r) throw new DomainError("NOT_FOUND", "Rotina não encontrada.", 404);
  profileFor(actor, String(r.care_profile_id));
  if (r.cancelled_at) throw new DomainError("CANCELLED", "Rotina cancelada.");
  if (d.operation === "retry") {
    if (
      !one(
        "SELECT id FROM routine_runs WHERE routine_id=? AND status='failed' AND attempts<3",
        r.id,
      )
    )
      throw new DomainError(
        "RETRY_LIMIT",
        "Não há tentativa disponível. Edite o horário para criar uma nova ocorrência.",
      );
    run(
      "UPDATE routine_runs SET retry_at=? WHERE routine_id=? AND status='failed' AND attempts<3",
      now(),
      r.id,
    );
    audit(actor.id, "retry_failed_routine", "routines", String(r.id));
    return r;
  }
  const next = d.local_datetime
    ? localToUtc(d.local_datetime)
    : String(r.next_run_at);
  if (isQuiet(next))
    throw new DomainError("QUIET_HOURS", "Horário silencioso: 21h às 8h.");
  transaction(() => {
    run(
      "UPDATE routines SET title=?,prompt=?,next_run_at=?,enabled=?,cancelled_at=?,schedule_expression=? WHERE id=?",
      d.title ?? r.title,
      d.prompt ?? r.prompt,
      next,
      d.operation === "pause" || d.operation === "cancel"
        ? 0
        : d.operation === "resume"
          ? 1
          : d.local_datetime
            ? 1
            : r.enabled,
      d.operation === "cancel" ? now() : null,
      d.local_datetime && String(r.schedule_expression).startsWith("daily:")
        ? `daily:${d.local_datetime.slice(11, 16)}`
        : r.schedule_expression,
      r.id,
    );
    if (d.operation === "cancel")
      run(
        "UPDATE routine_runs SET status='cancelled',completed_at=? WHERE routine_id=? AND status IN ('invited','failed')",
        now(),
        r.id,
      );
    audit(actor.id, `${d.operation}_routine`, "routines", String(r.id));
  });
  return one("SELECT * FROM routines WHERE id=?", r.id)!;
}
export function executeDue(at = now(), options: { demo?: boolean } = {}) {
  if (options.demo) requireDemo();
  const result: { run_id: string; status: string }[] = [];
  transaction(() => {
    for (const r of rows(
      "SELECT * FROM routines WHERE enabled=1 AND cancelled_at IS NULL AND next_run_at<=? ORDER BY next_run_at LIMIT 50",
      at,
    )) {
      const key = `${r.id}:${r.next_run_at}`;
      const prior = one(
        "SELECT * FROM routine_runs WHERE idempotency_key=?",
        key,
      );
      if (prior) {
        if (
          prior.status !== "failed" ||
          Number(prior.attempts) >= 3 ||
          String(prior.retry_at) > at
        )
          continue;
      }
      const runId = prior ? String(prior.id) : id();
      if (!prior)
        run(
          "INSERT INTO routine_runs(id,routine_id,scheduled_at,status,idempotency_key,attempts) VALUES(?,?,?,?,?,0)",
          runId,
          r.id,
          r.next_run_at,
          "failed",
          key,
        );
      const permitted =
        consent(String(r.care_profile_id), "checkins") && !isQuiet(at);
      if (!permitted) {
        run(
          "UPDATE routine_runs SET status='failed',attempts=attempts+1,error_message=?,retry_at=? WHERE id=?",
          "CONSENT_OR_QUIET_HOURS",
          new Date(
            new Date(at).getTime() +
              Math.min(300000, 30000 * 2 ** Number(prior?.attempts ?? 0)),
          ).toISOString(),
          runId,
        );
        result.push({ run_id: runId, status: "failed" });
        continue;
      }
      const p = one(
        "SELECT * FROM care_profiles WHERE id=?",
        r.care_profile_id,
      )!;
      run(
        "UPDATE routine_runs SET started_at=?,status='invited',attempts=attempts+1,error_message=NULL,retry_at=NULL WHERE id=?",
        at,
        runId,
      );
      const e = id();
      run(
        "INSERT INTO care_events(id,care_profile_id,routine_run_id,event_type,summary,evidence_type,event_time,visibility_scope,created_at,simulated) VALUES(?,?,?,?,?,?,?,?,?,?)",
        e,
        p.id,
        runId,
        "invitation",
        `Convite de conversa com ${getCaregiver(String(p.id)).name} enviado. Aguardando resposta.`,
        "pending",
        at,
        "private",
        now(),
        options.demo || process.env.CARECIRCLE_DEMO === "true" ? 1 : 0,
      );
      notify(
        String(p.elder_member_id),
        e,
        null,
        "invitation",
        invitationMessage(getCaregiver(String(p.id)).id, String(r.prompt)),
      );
      audit(null, "execute_due_routine", "routine_runs", runId, {
        simulated_clock: !!options.demo,
      });
      if (r.schedule_expression === "once")
        run("UPDATE routines SET enabled=0 WHERE id=?", r.id);
      else
        run(
          "UPDATE routines SET next_run_at=? WHERE id=?",
          nextDaily(String(r.schedule_expression).slice(6), at),
          r.id,
        );
      result.push({ run_id: runId, status: "invited" });
    }
    for (const rr of rows(
      "SELECT rr.*,r.care_profile_id FROM routine_runs rr JOIN routines r ON r.id=rr.routine_id WHERE rr.status='invited' AND rr.started_at<=?",
      new Date(new Date(at).getTime() - 10 * 60000).toISOString(),
    )) {
      run(
        "UPDATE routine_runs SET status='unanswered',completed_at=? WHERE id=?",
        at,
        rr.id,
      );
      const p = one(
        "SELECT * FROM care_profiles WHERE id=?",
        rr.care_profile_id,
      )!;
      for (const c of rows(
        "SELECT recipient_id FROM consents WHERE care_profile_id=? AND scope='family_updates' AND revoked_at IS NULL",
        p.id,
      )) {
        const a = one<Actor>(
          "SELECT * FROM members WHERE id=?",
          p.elder_member_id,
        )!;
        const e = event(
          a,
          String(p.id),
          "unanswered",
          "Nenhuma resposta recebida ao convite. Isso não informa o estado de saúde de Helena.",
          "unanswered",
          String(c.recipient_id),
          null,
          String(rr.id),
        );
        notify(
          String(c.recipient_id),
          e,
          null,
          "unanswered",
          "O convite ficou sem resposta.",
        );
      }
    }
  });
  return result;
}
export function demoClock(advanceMinutes = 0) {
  requireDemo();
  const t = one("SELECT value FROM demo_state WHERE id=?", "clock");
  if (!t) throw new DomainError("NO_FIXTURE", "Carregue a demonstração.");
  const value = new Date(
    new Date(String(t.value)).getTime() + advanceMinutes * 60000,
  ).toISOString();
  if (advanceMinutes)
    run("UPDATE demo_state SET value=? WHERE id=?", value, "clock");
  return value;
}
export function propose(
  actor: Actor,
  kind: "create_task" | "update_task" | "confirm_routine_response",
  payload: unknown,
  sessionId: string | null,
  key: string,
) {
  if (actor.role !== "elder")
    throw new DomainError(
      "ELDER_REQUIRED",
      "Proposta somente para Helena.",
      403,
    );
  const p = profileFor(actor);
  const existing = one(
    "SELECT id,status FROM proposals WHERE idempotency_key=? AND actor_id=?",
    key,
    actor.id,
  );
  if (existing) return { ...existing, requires_confirmation: true };
  const proposalId = id();
  run(
    "INSERT INTO proposals VALUES(?,?,?,?,?,?,?,?,?)",
    proposalId,
    actor.id,
    p.id,
    kind,
    JSON.stringify(payload),
    "pending",
    now(),
    sessionId,
    key,
  );
  audit(actor.id, "proposal_created", "proposals", proposalId, { kind });
  return {
    id: proposalId,
    status: "pending",
    requires_confirmation: true,
    message:
      "Peça à Helena para revisar e confirmar o cartão na tela. Nada foi compartilhado.",
  };
}
export function confirmProposal(actor: Actor, input: unknown) {
  return transaction(() => {
    const d = z
      .object({
        proposal_id: uuid,
        confirmed: z.boolean(),
        revision: z.number().int().positive().optional(),
      })
      .parse(input);
    const proposal = one(
      "SELECT * FROM proposals WHERE id=? AND actor_id=?",
      d.proposal_id,
      actor.id,
    );
    if (!proposal)
      throw new DomainError("FORBIDDEN", "Proposta não autorizada.", 403);
    profileFor(actor, String(proposal.care_profile_id));
    const payload = JSON.parse(String(proposal.payload));
    if (payload._realtime && d.revision !== payload._realtime.revision)
      throw new DomainError(
        "STALE_PROPOSAL",
        "O pedido foi corrigido. Revise a versão atual na tela antes de confirmar.",
        409,
      );
    if (proposal.status !== "pending") return proposal;
    if (!d.confirmed) {
      run("UPDATE proposals SET status='rejected' WHERE id=?", proposal.id);
      return { status: "rejected" };
    }
    let result: unknown;
    if (proposal.kind === "create_task")
      result = createTask(
        actor,
        { ...payload, idempotency_key: proposal.id },
        proposal.source_session_id as string | null,
      );
    else if (proposal.kind === "update_task")
      result = updateTask(actor, payload);
    else
      result = confirmRoutine(
        actor,
        payload,
        proposal.source_session_id as string | null,
      );
    run("UPDATE proposals SET status='confirmed' WHERE id=?", proposal.id);
    audit(actor.id, "proposal_confirmed", "proposals", String(proposal.id));
    return { status: "confirmed", result };
  });
}
export function confirmRoutine(
  actor: Actor,
  input: unknown,
  sessionId: string | null = null,
) {
  const d = z
    .object({
      routine_run_id: uuid,
      response: z.string().trim().min(1).max(300),
    })
    .parse(input);
  if (actor.role !== "elder")
    throw new DomainError(
      "FORBIDDEN",
      "Somente Helena pode confirmar o relato.",
      403,
    );
  const rr = one(
    "SELECT rr.*,r.care_profile_id,r.created_by FROM routine_runs rr JOIN routines r ON r.id=rr.routine_id WHERE rr.id=?",
    d.routine_run_id,
  );
  if (!rr) throw new DomainError("NOT_FOUND", "Convite não encontrado.", 404);
  const p = profileFor(actor, String(rr.care_profile_id));
  if (!consent(String(p.id), "family_updates", String(rr.created_by)))
    throw new DomainError(
      "CONSENT_REQUIRED",
      "Autorize compartilhar com o familiar que criou a rotina.",
      403,
    );
  if (rr.status === "answered") return { status: "answered" };
  if (!["invited", "unanswered"].includes(String(rr.status)))
    throw new DomainError("INVALID_STATE", "Convite indisponível.");
  return transaction(() => {
    const e = event(
      actor,
      String(p.id),
      "checkin",
      `Helena informou: ${d.response}`,
      "reported",
      String(rr.created_by),
      sessionId,
      d.routine_run_id,
    );
    run(
      "UPDATE routine_runs SET status='answered',completed_at=? WHERE id=?",
      now(),
      rr.id,
    );
    notify(
      String(rr.created_by),
      e,
      null,
      "checkin",
      "Helena respondeu ao convite.",
    );
    return { status: "answered", event_id: e };
  });
}
export function summary(actor: Actor, profileId?: string, date?: string) {
  let events = visibleEvents(actor, profileId, 100);
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new DomainError("INVALID_DATE", "Data inválida.");
    events = events.filter(
      (e) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(String(e.event_time))) === date,
    );
  }
  return {
    answer: events.length
      ? events
          .slice(0, 8)
          .map(
            (e) =>
              `${formatTime(String(e.event_time))} · ${labels[String(e.evidence_type)]}: ${e.summary}${e.simulated ? " [SIMULAÇÃO]" : ""}`,
          )
          .join("\n")
      : "Não há registros autorizados para esse período. A ausência de registros não informa como Helena está.",
    sources: events.slice(0, 8).map((e) => ({
      id: e.id,
      event_time: e.event_time,
      status: e.evidence_type,
      simulated: !!e.simulated,
    })),
  };
}
export function snapshot(actor: Actor) {
  const p = profileFor(actor);
  const familyConsent =
    actor.role === "elder" || consent(String(p.id), "family_updates", actor.id);
  return {
    actor,
    profile: p,
    can_manage_chart:
      actor.role === "relative" && chartAccess(String(p.id), actor.id),
    chart_readers:
      actor.role === "elder"
        ? rows<{ member_id: string }>(
            "SELECT member_id FROM record_access WHERE profile_id=?",
            p.id,
          ).map((r) => r.member_id)
        : [],
    caregiver: getCaregiver(String(p.id)),
    can_choose_caregiver:
      actor.role === "relative" &&
      !!consent(String(p.id), "family_updates", actor.id),
    events: visibleEvents(actor),
    checkin_report: familyCheckinReport(actor, String(p.id)),
    tasks: pendingTasks(actor, undefined, true),
    routines: rows(
      "SELECT * FROM routines WHERE care_profile_id=? ORDER BY next_run_at",
      p.id,
    ),
    runs: rows(
      "SELECT rr.* FROM routine_runs rr JOIN routines r ON r.id=rr.routine_id WHERE r.care_profile_id=? ORDER BY rr.scheduled_at DESC LIMIT 30",
      p.id,
    ),
    members: rows(
      "SELECT id,display_name,role FROM members WHERE family_id=?",
      actor.family_id,
    ),
    consents:
      actor.role === "elder"
        ? rows(
            "SELECT * FROM consents WHERE care_profile_id=? AND revoked_at IS NULL",
            p.id,
          )
        : [],
    notifications: familyConsent
      ? rows(
          "SELECT n.* FROM notifications n LEFT JOIN care_events e ON e.id=n.event_id LEFT JOIN routine_runs rr ON rr.id=e.routine_run_id WHERE n.recipient_id=? AND (n.type!='invitation' OR (n.status='delivered' AND rr.status='invited')) ORDER BY n.created_at DESC LIMIT 20",
          actor.id,
        )
      : [],
    proposals: rows(
      "SELECT * FROM proposals WHERE actor_id=? AND status='pending' ORDER BY created_at DESC",
      actor.id,
    ).map((p) => ({ ...p, payload: JSON.parse(String(p.payload)) })),
    sessions: rows(
      "SELECT id,status,started_at,ended_at,expires_at FROM voice_sessions WHERE care_profile_id=? AND actor_id=? ORDER BY started_at DESC LIMIT 5",
      p.id,
      actor.id,
    ),
    audit: rows(
      "SELECT a.* FROM audit_logs a WHERE a.actor_id IN (SELECT id FROM members WHERE family_id=?) OR (a.entity_type='routine_runs' AND a.entity_id IN (SELECT rr.id FROM routine_runs rr JOIN routines r ON r.id=rr.routine_id JOIN care_profiles p ON p.id=r.care_profile_id WHERE p.family_id=?)) ORDER BY timestamp DESC LIMIT 20",
      actor.family_id,
      actor.family_id,
    ),
    demo: process.env.CARECIRCLE_DEMO === "true",
    demo_clock: process.env.CARECIRCLE_DEMO === "true" ? demoClock() : null,
    agora_configured: !!(
      process.env.NEXT_PUBLIC_AGORA_APP_ID &&
      process.env.NEXT_AGORA_APP_CERTIFICATE &&
      process.env.CARECIRCLE_VOICE_TOOL_URL
    ),
    openai_configured: !!process.env.OPENAI_API_KEY,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;
export const actionNames = [
  "create_routine",
  "change_routine",
  "change_consent",
  "confirm_proposal",
  "update_task",
  "confirm_response",
  "select_caregiver",
  "respond_invitation",
] as const;
export function dispatch(actor: Actor, action: string, input: unknown) {
  switch (action) {
    case "select_caregiver":
      return selectCaregiver(actor, input);
    case "respond_invitation":
      return respondInvitation(actor, input);
    case "create_routine":
      return createRoutine(actor, input);
    case "change_routine":
      return changeRoutine(actor, input);
    case "change_consent":
      return changeConsent(actor, input);
    case "confirm_proposal":
      return confirmProposal(actor, input);
    case "update_task":
      return updateTask(actor, input);
    case "confirm_response":
      return confirmRoutine(actor, input);
    default:
      throw new DomainError("UNKNOWN_ACTION", "Ação não encontrada.", 404);
  }
}
