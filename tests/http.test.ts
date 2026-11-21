import { expect, it, vi } from "vitest";
import { failure } from "../lib/http";
it("erro interno não expõe credenciais ou fala nos logs e na resposta", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = failure(
      new Error("Authorization: Bearer fixture-secret; fala privada"),
    );
    expect(response.status).toBe(500);
    const output = JSON.stringify(log.mock.calls) + (await response.text());
    expect(log).toHaveBeenCalledOnce();
    expect(output).toContain("request_failed");
    expect(output).not.toContain("fixture-secret");
    expect(output).not.toContain("fala privada");
  } finally {
    log.mockRestore();
  }
});
