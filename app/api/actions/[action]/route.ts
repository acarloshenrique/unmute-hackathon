import { actorFromRequest, checkOrigin } from "@/lib/auth";
import { dispatch } from "@/lib/domain";
import { body, failure } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(req);
    const actor = actorFromRequest(req);
    return Response.json({
      result: dispatch(actor, (await params).action, await body(req)),
    });
  } catch (e) {
    return failure(e);
  }
}
