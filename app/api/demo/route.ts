import { z } from "zod";
import { actorFromRequest, createDemoSession, demoLocal } from "@/lib/auth";
import { DEMO, resetDemo, seedDemo } from "@/lib/seed";
import { body, failure } from "@/lib/http";
import { demoClock, executeDue } from "@/lib/domain";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    demoLocal(req);
    const d = z
      .object({
        action: z.enum(["login", "seed", "reset", "advance", "trigger"]),
        persona: z.enum(["helena", "ana", "pedro"]).optional(),
        minutes: z.number().int().min(1).max(1440).optional(),
      })
      .parse(await body(req));
    if (d.action === "login" || d.action === "seed") {
      seedDemo();
      const token = createDemoSession(DEMO[d.persona ?? "ana"]);
      return Response.json(
        { ok: true, simulated: true },
        {
          headers: {
            "Set-Cookie": `carecircle_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`,
          },
        },
      );
    }
    actorFromRequest(req);
    if (d.action === "reset") {
      resetDemo();
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie":
              "carecircle_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
          },
        },
      );
    }
    if (d.action === "advance")
      return Response.json({ clock: demoClock(d.minutes ?? 2) });
    return Response.json({
      runs: executeDue(demoClock(), { demo: true }),
      simulated_trigger: true,
    });
  } catch (e) {
    return failure(e);
  }
}
