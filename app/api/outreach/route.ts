import { readFileSync } from "node:fs";
import { z } from "zod";
import { actorFromRequest, checkOrigin } from "@/lib/auth";
import { demoPhone, demoScenarios } from "@/lib/demo-scenarios";
import { body, failure, throttle } from "@/lib/http";
import { allowedOutreachNumbers } from "@/lib/outreach-policy";
export const runtime = "nodejs";

function dialKey(): string {
  try {
    return (
      readFileSync("/opt/naima-call/.env", "utf8")
        .split("\n")
        .find((l) => l.startsWith("NAIMA_CALL_KEY="))
        ?.split("=")[1]
        ?.trim() ?? ""
    );
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const actor = actorFromRequest(req);
    const d = z
      .union([
        z.strictObject({
          kind: z.enum(["whatsapp", "call", "text"]),
          to: z.string().max(32),
          scenario: z.enum(demoScenarios.map((s) => s.id)),
        }),
        z.strictObject({
          kind: z.enum(["whatsapp", "call"]),
          to: z.string().max(32),
          message: z.string().min(1).max(400),
        }),
      ])
      .parse(await body(req));
    const demo = "scenario" in d;
    const number = demoPhone(d.to);
    if (!number)
      return Response.json(
        { error: "INVALID_NUMBER", message: "Confira o telefone e o DDD." },
        { status: 400 },
      );
    const allowed = allowedOutreachNumbers();
    if (!allowed)
      return Response.json(
        {
          error: "OUTREACH_DISABLED",
          message: "Os envios reais estão desativados neste ambiente.",
        },
        { status: 503 },
      );
    if (!allowed.has(number))
      return Response.json(
        {
          error: "OUTREACH_NOT_ALLOWED",
          message: "O envio real é restrito aos números de teste autorizados.",
        },
        { status: 403 },
      );
    throttle(actor.id, "demo_outreach");
    const num = number.slice(1);
    const greeting = "Oi, aqui é a Lia, assistente virtual do CareCircle.";
    const message = demo
      ? demoScenarios.find((s) => s.id === d.scenario)!.message
      : d.message;
    if (d.kind === "text") {
      const url = process.env.CARECIRCLE_EVOLUTION_TEXT_URL;
      const key = process.env.CARECIRCLE_EVOLUTION_API_KEY;
      if (!url || !key)
        return Response.json(
          { message: "O canal de texto ainda não está configurado." },
          { status: 503 },
        );
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({ number: num, text: greeting + " " + message }),
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      });
      if (!r.ok)
        return Response.json(
          { message: "O WhatsApp não confirmou o pedido de envio do texto." },
          { status: 502 },
        );
      return Response.json({ ok: true, channel: "text" });
    }
    if (d.kind === "whatsapp") {
      const r = await fetch("http://127.0.0.1:8645/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: num,
          text: demo ? greeting + " " + message : message,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false)
        return Response.json(
          {
            error: "Canal WhatsApp indisponível.",
            message: "O WhatsApp não confirmou o pedido de envio do áudio.",
          },
          { status: 502 },
        );
      return Response.json({ ok: true, channel: "whatsapp" });
    }
    const key = dialKey();
    if (!key)
      return Response.json(
        {
          error: "Ponte de ligação indisponível.",
          message: "O serviço de ligação da Lia está indisponível no momento.",
        },
        { status: 503 },
      );
    const qs = new URLSearchParams({
      to: num,
      persona: "lia",
      say: message,
      greeting: demo ? greeting : "Oi, aqui é a Lia do CareCircle.",
    });
    const r = await fetch(`http://127.0.0.1:8765/dial?${qs}`, {
      method: "POST",
      headers: { "X-Call-Key": key },
      signal: AbortSignal.timeout(25000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false)
      return Response.json(
        {
          error: "Ligação não confirmada.",
          message: "O serviço não confirmou a solicitação da ligação.",
        },
        { status: 502 },
      );
    return Response.json(
      demo
        ? { ok: true, channel: "call" }
        : { ok: true, channel: "call", call: j },
    );
  } catch (e) {
    if (
      e instanceof TypeError ||
      (e instanceof Error && e.name === "TimeoutError")
    ) {
      const message =
        "Não foi possível confirmar o pedido. Confira seu telefone antes de tentar novamente.";
      return Response.json({ error: message, message }, { status: 502 });
    }
    return failure(e);
  }
}
