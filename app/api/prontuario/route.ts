import { actorFromRequest, checkOrigin } from "@/lib/auth";
import { readChart, setChartAccess, writeChart } from "@/lib/chart";
import { body, failure } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const data = readChart(
      actorFromRequest(req),
      new URL(req.url).searchParams.get("day"),
    );
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const actor = actorFromRequest(req),
      input = await body(req);
    if (input?.action === "access") setChartAccess(actor, input);
    else writeChart(actor, input);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
