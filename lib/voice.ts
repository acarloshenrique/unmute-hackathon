import {
  Agent,
  AgoraClient,
  Area,
  AresSTT,
  OpenAI as AgoraOpenAI,
  MiniMaxTTS,
  ExpiresIn,
} from "agora-agents";
import AgoraToken from "agora-token";
const { RtcTokenBuilder, RtcRole } = AgoraToken;
import { randomBytes, randomInt } from "node:crypto";
import { type Actor, DomainError, hash, profileFor } from "./auth";
import { audit, id, now, one, rows, run } from "./db";
import { consent } from "./domain";
import { LIA_PROMPT } from "./intelligence";
export const AGENT_UID = 123456;
function configuration() {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID,
    appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE,
    url = process.env.CARECIRCLE_PUBLIC_URL;
  if (!appId || !appCertificate || !url || !process.env.OPENAI_API_KEY)
    throw new DomainError(
      "AGORA_NOT_CONFIGURED",
      "Voz real indisponível: configure App ID, App Certificate, OpenAI e URL HTTPS pública. Nenhuma sessão simulada foi iniciada.",
      503,
    );
  if (!url.startsWith("https://"))
    throw new DomainError(
      "HTTPS_REQUIRED",
      "A URL do backend para Agora precisa usar HTTPS.",
      503,
    );
  return { appId, appCertificate, url };
}
const clientFor = (c: { appId: string; appCertificate: string }) =>
  new AgoraClient({
    area: Area.US,
    appId: c.appId,
    appCertificate: c.appCertificate,
  });
