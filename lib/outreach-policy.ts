import { demoPhone } from "./demo-scenarios";

/** Server configuration only. An incomplete or malformed list disables delivery. */
export function allowedOutreachNumbers(): ReadonlySet<string> | null {
  if (process.env.CARECIRCLE_OUTREACH_ENABLED !== "true") return null;
  const entries = (process.env.CARECIRCLE_OUTREACH_TEST_NUMBERS || "")
    .split(",")
    .map((entry) => entry.trim());
  const numbers = new Set<string>();
  for (const entry of entries) {
    const number = entry.startsWith("+") ? demoPhone(entry) : null;
    if (!number) return null;
    numbers.add(number);
  }
  return numbers;
}
