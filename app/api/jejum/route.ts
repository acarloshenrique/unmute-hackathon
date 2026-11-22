import { z } from "zod";
import { actorFromRequest, checkOrigin, DomainError } from "@/lib/auth";
import { body, failure } from "@/lib/http";
import { demoPhone } from "@/lib/demo-scenarios";
import { startFastingCall } from "@/lib/fasting-call";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const actor = actorFromRequest(req);
    const d = z
      .strictObject({ id: z.uuid(), to: z.string().max(32) })
      .parse(await body(req));
    const number = demoPhone(d.to);
    if (!number) throw new DomainError("NUMBER", "Confira o telefone e o DDD.");
    return Response.json(await startFastingCall(actor, d.id, number), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
