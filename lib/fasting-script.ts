export const fasting = {
  question:
    "Lia, preciso tomar meu remédio, mas estou em jejum para um exame. Posso tomar café?",
  hold: "Helena, entendi sua dúvida. Vou perguntar à sua filha Ana se a equipe do exame já orientou sobre o café. Para o remédio, é preciso conferir a orientação de quem o prescreveu.",
  ask: "Ana, aqui é a Lia, assistente virtual da demonstração CareCircle. Sua mãe, Helena, está em jejum para um exame e quer tomar café. A equipe do exame já confirmou que ela pode tomar café durante esse preparo?",
  options:
    "Diga sim, não ou não sei. Se preferir, tecle um para sim, dois para não ou três para não sei.",
} as const;

export const returns = {
  yes: "Helena, a Ana disse que sim: segundo ela, a equipe do exame já liberou o café para este preparo. Se isso for diferente da orientação que você recebeu, confirme com a equipe. Sobre o remédio, ainda precisamos da orientação de quem o prescreveu.",
  no: "Helena, a Ana respondeu que não: ela não tem confirmação da equipe de que o café está liberado. A dúvida sobre o café e o remédio continua para a equipe responsável.",
  unsure:
    "Helena, a Ana disse que não sabe se a equipe liberou o café. Vamos conferir a orientação do exame e a do remédio com a equipe responsável.",
  unanswered:
    "Helena, não consegui confirmar uma resposta da Ana. A dúvida sobre o café e o remédio continua em aberto. Você pode falar com a equipe responsável pelo preparo.",
} as const;
export type FastingOutcome = keyof typeof returns;
export type FastingState = FastingOutcome | "waiting";
export const answerLabels = {
  yes: "Sim",
  no: "Não",
  unsure: "Não sei",
} as const;

export function readAnswer(
  digits: string,
  speech: string,
): Exclude<FastingOutcome, "unanswered"> | undefined {
  if (digits)
    return ({ "1": "yes", "2": "no", "3": "unsure" } as const)[
      digits as "1" | "2" | "3"
    ];
  const value = speech
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.,!?]+$/, "")
    .trim();
  if (value === "sim") return "yes";
  if (value === "nao") return "no";
  if (["nao sei", "nao tenho certeza"].includes(value)) return "unsure";
}
