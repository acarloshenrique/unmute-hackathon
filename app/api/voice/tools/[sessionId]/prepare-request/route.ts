import { z } from "zod";
import { voiceActor } from "@/lib/voice";
import { prepareRequest, prepareRequestSchema } from "@/lib/realtime-request";
import { body, failure, throttle } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const sessionId = z
      .string()
      .uuid()
      .parse((await params).sessionId);
    const actor = voiceActor(sessionId, req.headers.get("authorization"));
    const parsed = prepareRequestSchema
      .extend({ tool_call_id: z.string().min(1).max(200) })
      .strict()
      .parse(await body(req));
    throttle(actor.id, "prepare_request", 30);
    const { tool_call_id, ...input } = parsed;
    return Response.json(
      prepareRequest(actor, sessionId, input, tool_call_id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
