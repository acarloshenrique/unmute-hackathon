import { expect, test } from "@playwright/test";

test("visitante simula canais sem telefone ou envio e abre o painel de Ana", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/outreach", (route) => {
    attempts++;
    return route.abort();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(
    page.getByRole("group", { name: "Escolha um cenário" }).getByRole("radio"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("radio", { name: "Ligação", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Seu telefone com DDD")).toHaveCount(0);
  await expect(
    page.getByText("Modo simulação.", { exact: false }),
  ).toBeVisible();

  await page.getByText("Lembrete de remédio", { exact: true }).click();
  await page.getByRole("button", { name: "Simular ligação" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Simulação: Ligação para “Lembrete de remédio”. Nenhum contato foi feito.",
  );
  await page.getByText("Áudio", { exact: true }).click();
  await page.getByText("Conversa sobre o almoço", { exact: true }).click();
  await page.getByRole("button", { name: "Simular áudio" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Simulação: Áudio no WhatsApp para “Conversa sobre o almoço”. Nenhum contato foi feito.",
  );

  await page.getByText("Texto", { exact: true }).click();
  await page.getByRole("button", { name: "Simular texto" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Simulação: Texto no WhatsApp para “Conversa sobre o almoço”. Nenhum contato foi feito.",
  );
  expect(attempts).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Painel da família" }).click();
  await expect(page).toHaveURL(/\/familia$/);
  await expect(
    page.getByRole("heading", { name: "Um olhar para o seu círculo." }),
  ).toBeVisible();
});

test("a API bloqueia, por padrão, envio real até com sessão de demonstração", async ({
  request,
}) => {
  const login = await request.post("/api/demo", {
    data: { action: "login", persona: "ana" },
  });
  expect(login.ok()).toBe(true);
  const response = await request.post("/api/outreach", {
    data: { kind: "call", to: "+12025550143", scenario: "feira" },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({ error: "OUTREACH_DISABLED" });
});
