import { z } from "zod";
import { actorFromRequest, checkOrigin, relativeOnly } from "@/lib/auth";
import { copilot } from "@/lib/intelligence";
import { body, failure, throttle } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const actor = actorFromRequest(req);
    relativeOnly(actor);
    throttle(actor.id, "copilot");
    const d = z
      .object({ question: z.string().trim().min(1).max(800) })
      .parse(await body(req));
    return Response.json(await copilot(actor, d.question));
  } catch (e) {
    return failure(e);
  }
}
