import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: vi
          .fn()
          .mockRejectedValue({ status: 429, code: "credit_balance_exhausted" }),
      },
    };
  },
}));
import { closeDb, id, one, run } from "../lib/db";
import { DEMO, seedDemo } from "../lib/seed";
import { type Actor, checkOrigin, demoLocal } from "../lib/auth";
import { copilot, recordAnswer } from "../lib/intelligence";
const dir = mkdtempSync(join(tmpdir(), "carecircle-ai-"));
let ana: Actor;
beforeEach(() => {
  closeDb();
  process.env.CARECIRCLE_DB_PATH = join(dir, `${id()}.sqlite`);
  process.env.CARECIRCLE_DEMO = "true";
  seedDemo();
  ana = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.ana)!;
});
afterAll(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});
it("consulta direta distingue tarefas e eventos", () => {
  expect(
    recordAnswer(ana, "Tem alguma solicitação pendente?").answer,
  ).toContain("Não há tarefas");
  expect(recordAnswer(ana, "Como foi o dia?").answer).toContain("12:08");
});
it("queda da IA preserva fatos e identifica modo sem IA", async () => {
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-not-a-real-key";
  const result = await copilot(ana, "Como foi o dia?");
  expect(result.mode).toBe("records");
  expect("notice" in result && result.notice).toContain("IA indisponível");
  expect(result.answer).toContain("SIMULAÇÃO");
  expect(result.sources).toHaveLength(1);
  if (saved) process.env.OPENAI_API_KEY = saved;
  else delete process.env.OPENAI_API_KEY;
});
it("sem registros não fabrica resposta mesmo com provedor indisponível", async () => {
  run("DELETE FROM care_events");
  const result = recordAnswer(ana, "Como foi o dia?");
  expect(result.answer).toContain("Não há registros");
  expect(result.sources).toEqual([]);
});
it("requisições localhost reescritas pelo Next aceitam o Host real e rejeitam origem externa", () => {
  expect(() =>
    checkOrigin(
      new Request("http://localhost:3000/api/demo", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  ).not.toThrow();
  expect(() =>
    checkOrigin(
      new Request("http://localhost:3000/api/demo", {
        headers: { host: "127.0.0.1:3000", origin: "https://externo.example" },
      }),
    ),
  ).toThrow();
  expect(() =>
    demoLocal(
      new Request("http://localhost:3000/api/demo", {
        headers: { host: "hostile.example" },
      }),
    ),
  ).toThrow();
});
it("agendamento por texto indisponível não fabrica confirmação de rotina", () => {
  expect(
    recordAnswer(ana, "Às 16h, pergunte se precisa de algo").answer,
  ).toContain("formulário");
  expect(
    recordAnswer(ana, "Às 16h, pergunte se precisa de algo").sources,
  ).toEqual([]);
});
