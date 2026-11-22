import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import twilio from "twilio";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fastingWebhook,
  readFastingCall,
  startFastingCall,
} from "@/lib/fasting-call";
import { closeDb, run, rows } from "@/lib/db";
import { DEMO, seedDemo } from "@/lib/seed";
import { readAnswer } from "@/lib/fasting-script";
const directory = mkdtempSync(join(tmpdir(), "fasting-test-"));
const helena = {
  id: DEMO.helena,
  role: "elder",
  family_id: DEMO.family,
  display_name: "Helena",
} as const;
const origin = "https://example.test",
  sid = "CA" + "1".repeat(32),
  account = "AC" + "2".repeat(32),
  token = "test-secret";
beforeEach(() => {
  vi.stubEnv("CARECIRCLE_DB_PATH", join(directory, randomUUID() + ".sqlite"));
  vi.stubEnv("CARECIRCLE_DEMO", "true");
  vi.stubEnv("CARECIRCLE_OUTREACH_ENABLED", "true");
  vi.stubEnv("CARECIRCLE_OUTREACH_TEST_NUMBERS", "+12025550143");
  vi.stubEnv("CARECIRCLE_CALLBACK_ORIGIN", origin);
  vi.stubEnv("TWILIO_ACCOUNT_SID", account);
  vi.stubEnv("TWILIO_AUTH_TOKEN", token);
  vi.stubEnv("TWILIO_FROM_NUMBER", "+12025550144");
  seedDemo();
});
afterEach(() => {
  closeDb();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function hook(
  id: string,
  event: string,
  fields: Record<string, string>,
  valid = true,
) {
  const url = origin + "/api/jejum/" + id + "/" + event,
    params = { CallSid: sid, AccountSid: account, ...fields };
  const signature = twilio.getExpectedTwilioSignature(token, url, params);
  return fastingWebhook(
    new Request(url, {
      method: "POST",
      headers: { "X-Twilio-Signature": valid ? signature : "invalid" },
      body: new URLSearchParams(params),
    }),
    id,
    event,
  );
}
it("disca somente uma vez e devolve a resposta assinada a Helena", async () => {
  const request = vi
    .spyOn(twilio.Twilio.prototype, "request")
    .mockResolvedValue({ statusCode: 201, body: { sid }, headers: {} });
  const id = randomUUID();
  expect(await startFastingCall(helena, id, "+12025550143")).toEqual({
    state: "waiting",
  });
  expect(await startFastingCall(helena, id, "+12025550143")).toEqual({
    state: "waiting",
  });
  expect(request).toHaveBeenCalledTimes(1);
  const sent = JSON.stringify(request.mock.calls[0]);
  expect(sent).toContain("Gather");
  expect(sent).toContain("Sua mãe, Helena");
  expect(sent).toContain("pt-BR");
  expect(
    (await hook(id, "answer", { SpeechResult: "sim" }, false)).status,
  ).toBe(403);
  expect(readFastingCall(helena, id).state).toBe("waiting");
  expect(
    (await hook(id, "answer", { SpeechResult: "Sim.", Confidence: "0.96" }))
      .status,
  ).toBe(200);
  await hook(id, "status", { CallStatus: "completed" });
  await hook(id, "answer", { Digits: "2" });
  expect(readFastingCall(helena, id).state).toBe("yes");
  expect(
    rows("SELECT recipient_id,message FROM notifications WHERE id=?", id),
  ).toEqual([
    {
      recipient_id: DEMO.helena,
      message: expect.stringContaining("a Ana disse que sim"),
    },
  ]);
  expect(() => readFastingCall({ ...helena, id: DEMO.pedro }, id)).toThrow();
});
it("sai do assunto, repete uma vez e fecha sem inventar uma resposta", async () => {
  const id = randomUUID();
  run(
    "INSERT INTO fasting_calls VALUES(?,?,?,?,'waiting')",
    id,
    helena.id,
    sid,
    Date.now(),
  );
  expect(
    await (
      await hook(id, "answer", { SpeechResult: "Quero ir à feira" })
    ).text(),
  ).toContain("Gather");
  expect(readFastingCall(helena, id).state).toBe("waiting");
  await hook(id, "repeat", { SpeechResult: "sim", Confidence: "0.1" });
  expect(readFastingCall(helena, id).state).toBe("unanswered");
});
it.each([
  ["Não.", "no"],
  ["não sei", "unsure"],
])("distingue a resposta %s", async (speech, expected) => {
  const id = randomUUID();
  run(
    "INSERT INTO fasting_calls VALUES(?,?,?,?,'waiting')",
    id,
    helena.id,
    sid,
    Date.now(),
  );
  await hook(id, "answer", { SpeechResult: speech });
  expect(readFastingCall(helena, id).state).toBe(expected);
});
it("número não autorizado, consentimento revogado e silêncio não disparam nem liberam o café", async () => {
  const request = vi.spyOn(twilio.Twilio.prototype, "request");
  await expect(
    startFastingCall(helena, randomUUID(), "+12025550145"),
  ).rejects.toThrow("autorizado");
  run("UPDATE consents SET revoked_at=?", new Date().toISOString());
  await expect(
    startFastingCall(helena, randomUUID(), "+12025550143"),
  ).rejects.toThrow("autorizar");
  expect(request).not.toHaveBeenCalled();
  expect(readAnswer("", "sim, mas não sei")).toBeUndefined();
  const id = randomUUID();
  run(
    "INSERT INTO fasting_calls VALUES(?,?,?,?,'waiting')",
    id,
    helena.id,
    sid,
    Date.now(),
  );
  await hook(id, "status", { CallStatus: "no-answer" });
  expect(readFastingCall(helena, id).state).toBe("unanswered");
});
