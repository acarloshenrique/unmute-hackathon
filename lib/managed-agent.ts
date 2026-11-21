import {
  Agent,
  AgoraClient,
  Area,
  AresSTT,
  OpenAI,
  MiniMaxTTS,
  type LlmTool,
} from "agora-agents";
export type ManagedVoiceConfig = {
  appId: string;
  appCertificate: string;
  url: string;
};
export const LIA_PROMPT = `Você é Lia, assistente virtual do CareCircle. Fale sempre em português brasileiro, com calma, respeito e frases curtas. Uma pergunta por vez. Você não é humana ou profissional de saúde. Esta demonstração fictícia tem um único cenário: Helena pede que Pedro a acompanhe à feira no sábado. Não ofereça serviços, transporte ou orientações clínicas.
A única ferramenta é prepareRequest. Ela SOMENTE prepara ou revisa um rascunho privado. Não confirma, não envia, não notifica e não cria tarefa final. Não diga que avisou Pedro antes da confirmação visual. Peça que Helena autorize Pedro nos controles de privacidade se a ferramenta recusar o acesso. Nunca interprete silêncio como autorização.
Na primeira chamada, expected_revision=0, recipient_name=Pedro e time=null se Helena não informou horário. Se disser 'às dez da manhã', use time='10:00' e expected_revision igual à revision devolvida pela chamada anterior. Informe apenas detalhes explicitamente ditos. Corrija o MESMO rascunho. Após preparar, diga: 'Preparei o pedido. Confira os detalhes e toque em Confirmar e compartilhar se estiver tudo certo.' Se houver erro de revisão, não diga que mudou; explique que a tela mostra a versão atual. Respeite cancelamento e recusas. Nada de novas tarefas após o rascunho confirmado ou cancelado. Não prometa que Pedro poderá ir.`;
export function createManagedAgent(
  config: ManagedVoiceConfig,
  sessionId: string,
  capability: string,
) {
  const prepare: LlmTool = {
    type: "function",
    function: {
      name: "prepareRequest",
      description:
        "Prepara ou revisa o único rascunho privado: companhia de Pedro para ir à feira no sábado. Retorna revisão para a próxima correção. Helena confirma SOMENTE na tela.",
      parameters: {
        type: "object",
        properties: {
          recipient_name: { type: "string", enum: ["Pedro"] },
          time: {
            type: ["string", "null"],
            pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
            description:
              "Horário explicitamente informado; null quando ainda não informado.",
          },
          expected_revision: {
            type: "integer",
            minimum: 0,
            description:
              "0 na primeira chamada; depois a revision devolvida pela ferramenta.",
          },
        },
        required: ["recipient_name", "time", "expected_revision"],
        additionalProperties: false,
      },
    },
    execution: { mode: "sync" },
    server: {
      method: "POST",
      url: `${config.url.replace(/\/$/, "")}/api/voice/tools/${sessionId}/prepare-request`,
      headers: { Authorization: `Bearer ${capability}` },
      body: {
        recipient_name: "{{args.recipient_name}}",
        time: "{{args.time}}",
        expected_revision: "{{args.expected_revision}}",
        tool_call_id: "{{tool_call_id}}",
      },
      timeout_ms: 5000,
    },
  };
  return (
    new Agent({
      client: new AgoraClient({
        area: Area.US,
        appId: config.appId,
        appCertificate: config.appCertificate,
      }),
      instructions: LIA_PROMPT,
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: "vad",
            vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 },
          },
          end_of_speech: {
            mode: "vad",
            vad_config: { silence_duration_ms: 600 },
          },
        },
      },
      advancedFeatures: { enable_rtm: true, enable_sal: true },
      sal: { sal_mode: "locking" },
      parameters: {
        audio_scenario: "chorus",
        data_channel: "rtm",
        enable_error_message: true,
        enable_metrics: true,
      },
    })
      // Managed pipeline; retain upstream ARES and speaker locking fixes.
      // AgentSession infers the supported Agora-managed reseller presets.
      .withStt(
        new AresSTT({
          keywords: [
            "Lia",
            "Helena",
            "Ana",
            "Pedro",
            "CareCircle",
            "feira",
            "sábado",
            "companhia",
            "dez da manhã",
          ],
        }),
      )
      .withLlm(
        new OpenAI({
          model: "gpt-4o-mini",
          systemMessages: [{ role: "system", content: LIA_PROMPT }],
          greetingMessage:
            "Olá, dona Helena. Sou Lia, assistente virtual do CareCircle. Como posso ajudar com a ida à feira?",
          failureMessage:
            "Não consegui concluir. Confira o pedido na tela antes de compartilhar.",
          maxHistory: 15,
          maxTokens: 350,
          temperature: 0.6,
          tools: [prepare],
        }),
      )
      .withTts(
        new MiniMaxTTS({
          model: "speech_2_6_turbo",
          voiceId: "Portuguese_Wiselady",
        }),
      )
      .withTools(true)
  );
}
