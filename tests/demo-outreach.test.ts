import { afterEach, describe, expect, it, vi } from "vitest";
import { demoPhone, demoScenarios } from "@/lib/demo-scenarios";
import { POST } from "@/app/api/outreach/route";

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
  it.each(demoScenarios)(
    "encaminha a ligação com a fala de $title",
    async (scenario) => {
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
  it("envia texto e áudio pelos canais distintos e preserva o envio livre do painel", async () => {
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
  it("não confirma envio rejeitado ou sem configuração", async () => {
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
          request({ kind: "call", to: "+12025550143", scenario: "remedio" }),
        )
      ).status,
    ).toBe(502);
  });
});
