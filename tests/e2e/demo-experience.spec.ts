import { expect, test } from "@playwright/test";

test("visitante escolhe exemplo e canal, informa telefone e entra no painel de Ana", async ({
  page,
}) => {
  const requests: Record<string, string>[] = [];
  await page.route("**/api/outreach", async (route) => {
    const data = route.request().postDataJSON();
    requests.push(data);
    if (requests.length === 1)
      return route.fulfill({ status: 401, json: { error: "UNAUTHENTICATED" } });
    await route.fulfill({ json: { ok: true, channel: data.kind } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(
    page.getByRole("group", { name: "Escolha um cenário" }).getByRole("radio"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("radio", { name: "Ligação", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Receber ligação da Lia" }).click();
  await expect(
    page
      .getByRole("region", { name: "Experimente no seu celular" })
      .getByRole("alert"),
  ).toContainText("Confira o DDD");
  expect(requests).toHaveLength(0);
  await page.getByText("Lembrete de remédio", { exact: true }).click();
  await page.getByLabel("Seu telefone com DDD").fill("(11) 98765-4321");
  await page.getByRole("button", { name: "Receber ligação da Lia" }).click();
  await expect(page.getByRole("status")).toContainText("Ligação solicitada");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({
    kind: "call",
    scenario: "remedio",
    to: "+5511987654321",
  });
  await expect(
    page.getByRole("button", { name: "Receber ligação da Lia" }),
  ).toBeDisabled();
  await page.getByText("Áudio", { exact: true }).click();
  await page.getByText("Conversa sobre o almoço", { exact: true }).click();
  await page.getByRole("button", { name: "Receber áudio no WhatsApp" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Envio de áudio solicitado",
  );
  expect(requests[2].scenario).toBe("almoco");
  expect(requests[2].kind).toBe("whatsapp");
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

test("texto no WhatsApp respeita configuração e exibe falha sem confirmar envio", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/outreach", (route) => {
    attempts++;
    expect(route.request().postDataJSON().kind).toBe("text");
    return route.fulfill({
      status: 502,
      json: { message: "O WhatsApp não confirmou o pedido de envio do texto." },
    });
  });
  await page.goto("/demo");
  await page.getByText("Texto", { exact: true }).click();
  await page.getByLabel("Seu telefone com DDD").fill("+1 202 555 0143");
  const submit = page.getByRole("button", {
    name: "Receber texto no WhatsApp",
  });
  if (await submit.isDisabled()) {
    await expect(page.getByRole("status")).toContainText("aguarda a conexão");
    expect(attempts).toBe(0);
  } else {
    await submit.click();
    await expect(
      page
        .getByRole("region", { name: "Experimente no seu celular" })
        .getByRole("alert"),
    ).toContainText("não confirmou");
    expect(attempts).toBe(1);
  }
});
