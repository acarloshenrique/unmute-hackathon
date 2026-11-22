import type { Actor } from "./auth";
import { readChart } from "./chart";
import { calendarDay, quantityLabel, stockDays } from "./chart-model";
import { formatTime } from "./time";

export const chartTopics = [
  "estoque",
  "tomadas",
  "agenda",
  "plano",
  "cotidiano",
] as const;
export function chartTopic(
  q: string,
): (typeof chartTopics)[number] | undefined {
  const text = q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    /quem cuida|cuidador.*apoio|apoio.*cuidador|relatos? do cotidiano/.test(
      text,
    )
  )
    return "cotidiano";
  if (/objetivo|meta familiar|plano familiar|plano de cuidado/.test(text))
    return "plano";
  if (/estoque|repor|reposicao|restam|acabando/.test(text)) return "estoque";
  if (
    /remedio|medicamento|tomou|tomada|medicacao|dosagem|comprimido/.test(text)
  )
    return "tomadas";
  if (/exame|consulta medica|proxima consulta|procedimento|preparo/.test(text))
    return "agenda";
}
export function chartAnswer(actor: Actor, topic: (typeof chartTopics)[number]) {
  const data = readChart(actor);
  if (topic === "plano") {
    const plan = data.plan;
    return {
      answer: plan
        ? [
            plan.stage,
            plan.goal,
            "Próximo passo: " + plan.next_step,
            "Apoio: " + plan.helper,
            "Revisão: " + calendarDay(plan.review_on),
          ].join(" · ")
        : "Ainda não há objetivo registrado no plano familiar.",
      sources: plan
        ? [
            {
              id: plan.version_id,
              event_time: plan.at,
              status: "Plano registrado por " + plan.author,
            },
          ]
        : [],
    };
  }
  if (topic === "cotidiano")
    return {
      answer:
        data.observations.map((o) => o.detail).join("\n") ||
        "Ainda não há relatos do cotidiano.",
      sources: data.observations.map((e) => ({
        id: e.request_id,
        event_time: e.at,
        status: "Relato registrado por " + e.author,
      })),
    };
  const lines =
    topic === "estoque"
      ? data.medications.map(
          (m) =>
            `${m.name} · ${quantityLabel(m.stock)} ${m.unit} no saldo registrado. ${m.stock < 0 ? "Conferir contagem." : `Cobertura estimada: ${stockDays(m)} dia(s) completos pela prescrição vigente.`}`,
        )
      : topic === "tomadas"
        ? data.doses.map(
            (d) =>
              `${formatTime(d.scheduled_at)} · ${d.name}: ${d.status === "taken" ? "tomada relatada" : d.status === "skipped" ? "não tomou, segundo relato" : d.scheduled_at > data.asOf ? "prevista" : "sem registro"}.`,
          )
        : data.visits.map(
            (v) =>
              `${v.kind} · ${v.title} · ${formatTime(v.scheduled_at)}, ${v.location}. Lembrete: ${formatTime(v.reminder_at)}. ${v.steps.map((s) => `${s.instruction} (${s.completed_at ? "concluído" : "previsto para " + formatTime(s.due_at)})`).join(" ")} Fonte: ${v.source}.`,
          );
  const kinds =
    topic === "agenda"
      ? ["visit", "prep", "visit_status"]
      : ["medicine", "revision", "stop", "stock", "intake"];
  return {
    answer:
      lines.join("\n") ||
      "Nenhum registro para esta consulta no prontuário familiar.",
    sources: data.history
      .filter((h) => kinds.includes(h.kind))
      .slice(0, 10)
      .map((h) => ({
        id: h.request_id,
        event_time: h.at,
        status: "Registro familiar",
      })),
  };
}
