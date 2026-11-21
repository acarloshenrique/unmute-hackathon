import { actorFromRequest } from "@/lib/auth";
import { snapshot } from "@/lib/domain";
import { failure } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    return Response.json(snapshot(actorFromRequest(req)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
