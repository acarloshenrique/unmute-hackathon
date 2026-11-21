import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
const base = "http://127.0.0.1:3000";
const database = () =>
  new DatabaseSync(
    resolve(process.env.CARECIRCLE_DB_PATH || ".agent-local/carecircle.sqlite"),
  );
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function authorizePedro(page: Page) {
  const changed = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/actions/change_consent") &&
      r.request().method() === "POST",
  );
  const checkbox = page.getByLabel(
    "Permitir compartilhar pedidos e relatos revisados com Pedro",
  );
  await checkbox.click();
  expect((await changed).ok()).toBe(true);
  await expect(checkbox).toBeChecked();
}
async function login(context: BrowserContext, persona: string) {
  expect(
    (
      await context.request.post(`${base}/api/demo`, {
        data: { action: "login", persona },
      })
    ).ok(),
  ).toBe(true);
}
async function reset(request: APIRequestContext) {
  await request.post(`${base}/api/demo`, {
    data: { action: "login", persona: "helena" },
  });
  expect(
    (
      await request.post(`${base}/api/demo`, { data: { action: "reset" } })
    ).ok(),
  ).toBe(true);
}
function simulatedSession(actor: string, profile: string) {
  const db = database(),
    session = randomUUID(),
    token = `fixture-tool-${randomUUID()}`;
  db.prepare("INSERT INTO voice_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
    session,
    profile,
    actor,
    `fixture-${session}`,
    new Date().toISOString(),
    null,
    "active",
    null,
    9000,
    hash(token),
    new Date(Date.now() + 900000).toISOString(),
    null,
  );
  db.close();
  return { session, token };
}
function closeFixture(session: string) {
  const db = database();
  db.prepare(
    "UPDATE voice_sessions SET status='disconnected',ended_at=?,capability_hash=NULL WHERE id=?",
  ).run(new Date().toISOString(), session);
  db.close();
}
async function invoke(
  request: APIRequestContext,
  fixture: { session: string; token: string },
  input: unknown,
) {
  return request.post(
    `${base}/api/voice/tools/${fixture.session}/prepare-request`,
    { headers: { Authorization: `Bearer ${fixture.token}` }, data: input },
  );
}

