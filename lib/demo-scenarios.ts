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

// Nas ligações o cenário vai no mission (prompt) + saudação natural da Lia.
// A `message` acima é roteiro para quem encena no app — nunca deve ser falada.
export const phoneScenarios: Record<
  DemoScenarioId,
  { greeting: string; mission: string }
> = {
  feira: {
    greeting:
      "Oi! Aqui é a Lia, do círculo de cuidado. A Ana me contou que você quer ir à feira sábado com o Pedro — que horário fica bom pra vocês?",
    mission:
      "Objetivo: combinar a ida à feira de sábado com a companhia do Pedro. Descubra o horário que a pessoa prefere, repita para confirmar (ex.: 'então fechamos nove da manhã?'), aceite correções no meio e repita a versão nova se perguntarem o que você entendeu. Feche dizendo que vai avisar a Ana no aplicativo. Uma pergunta por vez, frases curtas.",
  },
  remedio: {
    greeting:
      "Oi! Aqui é a Lia, do círculo de cuidado. Você tem exame amanhã em jejum, né? Me conta o que você quer saber que eu anoto pra Ana.",
    mission:
      "A pessoa vai perguntar se pode tomar café de manhã estando em jejum para exame. Você NUNCA decide nada clínico: anote a dúvida, diga que vai confirmar com a Ana e que retorna com a resposta. Se ela só responder sim, não ou não sei, conduza com gentileza. Uma pergunta por vez.",
  },
  consulta: {
    greeting:
      "Oi! Aqui é a Lia, do círculo de cuidado. A Ana me falou da sua consulta de sexta de manhã — quer que eu veja quem pode ir junto com você?",
    mission:
      "Objetivo: descobrir quem acompanha a pessoa na consulta de sexta de manhã. Pergunte quem ela prefere (Ana, Pedro ou outra pessoa), confirme a escolha repetindo, e feche dizendo que avisa a Ana no aplicativo. Uma pergunta por vez, frases curtas.",
  },
  almoco: {
    greeting:
      "Oi! Aqui é a Lia, do círculo de cuidado, ligando pra saber como foi o seu almoço hoje. Me conta?",
    mission:
      "Conversa leve sobre o almoço: escute com interesse, um tema por vez. Se a pessoa quiser compartilhar algo com a família, ofereça repassar o recado pra Ana. Sem pressa, frases curtas.",
  },
};

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
