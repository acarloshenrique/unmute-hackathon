import { fastingWebhook } from "@/lib/fasting-call";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; event: string }> },
) {
  const { id, event } = await params;
  return fastingWebhook(req, id, event);
}
