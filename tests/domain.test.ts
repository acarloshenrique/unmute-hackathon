import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DateTime } from "luxon";
import { closeDb, id, now, one, rows, run } from "../lib/db";
import {
  type Actor,
  actorFromRequest,
  createDemoSession,
  hash,
} from "../lib/auth";
import { DEMO, seedDemo } from "../lib/seed";
import {
  changeConsent,
  changeRoutine,
  confirmProposal,
  confirmRoutine,
  createRoutine,
  createTask,
  demoClock,
  executeDue,
  pendingTasks,
  propose,
  snapshot,
  summary,
  updateTask,
  visibleEvents,
} from "../lib/domain";
import { localToUtc, nextDaily, ZONE } from "../lib/time";
import { executeTool } from "../lib/intelligence";
import { familyCheckinReport } from "../lib/checkin-report";
import { makeCleanup } from "../lib/voice-cleanup";
import { startVoice, voiceActor, stopVoice } from "../lib/voice";
const temp = mkdtempSync(join(tmpdir(), "carecircle-test-"));
const at = (time: string) => localToUtc(`2026-11-22T${time}`);
let helena: Actor, ana: Actor, pedro: Actor;
beforeEach(() => {
  closeDb();
  process.env.CARECIRCLE_DB_PATH = join(temp, `${id()}.sqlite`);
  process.env.CARECIRCLE_DEMO = "true";
  seedDemo();
  helena = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.helena)!;
  ana = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.ana)!;
  pedro = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.pedro)!;
});
afterAll(() => {
  closeDb();
  rmSync(temp, { recursive: true, force: true });
});
const routine = (repeat: "once" | "daily" = "once") =>
  createRoutine(ana, {
    title: "Conversa",
    prompt: "Precisa de alguma coisa?",
    local_datetime: "2026-11-22T16:00",
    repeat,
    idempotency_key: id(),
  });
const taskInput = () => ({
  care_profile_id: DEMO.profile,
  title: "Ajuda com as compras",
  items: [{ label: "leite" }, { label: "pão" }, { label: "café" }],
  assignee_id: DEMO.ana,
  idempotency_key: id(),
});
describe("Acompanhamento familiar inspirado no ICOPE", () => {
  it("conta 7 dias civis em São Paulo e exige destinatário nos desfechos", () => {
    // Ainda é 21/11 em São Paulo. O recorte começa em 15/11 às 03:00 UTC.
    run(
      "UPDATE demo_state SET value=? WHERE id='clock'",
      "2026-11-22T02:30:00.000Z",
    );
    const owned = routine();
    const other = createRoutine(pedro, {
      title: "Agenda de outro familiar",
      prompt: "Conversa",
      local_datetime: "2026-11-22T09:00",
      idempotency_key: id(),
    });
    const addRun = (
      routineId: string | number | null,
      at: string,
      status: string,
    ) => {
      const runId = id();
      run(
        "INSERT INTO routine_runs(id,routine_id,scheduled_at,status,idempotency_key) VALUES(?,?,?,?,?)",
        runId,
        routineId,
        at,
        status,
        id(),
      );
      return runId;
    };
    const source = (
      runId: string,
      at: string,
      status: string,
      recipient: string,
    ) => {
      const eventId = id();
      run(
        "INSERT INTO care_events(id,care_profile_id,routine_run_id,event_type,summary,evidence_type,event_time,visibility_scope,recipient_id,created_at,simulated) VALUES(?,?,?,?,?,?,?,'family',?,?,1)",
        eventId,
        DEMO.profile,
        runId,
        status === "reported" ? "checkin" : "unanswered",
        "Teste",
        status,
        at,
        recipient,
        at,
      );
      return eventId;
    };
    const boundary = "2026-11-15T03:00:00.000Z";
    const last = "2026-11-21T18:00:00.000Z";
    addRun(owned.id, "2026-11-15T02:59:59.999Z", "invited");
    addRun(owned.id, "2026-11-22T03:00:00.000Z", "invited");
    const answered = addRun(owned.id, boundary, "answered");
    source(answered, boundary, "reported", DEMO.ana);
    source(answered, boundary, "reported", DEMO.ana);
    const missing = addRun(owned.id, last, "unanswered");
    const lastId = source(missing, last, "unanswered", DEMO.ana);
    const privateResult = addRun(
      owned.id,
      "2026-11-21T19:00:00.000Z",
      "answered",
    );
    source(privateResult, "2026-11-21T19:00:00.000Z", "reported", DEMO.pedro);
    addRun(other.id, "2026-11-21T16:00:00.000Z", "invited");
    expect(snapshot(ana).family_followup).toMatchObject({
      invited: 2,
      answered: 1,
      unanswered: 1,
      lastContact: { id: lastId, status: "unanswered", simulated: 1 },
      nextContact: { at: "2026-11-22T19:00:00.000Z" },
    });
    expect(snapshot(pedro).family_followup).toBeNull();
  });

  it("conta só pedidos do destinatário no recorte e respeita revogação", () => {
    run(
      "UPDATE demo_state SET value=? WHERE id='clock'",
      "2026-11-22T18:00:00.000Z",
    );
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: DEMO.pedro,
      granted: true,
    });
    for (const [assignee, date, status] of [
      [DEMO.ana, "2026-11-22T16:00:00.000Z", "pending"],
      [DEMO.ana, "2026-11-20T16:00:00.000Z", "accepted"],
      [DEMO.ana, "2026-11-16T02:59:59.999Z", "accepted"],
      [DEMO.ana, "2026-11-19T16:00:00.000Z", "completed"],
      [DEMO.pedro, "2026-11-22T16:00:00.000Z", "pending"],
    ]) {
      const task = createTask(helena, {
        ...taskInput(),
        assignee_id: assignee,
      });
      run(
        "UPDATE tasks SET created_at=?,status=? WHERE id=?",
        date,
        status,
        task.id,
      );
    }
    expect(snapshot(ana).family_followup).toMatchObject({
      pending: 1,
      accepted: 1,
    });
    expect(snapshot(pedro).family_followup).toMatchObject({
      pending: 1,
      accepted: 0,
    });
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: DEMO.ana,
      granted: false,
    });
    expect(snapshot(ana).family_followup).toBeNull();
  });
});

