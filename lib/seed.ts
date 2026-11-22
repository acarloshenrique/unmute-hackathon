import { id, now, one, run, transaction, audit } from "./db";
import { writeChart } from "./chart";
import { requireDemo, type Actor } from "./auth";
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
  if (one("SELECT id FROM families WHERE id=?", DEMO.family)) {
    seedFamilyChart();
    return;
  }
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
    seedFamilyChart();
    audit(DEMO.ana, "demo_seed", "families", DEMO.family, { simulated: true });
  });
}
function seedFamilyChart() {
  transaction(() => {
    if (one("SELECT 1 FROM family_charts WHERE profile_id=?", DEMO.profile))
      return;
    const ana = one<Actor>("SELECT * FROM members WHERE id=?", DEMO.ana)!;
    const yesterday = DateTime.now()
      .setZone(ZONE)
      .minus({ days: 1 })
      .startOf("day");
    const tomorrow = yesterday.plus({ days: 2 });
    const format = (hour: number) =>
      tomorrow.set({ hour }).toFormat("yyyy-MM-dd'T'HH:mm");
    run(
      "INSERT OR IGNORE INTO record_access VALUES(?,?)",
      DEMO.profile,
      DEMO.ana,
    );
    const at = yesterday.toUTC().toISO()!;
    writeChart(
      ana,
      {
        requestId: id(),
        action: "profile",
        revision: 0,
        allergies: "Sem informação registrada",
        conditions: "",
        preferences:
          "Prefere instruções por escrito e companhia nas consultas.",
        reference: "Ana · filha",
        source: "Conversa fictícia com Helena",
      },
      at,
    );
    writeChart(
      ana,
      {
        requestId: id(),
        action: "plan",
        previous: null,
        stage: "Combinado com a pessoa",
        goal: "Quero voltar a escolher as frutas na feira de sábado.",
        next_step:
          "Combinar o horário e o ponto de encontro para a próxima ida à feira.",
        helper: "Ana acompanha Helena",
        review_on: tomorrow.plus({ days: 7 }).toISODate(),
      },
      at,
    );
    writeChart(
      ana,
      {
        requestId: id(),
        action: "observation",
        topic: "Apoio a quem cuida",
        account:
          "Ana pediu ajuda para dividir o acompanhamento nas próximas consultas.",
        source: "Familiar ou cuidador",
        observed_on: yesterday.toISODate(),
      },
      at,
    );
    writeChart(
      ana,
      {
        requestId: id(),
        action: "medicine",
        name: "Medicamento demonstrativo A",
        unit: "comprimido(s)",
        stock: 5,
        dose: "1 comprimido",
        quantity: 1,
        times: ["08:00", "20:00"],
        source: "Receita fictícia de demonstração",
      },
      at,
    );
    writeChart(
      ana,
      {
        requestId: id(),
        action: "visit",
        kind: "Exame",
        title: "Exame de acompanhamento",
        location: "Clínica do Círculo · fictícia",
        scheduled: format(10),
        reminder: format(8),
        source: "Guia fictícia da clínica",
        steps: [
          {
            instruction: "Separar a guia e o documento de identificação.",
            due: format(7),
          },
        ],
      },
      at,
    );
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
      "caregiver_preferences",
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
