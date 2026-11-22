export const planStages = [
  "A conversar com a pessoa",
  "Combinado com a pessoa",
  "Concluído com a pessoa",
] as const;
export type FamilyPlan = {
  goal: string;
  next_step: string;
  helper: string;
  review_on: string;
  stage: (typeof planStages)[number];
  version_id: string;
  at: string;
  author: string;
};
export const everydayTopics = [
  "Memória e atenção",
  "Mobilidade",
  "Vitalidade e alimentação",
  "Visão",
  "Audição",
  "Bem-estar emocional",
  "Convívio e apoio social",
  "Apoio a quem cuida",
  "Continência urinária",
] as const;
export const observationSources = [
  "Pessoa acompanhada",
  "Familiar ou cuidador",
  "Equipe de cuidado",
] as const;
export function calendarDay(day: string) {
  return day.split("-").reverse().join("/");
}
export type ChartProfile = {
  allergies: string;
  conditions: string;
  preferences: string;
  reference: string;
  source: string;
  revision: number;
};
export type Medicine = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  regimen_id: string;
  dose: string;
  quantity: number;
  times: string;
  source: string;
  starts_at: string;
};
export type Intake = {
  regimen_id: string;
  name: string;
  dose: string;
  scheduled_at: string;
  status: "taken" | "skipped" | null;
  reporter: string | null;
  version_id: string | null;
};
export type Prep = {
  id: string;
  instruction: string;
  due_at: string;
  completed_at: string | null;
};
export type Visit = {
  id: string;
  kind: string;
  title: string;
  scheduled_at: string;
  location: string;
  reminder_at: string;
  source: string;
  status: "scheduled" | "done" | "cancelled";
  steps: Prep[];
};
export type ChartEvent = {
  request_id: string;
  at: string;
  kind: string;
  detail: string;
  author: string;
};
export type ChartData = {
  profile: ChartProfile | null;
  plan: FamilyPlan | null;
  observations: ChartEvent[];
  medications: Medicine[];
  doses: Intake[];
  visits: Visit[];
  history: ChartEvent[];
  day: string;
  today: string;
  asOf: string;
};
export const stockDays = (m: Medicine) =>
  Math.max(
    0,
    Math.floor(
      Math.round(m.stock * 100) /
        (Math.round(m.quantity * 100) * m.times.split(",").length),
    ),
  );
export const quantityLabel = (q: number) =>
  q.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const visitTypes = ["Consulta", "Exame", "Procedimento"] as const;
export const historyLabels: Record<string, string> = {
  profile: "Ficha",
  plan: "Plano familiar",
  observation: "Relato do cotidiano",
  medicine: "Medicamento",
  revision: "Prescrição",
  stop: "Prescrição",
  stock: "Estoque",
  intake: "Tomada",
  visit: "Agenda",
  prep: "Preparo",
  visit_status: "Agenda",
  note: "Anotação",
};
