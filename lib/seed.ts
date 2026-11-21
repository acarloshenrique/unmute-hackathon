import { id, now, one, run, transaction, audit } from "./db";
import { requireDemo } from "./auth";
import { DateTime } from "luxon";
import { ZONE } from "./time";
export const DEMO = {
  family: "11111111-1111-4111-8111-111111111111",
  helena: "22222222-2222-4222-8222-222222222222",
  ana: "33333333-3333-4333-8333-333333333333",
  pedro: "44444444-4444-4444-8444-444444444444",
  profile: "55555555-5555-4555-8555-555555555555",
};
export function seedDemo() {
  requireDemo();
  if (one("SELECT id FROM families WHERE id=?", DEMO.family)) return;
  transaction(() => {
    const t = now();
    run(
      "INSERT INTO families VALUES(?,?,?)",
      DEMO.family,
      "Círculo da Helena • fictício",
      t,
    );
    for (const [key, name, role] of [
      ["helena", "Helena", "elder"],
      ["ana", "Ana", "relative"],
      ["pedro", "Pedro", "relative"],
    ] as const)
      run(
        "INSERT INTO members VALUES(?,?,?,?,?,?)",
        DEMO[key],
        DEMO.family,
        null,
        name,
        role,
        t,
      );
    run(
      "INSERT INTO care_profiles VALUES(?,?,?,?,?,?)",
      DEMO.profile,
      DEMO.family,
      "Dona Helena",
      ZONE,
      DEMO.helena,
      t,
    );
    run(
      "INSERT INTO consents VALUES(?,?,?,?,?,?,NULL)",
      id(),
      DEMO.profile,
      DEMO.helena,
      "checkins",
      null,
      t,
    );
    run(
      "INSERT INTO consents VALUES(?,?,?,?,?,?,NULL)",
      id(),
      DEMO.profile,
      DEMO.helena,
      "family_updates",
      DEMO.ana,
      t,
    );
    const fixtureTime = DateTime.now()
      .setZone(ZONE)
      .set({ hour: 12, minute: 8, second: 0, millisecond: 0 })
      .toUTC()
      .toISO()!;
    run(
      "INSERT INTO care_events(id,care_profile_id,event_type,summary,evidence_type,event_time,visibility_scope,recipient_id,created_at,simulated) VALUES(?,?,?,?,?,?,?,?,?,1)",
      id(),
      DEMO.profile,
      "checkin",
      "Helena informou que já havia almoçado.",
      "reported",
      fixtureTime,
      "family",
      DEMO.ana,
      t,
    );
    run(
      "INSERT INTO demo_state VALUES(?,?)",
      "clock",
      DateTime.now()
        .setZone(ZONE)
        .set({ hour: 15, minute: 58, second: 0, millisecond: 0 })
        .toUTC()
        .toISO()!,
    );
    audit(DEMO.ana, "demo_seed", "families", DEMO.family, { simulated: true });
  });
}
export function resetDemo() {
  requireDemo();
  if (
    one(
      "SELECT id FROM voice_sessions WHERE status IN ('starting','active','stop_failed')",
    )
  )
    throw new Error("Encerre as sessões de voz antes de reiniciar.");
  transaction(() => {
    for (const table of [
      "notifications",
      "audit_logs",
      "proposals",
      "task_items",
      "tasks",
      "care_events",
      "voice_sessions",
      "routine_runs",
      "routines",
      "consents",
      "app_sessions",
      "care_profiles",
      "members",
      "families",
      "demo_state",
    ])
      run(`DELETE FROM ${table}`);
  });
  seedDemo();
}
