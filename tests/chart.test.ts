import { beforeEach, afterEach, afterAll, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, id, one } from "../lib/db";
import { DEMO, seedDemo, resetDemo } from "../lib/seed";
import type { Actor } from "../lib/auth";
import { readChart, writeChart, setChartAccess } from "../lib/chart";
import { chartAnswer } from "../lib/chart-answer";
import { visitCalendar } from "../lib/chart-calendar";
import { stockDays } from "../lib/chart-model";
const dir = mkdtempSync(join(tmpdir(), "chart-test-"));
let ana: Actor, helena: Actor, pedro: Actor;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-22T14:00:00Z"));
  process.env.CARECIRCLE_DB_PATH = join(dir, id() + ".sqlite");
  process.env.CARECIRCLE_DEMO = "true";
  seedDemo();
  [ana, helena, pedro] = [DEMO.ana, DEMO.helena, DEMO.pedro].map((v) =>
    one<Actor>("SELECT * FROM members WHERE id=?", v)!,
  );
});
afterEach(() => {
  closeDb();
  vi.useRealTimers();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const save = (v: Record<string, unknown>) =>
  writeChart(ana, { requestId: id(), ...v });
it("exige autorização específica, revogável, inclusive no copiloto e nas mutações", () => {
  expect(() => readChart(pedro)).toThrow(/autorização/);
  expect(() =>
    setChartAccess(ana, { memberId: DEMO.pedro, granted: true }),
  ).toThrow(/Somente/);
  setChartAccess(helena, { memberId: DEMO.pedro, granted: true });
  expect(readChart(pedro).medications.length).toBe(1);
  setChartAccess(helena, { memberId: DEMO.ana, granted: false });
  seedDemo();
  expect(() => readChart(ana)).toThrow(/autorização/);
  expect(() => save({ action: "note", note: "teste" })).toThrow(/autorização/);
  expect(() => chartAnswer(ana, "estoque")).toThrow(/autorização/);
});
it("baixa e corrige o estoque uma só vez, mesmo após retry ou registro concorrente", () => {
  const d = readChart(ana).doses[0];
  const initial = readChart(ana).medications[0].stock;
  const report = {
    requestId: id(),
    action: "intake",
    scheduledAt: d.scheduled_at,
    regimenId: d.regimen_id,
    status: "taken",
    reporter: "Observação do familiar",
  };
  save(report);
  save(report);
  expect(readChart(ana).medications[0].stock).toBe(initial - 1);
  expect(() => save({ ...report, requestId: id() })).toThrow(/já mudou/);
  expect(() => save({ ...report, status: "skipped" })).toThrow(/processado/);
  save({
    ...report,
    requestId: id(),
    previousRecord: report.requestId,
    status: "skipped",
  });
  expect(readChart(ana).medications[0].stock).toBe(initial);
  expect(
    readChart(ana).history.filter((h) => h.kind === "intake"),
  ).toHaveLength(2);
  expect(chartAnswer(ana, "tomadas").answer).toContain(
    "não tomou, segundo relato",
  );
});
it("versões mantêm as doses anteriores e atualizam somente os próximos horários", () => {
  const m = readChart(ana).medications[0];
  const change = {
    action: "revision",
    regimenId: m.regimen_id,
    dose: "Dose B",
    quantity: 0.5,
    times: ["08:00", "18:00"],
    source: "Orientação fictícia B",
  };
  save(change);
  expect(() => save(change)).toThrow(/prescrição já mudou/);
  const chart = readChart(ana);
  expect(chart.doses.map((d) => d.dose)).toEqual(["1 comprimido", "Dose B"]);
  const med = chart.medications[0];
  expect(
    stockDays({
      ...med,
      stock: 0.6,
      quantity: 0.1,
      times: "08:00,12:00,18:00",
    }),
  ).toBe(2);
  const restock = {
    action: "stock",
    medicineId: med.id,
    amount: 2.5,
    requestId: id(),
  };
  save(restock);
  save(restock);
  expect(readChart(ana).medications[0].stock).toBe(7.5);
  expect(() =>
    save({
      action: "intake",
      regimenId: med.regimen_id,
      scheduledAt: chart.doses[1].scheduled_at,
      status: "taken",
      reporter: "Observação do familiar",
    }),
  ).toThrow(/horário/);
  save({
    action: "stop",
    regimenId: med.regimen_id,
    source: "Documento de encerramento fictício",
  });
  expect(readChart(ana).medications).toHaveLength(0);
  expect(readChart(ana).doses).toHaveLength(1);
  expect(readChart(ana, "2026-11-21").doses).toHaveLength(2);
});
it("agenda, preparo e conclusão são atômicos e têm fonte e autoria", () => {
  const visit = {
    action: "visit",
    kind: "Procedimento",
    title: "Atendimento fictício",
    scheduled: "2026-11-23T11:00",
    reminder: "2026-11-22T10:00",
    source: "Guia de teste",
    location: "Unidade A",
    steps: [{ instruction: "Separar documento", due: "2026-11-22T09:00" }],
  };
  expect(() =>
    save({ ...visit, steps: [{ instruction: "A", due: "2026-11-24T09:00" }] }),
  ).toThrow(/preparo/);
  expect(readChart(ana).visits).toHaveLength(1);
  save(visit);
  const v = readChart(ana).visits.find((v) => v.title === visit.title)!;
  expect(v.reminder_at).toBe("2026-11-22T13:00:00.000Z");
  const step = { action: "prep", stepId: v.steps[0].id, requestId: id() };
  save(step);
  save(step);
  expect(chartAnswer(ana, "agenda").answer).toContain(
    "Separar documento (concluído)",
  );
  expect(() =>
    save({ action: "visit_status", visitId: v.id, status: "done" }),
  ).toThrow(/ainda não/);
  save({ action: "visit_status", visitId: v.id, status: "cancelled" });
  expect(readChart(ana).visits.some((i) => i.id === v.id)).toBe(false);
  expect(readChart(ana).history[0].author).toBe("Ana");
});
it("protege a ficha de edição simultânea e reinicia a demonstração sem dados órfãos", () => {
  const profile = readChart(ana).profile!;
  save({
    ...profile,
    action: "profile",
    source: "Nova fonte",
    reference: "Referência fictícia",
  });
  expect(() => save({ ...profile, action: "profile" })).toThrow(/ficha mudou/);
  save({ action: "note", note: "Anotação de teste" });
  resetDemo();
  expect(readChart(ana).history).toHaveLength(5);
  expect(readChart(ana).profile?.revision).toBe(1);
});

it("exporta o atendimento e cada preparo pendente com alarme no fuso correto", () => {
  const v = readChart(ana).visits[0];
  const text = visitCalendar(
    {
      ...v,
      title: "Exame, guia; A",
      steps: [
        { ...v.steps[0], instruction: "Separar\nguia" },
        { ...v.steps[0], id: id(), completed_at: "2026-11-22T11:00:00Z" },
      ],
    },
    new Date().toISOString(),
  );
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(text.match(/BEGIN:VALARM/g)).toHaveLength(2);
  expect(text).toContain("DTSTART:20261123T130000Z");
  expect(text).toContain("TRIGGER;VALUE=DATE-TIME:20261123T110000Z");
  expect(text).toContain("Exame\\, guia\\; A");
  expect(text).toContain("Separar\\nguia");
});

it("versiona o objetivo combinado e preserva os registros quando o familiar perde acesso", () => {
  const prior = readChart(ana).plan!;
  const draft = {
    requestId: id(),
    action: "plan",
    previous: prior.version_id,
    goal: "Visitar a praça",
    next_step: "Escolher um dia",
    helper: "Pedro",
    review_on: "2026-12-02",
    stage: "A conversar com a pessoa",
  };
  save(draft);
  save(draft);
  expect(() => save({ ...draft, requestId: id() })).toThrow(
    /atualizou o plano/,
  );
  const revised = readChart(ana).plan!;
  expect(revised.stage).toBe("A conversar com a pessoa");
  expect(revised.author).toBe("Ana");
  expect(chartAnswer(ana, "plano").answer).toContain("02/12/2026");
  expect(chartAnswer(ana, "plano").sources[0].id).toBe(draft.requestId);
  save({
    ...draft,
    requestId: id(),
    previous: revised.version_id,
    stage: "Combinado com a pessoa",
  });
  expect(readChart(ana).history.filter((e) => e.kind === "plan")).toHaveLength(
    3,
  );
  setChartAccess(helena, { memberId: ana.id, granted: false });
  expect(() => chartAnswer(ana, "plano")).toThrow(/autorização/);
  expect(() => save({ ...draft, requestId: id() })).toThrow(/autorização/);
});
it("registra observação opcional com origem, autoria e data sem interpretar ausência de relato", () => {
  const entry = {
    requestId: id(),
    action: "observation",
    topic: "Audição",
    observed_on: "2026-11-20",
    source: "Pessoa acompanhada",
    account: "Prefiro conversar com a TV desligada.",
  };
  expect(() => save({ ...entry, observed_on: "2026-11-23" })).toThrow(
    /hoje ou anterior/,
  );
  save(entry);
  save(entry);
  const row = readChart(ana).observations[0];
  expect(row.detail).toContain("Audição · 20/11/2026 · Pessoa acompanhada");
  expect(row.author).toBe("Ana");
  expect(chartAnswer(ana, "cotidiano").answer).toContain(entry.account);
  expect(() => chartAnswer(pedro, "cotidiano")).toThrow(/autorização/);
});
