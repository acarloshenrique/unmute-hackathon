import { readFileSync } from "node:fs";
import { z } from "zod";
import { actorFromRequest } from "@/lib/auth";
import { body, failure } from "@/lib/http";
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
    actorFromRequest(req);
    const d = z
      .object({
        kind: z.enum(["whatsapp", "call"]),
        to: z.string().regex(/^[+\d\s()-]{8,20}$/),
        message: z.string().min(1).max(400),
      })
      .parse(await body(req));
    const num = d.to.replace(/\D/g, "");
    if (num.length < 10 || num.length > 15)
      return Response.json({ error: "Número inválido." }, { status: 400 });
    if (d.kind === "whatsapp") {
      const r = await fetch("http://127.0.0.1:8645/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: num, text: d.message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok)
        return Response.json(
          { error: j.error || `Canal WhatsApp indisponível (${r.status}).` },
          { status: 502 },
        );
      return Response.json({ ok: true, channel: "whatsapp" });
    }
    const key = dialKey();
    if (!key)
      return Response.json(
        { error: "Ponte de ligação indisponível." },
        { status: 503 },
      );
    const qs = new URLSearchParams({
      to: num,
      persona: "lia",
      say: d.message,
      greeting: "Oi, aqui é a Lia do CareCircle.",
    });
    const r = await fetch(`http://127.0.0.1:8765/dial?${qs}`, {
      method: "POST",
      headers: { "X-Call-Key": key },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok)
      return Response.json(
        { error: j.detail || j.error || `Ligação falhou (${r.status}).` },
        { status: 502 },
      );
    return Response.json({ ok: true, channel: "call", call: j });
  } catch (e) {
    return failure(e);
  }
}
