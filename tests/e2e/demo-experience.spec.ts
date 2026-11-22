import { expect, test } from "@playwright/test";

test("visitante digita telefone e simula os canais sem envio e abre o painel de Ana", async ({
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
  await expect(page.getByLabel("Seu telefone com DDD")).toBeVisible();
  await page.getByLabel("Seu telefone com DDD").fill("(11) 98888-0101");
  await expect(
    page.getByText("Modo simulação.", { exact: false }),
  ).toBeVisible();

  await page.getByText("Companhia na consulta", { exact: true }).click();
  await page.getByRole("button", { name: "Simular ligação" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Simulação: Ligação para “Companhia na consulta”. Nenhum contato foi feito.",
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

test("cenário 2 mantém os papéis e entrega sim, não ou ausência de resposta a Helena", async ({
  page,
}) => {
  let contact = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /api\/(outreach|jejum)/.test(r.url()))
      contact++;
  });
  await page.goto("/demo");
  await page.getByText("Café, remédio e jejum", { exact: true }).click();
  await page.getByLabel("Seu telefone com DDD").fill("(11) 98888-0101");
  await page.getByRole("button", { name: "Abrir cenário de jejum" }).click();
  for (const [choice, expected] of [
    ["Não", "a Ana respondeu que não"],
    ["Sim", "a Ana disse que sim"],
    ["Não sei", "a Ana disse que não sabe"],
    ["Sem resposta", "não consegui confirmar uma resposta"],
  ]) {
    await page
      .getByRole("button", { name: "Usar a pergunta de Helena" })
      .click();
    await expect(
      page.getByLabel("Telefone com DDD para receber como Ana"),
    ).toHaveValue("+5511988880101");
    await page
      .getByRole("button", { name: "Simular ligação para Ana" })
      .click();
    await page.getByRole("button", { name: choice, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: new RegExp(expected) }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Recomeçar o cenário" }).click();
  }
  expect(contact).toBe(0);
});

test("o botão da foto abre a conversa no perfil de Helena e devolve o foco ao fechar", async ({
  page,
}) => {
  await page.goto("/demo");
  const open = page.getByRole("button", { name: "Conversar com a Lia" });
  await open.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Perfil de Helena/)).toBeVisible();
  await expect(
    dialog.getByText("Microfone desligado", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toHaveCount(0);
});