test("ferramenta HTTP com sessão fictícia: revisão, clique antigo, cartão único e aceite persistido (sem áudio)", async ({
  browser,
  request,
}) => {
  await reset(request);
  const helena = await browser.newContext(),
    pedro = await browser.newContext();
  let fixture: { session: string; token: string } | undefined;
  try {
    await login(helena, "helena");
    await login(pedro, "pedro");
    const h = await helena.newPage(),
      p = await pedro.newPage();
    await h.goto(`${base}/idoso`);
    await authorizePedro(h);
    const snapshot = await (
      await helena.request.get(`${base}/api/snapshot`)
    ).json();
    fixture = simulatedSession(snapshot.actor.id, snapshot.profile.id);
    const endpoint = `${base}/api/voice/tools/${fixture.session}/prepare-request`;
    expect(
      (
        await helena.request.post(endpoint, {
          data: {
            recipient_name: "Pedro",
            time: null,
            expected_revision: 0,
            tool_call_id: "c0",
          },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await invoke(helena.request, fixture, {
          recipient_name: "Pedro",
          time: null,
          expected_revision: 0,
          tool_call_id: "c0",
          family_id: snapshot.profile.id,
        })
      ).status(),
    ).toBe(400);
    const first = await invoke(helena.request, fixture, {
      recipient_name: "Pedro",
      time: null,
      expected_revision: 0,
      tool_call_id: "c1",
    });
    expect(first.ok()).toBe(true);
    const draft = await first.json();
    await expect(
      h.getByRole("button", { name: "Confirmar e compartilhar" }),
    ).toBeVisible();
    const corrected = await invoke(helena.request, fixture, {
      recipient_name: "Pedro",
      time: "10:00",
      expected_revision: 1,
      tool_call_id: "c2",
    });
    expect(corrected.ok()).toBe(true);
    const latest = await corrected.json();
    expect(latest.proposal_id).toBe(draft.proposal_id);
    await expect(h.locator(".proposal")).toContainText("10:00");
    await expect(h.locator(".proposal")).not.toContainText(
      "horário a combinar",
    );
    await p.goto(`${base}/familia/tarefas`);
    expect(
      (await (await pedro.request.get(`${base}/api/snapshot`)).json()).tasks,
    ).toHaveLength(0);
    await expect(p.getByRole("button", { name: "Posso ajudar" })).toHaveCount(
      0,
    );
    expect(
      (
        await helena.request.post(`${base}/api/actions/confirm_proposal`, {
          data: {
            proposal_id: draft.proposal_id,
            revision: 1,
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await (await pedro.request.get(`${base}/api/snapshot`)).json()).tasks,
    ).toHaveLength(0);
    await h
      .getByRole("button", { name: "Confirmar e compartilhar" })
      .dblclick();
    await expect(
      h.getByRole("button", { name: "Confirmar e compartilhar" }),
    ).toHaveCount(0);
    const duplicate = await helena.request.post(
      `${base}/api/actions/confirm_proposal`,
      {
        data: { proposal_id: draft.proposal_id, revision: 2, confirmed: true },
      },
    );
    expect(duplicate.ok()).toBe(true);
    await expect(p.getByRole("button", { name: "Posso ajudar" })).toHaveCount(
      1,
    );
    await expect(p.locator(".task")).toContainText("10:00");
    await p.getByRole("button", { name: "Posso ajudar" }).click();
    await p.reload();
    await expect(p.getByText("Aceita", { exact: true })).toBeVisible();
    const saved = await (
      await pedro.request.get(`${base}/api/snapshot`)
    ).json();
    expect(saved.tasks).toHaveLength(1);
    expect(saved.tasks[0].status).toBe("accepted");
    expect(
      saved.notifications.filter((n: { type: string }) => n.type === "task"),
    ).toHaveLength(1);
    expect(
      (
        await helena.request.post(`${base}/api/voice/llm/${fixture.session}`, {
          data: { messages: [] },
        })
      ).status(),
    ).toBe(410);
  } finally {
    if (fixture) closeFixture(fixture.session);
    await helena.close();
    await pedro.close();
  }
});
test("cancelar o rascunho na tela não compartilha cartão (sessão fictícia, sem áudio)", async ({
  browser,
  request,
}) => {
  await reset(request);
  const helena = await browser.newContext(),
    pedro = await browser.newContext();
  let fixture: { session: string; token: string } | undefined;
  try {
    await login(helena, "helena");
    await login(pedro, "pedro");
    const h = await helena.newPage();
    await h.goto(`${base}/idoso`);
    await authorizePedro(h);
    const data = await (
      await helena.request.get(`${base}/api/snapshot`)
    ).json();
    fixture = simulatedSession(data.actor.id, data.profile.id);
    expect(
      (
        await invoke(helena.request, fixture, {
          recipient_name: "Pedro",
          time: "10:00",
          expected_revision: 0,
          tool_call_id: "cancel1",
        })
      ).ok(),
    ).toBe(true);
    await h
      .getByRole("button", { name: "Não compartilhar", exact: true })
      .click();
    await expect(
      h.getByRole("button", { name: "Confirmar e compartilhar" }),
    ).toHaveCount(0);
    await invoke(helena.request, fixture, {
      recipient_name: "Pedro",
      time: "10:00",
      expected_revision: 0,
      tool_call_id: "cancel1",
    });
    expect(
      (await (await pedro.request.get(`${base}/api/snapshot`)).json()).tasks,
    ).toHaveLength(0);
    expect(
      (await (await pedro.request.get(`${base}/api/snapshot`)).json())
        .notifications,
    ).toHaveLength(0);
  } finally {
    if (fixture) closeFixture(fixture.session);
    await helena.close();
    await pedro.close();
  }
});
