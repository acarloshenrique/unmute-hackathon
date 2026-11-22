import { describe, expect, it } from "vitest";
import { voiceFailure, agentUiState } from "../lib/voice-feedback";
describe("mensagens seguras da voz", () => {
  it("identifica falta de saldo sem reproduzir dados privados do provedor", () => {
    const result = voiceFailure(
      {
        message:
          "credit_balance_exhausted; Authorization=fixture-secret; fala privada",
      },
      "agent",
    );
    expect(result).toContain("falta de saldo");
    expect(result).not.toContain("fixture-secret");
    expect(result).not.toContain("fala privada");
    expect(voiceFailure({ code: "insufficient_quota" }, "agent")).toContain(
      "cota",
    );
  });
  it("distingue permissão negada, dispositivo ausente e captura bloqueada", () => {
    expect(
      voiceFailure(new DOMException("", "NotAllowedError"), "microphone"),
    ).toContain("não foi autorizado");
    expect(voiceFailure({ code: "DEVICE_NOT_FOUND" }, "microphone")).toContain(
      "Nenhum microfone",
    );
    expect(
      voiceFailure(new DOMException("", "NotReadableError"), "microphone"),
    ).toContain("abrir o microfone");
  });
  it("distingue falha RTM de publicação e não exibe erro arbitrário", () => {
    expect(voiceFailure({ message: "Bearer fixture-secret" }, "rtm")).toContain(
      "Agora RTM",
    );
    expect(
      voiceFailure({ message: "Bearer fixture-secret" }, "publish"),
    ).toContain("publicar o microfone");
    expect(
      voiceFailure({ message: "Bearer fixture-secret" }, "agent"),
    ).not.toContain("fixture-secret");
    expect(voiceFailure(null, "rtc")).toContain("Agora RTC");
  });
});

it("idle e silent do agente mantêm a conexão ativa e os controles de encerramento", () => {
  expect(agentUiState("idle")).toBe("connected");
  expect(agentUiState("silent")).toBe("connected");
});
it("somente eventos conhecidos mudam o estado sem inventar escuta ou fala", () => {
  expect(agentUiState("speaking")).toBe("speaking");
  expect(agentUiState("thinking")).toBe("thinking");
  expect(agentUiState("listening")).toBe("listening");
  expect(agentUiState("unknown")).toBeUndefined();
});
