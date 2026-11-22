import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";

test("Ana acompanha tomadas, corrige estoque e cadastra preparo no prontuário", async ({
  page,
}) => {
  await page.request.post("/api/demo", {
    data: { action: "login", persona: "ana" },
  });
  await page.request.post("/api/demo", { data: { action: "reset" } });
  await page.goto("/familia");
  await page
    .getByRole("button", { name: /Ana Acompanhar e organizar/ })
    .click();
  await page.getByRole("link", { name: "Abrir prontuário" }).click();
  await expect(
    page.getByRole("heading", { name: "Ficha de cuidado" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Medicamentos", exact: true }).click();
  const sp = DateTime.now().setZone("America/Sao_Paulo");
  await page
    .getByLabel("Data das tomadas")
    .fill(sp.minus({ days: 1 }).toISODate()!);
  await expect(
    page.getByRole("button", { name: "Registrar", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Registrar", exact: true })
    .first()
    .click();
  await page.getByLabel("O que foi informado?").selectOption("taken");
  await page
    .getByLabel("Origem da informação")
    .selectOption("Observação do familiar");
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.locator(".stock-box")).toContainText("4 comprimido");
  await page.getByRole("button", { name: "Repor estoque" }).click();
  await page.getByLabel(/Quantidade recebida/).fill("8");
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.locator(".stock-box")).toContainText("12 comprimido");
  await page.getByRole("button", { name: "Alterar prescrição" }).click();
  await page
    .getByLabel("Dose e via conforme a prescrição")
    .fill("Dose fictícia revisada");
  await page
    .getByLabel("Profissional ou documento de origem")
    .fill("Guia fictícia B");
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.locator(".chart-med")).toContainText(
    "Dose fictícia revisada",
  );
  await page
    .getByRole("link", { name: "Agenda e preparo", exact: true })
    .click();
  await page.getByRole("button", { name: "Agendar atendimento" }).click();
  await page.getByLabel("Tipo de atendimento").selectOption("Procedimento");
  await page.getByLabel("Nome do atendimento").fill("Atendimento de teste");
  await page.getByLabel("Local ou serviço").fill("Unidade fictícia");
  await page
    .getByLabel("Data e hora do atendimento")
    .fill(sp.plus({ days: 2 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  await page
    .getByLabel("Lembrar a família em")
    .fill(sp.minus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  await page.getByLabel("Fonte da orientação").fill("Guia de teste");
  await page
    .getByRole("button", { name: "Adicionar etapa de preparo" })
    .click();
  await page.getByLabel("Instrução recebida").fill("Separar a guia");
  await page
    .getByLabel("Horário do preparo")
    .fill(sp.minus({ minutes: 5 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await page.getByRole("link", { name: "Resumo", exact: true }).click();
  await expect(
    page.locator(".chart-reminder").filter({ hasText: "Separar a guia" }),
  ).toBeVisible();
  await page
    .locator(".chart-reminder")
    .filter({ hasText: "Separar a guia" })
    .click();
  const visit = page
    .locator(".chart-visit")
    .filter({ hasText: "Atendimento de teste" });
  const download = page.waitForEvent("download");
  await visit.getByRole("link", { name: /Baixar lembretes/ }).click();
  expect((await download).suggestedFilename()).toBe(
    "lembretes-do-atendimento.ics",
  );
  await visit.getByRole("button", { name: "Concluir etapa" }).click();
  await expect(visit).toContainText("1 de 1 etapas concluídas");
  await page.reload();
  await page.getByRole("link", { name: "Histórico", exact: true }).click();
  await expect(
    page
      .locator(".chart-history-row")
      .filter({ hasText: "preparo confirmado: Separar a guia" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Anotar no histórico" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("familiar registra o objetivo, recebe lembrete de revisão e leva relatos para a conversa", async ({
  page,
}) => {
  await page.request.post("/api/demo", {
    data: { action: "login", persona: "ana" },
  });
  await page.request.post("/api/demo", { data: { action: "reset" } });
  await page.request.post("/api/demo", {
    data: { action: "login", persona: "ana" },
  });
  await page.goto("/familia/prontuario#plano");
  await page.getByRole("button", { name: "Rever objetivo" }).click();
  await page
    .getByLabel("O que é importante para a pessoa?")
    .fill("Quero almoçar com meus netos");
  await page
    .getByLabel("O que foi combinado?")
    .selectOption("A conversar com a pessoa");
  await page
    .getByLabel("Data de revisão")
    .fill(DateTime.now().setZone("America/Sao_Paulo").toISODate()!);
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await page
    .getByRole("button", { name: "Registrar relato", exact: true })
    .click();
  await page
    .getByLabel("Assunto do relato")
    .selectOption("Convívio e apoio social");
  await page.getByLabel("Quem informou?").selectOption("Pessoa acompanhada");
  await page
    .getByLabel("O que aconteceu ou que apoio foi pedido?")
    .fill("Pedi companhia para o almoço de domingo.");
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await page.reload();
  await expect(
    page.locator(".chart-history-row").filter({ hasText: "Pedi companhia" }),
  ).toContainText("Pessoa acompanhada");
  await page.getByRole("link", { name: "Resumo", exact: true }).click();
  await expect(
    page.getByText("Quero almoçar com meus netos", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Rever o objetivo com a pessoa acompanhada/ })
    .click();
  await expect(
    page.getByText("A conversar com a pessoa", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Agenda e preparo", exact: true })
    .click();
  await page.getByText("Resumo para a consulta", { exact: true }).click();
  const resumo = page
    .locator("details")
    .filter({ hasText: "Resumo para a consulta" });
  await expect(resumo).toContainText("Quero almoçar com meus netos");
  await expect(resumo).toContainText("Medicamento demonstrativo A");
  await expect(resumo).toContainText(
    "Pedi companhia para o almoço de domingo.",
  );
});
