PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), auth_user_id TEXT UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('elder','relative')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_profiles(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), display_name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo', elder_member_id TEXT NOT NULL REFERENCES members(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS consents(id TEXT PRIMARY KEY, care_profile_id TEXT NOT NULL REFERENCES care_profiles(id), granted_by TEXT NOT NULL REFERENCES members(id), scope TEXT NOT NULL CHECK(scope IN ('checkins','family_updates')), recipient_id TEXT REFERENCES members(id), granted_at TEXT NOT NULL, revoked_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS consent_active ON consents(care_profile_id,scope,COALESCE(recipient_id,'')) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY, care_profile_id TEXT NOT NULL REFERENCES care_profiles(id), created_by TEXT NOT NULL REFERENCES members(id), title TEXT NOT NULL, prompt TEXT NOT NULL, schedule_expression TEXT NOT NULL, timezone TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, next_run_at TEXT NOT NULL, cancelled_at TEXT, idempotency_key TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS routine_runs(id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES routines(id), scheduled_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, status TEXT NOT NULL CHECK(status IN ('invited','answered','unanswered','failed','cancelled')), idempotency_key TEXT NOT NULL UNIQUE, error_message TEXT, attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT, UNIQUE(routine_id,scheduled_at));
CREATE TABLE IF NOT EXISTS voice_sessions(id TEXT PRIMARY KEY, care_profile_id TEXT NOT NULL REFERENCES care_profiles(id), actor_id TEXT NOT NULL REFERENCES members(id), agora_channel_id TEXT NOT NULL UNIQUE, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL, agent_id TEXT, uid INTEGER NOT NULL, capability_hash TEXT, expires_at TEXT NOT NULL, routine_run_id TEXT REFERENCES routine_runs(id));
CREATE TABLE IF NOT EXISTS care_events(id TEXT PRIMARY KEY, care_profile_id TEXT NOT NULL REFERENCES care_profiles(id), routine_run_id TEXT REFERENCES routine_runs(id), event_type TEXT NOT NULL, summary TEXT NOT NULL, evidence_type TEXT NOT NULL CHECK(evidence_type IN ('confirmed','reported','unanswered','pending','completed')), event_time TEXT NOT NULL, source_session_id TEXT REFERENCES voice_sessions(id), visibility_scope TEXT NOT NULL CHECK(visibility_scope IN ('private','family')), recipient_id TEXT REFERENCES members(id), created_at TEXT NOT NULL, simulated INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, care_profile_id TEXT NOT NULL REFERENCES care_profiles(id), title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','accepted','completed','cancelled')), assigned_to TEXT NOT NULL REFERENCES members(id), created_by TEXT NOT NULL REFERENCES members(id), scheduled_for TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, source_session_id TEXT REFERENCES voice_sessions(id));
CREATE TABLE IF NOT EXISTS task_items(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, label TEXT NOT NULL, quantity TEXT);
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES members(id), event_id TEXT REFERENCES care_events(id), task_id TEXT REFERENCES tasks(id), type TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'delivered', created_at TEXT NOT NULL, read_at TEXT);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY, actor_id TEXT REFERENCES members(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, timestamp TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS app_sessions(token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES members(id), care_profile_id TEXT NOT NULL REFERENCES care_profiles(id), kind TEXT NOT NULL CHECK(kind IN ('create_task','update_task','confirm_routine_response')), payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, source_session_id TEXT REFERENCES voice_sessions(id), idempotency_key TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS demo_state(id TEXT PRIMARY KEY CHECK(id='clock'), value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS routine_due ON routines(enabled,next_run_at);
CREATE INDEX IF NOT EXISTS event_profile_time ON care_events(care_profile_id,event_time);
CREATE INDEX IF NOT EXISTS task_profile_status ON tasks(care_profile_id,status);
CREATE INDEX IF NOT EXISTS notification_recipient ON notifications(recipient_id,created_at);
CREATE INDEX IF NOT EXISTS voice_expiry ON voice_sessions(status,expires_at);
CREATE INDEX IF NOT EXISTS audit_time ON audit_logs(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_voice ON voice_sessions(actor_id) WHERE status IN ('starting','active','stop_failed');

-- Preferência por pessoa; estilos fixos, sem alterar timbre ou consentimentos.
CREATE TABLE IF NOT EXISTS caregiver_preferences(
  care_profile_id TEXT PRIMARY KEY REFERENCES care_profiles(id) ON DELETE CASCADE,
  caregiver_id TEXT NOT NULL CHECK(caregiver_id IN ('lia','clara','rosa')),
  updated_by TEXT NOT NULL REFERENCES members(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fasting_calls(
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  sid TEXT UNIQUE, started INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('waiting','yes','no','unsure','unanswered'))
);

CREATE TABLE IF NOT EXISTS record_access (
  profile_id TEXT NOT NULL REFERENCES care_profiles ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members,
  PRIMARY KEY(profile_id, member_id)
);
CREATE TABLE IF NOT EXISTS family_charts (
  profile_id TEXT PRIMARY KEY REFERENCES care_profiles ON DELETE CASCADE,
  allergies TEXT NOT NULL, conditions TEXT NOT NULL, preferences TEXT NOT NULL,
  reference TEXT NOT NULL, source TEXT NOT NULL, revision INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chart_medicines (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES care_profiles ON DELETE CASCADE,
  name TEXT NOT NULL, unit TEXT NOT NULL, stock REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS chart_medicine_profile ON chart_medicines(profile_id);
CREATE TABLE IF NOT EXISTS chart_regimens (
  id TEXT PRIMARY KEY, medicine_id TEXT NOT NULL REFERENCES chart_medicines ON DELETE CASCADE,
  dose TEXT NOT NULL, quantity REAL NOT NULL, times TEXT NOT NULL, source TEXT NOT NULL,
  starts_at TEXT NOT NULL, ends_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS chart_current_regimen ON chart_regimens(medicine_id) WHERE ends_at IS NULL;
CREATE TABLE IF NOT EXISTS chart_intakes (
  regimen_id TEXT NOT NULL REFERENCES chart_regimens ON DELETE CASCADE, scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('taken','skipped')), reporter TEXT NOT NULL,
  recorded_at TEXT NOT NULL, version_id TEXT NOT NULL, PRIMARY KEY(regimen_id, scheduled_at)
);
CREATE TABLE IF NOT EXISTS chart_visits (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES care_profiles ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, scheduled_at TEXT NOT NULL, location TEXT NOT NULL,
  reminder_at TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled'
);
CREATE INDEX IF NOT EXISTS chart_visit_profile ON chart_visits(profile_id, scheduled_at);
CREATE TABLE IF NOT EXISTS chart_prep (
  id TEXT PRIMARY KEY, visit_id TEXT NOT NULL REFERENCES chart_visits ON DELETE CASCADE,
  instruction TEXT NOT NULL, due_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS chart_history (
  request_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES care_profiles ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES members, kind TEXT NOT NULL, at TEXT NOT NULL,
  detail TEXT NOT NULL, fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chart_history_profile ON chart_history(profile_id, at);

CREATE TABLE IF NOT EXISTS chart_family_plans (
  profile_id TEXT PRIMARY KEY REFERENCES care_profiles ON DELETE CASCADE,
  goal TEXT NOT NULL, next_step TEXT NOT NULL, helper TEXT NOT NULL,
  review_on TEXT NOT NULL, stage TEXT NOT NULL, version_id TEXT NOT NULL
);
