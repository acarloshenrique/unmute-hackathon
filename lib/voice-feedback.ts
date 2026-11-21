// Inspect provider errors transiently; expose only fixed, safe messages.
export type VoiceStage =
  "microphone" | "agent" | "rtm" | "rtc" | "toolkit" | "publish";
export function voiceFailure(error: unknown, stage: VoiceStage): string {
  const value =
    error && typeof error === "object"
      ? (error as { name?: unknown; code?: unknown; message?: unknown })
      : {};
  const signature = [value.name, value.code, value.message]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
  if (/credit_balance_exhausted|insufficient_quota/.test(signature))
    return "A voz gerenciada foi recusada por falta de saldo ou cota. Confira o faturamento e os serviços habilitados no projeto Agora. O microfone foi desligado.";
  if (/notallowederror|permission_denied|permission denied/.test(signature))
    return "O microfone não foi autorizado. Libere o acesso nas configurações deste navegador e tente novamente.";
  if (/notfounderror|device_not_found/.test(signature))
    return "Nenhum microfone foi encontrado. Conecte um dispositivo de entrada e tente novamente.";
  if (/notreadableerror|track_start_error/.test(signature))
    return "Não foi possível abrir o microfone. Confira o dispositivo de entrada e se outro aplicativo está usando-o.";
  const messages: Record<VoiceStage, string> = {
    microphone:
      "Não foi possível iniciar o microfone. Confira a permissão e o dispositivo de entrada do navegador.",
    agent:
      "O agente de voz gerenciado falhou. Confira o saldo, as credenciais e a habilitação Conversational AI e dos modelos gerenciados no projeto Agora. A criação do agente não confirma uma conversa com áudio.",
    rtm: "A conexão de mensagens Agora RTM falhou. Confira a habilitação de RTM e tente novamente. O microfone foi desligado.",
    rtc: "A conexão de áudio Agora RTC falhou. Confira a rede e a configuração Agora e tente novamente.",
    toolkit:
      "Não foi possível iniciar os eventos da conversa. Recarregue esta página e tente novamente.",
    publish:
      "Não foi possível publicar o microfone na Agora. Encerre e tente novamente.",
  };
  return messages[stage];
}
