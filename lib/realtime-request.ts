import { z } from "zod";
import { DateTime } from "luxon";
import { type Actor, DomainError, hash, profileFor } from "./auth";
import { audit, now, one, run, transaction } from "./db";
import { consent, propose } from "./domain";
import { ZONE } from "./time";

// One non-clinical scenario. The model selects no database identities.
export const prepareRequestSchema = z
  .object({
    recipient_name: z.literal("Pedro"),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    expected_revision: z.number().int().min(0).max(100),
  })
  .strict();
export type PrepareRequestInput = z.infer<typeof prepareRequestSchema>;
type Revision = {
  revision: number;
  time: string | null;
  saturday: string;
  calls: Record<string, string>;
};
type Draft = {
  care_profile_id: string;
  title: string;
  items: { label: string }[];
  assignee_id: string;
  _realtime: Revision;
};
function output(proposalId: string, status: string, payload: Draft) {
  return {
    proposal_id: proposalId,
    status,
    revision: payload._realtime.revision,
    title: payload.title,
    details: payload.items.map((i) => i.label),
    recipient_name: "Pedro",
    requires_visual_confirmation: status === "pending",
    shared: status === "confirmed",
    message:
      status === "pending"
        ? "Rascunho atualizado. Helena precisa revisar e confirmar na tela. Nada foi enviado."
        : status === "rejected"
          ? "Helena cancelou. Nenhuma tarefa foi criada."
          : "Este pedido já foi compartilhado; não crie outro.",
  };
}
export function prepareRequest(
  actor: Actor,
  sessionId: string,
  input: unknown,
  toolCallId: string,
) {
  const d = prepareRequestSchema.parse(input);
  z.string().min(1).max(200).parse(toolCallId);
  if (actor.role !== "elder")
    throw new DomainError(
      "ELDER_REQUIRED",
      "Só Helena pode preparar seu pedido.",
      403,
    );
  const profile = profileFor(actor);
  const session = one(
    "SELECT id FROM voice_sessions WHERE id=? AND actor_id=? AND care_profile_id=? AND status='active' AND expires_at>?",
    sessionId,
    actor.id,
    profile.id,
    now(),
  );
  if (!session || !consent(String(profile.id), "checkins"))
    throw new DomainError(
      "SESSION_INVALID",
      "Sessão inválida, expirada ou revogada.",
      403,
    );
  const recipient = one(
    "SELECT id FROM members WHERE family_id=? AND role='relative' AND display_name=?",
    actor.family_id,
    d.recipient_name,
  );
  if (
    !recipient ||
    !consent(String(profile.id), "family_updates", String(recipient.id))
  )
    throw new DomainError(
      "CONSENT_REQUIRED",
      "Helena precisa autorizar o compartilhamento com Pedro nos controles de privacidade.",
      403,
    );
  return transaction(() => {
    const key = `realtime:prepareRequest:${sessionId}`;
    const existing = one(
      "SELECT * FROM proposals WHERE idempotency_key=? AND actor_id=?",
      key,
      actor.id,
    );
    const old: Draft | undefined = existing
      ? JSON.parse(String(existing.payload))
      : undefined;
    const call = hash(toolCallId),
      content = hash(
        JSON.stringify({ recipient_name: d.recipient_name, time: d.time }),
      );
    if (old?._realtime.calls[call]) {
      if (old._realtime.calls[call] !== content)
        throw new DomainError(
          "CALL_CONFLICT",
          "A mesma chamada não pode mudar o pedido.",
          409,
        );
      return output(String(existing!.id), String(existing!.status), old);
    }
    if (existing && existing.status !== "pending")
      return output(String(existing.id), String(existing.status), old!);
    if (old && old._realtime.time === d.time) {
      if (Object.keys(old._realtime.calls).length >= 40)
        throw new DomainError(
          "DRAFT_LIMIT",
          "Limite de revisões atingido.",
          429,
        );
      old._realtime.calls[call] = content;
      run(
        "UPDATE proposals SET payload=? WHERE id=?",
        JSON.stringify(old),
        String(existing!.id),
      );
      return output(String(existing!.id), "pending", old);
    }
    const revision = old?._realtime.revision ?? 0;
    if (d.expected_revision !== revision)
      throw new DomainError(
        "REVISION_CONFLICT",
        `O rascunho atual está na revisão ${revision}. A alteração antiga não foi aplicada.`,
        409,
      );
    if (Object.keys(old?._realtime.calls ?? {}).length >= 40)
      throw new DomainError(
        "DRAFT_LIMIT",
        "Limite de revisões desta conversa atingido.",
        429,
      );
    const local = DateTime.now().setZone(ZONE);
    const saturday =
      old?._realtime.saturday ??
      local.plus({ days: (6 - local.weekday + 7) % 7 || 7 }).toISODate()!;
    const payload: Draft = {
      care_profile_id: String(profile.id),
      title: "Companhia para ir à feira no sábado",
      items: [
        {
          label: `Sábado, ${DateTime.fromISO(saturday).toFormat("dd/MM")}${d.time ? `, às ${d.time}` : ", horário a combinar"}`,
        },
      ],
      assignee_id: String(recipient.id),
      _realtime: {
        revision: revision + 1,
        time: d.time,
        saturday,
        calls: { ...old?._realtime.calls, [call]: content },
      },
    };
    let proposalId: string;
    if (existing) {
      proposalId = String(existing.id);
      run(
        "UPDATE proposals SET payload=? WHERE id=? AND status=?",
        JSON.stringify(payload),
        proposalId,
        "pending",
      );
    } else {
      const created = propose(actor, "create_task", payload, sessionId, key);
      proposalId = String(created.id);
    }
    audit(actor.id, "prepare_request_draft", "proposals", proposalId, {
      revision: revision + 1,
    });
    return output(proposalId, "pending", payload);
  });
}
