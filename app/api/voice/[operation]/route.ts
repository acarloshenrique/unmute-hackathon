import { z } from "zod";
import { actorFromRequest, checkOrigin, DomainError } from "@/lib/auth";
import { body, failure, throttle } from "@/lib/http";
import { startVoice, stopVoice } from "@/lib/voice";
import { voiceReply } from "@/lib/intelligence";
import { audit } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ operation: string }> },
) {
  try {
    checkOrigin(req);
    const actor = actorFromRequest(req);
    const op = (await params).operation;
    if (op === "start") {
      throttle(actor.id, "voice_start", 4);
      return Response.json(await startVoice(actor));
    }
    if (op === "stop") {
      const d = z
        .object({ session_id: z.string().uuid() })
        .parse(await body(req));
      return Response.json(await stopVoice(actor, d.session_id));
    }
    if (op === "text") {
      if (actor.role !== "elder")
        throw new DomainError(
          "FORBIDDEN",
          "Conversa disponível para Helena.",
          403,
        );
      throttle(actor.id, "text", 12);
      const d = z
        .object({
          messages: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().max(1500),
              }),
            )
            .min(1)
            .max(16),
        })
        .parse(await body(req));
      audit(actor.id, "text_test", "members", actor.id, { simulated: true });
      return Response.json({
        answer: await voiceReply(actor, d.messages, null),
        mode: "text_test",
        agora: false,
      });
    }
    throw new DomainError("NOT_FOUND", "Ação não encontrada.", 404);
  } catch (e) {
    return failure(e);
  }
}
