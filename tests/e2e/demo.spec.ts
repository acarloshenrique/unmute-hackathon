import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("API protege identidade e origem", async ({ request }) => {
  const missing = await request.get("/api/snapshot");
  expect(missing.status()).toBe(401);
  const csrf = await request.post("/api/demo", {
    headers: { Origin: "https://outro.example" },
    data: { action: "login", persona: "ana" },
  });
  expect(csrf.status()).toBe(403);
});
test("jornada persistida: agenda → convite → consentimento → tarefa → aceite", async ({
  page,
}) => {
  const login = await page.request.post("/api/demo", {
    data: { action: "login", persona: "ana" },
  });
  expect(login.ok()).toBe(true);
  const reset = await page.request.post("/api/demo", {
    data: { action: "reset" },
  });
  expect(reset.ok()).toBe(true);
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Ana Acompanhar e organizar" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Uma história de cuidado, ao vivo." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Agendar conversa", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Conversa de compras • teste");
  await page
    .getByRole("button", { name: "Confirmar agendamento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Avançar 2 minutos" }).click();
  await page.getByRole("button", { name: "Disparar agora · teste" }).click();
  await expect(
    page.getByText("Convite enviado", { exact: true }),
  ).toBeVisible();
  const first = await page.request.get("/api/snapshot");
  const firstData = await first.json();
  expect(
    firstData.runs.filter((r: { status: string }) => r.status === "invited"),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Disparar agora · teste" }).click();
  const again = await (await page.request.get("/api/snapshot")).json();
  expect(again.runs).toHaveLength(firstData.runs.length);
  await page
    .getByRole("button", { name: "Helena fictícia", exact: true })
    .click();
  await page.getByRole("link", { name: "Abrir conversa com Lia" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, dona Helena." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conversar", exact: true }),
  ).toBeVisible();
  // This journey never starts audio, whether credentials exist or not.
  await expect(
    page.getByText("Microfone desligado", { exact: true }),
  ).toBeVisible();
  await page.getByText("Prefiro escrever meu pedido", { exact: true }).click();
  await page
    .getByLabel("Itens, separados por vírgula")
    .fill("leite, pão, café");
  await page
    .getByRole("button", { name: "Revisar antes de compartilhar" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Podemos compartilhar?" }),
  ).toBeVisible();
  const before = await (await page.request.get("/api/snapshot")).json();
  expect(before.tasks).toHaveLength(0);
  await page.getByRole("button", { name: "Confirmar e compartilhar" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar e compartilhar" }),
  ).not.toBeVisible();
  await expect(
    page.getByText("leite · pão · café", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sala de demonstração" }).click();
  await page.getByRole("button", { name: "Ana fictícia", exact: true }).click();
  await page.getByRole("link", { name: "Abrir painel da família" }).click();
  await expect(
    page.getByRole("heading", { name: "Um olhar para o seu círculo." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Posso ajudar" }).click();
  await expect(page.getByText("Aceita", { exact: true })).toBeVisible();
  const report = page.getByRole("region", { name: "Resumo de acompanhamento" });
  await expect(report).toContainText("Pedido compartilhado com você");
  await expect(report).toContainText("Status: Aceita");
  await expect(report).toContainText("SIMULAÇÃO");
  await expect(report).toContainText("nem altera o plano de acompanhamento");
  await page.reload();
  await expect(report).toContainText("Status: Aceita");
  const saved = await (await page.request.get("/api/snapshot")).json();
  expect(saved.tasks).toHaveLength(1);
  expect(saved.tasks[0].status).toBe("accepted");
  expect(saved.tasks[0].items).toHaveLength(3);
  expect(
    saved.notifications.some((n: { type: string }) => n.type === "task"),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Como foi o dia da minha mãe?", exact: true })
    .click();
  await expect(page.locator(".copilot-answer")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".copilot-answer")).toContainText("SIMULAÇÃO");
  await expect(page.locator(".copilot-answer")).toContainText("12:08");
  mkdirSync(".agent-local/screenshots", { recursive: true });
  await page.screenshot({
    path: ".agent-local/screenshots/familia-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Um olhar para o seu círculo." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".agent-local/screenshots/familia-mobile.png",
    fullPage: true,
  });
});
