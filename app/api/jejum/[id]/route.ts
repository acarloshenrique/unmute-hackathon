import { actorFromRequest } from "@/lib/auth";
import { readFastingCall } from "@/lib/fasting-call";
import { failure } from "@/lib/http";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      readFastingCall(actorFromRequest(req), (await params).id),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
