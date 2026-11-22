import { createHash, randomBytes } from "node:crypto";
import { one, run, now, audit } from "./db";
export type Actor = {
  id: string;
  family_id: string;
  display_name: string;
  role: "elder" | "relative";
};
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function requireDemo() {
  if (process.env.CARECIRCLE_DEMO !== "true")
    throw new DomainError(
      "DEMO_DISABLED",
      "Demonstração local desativada.",
      403,
    );
}
function requestHost(req: Request) {
  return req.headers.get("host") || new URL(req.url).host;
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    let allowed = false;
    try {
      const parsed = new URL(origin);
      const proto = req.headers.get("x-forwarded-proto")
        ? `${req.headers.get("x-forwarded-proto")}:`
        : new URL(req.url).protocol;
      const extra = (process.env.CARECIRCLE_ALLOWED_ORIGINS || "")
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      allowed =
        (parsed.host === requestHost(req) || extra.includes(parsed.host)) &&
        parsed.protocol === proto;
    } catch {
      /* malformed origins are denied */
    }
    if (!allowed)
      throw new DomainError("ORIGIN", "Origem não autorizada.", 403);
  }
}
export function demoLocal(req: Request) {
  requireDemo();
  const hostname = new URL(`http://${requestHost(req)}`).hostname;
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(hostname) &&
    process.env.CARECIRCLE_PUBLIC_DEMO !== "true"
  )
    throw new DomainError(
      "LOCAL_ONLY",
      "Identidades de demonstração disponíveis somente em localhost.",
      403,
    );
  checkOrigin(req);
}
export function actorFromRequest(req: Request): Actor {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("carecircle_session="))
    ?.slice("carecircle_session=".length);
  const actor =
    cookie &&
    one<Actor>(
      "SELECT m.id,m.family_id,m.display_name,m.role FROM app_sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>?",
      hash(cookie),
      now(),
    );
  if (!actor)
    throw new DomainError(
      "UNAUTHENTICATED",
      "Entre na demonstração para continuar.",
      401,
    );
  return actor;
}
export function createDemoSession(memberId: string) {
  requireDemo();
  if (!one("SELECT id FROM members WHERE id=?", memberId))
    throw new DomainError("NOT_FOUND", "Pessoa não encontrada.", 404);
  const token = randomBytes(32).toString("hex");
  run(
    "INSERT INTO app_sessions VALUES(?,?,?)",
    hash(token),
    memberId,
    new Date(Date.now() + 8 * 3600000).toISOString(),
  );
  audit(memberId, "demo_login", "members", memberId);
  return token;
}
export function profileFor(actor: Actor, profileId?: string) {
  const profile = profileId
    ? one(
        "SELECT * FROM care_profiles WHERE id=? AND family_id=?",
        profileId,
        actor.family_id,
      )
    : one("SELECT * FROM care_profiles WHERE family_id=?", actor.family_id);
  if (
    !profile ||
    (actor.role === "elder" && profile.elder_member_id !== actor.id)
  )
    throw new DomainError("FORBIDDEN", "Perfil não autorizado.", 403);
  return profile;
}
export function relativeOnly(actor: Actor) {
  if (actor.role !== "relative")
    throw new DomainError(
      "FORBIDDEN",
      "Ação disponível para familiares autorizados.",
      403,
    );
}
