import { z } from "zod";
import { actorFromRequest, checkOrigin } from "@/lib/auth";
import { body, failure } from "@/lib/http";
import { propose, taskSchema } from "@/lib/domain";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const actor = actorFromRequest(req);
    const d = z.object({ task: taskSchema }).parse(await body(req));
    return Response.json(
      propose(actor, "create_task", d.task, null, d.task.idempotency_key),
    );
  } catch (e) {
    return failure(e);
  }
}
