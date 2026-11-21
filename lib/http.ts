import { ZodError } from "zod";
import { DomainError } from "./auth";
import { one, now, run, id } from "./db";
export function failure(error: unknown) {
  if (error instanceof DomainError)
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        error: "VALIDATION",
        message: "Revise os campos informados.",
        fields: error.issues.map((i) => i.path.join(".")),
      },
      { status: 400 },
    );
  console.error(
    JSON.stringify({
      action: "request_failed",
      type: error instanceof Error ? error.name : "unknown",
    }),
  );
  return Response.json(
    {
      error: "INTERNAL",
      message: "Não foi possível concluir. Tente novamente.",
    },
    { status: 500 },
  );
}
export async function body(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 32000)
    throw new DomainError("TOO_LARGE", "Pedido muito extenso.", 413);
  const text = await req.text();
  if (text.length > 32000)
    throw new DomainError("TOO_LARGE", "Pedido muito extenso.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError("INVALID_JSON", "JSON inválido.");
  }
}
export function throttle(actor: string, action: string, limit = 10) {
  const since = new Date(Date.now() - 60000).toISOString();
  const n = one(
    "SELECT count(*) AS n FROM audit_logs WHERE actor_id=? AND action=? AND timestamp>?",
    actor,
    `rate:${action}`,
    since,
  );
  if (Number(n?.n ?? 0) >= limit)
    throw new DomainError(
      "RATE_LIMIT",
      "Aguarde um minuto antes de tentar novamente.",
      429,
    );
  run(
    "INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?)",
    id(),
    actor,
    `rate:${action}`,
    "request",
    actor,
    now(),
    "{}",
  );
}
