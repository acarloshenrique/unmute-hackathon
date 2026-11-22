import { z } from "zod";
import { voiceActor } from "@/lib/voice";
import { body, failure, throttle } from "@/lib/http";
import { pendingTasks, visibleEvents } from "@/lib/domain";
import { profileFor } from "@/lib/auth";
import { rows } from "@/lib/db";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const id = z.uuid().parse((await params).sessionId);
    const actor = voiceActor(id, req.headers.get("authorization"));
    const { topic } = z
      .strictObject({ topic: z.enum(["registros", "agenda", "tarefas"]) })
      .parse(await body(req));
    throttle(actor.id, "voice_context", 30);
    const profile = profileFor(actor);
    const records =
      topic === "registros"
        ? visibleEvents(actor, String(profile.id), 6).map((e) => ({
            resumo: e.summary,
            horario: e.event_time,
            fonte: e.evidence_type,
            simulado: Boolean(e.simulated),
          }))
        : topic === "tarefas"
          ? pendingTasks(actor, String(profile.id), true)
              .slice(0, 8)
              .map((t) => ({
                tarefa: t.title,
                estado: t.status,
                atualizada: t.updated_at,
              }))
          : rows(
              "SELECT title AS atividade,next_run_at AS horario FROM routines WHERE care_profile_id=? AND enabled=1 AND cancelled_at IS NULL ORDER BY next_run_at LIMIT 8",
              profile.id,
            );
    return Response.json(
      {
        fonte: topic,
        consultado_em: new Date().toISOString(),
        registros: records,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
