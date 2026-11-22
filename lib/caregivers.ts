export const CAREGIVER_IDS = ["lia", "clara", "rosa"] as const;
export type CaregiverId = (typeof CAREGIVER_IDS)[number];
export const CAREGIVERS = {
  lia: {
    id: "lia",
    name: "Lia",
    style: "Acolhedora",
    description: "Uma conversa calorosa, com escuta e acolhimento.",
    instructions:
      "Estilo acolhedor: reconheça o que a pessoa diz com empatia discreta. Use frases curtas, tom caloroso e respeitoso, sem infantilizar.",
  },
  clara: {
    id: "clara",
    name: "Clara",
    style: "Direta",
    description: "Perguntas objetivas e respostas breves, com respeito.",
    instructions:
      "Estilo direto: seja objetiva, use frases breves e faça uma pergunta por vez. Evite rodeios, sem ser ríspida, pressionar ou omitir a confirmação de consentimento.",
  },
  rosa: {
    id: "rosa",
    name: "Rosa",
    style: "Paciente",
    description: "Uma pergunta de cada vez, com tempo para responder.",
    instructions:
      "Estilo paciente: ofereça tempo para responder, fale em frases simples e curtas e faça uma pergunta por vez. Aguarde a resposta sem apressar ou completar a fala da pessoa. Se ela pedir, reformule com calma. Silêncio nunca significa autorização. Não infantilize.",
  },
} as const;
export type CaregiverProfile = {
  id: CaregiverId;
  name: string;
  style: string;
  description: string;
};
export function caregiverProfile(id: CaregiverId = "lia"): CaregiverProfile {
  const { name, style, description } = CAREGIVERS[id];
  return { id, name, style, description };
}
export const CAREGIVER_OPTIONS = CAREGIVER_IDS.map(caregiverProfile);
export function invitationMessage(id: CaregiverId, prompt: string) {
  return `${CAREGIVERS[id].name} quer conversar com você. ${prompt}`;
}
