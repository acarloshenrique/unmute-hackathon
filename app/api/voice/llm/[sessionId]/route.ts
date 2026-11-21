import { z } from "zod";
import { voiceActor } from "@/lib/voice";
import { voiceReply } from "@/lib/intelligence";
import { body, failure, throttle } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const actor = voiceActor(sessionId, req.headers.get("authorization"));
    throttle(actor.id, "voice_llm", 25);
    const d = z
      .object({
        messages: z
          .array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string().max(5000),
            }),
          )
          .max(30),
        stream: z.boolean().optional(),
      })
      .parse(await body(req));
    const text = await voiceReply(
      actor,
      d.messages.filter((m) => m.role !== "system") as {
        role: "user" | "assistant";
        content: string;
      }[],
      sessionId,
    );
    const responseId = `chatcmpl-${crypto.randomUUID()}`,
      created = Math.floor(Date.now() / 1000),
      model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    if (d.stream === false)
      return Response.json({
        id: responseId,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          },
        ],
      });
    const chunk = (
      delta: Record<string, string>,
      finish_reason: string | null = null,
    ) =>
      `data: ${JSON.stringify({ id: responseId, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    return new Response(
      chunk({ role: "assistant", content: text }) +
        chunk({}, "stop") +
        "data: [DONE]\n\n",
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