describe("Tempo e agenda persistente", () => {
  it("converte São Paulo para UTC e rejeita horário impossível", () => {
    expect(at("16:00")).toBe("2026-11-22T19:00:00.000Z");
    expect(() => localToUtc("2026-02-30T16:00")).toThrow();
  });
  it("calcula próxima ocorrência diária sem depender do fuso do processo", () => {
    expect(nextDaily("16:00", at("16:00"))).toBe("2026-11-23T19:00:00.000Z");
  });
  it("cria rotina em disco com expressão e fuso", () => {
    const r = routine("daily");
    closeDb();
    expect(one("SELECT * FROM routines WHERE id=?", r.id)?.timezone).toBe(ZONE);
  });
  it("não executa antes do horário e grava um único convite após retries", () => {
    routine();
    expect(executeDue(at("15:59"))).toHaveLength(0);
    expect(executeDue(at("16:00"))).toHaveLength(1);
    expect(executeDue(at("16:00"))).toHaveLength(0);
    expect(rows("SELECT * FROM routine_runs")).toHaveLength(1);
    expect(
      rows("SELECT * FROM notifications WHERE type='invitation'"),
    ).toHaveLength(1);
  });
  it("avança recorrência diária sem duplicar a mesma ocorrência", () => {
    const r = routine("daily");
    executeDue(at("16:00"));
    expect(
      one("SELECT next_run_at FROM routines WHERE id=?", r.id)?.next_run_at,
    ).toBe("2026-11-23T19:00:00.000Z");
    expect(executeDue(at("16:00"))).toEqual([]);
  });
  it("pausa e cancela sem novos convites", () => {
    const r = routine();
    changeRoutine(ana, { routine_id: r.id, operation: "pause" });
    expect(executeDue(at("16:00"))).toHaveLength(0);
    changeRoutine(ana, { routine_id: r.id, operation: "cancel" });
    expect(() =>
      changeRoutine(ana, { routine_id: r.id, operation: "resume" }),
    ).toThrow();
  });
  it("respeita horário silencioso", () => {
    expect(() =>
      createRoutine(ana, {
        title: "Noite",
        prompt: "Oi",
        local_datetime: "2026-11-22T23:00",
        idempotency_key: id(),
      }),
    ).toThrow("8h");
  });
  it("respeita consentimento revogado e limita tentativas", () => {
    routine();
    changeConsent(helena, { scope: "checkins", granted: false });
    for (let n = 0; n < 5; n++)
      executeDue(at(`16:${String(n * 6).padStart(2, "0")}`));
    expect(one("SELECT attempts FROM routine_runs")?.attempts).toBe(3);
    expect(rows("SELECT * FROM notifications")).toHaveLength(0);
  });
  it("permite retry após autorização sem duplicar ocorrência", () => {
    routine();
    changeConsent(helena, { scope: "checkins", granted: false });
    executeDue(at("16:00"));
    changeConsent(helena, { scope: "checkins", granted: true });
    expect(executeDue(at("16:01"))[0].status).toBe("invited");
    expect(rows("SELECT * FROM routine_runs")).toHaveLength(1);
  });
  it("marca ausência como sem resposta, nunca como saúde confirmada", () => {
    routine();
    executeDue(at("16:00"));
    executeDue(at("16:11"));
    expect(one("SELECT status FROM routine_runs")?.status).toBe("unanswered");
    expect(summary(ana).answer).toContain("não informa o estado de saúde");
  });
  it("separa relógio de demonstração do relógio real", () => {
    const before = Date.now();
    const old = demoClock();
    expect(new Date(demoClock(2)).getTime() - new Date(old).getTime()).toBe(
      120000,
    );
    expect(Date.now() - before).toBeLessThan(1000);
  });
});
describe("Resumo de acompanhamento familiar", () => {
  it("não expõe rascunho ao destinatário, titular ou fora da família", () => {
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: DEMO.pedro,
      granted: true,
    });
    propose(
      helena,
      "create_task",
      {
        ...taskInput(),
        title: "Rascunho privado para Pedro",
        assignee_id: DEMO.pedro,
      },
      null,
      id(),
    );

    expect(snapshot(pedro).checkin_report).toBeNull();
    expect(snapshot(helena).checkin_report).toBeNull();
    expect(
      familyCheckinReport({ ...pedro, family_id: id() }, DEMO.profile),
    ).toBeNull();
    expect(snapshot(ana).checkin_report?.observation).not.toContain("Rascunho");
  });

  it("vincula apenas a tarefa aprovada ao destinatário e reflete seu estado", () => {
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: DEMO.pedro,
      granted: true,
    });
    const draft = propose(
      helena,
      "create_task",
      {
        ...taskInput(),
        title: "Companhia para a feira",
        assignee_id: DEMO.pedro,
      },
      null,
      id(),
    );
    confirmProposal(helena, { proposal_id: draft.id, confirmed: true });
    confirmProposal(helena, { proposal_id: draft.id, confirmed: true });
    const task = pendingTasks(pedro)[0];
    expect(pendingTasks(pedro)).toHaveLength(1);
    expect(snapshot(pedro).checkin_report).toMatchObject({
      situation: "Pedido compartilhado com você",
      context: null,
      nextStep: {
        title: "Companhia para a feira",
        status: "pending",
        responsible: "Pedro",
      },
      source: { simulated: true },
    });
    expect(snapshot(ana).checkin_report?.nextStep).toBeNull();
    updateTask(pedro, { task_id: task.id, changes: { status: "accepted" } });
    expect(snapshot(pedro).checkin_report?.nextStep?.status).toBe("accepted");
    updateTask(pedro, { task_id: task.id, changes: { status: "completed" } });
    expect(snapshot(pedro).checkin_report?.nextStep?.status).toBe("completed");
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: DEMO.pedro,
      granted: false,
    });
    expect(snapshot(pedro).checkin_report).toBeNull();
  });

  it("mantém o relato sem verificação e não associa tarefa de outra ocorrência", () => {
    createTask(helena, taskInput());
    routine();
    executeDue(at("16:00"));
    const rr = one("SELECT id FROM routine_runs")!;
    const draft = propose(
      helena,
      "confirm_routine_response",
      {
        routine_run_id: rr.id,
        response: "Prefiro conversar amanhã.",
      },
      null,
      id(),
    );
    confirmProposal(helena, { proposal_id: draft.id, confirmed: true });
    expect(snapshot(ana).checkin_report).toMatchObject({
      situation: "Relato compartilhado pela pessoa acompanhada",
      context: "Conversa",
      observation: "Helena informou: Prefiro conversar amanhã.",
      verification: expect.stringContaining("não foi verificado"),
      nextStep: null,
    });
  });

  it("não confunde ausência de resposta com relato, saúde ou tarefa", () => {
    createTask(helena, taskInput());
    routine();
    executeDue(at("16:00"));
    executeDue(at("16:11"));
    expect(snapshot(ana).checkin_report).toMatchObject({
      situation: "Convite sem resposta",
      observation: null,
      verification: expect.stringContaining("não informa o estado de saúde"),
      nextStep: null,
    });
  });
});
describe("Autorização, privacidade e ferramentas", () => {
  it("identidade vem de cookie opaco persistido e expira", () => {
    const token = createDemoSession(DEMO.ana);
    const req = new Request("http://localhost/api/snapshot", {
      headers: { cookie: `carecircle_session=${token}` },
    });
    expect(actorFromRequest(req).id).toBe(DEMO.ana);
    run(
      "UPDATE app_sessions SET expires_at=? WHERE token_hash=?",
      "2000-01-01",
      hash(token),
    );
    expect(() => actorFromRequest(req)).toThrow();
  });
  it("isola outra família mesmo quando o modelo fornece o ID", () => {
    const other: Actor = {
      id: id(),
      family_id: id(),
      display_name: "Outra pessoa",
      role: "relative",
    };
    expect(() => visibleEvents(other, DEMO.profile)).toThrow();
    expect(() =>
      executeTool(other, "get_daily_summary", {
        care_profile_id: DEMO.profile,
      }),
    ).toThrow();
  });
  it("oculta eventos para Pedro sem consentimento direcionado", () => {
    expect(visibleEvents(pedro)).toEqual([]);
    expect(summary(pedro).answer).toContain("Não há registros autorizados");
  });
  it("consentimento só pode ser concedido pela pessoa titular", () => {
    expect(() =>
      changeConsent(ana, {
        scope: "family_updates",
        recipient_id: DEMO.ana,
        granted: true,
      }),
    ).toThrow();
  });
  it("impede tarefa sem consentimento e sem identidade da Helena", () => {
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: DEMO.ana,
      granted: false,
    });
    expect(() => createTask(helena, taskInput())).toThrow();
    expect(() => createTask(ana, taskInput())).toThrow();
  });
  it("ferramenta do modelo só cria proposta sem efeitos de compartilhamento", () => {
    const result = executeTool(helena, "create_task", taskInput(), null) as {
      requires_confirmation: boolean;
    };
    expect(result.requires_confirmation).toBe(true);
    expect(rows("SELECT * FROM tasks")).toHaveLength(0);
    expect(rows("SELECT * FROM notifications")).toHaveLength(0);
  });
  it("rejeita proposta sem criar tarefa ou notificação", () => {
    const p = propose(helena, "create_task", taskInput(), null, id());
    confirmProposal(helena, { proposal_id: p.id, confirmed: false });
    expect(rows("SELECT * FROM tasks")).toHaveLength(0);
  });
  it("cria tarefa e notificação uma única vez após confirmação explícita", () => {
    const p = propose(helena, "create_task", taskInput(), null, id());
    confirmProposal(helena, { proposal_id: p.id, confirmed: true });
    confirmProposal(helena, { proposal_id: p.id, confirmed: true });
    expect(pendingTasks(ana)).toHaveLength(1);
    expect(snapshot(ana).notifications).toHaveLength(1);
    expect(rows("SELECT * FROM task_items")).toHaveLength(3);
  });
  it("não permite confirmar proposta de outra pessoa", () => {
    const p = propose(helena, "create_task", taskInput(), null, id());
    expect(() =>
      confirmProposal(ana, { proposal_id: p.id, confirmed: true }),
    ).toThrow();
  });
  it("corrige itens mantendo tarefa existente e aceita como Ana", () => {
    const t = createTask(helena, taskInput());
    updateTask(ana, { task_id: t.id, changes: { status: "accepted" } });
    updateTask(helena, {
      task_id: t.id,
      changes: {
        items: [
          { label: "leite" },
          { label: "pão" },
          { label: "café" },
          { label: "açúcar" },
        ],
      },
    });
    expect(rows("SELECT * FROM tasks")).toHaveLength(1);
    expect(pendingTasks(ana)[0].items).toHaveLength(4);
    expect(pendingTasks(ana)[0].status).toBe("accepted");
  });
  it("impede Pedro de aceitar tarefa da Ana e familiar de adulterar itens", () => {
    const t = createTask(helena, taskInput());
    expect(() =>
      updateTask(pedro, { task_id: t.id, changes: { status: "accepted" } }),
    ).toThrow();
    expect(() =>
      updateTask(ana, {
        task_id: t.id,
        changes: { items: [{ label: "outro" }] },
      }),
    ).toThrow();
  });
  it("conclusão exige aceite e estado final impede mutação", () => {
    const t = createTask(helena, taskInput());
    expect(() =>
      updateTask(ana, { task_id: t.id, changes: { status: "completed" } }),
    ).toThrow();
    updateTask(ana, { task_id: t.id, changes: { status: "accepted" } });
    updateTask(ana, { task_id: t.id, changes: { status: "completed" } });
    expect(() =>
      updateTask(helena, { task_id: t.id, changes: { title: "outro" } }),
    ).toThrow();
  });
  it("revogação oculta eventos, tarefas e notificações do destinatário", () => {
    createTask(helena, taskInput());
    changeConsent(helena, {
      scope: "family_updates",
      recipient_id: DEMO.ana,
      granted: false,
    });
    expect(snapshot(ana).events).toEqual([]);
    expect(snapshot(ana).tasks).toEqual([]);
    expect(snapshot(ana).notifications).toEqual([]);
  });
  it("resumo cita fonte, horário, status e fixture", () => {
    const s = summary(ana);
    expect(s.answer).toContain("12:08");
    expect(s.answer).toContain("Relatado");
    expect(s.answer).toContain("SIMULAÇÃO");
    expect(s.sources).toHaveLength(1);
    expect(s.answer).not.toContain("adequadamente");
  });
  it("responde sem dados sem fabricar fatos", () => {
    run("DELETE FROM care_events");
    expect(summary(ana).sources).toEqual([]);
    expect(summary(ana).answer).toContain("Não há registros autorizados");
  });
  it("confirma relato de rotina uma única vez sem armazenar transcrição integral", () => {
    routine();
    executeDue(at("16:00"));
    const rr = one("SELECT id FROM routine_runs")!;
    confirmRoutine(helena, {
      routine_run_id: rr.id,
      response: "Gostaria de ajuda nas compras.",
    });
    confirmRoutine(helena, {
      routine_run_id: rr.id,
      response: "Gostaria de ajuda nas compras.",
    });
    expect(
      rows(
        "SELECT * FROM care_events WHERE routine_run_id=? AND event_type='checkin'",
        rr.id,
      ),
    ).toHaveLength(1);
    expect(one("SELECT status FROM routine_runs")?.status).toBe("answered");
  });
});
describe("Voz: falhas honestas e liberação de recursos", () => {
  it("não finge sucesso sem credenciais Agora", async () => {
    const saved = process.env.NEXT_AGORA_APP_CERTIFICATE;
    delete process.env.NEXT_AGORA_APP_CERTIFICATE;
    await expect(startVoice(helena)).rejects.toThrow("Voz real indisponível");
    expect(rows("SELECT * FROM voice_sessions")).toHaveLength(0);
    if (saved) process.env.NEXT_AGORA_APP_CERTIFICATE = saved;
  });
  it("rejeita callback sem token e sessão expirada", () => {
    expect(() => voiceActor(id(), null)).toThrow();
  });
  it("encerra apenas sessão da própria identidade", async () => {
    await expect(stopVoice(ana, id())).rejects.toThrow("não autorizada");
  });
  it("cleanup libera microfone mesmo se logout falha e é idempotente", async () => {
    const calls: string[] = [];
    const cleanup = makeCleanup({
      closeMicrophone: () => {
        calls.push("mic");
      },
      destroyToolkit: () => {
        calls.push("toolkit");
      },
      leaveRtc: async () => {
        calls.push("rtc");
      },
      logoutRtm: async () => {
        calls.push("rtm");
        throw new Error("offline");
      },
      stopAgent: async () => {
        calls.push("agent");
      },
    });
    expect(await cleanup()).toEqual(["logoutRtm"]);
    await cleanup();
    expect(calls).toEqual(["mic", "toolkit", "rtc", "rtm", "agent"]);
  });
});
