import type { Actor } from "./auth";
import { one } from "./db";

type Evidence = {
  id: string;
  event_type: "checkin" | "unanswered" | "task_created" | "task_updated";
  event_time: string;
  evidence_type: string;
  summary: string;
  simulated: number;
  routine_title: string | null;
};

export type FamilyCheckinReport = {
  situation: string;
  context: string | null;
  observation: string | null;
  verification: string;
  nextStep: { title: string; responsible: string; status: string } | null;
  source: { id: string; at: string; simulated: boolean };
};

// Project one recent, recipient-authorized source; never merge separate
// check-ins, tasks, or transcripts into a single purported conversation.
export function familyCheckinReport(
  actor: Actor,
  profileId: string,
): FamilyCheckinReport | null {
  if (actor.role !== "relative") return null;
  const source = one<Evidence>(
    `SELECT e.id,e.event_type,e.event_time,e.evidence_type,e.summary,e.simulated,
      CASE WHEN r.created_by=? THEN r.title END AS routine_title
     FROM care_events e
     JOIN care_profiles p ON p.id=e.care_profile_id AND p.family_id=?
     JOIN consents c ON c.care_profile_id=p.id AND c.scope='family_updates'
       AND c.recipient_id=? AND c.revoked_at IS NULL
     LEFT JOIN routine_runs rr ON rr.id=e.routine_run_id
     LEFT JOIN routines r ON r.id=rr.routine_id AND r.care_profile_id=p.id
     WHERE p.id=? AND e.visibility_scope='family' AND e.recipient_id=?
       AND e.event_type IN ('checkin','unanswered','task_created','task_updated')
     ORDER BY e.created_at DESC,e.rowid DESC LIMIT 1`,
    actor.id,
    actor.family_id,
    actor.id,
    profileId,
    actor.id,
  );
  if (!source) return null;

  // Updates from a relative notify Helena, so match by the already-authorized
  // event and verify task ownership rather than relying on notice addressee.
  const task = one<{ title: string; status: string; responsible: string }>(
    `SELECT t.title,t.status,m.display_name AS responsible
     FROM notifications n
     JOIN tasks t ON t.id=n.task_id AND t.care_profile_id=? AND t.assigned_to=?
     JOIN members m ON m.id=t.assigned_to AND m.family_id=?
     WHERE n.event_id=? ORDER BY n.created_at DESC,n.rowid DESC LIMIT 1`,
    profileId,
    actor.id,
    actor.family_id,
    source.id,
  );
  const base = {
    context: source.routine_title,
    nextStep: task ?? null,
    source: {
      id: source.id,
      at: source.event_time,
      simulated: !!source.simulated,
    },
  };
  if (source.event_type === "unanswered")
    return {
      ...base,
      situation: "Convite sem resposta",
      observation: null,
      verification:
        "Não houve resposta. Isso não informa o estado de saúde da pessoa.",
    };
  if (source.event_type === "checkin")
    return {
      ...base,
      situation: "Relato compartilhado pela pessoa acompanhada",
      observation: source.evidence_type === "reported" ? source.summary : null,
      verification:
        "O conteúdo relatado não foi verificado de forma independente.",
    };
  return {
    ...base,
    situation: "Pedido compartilhado com você",
    observation: source.summary,
    verification:
      "O registro confirma apenas o estado da tarefa no app, não a realização do pedido fora dele.",
  };
}
