import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { closeDb, id, now, one, rows, run } from "../lib/db";
import { type Actor, hash } from "../lib/auth";
import { DEMO, seedDemo } from "../lib/seed";
import {
  changeConsent,
  confirmProposal,
  pendingTasks,
  updateTask,
} from "../lib/domain";
import { prepareRequest } from "../lib/realtime-request";
import { createManagedAgent } from "../lib/managed-agent";
import { voiceActor } from "../lib/voice";
import { allowedToolPath } from "../scripts/voice-tool-gateway";
const dir = mkdtempSync(join(tmpdir(), "carecircle-realtime-"));
let helena: Actor, pedro: Actor, sessionId: string, token: string;
beforeEach(() => {
  closeDb();
  process.env.CARECIRCLE_DB_PATH = join(dir, `${id()}.sqlite`);
  process.env.CARECIRCLE_DEMO = "true";
  seedDemo();
  helena = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.helena)!;
  pedro = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.pedro)!;
  changeConsent(helena, {
    scope: "family_updates",
    recipient_id: pedro.id,
    granted: true,
  });
  sessionId = id();
  token = `fixture-capability-${id()}`;
  run(
    "INSERT INTO voice_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    sessionId,
    DEMO.profile,
    helena.id,
    `unit-${sessionId}`,
    now(),
    null,
    "active",
    null,
    1000,
    hash(token),
    new Date(Date.now() + 900000).toISOString(),
    null,
  );
});
afterAll(() => {
  closeDb();
  if (!resolve(dir).startsWith(resolve(tmpdir()) + requireSeparator()))
    throw new Error("Unsafe test path");
  rmSync(dir, { recursive: true, force: true });
});
function requireSeparator() {
  return process.platform === "win32" ? "\\" : "/";
}
const initial = () => ({
  recipient_name: "Pedro",
  time: null,
  expected_revision: 0,
});
describe("Realtime: fronteira de autorização e rascunho", () => {
  it("não aceita cookie ou token ausente, errado ou de outra sessão", () => {
    expect(() => voiceActor(sessionId, null)).toThrow();
    expect(() => voiceActor(sessionId, "Bearer errado")).toThrow();
    expect(() => voiceActor(id(), `Bearer ${token}`)).toThrow();
    expect(voiceActor(sessionId, `Bearer ${token}`).id).toBe(helena.id);
  });
  it("nega token expirado e invalidado após encerramento", () => {
    run(
      "UPDATE voice_sessions SET expires_at=? WHERE id=?",
      "2000-01-01T00:00:00Z",
      sessionId,
    );
    expect(() => voiceActor(sessionId, `Bearer ${token}`)).toThrow();
    run(
      "UPDATE voice_sessions SET expires_at=?,status='disconnected',capability_hash=NULL WHERE id=?",
      new Date(Date.now() + 900000).toISOString(),
      sessionId,
    );
    expect(() => voiceActor(sessionId, `Bearer ${token}`)).toThrow();
  });
  it("nega ferramenta após revogação e para outra identidade", () => {
    expect(() =>
      prepareRequest(pedro, sessionId, initial(), "call1"),
    ).toThrow();
    changeConsent(helena, { scope: "checkins", granted: false });
    expect(() => voiceActor(sessionId, `Bearer ${token}`)).toThrow();
    expect(() =>
      prepareRequest(helena, sessionId, initial(), "call1"),
    ).toThrow();
  });
  it("nega destinatário sem consentimento e ignora nenhuma identidade do modelo", () => {
    expect(() =>
      prepareRequest(
        helena,
        sessionId,
        { ...initial(), family_id: DEMO.family },
        "c",
      ),
    ).toThrow();
    expect(() =>
      prepareRequest(
        helena,
        sessionId,
        { ...initial(), recipient_id: pedro.id },
        "c",
      ),
    ).toThrow();
    expect(() =>
      prepareRequest(
        helena,
        sessionId,
        { ...initial(), recipient_name: "Ana" },
        "c",
      ),
    ).toThrow();
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: pedro.id,
      granted: false,
    });
    expect(() => prepareRequest(helena, sessionId, initial(), "c")).toThrow();
  });
  it("não aceita comandos de confirmação ou horário inválido", () => {
    expect(() =>
      prepareRequest(helena, sessionId, { ...initial(), confirmed: true }, "c"),
    ).toThrow();
    expect(() =>
      prepareRequest(helena, sessionId, { ...initial(), time: "25:00" }, "c"),
    ).toThrow();
  });
  it("correção atualiza o mesmo rascunho sem tarefa nem notificação", () => {
    const first = prepareRequest(helena, sessionId, initial(), "call1");
    const next = prepareRequest(
      helena,
      sessionId,
      { ...initial(), time: "10:00", expected_revision: first.revision },
      "call2",
    );
    expect(next.proposal_id).toBe(first.proposal_id);
    expect(next.revision).toBe(2);
    expect(next.details.join(" ")).toContain("10:00");
    expect(rows("SELECT * FROM proposals")).toHaveLength(1);
    expect(pendingTasks(pedro)).toEqual([]);
    expect(rows("SELECT * FROM notifications")).toEqual([]);
  });
  it("replay de chamada antiga não desfaz correção e chamada não pode mudar argumentos", () => {
    const first = prepareRequest(helena, sessionId, initial(), "call1");
    prepareRequest(
      helena,
      sessionId,
      { ...initial(), time: "10:00", expected_revision: first.revision },
      "call2",
    );
    const replay = prepareRequest(helena, sessionId, initial(), "call1");
    expect(replay.revision).toBe(2);
    expect(replay.details.join(" ")).toContain("10:00");
    expect(() =>
      prepareRequest(
        helena,
        sessionId,
        { ...initial(), time: "11:00", expected_revision: 2 },
        "call1",
      ),
    ).toThrow();
  });
  it("correção fora de ordem é negada e não altera o pedido", () => {
    prepareRequest(helena, sessionId, initial(), "c1");
    prepareRequest(
      helena,
      sessionId,
      { ...initial(), time: "10:00", expected_revision: 1 },
      "c2",
    );
    expect(() =>
      prepareRequest(
        helena,
        sessionId,
        { ...initial(), time: "11:00", expected_revision: 1 },
        "c3",
      ),
    ).toThrow();
    expect(
      JSON.parse(String(one("SELECT payload FROM proposals")?.payload))
        ._realtime.time,
    ).toBe("10:00");
  });
  it("confirmação antiga ou sem revisão não compartilha texto obsoleto", () => {
    const first = prepareRequest(helena, sessionId, initial(), "c1");
    prepareRequest(
      helena,
      sessionId,
      { ...initial(), time: "10:00", expected_revision: 1 },
      "c2",
    );
    expect(() =>
      confirmProposal(helena, {
        proposal_id: first.proposal_id,
        confirmed: true,
        revision: 1,
      }),
    ).toThrow("corrigido");
    expect(() =>
      confirmProposal(helena, {
        proposal_id: first.proposal_id,
        confirmed: true,
      }),
    ).toThrow();
    expect(pendingTasks(pedro)).toEqual([]);
  });
  it("confirmação repetida cria uma tarefa e uma notificação e aceite persiste", () => {
    const d = prepareRequest(
      helena,
      sessionId,
      { ...initial(), time: "10:00" },
      "c1",
    );
    const confirmation = {
      proposal_id: d.proposal_id,
      confirmed: true,
      revision: d.revision,
    };
    confirmProposal(helena, confirmation);
    confirmProposal(helena, confirmation);
    prepareRequest(
      helena,
      sessionId,
      { ...initial(), time: "11:00", expected_revision: 1 },
      "c2",
    );
    expect(rows("SELECT * FROM tasks")).toHaveLength(1);
    expect(rows("SELECT * FROM notifications")).toHaveLength(1);
    const task = pendingTasks(pedro)[0];
    expect(task.items[0].label).toContain("10:00");
    updateTask(pedro, { task_id: task.id, changes: { status: "accepted" } });
    closeDb();
    expect(pendingTasks(pedro)[0].status).toBe("accepted");
  });
  it("cancelamento e chamada repetida nunca criam cartão", () => {
    const d = prepareRequest(helena, sessionId, initial(), "c1");
    confirmProposal(helena, {
      proposal_id: d.proposal_id,
      confirmed: false,
      revision: d.revision,
    });
    expect(
      prepareRequest(
        helena,
        sessionId,
        { ...initial(), time: "10:00", expected_revision: 1 },
        "c2",
      ).status,
    ).toBe("rejected");
    expect(rows("SELECT * FROM tasks")).toEqual([]);
    expect(rows("SELECT * FROM notifications")).toEqual([]);
  });
});
it("SDK instalado configura pipeline gerenciado sem chave de provedor e com ferramenta privada", () => {
  const agent = createManagedAgent(
    {
      appId: "a".repeat(32),
      appCertificate: "b".repeat(32),
      url: "https://gateway.example",
    },
    sessionId,
    "fixture-token",
  );
  const wire = agent.toProperties({
    channel: "unit",
    agentUid: "123456",
    remoteUids: ["1000"],
    token: "fixture-agora-token",
    // AgentSession applies these skips after inferring the managed presets.
    skipVendorValidationCategories: new Set(["asr", "llm", "tts"]),
  });
  expect(wire.mllm).toBeUndefined();
  expect(wire.asr?.vendor).toBe("ares");
  expect(wire.asr?.language).toBe("pt-PT");
  expect(wire.llm?.params?.stream).toBe(true);
  expect(wire.asr?.keywords).toContain("feira");
  expect(wire.advanced_features?.enable_sal).toBe(true);
  expect(wire.sal?.sal_mode).toBe("locking");
  expect(wire.asr?.params?.api_key).toBeUndefined();
  expect(wire.llm?.api_key).toBeUndefined();
  expect(wire.llm?.params?.model).toBe("gpt-4o-mini");
  expect(wire.tts?.vendor).toBe("minimax");
  expect(wire.tts?.params).not.toHaveProperty("key");
  expect(wire.turn_detection?.config?.end_of_speech?.mode).toBe("vad");
  expect(wire.advanced_features?.enable_rtm).toBe(true);
  expect(wire.advanced_features?.enable_tools).toBe(true);
  const tools = wire.llm?.tools!;
  expect(tools).toHaveLength(1);
  expect(tools[0].function.name).toBe("prepareRequest");
  expect(tools[0].server.body?.tool_call_id).toBe("{{tool_call_id}}");
  expect(tools[0].server.url).not.toContain("/llm/");
  expect(tools[0].server.headers?.Authorization).toBe("Bearer fixture-token");
});
it("gateway não publica login, painéis, callback antigo, query ou caminhos alternativos", () => {
  const path = `/api/voice/tools/${sessionId}/prepare-request`;
  expect(allowedToolPath(path)).toBe(true);
  for (const denied of [
    "/api/demo",
    "/familia",
    `/api/voice/llm/${sessionId}`,
    `${path}?next=/api/demo`,
    `${path}/../demo`,
    "/",
  ])
    expect(allowedToolPath(denied)).toBe(false);
});
