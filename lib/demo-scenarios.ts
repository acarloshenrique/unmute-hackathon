import { fasting } from "./fasting-script";
export const demoScenarios = [
  {
    id: "feira",
    title: "Companhia para a feira",
    description: "Combine com Pedro a ida de Helena à feira de sábado.",
    message:
      "Vamos imaginar que é sábado. Você é a Helena e quer ir à feira com o Pedro. Que horário seria bom para vocês?",
  },
  {
    id: "remedio",
    title: "Café, remédio e jejum",
    description:
      "Helena pergunta sobre café em jejum. Lia consulta a filha Ana e volta com a resposta.",
    message: fasting.ask,
  },
  {
    id: "consulta",
    title: "Companhia na consulta",
    description: "Converse sobre quem pode acompanhar Helena.",
    message:
      "Imagine que a Helena tem uma consulta na sexta de manhã. Quem você gostaria de convidar para ir junto?",
  },
  {
    id: "almoco",
    title: "Conversa sobre o almoço",
    description: "Conte à Lia como foi o almoço e o que quer compartilhar.",
    message:
      "Imagine que estamos conversando depois do almoço da Helena. Como foi o seu almoço hoje? Se quiser, pode me contar.",
  },
] as const;

export type DemoScenarioId = (typeof demoScenarios)[number]["id"];

export function demoPhone(raw: string): string | null {
  const entry = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(entry)) return null;
  const digits = entry.replace(/\D/g, "");
  const international = entry.startsWith("+")
    ? digits
    : /^\d{10,11}$/.test(digits)
      ? "55" + digits
      : digits;
  if (!/^[1-9]\d{7,14}$/.test(international)) return null;
  if (!entry.startsWith("+") && !international.startsWith("55")) return null;
  if (
    international.startsWith("55") &&
    !/^55[1-9]\d[2-9]\d{7,8}$/.test(international)
  )
    return null;
  return "+" + international;
}

export const demoPhoneDraftKey = "carecircle-demo-phone-draft";
