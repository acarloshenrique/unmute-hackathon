import twilio from "twilio";
import { DomainError, type Actor } from "./auth";
import { one, run, transaction, now } from "./db";
import { consent } from "./domain";
import { DEMO } from "./seed";
import { throttle } from "./http";
import {
  allowedOutreachNumbers,
  visitorDialingEnabled,
} from "./outreach-policy";
import {
  fasting,
  readAnswer,
  returns,
  type FastingState,
} from "./fasting-script";

const pendingMs = 4 * 60_000;
type Call = {
  id: string;
  actor_id: string;
  sid: string | null;
  state: FastingState;
  started: number;
};
export function fastingConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID,
    token = process.env.TWILIO_AUTH_TOKEN,
    from = process.env.TWILIO_FROM_NUMBER,
    base = process.env.CARECIRCLE_CALLBACK_ORIGIN;
  if (!sid || !token || !from || !base) return null;
  try {
    const u = new URL(base);
    if (u.protocol !== "https:" || u.origin !== base.replace(/\/$/, ""))
      return null;
    return { sid, token, from, origin: u.origin };
  } catch {
    return null;
  }
}
const callById = (id: string) =>
  one<Call>("SELECT * FROM fasting_calls WHERE id=?", id);
function finish(id: string, result: keyof typeof returns) {
  transaction(() => {
    const changed = run(
      "UPDATE fasting_calls SET state=? WHERE id=? AND (state='waiting' OR (state='unanswered' AND ?!='unanswered'))",
      result,
      id,
      result,
    );
    if (!changed.changes) return;
    const row = callById(id)!;
    run(
      "INSERT INTO notifications(id,recipient_id,type,message,status,created_at) VALUES(?,?,'fasting_return',?,'delivered',?) ON CONFLICT(id) DO UPDATE SET message=excluded.message,read_at=NULL",
      id,
      row.actor_id,
      returns[result],
      now(),
    );
  });
}
function stateOf(row: Call): FastingState {
  if (row.state === "waiting" && Date.now() - row.started >= pendingMs) {
    finish(row.id, "unanswered");
    return callById(row.id)!.state;
  }
  return row.state;
}
export function readFastingCall(actor: Actor, id: string) {
  const row = callById(id);
  if (!row || row.actor_id !== actor.id)
    throw new DomainError("NOT_FOUND", "Pedido não encontrado.", 404);
  return { state: stateOf(row) };
}
const path = (id: string, op: string) => `/api/jejum/${id}/${op}`;
function prompt(origin: string, id: string, retry = false) {
  const xml = new twilio.twiml.VoiceResponse();
  const gather = xml.gather({
    input: ["speech", "dtmf"],
    numDigits: 1,
    timeout: 7,
    speechTimeout: "auto",
    language: "pt-BR",
    action: origin + path(id, retry ? "repeat" : "answer"),
    method: "POST",
    actionOnEmptyResult: true,
  });
  gather.say(
    { language: "pt-BR" },
    (retry ? "Só preciso confirmar esta pergunta. " : "") +
      fasting.ask +
      " " +
      fasting.options,
  );
  return xml.toString();
}
function goodbye(message: string) {
  const xml = new twilio.twiml.VoiceResponse();
  xml.say({ language: "pt-BR" }, message);
  xml.hangup();
  return xml.toString();
}
export async function startFastingCall(
  actor: Actor,
  id: string,
  number: string,
) {
  if (actor.id !== DEMO.helena || actor.family_id !== DEMO.family)
    throw new DomainError("ELDER", "Abra o cenário no perfil de Helena.", 403);
  const allowed = allowedOutreachNumbers(),
    cfg = fastingConfig();
  const visitor = visitorDialingEnabled();
  if (!cfg || (!allowed && !visitor))
    throw new DomainError(
      "UNAVAILABLE",
      "A ligação com retorno ainda não está configurada neste ambiente.",
      503,
    );
  if (!visitor && !allowed?.has(number))
    throw new DomainError(
      "NUMBER",
      "Use o número de teste autorizado para representar Ana.",
      403,
    );
  if (!consent(DEMO.profile, "family_updates", DEMO.ana))
    throw new DomainError(
      "CONSENT",
      "Helena precisa autorizar o compartilhamento com Ana.",
      403,
    );
  if (callById(id)) return readFastingCall(actor, id);
  throttle(actor.id, "fasting_call", 4);
  run(
    "INSERT INTO fasting_calls(id,actor_id,started,state) VALUES(?,?,?,'waiting')",
    id,
    actor.id,
    Date.now(),
  );
  try {
    const client = twilio(cfg.sid, cfg.token, {
      timeout: 12000,
      autoRetry: false,
    });
    const call = await client.calls.create({
      to: number,
      from: cfg.from,
      twiml: prompt(cfg.origin, id),
      timeout: 25,
      timeLimit: 100,
      statusCallback: cfg.origin + path(id, "status"),
      statusCallbackEvent: ["completed"],
      statusCallbackMethod: "POST",
    });
    run(
      "UPDATE fasting_calls SET sid=? WHERE id=? AND (sid IS NULL OR sid=?)",
      call.sid,
      id,
      call.sid,
    );
  } catch (error) {
    // A lost HTTP response can still correspond to a real call. Keep polling the same request.
    const status = (error as { status?: number })?.status;
    if (typeof status === "number" && status >= 400 && status < 500)
      finish(id, "unanswered");
  }
  return readFastingCall(actor, id);
}
export async function fastingWebhook(req: Request, id: string, event: string) {
  const cfg = fastingConfig();
  if (!cfg || !["answer", "repeat", "status"].includes(event))
    return new Response(null, { status: 404 });
  const values = Object.fromEntries(new URLSearchParams(await req.text()));
  const signed = twilio.validateRequest(
    cfg.token,
    req.headers.get("X-Twilio-Signature") || "",
    cfg.origin + path(id, event),
    values,
  );
  if (
    !signed ||
    values.AccountSid !== cfg.sid ||
    !/^CA[0-9a-f]{32}$/i.test(values.CallSid || "")
  )
    return new Response(null, { status: 403 });
  const row = callById(id);
  if (!row || (row.sid && row.sid !== values.CallSid))
    return new Response(null, { status: 404 });
  const bound = run(
    "UPDATE fasting_calls SET sid=? WHERE id=? AND (sid IS NULL OR sid=?)",
    values.CallSid,
    id,
    values.CallSid,
  );
  if (!bound.changes) return new Response(null, { status: 409 });
  if (event === "status") {
    if (
      ["completed", "busy", "no-answer", "failed", "canceled"].includes(
        values.CallStatus,
      )
    )
      finish(id, "unanswered");
    return new Response(null, { status: 204 });
  }
  const xml = (s: string) =>
    new Response(s, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  if (Date.now() - row.started >= pendingMs)
    return xml(goodbye("O tempo deste pedido terminou. Obrigada, Ana."));
  if (["yes", "no", "unsure"].includes(row.state))
    return xml(goodbye("Sua resposta já foi recebida. Obrigada, Ana."));
  const answer = readAnswer(values.Digits || "", values.SpeechResult || "");
  const confidence = values.Confidence ? Number(values.Confidence) : undefined;
  const unclear =
    !answer ||
    (!values.Digits &&
      confidence !== undefined &&
      (!Number.isFinite(confidence) || confidence < 0.65));
  if (unclear && event === "answer") return xml(prompt(cfg.origin, id, true));
  const result = unclear ? "unanswered" : answer!;
  finish(id, result);
  return xml(
    goodbye(
      unclear
        ? "Não consegui confirmar sua resposta. Obrigada, Ana."
        : "Obrigada, Ana. Vou transmitir sua resposta à Helena.",
    ),
  );
}
