import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
import { executeDue } from "../lib/domain";
import { cleanupExpired } from "../lib/voice";
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
console.log(
  "CareCircle: scheduler iniciado. Relógio real; intervalo de 15 segundos.",
);
async function tick() {
  try {
    const runs = executeDue();
    if (runs.length) console.log(JSON.stringify({ action: "scheduler", runs }));
    await cleanupExpired();
  } catch {
    console.error("scheduler: falha; nova tentativa no próximo ciclo.");
  }
}
await tick();
const timer = setInterval(() => {
  if (stopped) {
    clearInterval(timer);
    process.exit(0);
  }
  void tick();
}, 15000);
