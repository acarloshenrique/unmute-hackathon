import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
async function login(context: BrowserContext, persona: string) {
  expect(
    (
      await context.request.post("/api/demo", {
        data: { action: "login", persona },
      })
    ).ok(),
  ).toBe(true);
}
async function reset(request: APIRequestContext) {
  expect(
    (
      await request.post("/api/demo", {
        data: { action: "login", persona: "ana" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await request.post("/api/demo", { data: { action: "reset" } })).ok(),
  ).toBe(true);
}
async function trigger(request: APIRequestContext) {
  const data = await (await request.get("/api/snapshot")).json();
  const local = DateTime.fromISO(data.demo_clock)
    .setZone("America/Sao_Paulo")
    .plus({ minutes: 1 })
    .toFormat("yyyy-MM-dd'T'HH:mm");
  expect(
    (
      await request.post("/api/actions/create_routine", {
        data: {
          title: "Companhia para a feira",
          prompt: "Quer combinar a ida à feira?",
          local_datetime: local,
          repeat: "once",
          idempotency_key: randomUUID(),
        },
      })
    ).ok(),
  ).toBe(true);
  await request.post("/api/demo", { data: { action: "advance", minutes: 2 } });
  const result = await request.post("/api/demo", {
    data: { action: "trigger" },
  });
  expect((await result.json()).runs[0].status).toBe("invited");
}
async function countMicrophoneRequests(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as {
      microphoneCalls: number;
      acceptedBeforeMicrophone: boolean;
      invitationAccepted: boolean;
    };
    state.microphoneCalls = 0;
    state.invitationAccepted = false;
    navigator.mediaDevices.getUserMedia = async () => {
      state.microphoneCalls++;
      state.acceptedBeforeMicrophone = state.invitationAccepted;
      throw new DOMException(
        "Recusa deliberada do teste, sem áudio",
        "NotAllowedError",
      );
    };
  });
}
test("Ana escolhe Rosa, recarrega e Helena só solicita microfone depois de aceitar (sem áudio real)", async ({
  browser,
  request,
}) => {
  await reset(request);
  const ana = await browser.newContext({ baseURL: "http://127.0.0.1:3000" }),
    helena = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    await login(ana, "ana");
    await login(helena, "helena");
    const a = await ana.newPage(),
      h = await helena.newPage();
    await a.goto("/familia");
    await expect(
      a.getByRole("radio", { name: "Lia · Acolhedora", exact: true }),
    ).toBeChecked();
    const saved = a.waitForResponse(
      (r) =>
        r.url().endsWith("/api/actions/select_caregiver") &&
        r.request().method() === "POST",
    );
    await a
      .getByRole("radio", { name: "Rosa · Paciente", exact: true })
      .click();
    expect((await saved).ok()).toBe(true);
    await expect(
      a.getByRole("radio", { name: "Rosa · Paciente", exact: true }),
    ).toBeChecked();
    await a.reload();
    await expect(
      a.getByRole("radio", { name: "Rosa · Paciente", exact: true }),
    ).toBeChecked();
    await expect(
      a.getByText(
        "Os três perfis usam a mesma voz. A diferença é o estilo de fala.",
      ),
    ).toBeVisible();
    const before = await (await ana.request.get("/api/snapshot")).json();
    await trigger(ana.request);
    await countMicrophoneRequests(h);
    // Only the configured flag is overridden. No provider request or audio is faked.
    await h.route("**/api/snapshot", async (route) => {
      const response = await route.fetch();
      const value = await response.json();
      await route.fulfill({
        response,
        json: { ...value, agora_configured: true },
      });
    });
    await h.route("**/api/actions/respond_invitation", async (route) => {
      const response = await route.fetch();
      if (response.ok())
        await h.evaluate(() => {
          (
            window as unknown as { invitationAccepted: boolean }
          ).invitationAccepted = true;
        });
      await route.fulfill({ response });
    });
    let voiceStarts = 0;
    h.on("request", (req) => {
      if (req.url().endsWith("/api/voice/start")) voiceStarts++;
    });
    await h.goto("/idoso");
    await expect(h.getByRole("img", { name: "Rosa, assistente virtual" })).toBeVisible();
    await expect(h.getByText("Microfone desligado", { exact: true })).toBeVisible();
    await expect(h.locator(".voice-invitation")).toContainText(
      "Rosa quer conversar com você",
    );
    await expect(h.getByRole("radio")).toHaveCount(0);
    expect(
      await h.evaluate(
        () =>
          (window as unknown as { microphoneCalls: number }).microphoneCalls,
      ),
    ).toBe(0);
    expect(
      (
        await helena.request.post("/api/actions/select_caregiver", {
          data: { care_profile_id: before.profile.id, caregiver_id: "clara" },
        })
      ).status(),
    ).toBe(403);
    await h.getByRole("button", { name: "Conversar", exact: true }).click();
    await expect(h.locator(".voice-card [role='alert']")).toContainText(
      "microfone não foi autorizado",
    );
    expect(
      await h.evaluate(
        () =>
          (window as unknown as { acceptedBeforeMicrophone: boolean })
            .acceptedBeforeMicrophone,
      ),
    ).toBe(true);
    expect(voiceStarts).toBe(0);
    const after = await (await ana.request.get("/api/snapshot")).json();
    expect(after.tasks).toHaveLength(0);
    expect(after.events).toEqual(before.events);
    expect(after.caregiver.id).toBe("rosa");
  } finally {
    await ana.close();
    await helena.close();
  }
});
test("Agora não não abre microfone nem compartilha resumo ou tarefa", async ({
  browser,
  request,
}) => {
  await reset(request);
  const ana = await browser.newContext({ baseURL: "http://127.0.0.1:3000" }),
    helena = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    await login(ana, "ana");
    await login(helena, "helena");
    const snapshot = await (await ana.request.get("/api/snapshot")).json();
    await ana.request.post("/api/actions/select_caregiver", {
      data: { care_profile_id: snapshot.profile.id, caregiver_id: "rosa" },
    });
    await trigger(ana.request);
    const h = await helena.newPage();
    await countMicrophoneRequests(h);
    await h.goto("/idoso");
    const response = h.waitForResponse((r) =>
      r.url().endsWith("/api/actions/respond_invitation"),
    );
    await h.getByRole("button", { name: "Agora não", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(
      h.getByText("Tudo bem. A conversa fica para outra hora."),
    ).toBeVisible();
    await expect(h.locator(".voice-invitation")).toHaveCount(0);
    expect(
      await h.evaluate(
        () =>
          (window as unknown as { microphoneCalls: number }).microphoneCalls,
      ),
    ).toBe(0);
    const result = await (await ana.request.get("/api/snapshot")).json();
    expect(result.tasks).toHaveLength(0);
    expect(result.events).toEqual(snapshot.events);
    expect(result.runs[0].status).toBe("cancelled");
    expect(
      (await (await helena.request.get("/api/snapshot")).json()).sessions,
    ).toHaveLength(0);
  } finally {
    await ana.close();
    await helena.close();
  }
});