export async function startVoice(actor: Actor) {
  if (actor.role !== "elder")
    throw new DomainError(
      "ELDER_REQUIRED",
      "A conversa com Lia é para Helena.",
      403,
    );
  const p = profileFor(actor);
  if (!consent(String(p.id), "checkins"))
    throw new DomainError(
      "CONSENT_REQUIRED",
      "Autorize conversas com Lia primeiro.",
      403,
    );
  const c = configuration();
  await cleanupExpired();
  if (
    one(
      "SELECT id FROM voice_sessions WHERE actor_id=? AND status IN ('starting','active','stop_failed')",
      actor.id,
    )
  )
    throw new DomainError(
      "SESSION_EXISTS",
      "Encerre a conversa anterior antes de iniciar outra.",
      409,
    );
  const sessionId = id(),
    channel = `cc-${sessionId}`,
    uid = randomInt(1000, 9999000),
    capability = randomBytes(32).toString("hex"),
    expires = new Date(Date.now() + 15 * 60000).toISOString();
  const invitation = one(
    "SELECT rr.id FROM routine_runs rr JOIN routines r ON r.id=rr.routine_id WHERE r.care_profile_id=? AND rr.status='invited' ORDER BY rr.scheduled_at DESC",
    p.id,
  );
  run(
    "INSERT INTO voice_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    sessionId,
    p.id,
    actor.id,
    channel,
    now(),
    null,
    "starting",
    null,
    uid,
    hash(capability),
    expires,
    invitation?.id ?? null,
  );
  let startedAgentId: string | undefined;
  try {
    const greeting =
      "Olá, dona Helena. Sou Lia, assistente virtual do CareCircle. A senhora precisa de alguma coisa?";
    const agent = new Agent({
      client: clientFor(c),
      instructions: LIA_PROMPT,
      greeting,
      failureMessage:
        "Não consegui concluir. Podemos tentar novamente pela tela.",
      maxHistory: 16,
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: "vad",
            vad_config: { interrupt_duration_ms: 200, prefix_padding_ms: 300 },
          },
          end_of_speech: {
            mode: "vad",
            vad_config: { silence_duration_ms: 600 },
          },
        },
      },
      advancedFeatures: { enable_rtm: true, enable_sal: true },
      sal: { sal_mode: "locking" },
      parameters: {
        audio_scenario: "chorus",
        data_channel: "rtm",
        enable_error_message: true,
        enable_metrics: true,
      },
    })
      .withStt(
        new AresSTT({
          keywords: [
            "Lia",
            "Helena",
            "Ana",
            "Pedro",
            "CareCircle",
            "remédio",
            "consulta",
            "visita",
            "tarefa",
          ],
        }),
      )
      .withLlm(
        new AgoraOpenAI({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          url: `${c.url.replace(/\/$/, "")}/api/voice/llm/${sessionId}`,
          apiKey: capability,
          greetingMessage: greeting,
          failureMessage:
            "Tive uma dificuldade. O pedido ainda não foi enviado.",
          maxHistory: 16,
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: "speech_2_6_turbo",
          ...(process.env.AGORA_TTS_VOICE
            ? { voiceId: process.env.AGORA_TTS_VOICE }
            : {}),
        }),
      );
    const session = agent.createSession({
      channel,
      agentUid: String(AGENT_UID),
      remoteUids: [String(uid)],
      idleTimeout: 30,
      expiresIn: ExpiresIn.minutes(15),
      debug: false,
    });
    const agentId = await session.start();
    startedAgentId = agentId;
    run(
      "UPDATE voice_sessions SET agent_id=?,status='active' WHERE id=?",
      agentId,
      sessionId,
    );
    audit(actor.id, "voice_agent_started", "voice_sessions", sessionId);
    const ttl = 900;
    const token = RtcTokenBuilder.buildTokenWithRtm(
      c.appId,
      c.appCertificate,
      channel,
      String(uid),
      RtcRole.PUBLISHER,
      ttl,
      ttl,
    );
    return {
      session_id: sessionId,
      app_id: c.appId,
      channel,
      uid,
      token,
      agent_uid: AGENT_UID,
      expires_at: expires,
    };
  } catch {
    if (startedAgentId) {
      try {
        await clientFor(c).stopAgent(startedAgentId);
      } catch {
        run(
          "UPDATE voice_sessions SET status='stop_failed',agent_id=? WHERE id=?",
          startedAgentId,
          sessionId,
        );
        audit(actor.id, "voice_cleanup_pending", "voice_sessions", sessionId);
        throw new DomainError(
          "AGORA_START_CLEANUP_PENDING",
          "A conversa falhou ao iniciar. O encerramento no servidor está pendente e será tentado pelo worker.",
          502,
        );
      }
    }
    run(
      "UPDATE voice_sessions SET status='error',ended_at=? WHERE id=?",
      now(),
      sessionId,
    );
    audit(actor.id, "voice_start_failed", "voice_sessions", sessionId);
    throw new DomainError(
      "AGORA_START_FAILED",
      "A Agora não iniciou a conversa. Confira credenciais, habilitação de RTC/RTM/ConvoAI, provedores e URL pública.",
      502,
    );
  }
}
export async function stopVoice(actor: Actor, sessionId: string) {
  const s = one(
    "SELECT * FROM voice_sessions WHERE id=? AND actor_id=?",
    sessionId,
    actor.id,
  );
  if (!s) throw new DomainError("FORBIDDEN", "Sessão não autorizada.", 403);
  profileFor(actor, String(s.care_profile_id));
  if (s.status === "disconnected" || s.status === "error")
    return { status: s.status };
  if (s.agent_id) {
    try {
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID,
        appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
      if (!appId || !appCertificate)
        throw new Error("AGORA_CREDENTIALS_MISSING");
      await clientFor({ appId, appCertificate }).stopAgent(String(s.agent_id));
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 404
      )) {
        run("UPDATE voice_sessions SET status='stop_failed' WHERE id=?", s.id);
        audit(actor.id, "voice_stop_failed", "voice_sessions", String(s.id));
        throw new DomainError(
          "STOP_FAILED",
          "O servidor não confirmou o encerramento. Tentaremos novamente até expirar a sessão.",
          502,
        );
      }
    }
  }
  run(
    "UPDATE voice_sessions SET status='disconnected',ended_at=?,capability_hash=NULL WHERE id=?",
    now(),
    s.id,
  );
  audit(actor.id, "voice_stopped", "voice_sessions", String(s.id));
  return { status: "disconnected" };
}
export async function cleanupExpired() {
  for (const s of rows(
    "SELECT * FROM voice_sessions WHERE (expires_at<? OR status='stop_failed') AND status IN ('starting','active','stop_failed')",
    now(),
  )) {
    const actor = one<Actor>("SELECT * FROM members WHERE id=?", s.actor_id);
    if (actor)
      try {
        await stopVoice(actor, String(s.id));
      } catch {
        /* Worker retries; Agora also enforces expiry and idle timeout. */
      }
  }
}
export function voiceActor(sessionId: string, authorization: string | null) {
  const s = one(
    "SELECT * FROM voice_sessions WHERE id=? AND status='active' AND expires_at>?",
    sessionId,
    now(),
  );
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!s || !bearer || hash(bearer) !== s.capability_hash)
    throw new DomainError(
      "UNAUTHENTICATED",
      "Sessão de voz inválida ou expirada.",
      401,
    );
  const actor = one<Actor>("SELECT * FROM members WHERE id=?", s.actor_id);
  if (!actor)
    throw new DomainError("UNAUTHENTICATED", "Identidade ausente.", 401);
  if (!consent(String(s.care_profile_id), "checkins"))
    throw new DomainError("CONSENT_REQUIRED", "Conversa revogada.", 403);
  return actor;
}
