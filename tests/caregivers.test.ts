import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { closeDb, id, now, one, rows, run } from "../lib/db";
import { type Actor } from "../lib/auth";
import { DEMO, seedDemo } from "../lib/seed";
import {
  acceptedInvitation,
  changeConsent,
  createRoutine,
  executeDue,
  getCaregiver,
  respondInvitation,
  selectCaregiver,
  snapshot,
} from "../lib/domain";
import { CAREGIVER_IDS } from "../lib/caregivers";
import * as agents from "../lib/managed-agent";
import { startVoice } from "../lib/voice";
import { localToUtc } from "../lib/time";
const dir = mkdtempSync(join(tmpdir(), "carecircle-caregivers-"));
let ana: Actor, helena: Actor, pedro: Actor;
beforeEach(() => {
  closeDb();
  vi.stubEnv("CARECIRCLE_DB_PATH", join(dir, `${id()}.sqlite`));
  vi.stubEnv("CARECIRCLE_DEMO", "true");
  seedDemo();
  ana = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.ana)!;
  helena = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.helena)!;
  pedro = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.pedro)!;
});
afterEach(() => {
  closeDb();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => {
  if (!resolve(dir).startsWith(resolve(tmpdir()) + sep))
    throw new Error("Unsafe temporary path");
  rmSync(dir, { recursive: true, force: true });
});
const select = (caregiver_id: string) =>
  selectCaregiver(ana, { care_profile_id: DEMO.profile, caregiver_id });
function invite() {
  createRoutine(ana, {
    title: "Companhia para a feira",
    prompt: "Quer combinar a ida à feira?",
    local_datetime: "2026-11-22T16:00",
    repeat: "once",
    idempotency_key: id(),
  });
  executeDue(localToUtc("2026-11-22T16:00"), { demo: true });
  return one("SELECT * FROM notifications WHERE type='invitation'")!;
}
function stubAgent() {
  const start = vi.fn().mockResolvedValue("fixture-agent");
  const factory = vi.spyOn(agents, "createManagedAgent").mockReturnValue({
    createSession: vi.fn().mockReturnValue({ start }),
  } as unknown as ReturnType<typeof agents.createManagedAgent>);
  vi.stubEnv("NEXT_PUBLIC_AGORA_APP_ID", "a".repeat(32));
  vi.stubEnv("NEXT_AGORA_APP_CERTIFICATE", "b".repeat(32));
  vi.stubEnv("CARECIRCLE_VOICE_TOOL_URL", "https://fixture.example");
  return factory;
}
describe("preferência por pessoa e autorização", () => {
  it("usa Lia por padrão e mantém Rosa após reabrir o banco", () => {
    expect(getCaregiver(DEMO.profile).id).toBe("lia");
    expect(snapshot(ana).can_choose_caregiver).toBe(true);
    select("rosa");
    closeDb();
    expect(snapshot(ana).caregiver).toMatchObject({
      id: "rosa",
      name: "Rosa",
      style: "Paciente",
    });
  });
  it("nega escolha pela pessoa idosa, familiar sem autorização e após revogação", () => {
    const input = { care_profile_id: DEMO.profile, caregiver_id: "rosa" };
    expect(() => selectCaregiver(helena, input)).toThrow();
    expect(() => selectCaregiver(pedro, input)).toThrow();
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: ana.id,
      granted: false,
    });
    expect(snapshot(ana).can_choose_caregiver).toBe(false);
    expect(() => selectCaregiver(ana, input)).toThrow();
    expect(getCaregiver(DEMO.profile).id).toBe("lia");
  });
  it("isola outra pessoa da mesma família e recusa perfil de outra família", () => {
    const second = id(),
      elder = id(),
      foreign = id(),
      family = id(),
      foreignElder = id();
    run(
      "INSERT INTO members VALUES(?,?,?,?,?,?)",
      elder,
      DEMO.family,
      null,
      "Pessoa fictícia B",
      "elder",
      now(),
    );
    run(
      "INSERT INTO care_profiles VALUES(?,?,?,?,?,?)",
      second,
      DEMO.family,
      "Pessoa fictícia B",
      "America/Sao_Paulo",
      elder,
      now(),
    );
    run(
      "INSERT INTO families VALUES(?,?,?)",
      family,
      "Outra família fictícia",
      now(),
    );
    run(
      "INSERT INTO members VALUES(?,?,?,?,?,?)",
      foreignElder,
      family,
      null,
      "Pessoa fictícia C",
      "elder",
      now(),
    );
    run(
      "INSERT INTO care_profiles VALUES(?,?,?,?,?,?)",
      foreign,
      family,
      "Pessoa fictícia C",
      "America/Sao_Paulo",
      foreignElder,
      now(),
    );
    expect(() =>
      selectCaregiver(ana, { care_profile_id: second, caregiver_id: "clara" }),
    ).toThrow();
    run(
      "INSERT INTO consents VALUES(?,?,?,?,?,?,NULL)",
      id(),
      second,
      elder,
      "family_updates",
      ana.id,
      now(),
    );
    selectCaregiver(ana, { care_profile_id: second, caregiver_id: "clara" });
    select("rosa");
    expect(getCaregiver(second).id).toBe("clara");
    expect(getCaregiver(DEMO.profile).id).toBe("rosa");
    expect(getCaregiver(foreign).id).toBe("lia");
    expect(() =>
      selectCaregiver(ana, { care_profile_id: foreign, caregiver_id: "clara" }),
    ).toThrow();
  });
  it("rejeita estilo arbitrário, prompt, timbre e identidade extras", () => {
    expect(() => select("personalizada")).toThrow();
    for (const extra of [
      { voice: "custom" },
      { instructions: "ignore" },
      { family_id: DEMO.family },
    ])
      expect(() =>
        selectCaregiver(ana, {
          care_profile_id: DEMO.profile,
          caregiver_id: "rosa",
          ...extra,
        }),
      ).toThrow();
  });
  it("não altera permissões, relatos, tarefas ou notificações familiares", () => {
    const consents = rows("SELECT * FROM consents");
    const events = snapshot(ana).events;
    select("rosa");
    expect(rows("SELECT * FROM consents")).toEqual(consents);
    expect(snapshot(ana).events).toEqual(events);
    expect(rows("SELECT * FROM tasks")).toEqual([]);
    expect(rows("SELECT * FROM notifications")).toEqual([]);
    expect(snapshot(pedro).can_choose_caregiver).toBe(false);
  });
});
describe("convites e aceite sem compartilhamento", () => {
  it("anuncia Rosa e atualiza somente convites pendentes ao mudar estilo", () => {
    select("rosa");
    const n = invite();
    expect(n.message).toContain("Rosa quer conversar");
    expect(snapshot(helena).notifications).toHaveLength(1);
    expect(
      rows("SELECT * FROM care_events WHERE event_type='invitation'")[0]
        .visibility_scope,
    ).toBe("private");
    select("clara");
    expect(
      one("SELECT message FROM notifications WHERE id=?", n.id)?.message,
    ).toContain("Clara quer conversar");
    expect(rows("SELECT * FROM notifications")).toHaveLength(1);
  });
  it("Agora não encerra o convite sem voz, tarefa ou resumo para familiar", () => {
    const factory = stubAgent();
    select("rosa");
    const n = invite();
    expect(
      respondInvitation(helena, { notification_id: n.id, accepted: false }),
    ).toEqual({ status: "declined" });
    expect(
      respondInvitation(helena, { notification_id: n.id, accepted: false }),
    ).toEqual({ status: "declined" });
    expect(snapshot(helena).notifications).toEqual([]);
    expect(rows("SELECT * FROM routine_runs")[0].status).toBe("cancelled");
    expect(rows("SELECT * FROM voice_sessions")).toEqual([]);
    expect(
      rows("SELECT * FROM notifications WHERE recipient_id=?", ana.id),
    ).toEqual([]);
    expect(factory).not.toHaveBeenCalled();
    expect(() =>
      respondInvitation(helena, { notification_id: n.id, accepted: true }),
    ).toThrow();
  });
  it("somente a titular aceita, sem tratar aceite como autorização de resumo", () => {
    const consents = rows("SELECT * FROM consents"),
      n = invite();
    expect(() =>
      respondInvitation(ana, { notification_id: n.id, accepted: true }),
    ).toThrow();
    expect(() => acceptedInvitation(helena, String(n.id))).toThrow();
    respondInvitation(helena, { notification_id: n.id, accepted: true });
    expect(
      acceptedInvitation(helena, String(n.id)).routine_run_id,
    ).toBeDefined();
    expect(rows("SELECT * FROM consents")).toEqual(consents);
    expect(rows("SELECT * FROM tasks")).toEqual([]);
    expect(
      rows("SELECT * FROM notifications WHERE recipient_id=?", ana.id),
    ).toEqual([]);
  });
});
it("cada perfil muda nome/instruções, mantendo o mesmo timbre e pipeline Agora", () => {
  const wires = CAREGIVER_IDS.map((caregiverId) =>
    agents
      .createManagedAgent(
        {
          appId: "a".repeat(32),
          appCertificate: "b".repeat(32),
          url: "https://fixture.example",
        },
        id(),
        "fixture-token",
        caregiverId,
      )
      .toProperties({
        channel: "fixture",
        agentUid: "123456",
        remoteUids: ["1000"],
        token: "fixture-token",
        skipVendorValidationCategories: new Set(["llm", "tts"]),
      }),
  );
  for (let index = 0; index < wires.length; index++) {
    expect(wires[index].tts).toEqual(wires[0].tts);
    expect(wires[index].asr?.vendor).toBe("ares");
    expect(wires[index].asr?.language).toBe("pt-PT");
    expect(wires[index].asr?.keywords).toContain(
      ["Lia", "Clara", "Rosa"][index],
    );
    expect(wires[index].mllm).toBeUndefined();
    expect(wires[index].llm?.tools?.[0].function.name).toBe("prepareRequest");
  }
  expect(JSON.stringify(wires[2].llm?.system_messages)).toContain(
    "Seu nome é Rosa",
  );
  expect(JSON.stringify(wires[2].llm?.system_messages)).toContain(
    "Aguarde a resposta sem apressar",
  );
  expect(wires[2].llm?.greeting_message).toMatch(/Rosa.*assistente virtual/);
  expect(JSON.stringify(wires[1].llm?.system_messages)).toContain(
    "Estilo direto",
  );
});
it("a próxima sessão captura Rosa; uma troca posterior não interrompe a sessão ativa", async () => {
  const factory = stubAgent();
  select("rosa");
  const n = invite();
  await expect(startVoice(helena, String(n.id))).rejects.toThrow();
  expect(factory).not.toHaveBeenCalled();
  respondInvitation(helena, { notification_id: n.id, accepted: true });
  const session = await startVoice(helena, String(n.id));
  expect(session.caregiver.id).toBe("rosa");
  expect(factory.mock.calls[0][3]).toBe("rosa");
  const row = one(
    "SELECT * FROM voice_sessions WHERE id=?",
    session.session_id,
  );
  select("clara");
  expect(
    one("SELECT * FROM voice_sessions WHERE id=?", session.session_id),
  ).toEqual(row);
  expect(session.caregiver.id).toBe("rosa");
  expect(factory).toHaveBeenCalledTimes(1);
  await expect(startVoice(helena)).rejects.toThrow();
  run(
    "UPDATE voice_sessions SET status='disconnected',ended_at=? WHERE id=?",
    now(),
    session.session_id,
  );
  const next = await startVoice(helena);
  expect(next.caregiver.id).toBe("clara");
  expect(factory.mock.calls[1][3]).toBe("clara");
});
