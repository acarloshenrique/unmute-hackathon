import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoPhone, demoScenarios } from "@/lib/demo-scenarios";
import { POST } from "@/app/api/outreach/route";
import { throttle } from "@/lib/http";

vi.mock("@/lib/auth", async (load) => ({
  ...(await load<typeof import("@/lib/auth")>()),
  actorFromRequest: () => ({ id: "test" }),
}));
vi.mock("@/lib/http", async (load) => ({
  ...(await load<typeof import("@/lib/http")>()),
  throttle: vi.fn(),
}));
vi.mock("node:fs", async (load) => ({
  ...(await load<typeof import("node:fs")>()),
  readFileSync: vi.fn(() => "NAIMA_CALL_KEY=test"),
}));

const request = (data: object) =>
  new Request("http://localhost/api/outreach", {
    method: "POST",
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CARECIRCLE_OUTREACH_ENABLED", "false");
  vi.stubEnv("CARECIRCLE_OUTREACH_TEST_NUMBERS", "");
});

function enableAuthorized() {
  vi.stubEnv("CARECIRCLE_OUTREACH_ENABLED", "true");
  vi.stubEnv(
    "CARECIRCLE_OUTREACH_TEST_NUMBERS",
    "+55 (11) 98765-4321, +1 (202) 555-0143",
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("cenários da demo", () => {
  it("entende DDD brasileiro e DDI explícito e recusa entradas incompletas", () => {
    for (const raw of [
      "(11) 98765-4321",
      "+55 (11) 98765-4321",
      "55 11 98765-4321",
    ])
      expect(demoPhone(raw)).toBe("+5511987654321");
    expect(demoPhone("+1 (202) 555-0143")).toBe("+12025550143");
    for (const raw of [
      "",
      "123",
      "abc11 98765-4321",
      "+55 11 9",
      "1+2025550143",
      "0000000000",
    ])
      expect(demoPhone(raw)).toBeNull();
  });
  it.each(demoScenarios.filter((s) => s.id !== "remedio"))(
    "encaminha a ligação com a fala de $title",
    async (scenario) => {
      enableAuthorized();
      const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
      vi.stubGlobal("fetch", fetch);
      const response = await POST(
        request({ kind: "call", to: "(11) 98765-4321", scenario: scenario.id }),
      );
      expect(await response.json()).toEqual({ ok: true, channel: "call" });
      expect(fetch).toHaveBeenCalledTimes(1);
      const url = new URL(fetch.mock.calls[0][0]);
      expect(url.pathname).toBe("/dial");
      expect(url.searchParams.get("to")).toBe("5511987654321");
      expect(url.searchParams.get("say")).toBe(scenario.message);
    },
  );
  it("envia texto e áudio pelos canais distintos, incluindo o painel com destinatário autorizado", async () => {
    enableAuthorized();
    vi.stubEnv(
      "CARECIRCLE_EVOLUTION_TEXT_URL",
      "http://localhost:8082/message/sendText/test",
    );
    vi.stubEnv("CARECIRCLE_EVOLUTION_API_KEY", "test-key");
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    for (const kind of ["text", "whatsapp"])
      expect(
        (
          await POST(
            request({ kind, to: "+12025550143", scenario: "consulta" }),
          )
        ).ok,
      ).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(
      process.env.CARECIRCLE_EVOLUTION_TEXT_URL,
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      number: "12025550143",
      text: expect.stringContaining(demoScenarios[2].message),
    });
    expect(fetch.mock.calls[1][0]).toMatch(/\/send$/);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
      to: "12025550143",
      text: expect.stringContaining(demoScenarios[2].message),
    });
    expect(
      (
        await POST(
          request({
            kind: "whatsapp",
            to: "+12025550143",
            message: "Mensagem do painel",
          }),
        )
      ).ok,
    ).toBe(true);
    expect(JSON.parse(fetch.mock.calls[2][1].body).text).toBe(
      "Mensagem do painel",
    );
  });
  const allFormats = [
    { kind: "call", scenario: "feira" },
    { kind: "whatsapp", scenario: "feira" },
    { kind: "text", scenario: "feira" },
    { kind: "call", message: "Mensagem do painel" },
    { kind: "whatsapp", message: "Mensagem do painel" },
  ];

  async function expectAllDenied(to: string, status: number, error: string) {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const format of allFormats) {
      const response = await POST(request({ ...format, to }));
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
    expect(throttle).not.toHaveBeenCalled();
  }

  it("sem opt-in não usa nenhuma ponte mesmo com lista válida", async () => {
    enableAuthorized();
    vi.stubEnv("CARECIRCLE_OUTREACH_ENABLED", "false");
    await expectAllDenied("+12025550143", 503, "OUTREACH_DISABLED");
  });

  it.each(["", "+12025550143, inválido"])(
    "com lista ausente ou malformada (%s) nenhum canal funciona",
    async (list) => {
      enableAuthorized();
      vi.stubEnv("CARECIRCLE_OUTREACH_TEST_NUMBERS", list);
      await expectAllDenied("+12025550143", 503, "OUTREACH_DISABLED");
    },
  );

  it("bloqueia qualquer destino fora da lista em todos os canais e no painel", async () => {
    enableAuthorized();
    await expectAllDenied("+12025550144", 403, "OUTREACH_NOT_ALLOWED");
  });

  it("aplica a mesma política ao telefone local no formato legado de ligação", async () => {
    enableAuthorized();
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      request({ kind: "call", to: "(11) 98765-4321", message: "Painel" }),
    );
    expect(response.ok).toBe(true);
    expect(throttle).toHaveBeenCalledWith("test", "demo_outreach");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("to")).toBe(
      "5511987654321",
    );
  });

  it("não confirma envio rejeitado ou sem configuração do canal", async () => {
    enableAuthorized();
    vi.stubEnv("CARECIRCLE_EVOLUTION_TEXT_URL", "");
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ok: false }, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await POST(
          request({ kind: "text", to: "+12025550143", scenario: "feira" }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await POST(
          request({
            kind: "call",
            to: "+12025550143",
            scenario: "desconhecido",
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({ kind: "call", to: "+12025550143", scenario: "almoco" }),
        )
      ).status,
    ).toBe(502);
  });

  it("usa os diferentes destinos digitados somente nos cenários do modo visitante", async () => {
    enableAuthorized();
    vi.stubEnv("CARECIRCLE_VISITOR_CONTACT", "true");
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    for (const to of ["(11) 98888-0101", "(21) 97777-0102"]) {
      const res = await POST(
        request({ kind: "call", to, scenario: "remedio" }),
      );
      expect(res.ok).toBe(true);
      const url = new URL(fetch.mock.calls.at(-1)![0]);
      expect(url.searchParams.get("to")).toBe("55" + to.replace(/\D/g, ""));
      expect(url.searchParams.get("say")).toContain("equipe do exame");
    }
    expect(
      (
        await POST(
          request({ kind: "call", to: "(11) 98888-0101", message: "livre" }),
        )
      ).status,
    ).toBe(403);
  });
});
