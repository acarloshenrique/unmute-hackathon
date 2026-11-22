import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { requireDemo } from "@/lib/auth";
import { one, rows, type Row } from "@/lib/db";
import { failure } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  demo_login: "Entrou na demo",
  voice_agent_started: "Lia entrou na conversa de voz",
  voice_stopped: "Conversa de voz encerrada",
  "rate:voice_start": "Clicou em falar",
  "rate:demo_outreach": "Disparo real — ligação ou zap",
  proposal_created: "Lia propôs um pedido",
  proposal_confirmed: "Pedido confirmado",
  prepare_request_draft: "Lia rascunhou um pedido",
  create_task: "Tarefa criada",
  task_created: "Tarefa criada",
  update_task: "Tarefa atualizada",
  task_updated: "Tarefa atualizada",
  consent_granted: "Consentimento concedido",
  consent_revoked: "Consentimento revogado",
};
const SKIP = new Set(["rate:voice_llm", "rate:prepare_request"]);

type Event = { ts: string; kind: string; title: string; detail: string };

function auditEvents(): Event[] {
  return rows(
    `SELECT a.timestamp AS ts, a.action, a.metadata, m.display_name AS actor
     FROM audit_logs a LEFT JOIN members m ON m.id=a.actor_id
     ORDER BY a.timestamp DESC LIMIT 140`,
  )
    .filter((r) => !SKIP.has(String(r.action)))
    .map((r) => {
      let detail = "";
      try {
        const meta = JSON.parse(String(r.metadata || "{}"));
        if (meta.kind) detail = String(meta.kind).replaceAll("_", " ");
        if (meta.caregiver_id) detail = `agente ${meta.caregiver_id}`;
      } catch {
        /* metadata vazia */
      }
      return {
        ts: String(r.ts),
        kind: String(r.action),
        title: LABELS[String(r.action)] || String(r.action),
        detail: [r.actor ? String(r.actor) : "", detail].filter(Boolean).join(" · "),
      };
    });
}

function callTranscripts() {
  const dir = process.env.CARECIRCLE_CALL_DIR || "/opt/naima-call/transcripts";
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10)
      .map(({ f, mtime }) => ({
        file: f.replace(/\.md$/, ""),
        at: new Date(mtime).toISOString(),
        lines: readFileSync(join(dir, f), "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("**"))
          .slice(0, 5),
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    requireDemo();
    const day = new Date(Date.now() - 24 * 3600e3).toISOString();
    const count = (sql: string, ...args: string[]) =>
      Number(one<Row>(sql, ...args)?.n ?? 0);
    const counters = {
      sessions: count("SELECT COUNT(*) n FROM app_sessions"),
      logins_24h: count(
        "SELECT COUNT(*) n FROM audit_logs WHERE action='demo_login' AND timestamp>?",
        day,
      ),
      voice_sessions: count("SELECT COUNT(*) n FROM voice_sessions"),
      voice_24h: count(
        "SELECT COUNT(*) n FROM voice_sessions WHERE started_at>?",
        day,
      ),
      voice_open: count(
        "SELECT COUNT(*) n FROM voice_sessions WHERE ended_at IS NULL",
      ),
      outreach: count(
        "SELECT COUNT(*) n FROM audit_logs WHERE action='rate:demo_outreach'",
      ),
      outreach_24h: count(
        "SELECT COUNT(*) n FROM audit_logs WHERE action='rate:demo_outreach' AND timestamp>?",
        day,
      ),
      tasks: count("SELECT COUNT(*) n FROM tasks"),
      notifications: count("SELECT COUNT(*) n FROM notifications"),
      care_events: count("SELECT COUNT(*) n FROM care_events"),
    };
    const domain: Event[] = rows(
      `SELECT e.created_at AS ts, e.event_type AS action, e.summary AS detail,
              m.display_name AS actor
       FROM care_events e LEFT JOIN members m ON m.id=e.recipient_id
       ORDER BY e.created_at DESC LIMIT 40`,
    ).map((r) => ({
      ts: String(r.ts),
      kind: `event:${r.action}`,
      title: "Evento de cuidado",
      detail: [r.actor ? `para ${r.actor}` : "", String(r.detail || "")]
        .filter(Boolean)
        .join(" · "),
    }));
    const notes: Event[] = rows(
      `SELECT n.created_at AS ts, 'notification' AS action, n.message AS detail,
              n.status, m.display_name AS actor
       FROM notifications n LEFT JOIN members m ON m.id=n.recipient_id
       ORDER BY n.created_at DESC LIMIT 30`,
    ).map((r) => ({
      ts: String(r.ts),
      kind: "notification",
      title: `Notificação ${r.status === "delivered" ? "entregue" : r.status}`,
      detail: [r.actor ? `para ${r.actor}` : "", String(r.detail || "")]
        .filter(Boolean)
        .join(" · "),
    }));
    const events = [...auditEvents(), ...domain, ...notes]
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 90);
    const voice = rows(
      `SELECT started_at, ended_at, status, agent_id FROM voice_sessions
       ORDER BY started_at DESC LIMIT 15`,
    ).map((r) => ({
      started_at: r.started_at,
      ended_at: r.ended_at,
      status: r.status,
      duration_s: r.ended_at
        ? Math.round(
            (Date.parse(String(r.ended_at)) - Date.parse(String(r.started_at))) /
              1000,
          )
        : null,
    }));
    return Response.json(
      {
        now: new Date().toISOString(),
        counters,
        events,
        voice_sessions: voice,
        calls: callTranscripts(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
