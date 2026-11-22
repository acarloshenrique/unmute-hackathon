import { z } from "zod";
import { actorFromRequest } from "@/lib/auth";
import { body, failure } from "@/lib/http";
export const runtime = "nodejs";

const LIA = "http://127.0.0.1:8645";

type LiaMed = {
  name?: string;
  freq_h?: number | null;
  obs?: string;
  estoque?: number | null;
  por_vez?: number;
  proximo?: number | null;
};
type LiaContact = { number?: string; papel?: string; nome?: string };
type LiaFamily = { phone?: string; persona?: string; name?: string };

function maskPhone(num: string) {
  const d = String(num).replace(/\D/g, "");
  if (d.length < 8) return "•••";
  return `+${d.slice(0, 4)}••••${d.slice(-4)}`;
}

async function liaList<T>(path: string, key: string): Promise<T[]> {
  try {
    const r = await fetch(LIA + path, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    const list = j?.[key];
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  try {
    actorFromRequest(req);
    const [meds, contacts, family] = await Promise.all([
      liaList<LiaMed>("/meds", "meds"),
      liaList<LiaContact>("/contacts", "contacts"),
      liaList<LiaFamily>("/family", "family"),
    ]);
    return Response.json({
      meds: meds.map((m) => ({
        name: m.name ?? "",
        freq_h: m.freq_h ?? null,
        obs: m.obs ?? "",
        estoque: m.estoque ?? null,
        por_vez: m.por_vez ?? 1,
        proximo: m.proximo ?? null,
      })),
      contacts: contacts.map((c) => ({
        nome: c.nome ?? "",
        papel: c.papel ?? "",
        number: maskPhone(c.number ?? ""),
      })),
      family: family.map((f) => ({
        name: f.name ?? "",
        persona: f.persona ?? "",
      })),
    });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  try {
    actorFromRequest(req);
    const d = z
      .discriminatedUnion("action", [
        z.object({
          action: z.enum(["tomei", "del"]),
          name: z.string().min(1).max(80),
        }),
        z.object({
          action: z.literal("marca"),
          contact: z.string().min(1).max(80),
          request: z.string().min(1).max(500),
        }),
      ])
      .parse(await body(req));
    const marca = d.action === "marca";
    let r: Response;
    try {
      r = await fetch(`${LIA}${marca ? "/agenda/action" : "/meds/action"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          marca
            ? { action: "marca", contact: d.contact, request: d.request }
            : { action: d.action, name: d.name },
        ),
        // 'marca' gera áudio TTS antes de responder — dá mais folga.
        signal: AbortSignal.timeout(marca ? 20000 : 3000),
      });
    } catch {
      return Response.json(
        {
          error: "LIA_DOWN",
          message: "A Lia está indisponível agora. Tente pelo WhatsApp.",
        },
        { status: 503 },
      );
    }
    if (!r.ok)
      return Response.json(
        {
          error: "LIA_ACTION",
          message:
            r.status === 404
              ? marca
                ? "Contato não está na agenda da Lia."
                : "Remédio não encontrado na lista."
              : "Não foi possível concluir com a Lia.",
        },
        { status: r.status === 404 ? 404 : 502 },
      );
    const j = await r.json().catch(() => ({}));
    return Response.json({
      ok: true,
      result: typeof j.result === "string" ? j.result : "Feito.",
    });
  } catch (e) {
    return failure(e);
  }
}
