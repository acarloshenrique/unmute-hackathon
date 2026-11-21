-- Alvo: Supabase Postgres. Não executado neste ambiente.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS families(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS members(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), family_id UUID NOT NULL REFERENCES families(id), auth_user_id UUID UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('elder','relative')), created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS care_profiles(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), family_id UUID NOT NULL REFERENCES families(id), display_name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo', elder_member_id UUID NOT NULL REFERENCES members(id), created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS consents(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), care_profile_id UUID NOT NULL REFERENCES care_profiles(id), granted_by UUID NOT NULL REFERENCES members(id), scope TEXT NOT NULL CHECK(scope IN ('checkins','family_updates')), recipient_id UUID REFERENCES members(id), granted_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ);
CREATE UNIQUE INDEX IF NOT EXISTS consent_active ON consents(care_profile_id,scope,COALESCE(recipient_id::text,'')) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS routines(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), care_profile_id UUID NOT NULL REFERENCES care_profiles(id), created_by UUID NOT NULL REFERENCES members(id), title TEXT NOT NULL, prompt TEXT NOT NULL, schedule_expression TEXT NOT NULL, timezone TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true, next_run_at TIMESTAMPTZ NOT NULL, cancelled_at TIMESTAMPTZ, idempotency_key TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS routine_runs(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), routine_id UUID NOT NULL REFERENCES routines(id), scheduled_at TIMESTAMPTZ NOT NULL, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, status TEXT NOT NULL CHECK(status IN ('invited','answered','unanswered','failed','cancelled')), idempotency_key TEXT NOT NULL UNIQUE, error_message TEXT, attempts INTEGER NOT NULL DEFAULT 0, retry_at TIMESTAMPTZ, UNIQUE(routine_id,scheduled_at));
CREATE TABLE IF NOT EXISTS voice_sessions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), care_profile_id UUID NOT NULL REFERENCES care_profiles(id), actor_id UUID NOT NULL REFERENCES members(id), agora_channel_id TEXT NOT NULL UNIQUE, started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ, status TEXT NOT NULL, agent_id TEXT, uid INTEGER NOT NULL, capability_hash TEXT, expires_at TIMESTAMPTZ NOT NULL, routine_run_id UUID REFERENCES routine_runs(id));
CREATE TABLE IF NOT EXISTS care_events(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), care_profile_id UUID NOT NULL REFERENCES care_profiles(id), routine_run_id UUID REFERENCES routine_runs(id), event_type TEXT NOT NULL, summary TEXT NOT NULL, evidence_type TEXT NOT NULL CHECK(evidence_type IN ('confirmed','reported','unanswered','pending','completed')), event_time TIMESTAMPTZ NOT NULL, source_session_id UUID REFERENCES voice_sessions(id), visibility_scope TEXT NOT NULL CHECK(visibility_scope IN ('private','family')), recipient_id UUID REFERENCES members(id), created_at TIMESTAMPTZ NOT NULL, simulated BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS tasks(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), care_profile_id UUID NOT NULL REFERENCES care_profiles(id), title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','accepted','completed','cancelled')), assigned_to UUID NOT NULL REFERENCES members(id), created_by UUID NOT NULL REFERENCES members(id), scheduled_for TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, source_session_id UUID REFERENCES voice_sessions(id));
CREATE TABLE IF NOT EXISTS task_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, label TEXT NOT NULL, quantity TEXT);
CREATE TABLE IF NOT EXISTS notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id UUID NOT NULL REFERENCES members(id), event_id UUID REFERENCES care_events(id), task_id UUID REFERENCES tasks(id), type TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'delivered', created_at TIMESTAMPTZ NOT NULL, read_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS audit_logs(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_id UUID REFERENCES members(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL, metadata TEXT NOT NULL DEFAULT '{}');

-- Identidade derivada de Supabase Auth, nunca de parâmetros do cliente.
CREATE OR REPLACE FUNCTION public.cc_member_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT id FROM public.members WHERE auth_user_id=auth.uid() LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.cc_family_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT family_id FROM public.members WHERE auth_user_id=auth.uid() LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.cc_profile_family(p UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT EXISTS(SELECT 1 FROM public.care_profiles WHERE id=p AND family_id=public.cc_family_id()) $$;
CREATE OR REPLACE FUNCTION public.cc_is_elder(p UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT EXISTS(SELECT 1 FROM public.care_profiles WHERE id=p AND elder_member_id=public.cc_member_id() AND family_id=public.cc_family_id()) $$;
CREATE OR REPLACE FUNCTION public.cc_shared_access(p UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT public.cc_profile_family(p) AND (public.cc_is_elder(p) OR EXISTS(SELECT 1 FROM public.consents WHERE care_profile_id=p AND scope='family_updates' AND recipient_id=public.cc_member_id() AND revoked_at IS NULL)) $$;
REVOKE ALL ON FUNCTION public.cc_member_id(),public.cc_family_id(),public.cc_profile_family(UUID),public.cc_is_elder(UUID),public.cc_shared_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_member_id(),public.cc_family_id(),public.cc_profile_family(UUID),public.cc_is_elder(UUID),public.cc_shared_access(UUID) TO authenticated;

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY family_read ON families FOR SELECT TO authenticated USING(id=public.cc_family_id());
CREATE POLICY member_read ON members FOR SELECT TO authenticated USING(family_id=public.cc_family_id());
CREATE POLICY profile_read ON care_profiles FOR SELECT TO authenticated USING(family_id=public.cc_family_id());
CREATE POLICY consent_read ON consents FOR SELECT TO authenticated USING(public.cc_profile_family(care_profile_id) AND (public.cc_is_elder(care_profile_id) OR recipient_id=public.cc_member_id()));
CREATE POLICY routine_read ON routines FOR SELECT TO authenticated USING(public.cc_profile_family(care_profile_id));
CREATE POLICY run_read ON routine_runs FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM routines r WHERE r.id=routine_id AND public.cc_profile_family(r.care_profile_id)));
CREATE POLICY voice_read ON voice_sessions FOR SELECT TO authenticated USING(actor_id=public.cc_member_id() AND public.cc_profile_family(care_profile_id));
CREATE POLICY event_read ON care_events FOR SELECT TO authenticated USING(public.cc_shared_access(care_profile_id) AND (public.cc_is_elder(care_profile_id) OR (visibility_scope='family' AND (recipient_id=public.cc_member_id() OR recipient_id IS NULL))));
CREATE POLICY task_read ON tasks FOR SELECT TO authenticated USING(public.cc_shared_access(care_profile_id) AND (assigned_to=public.cc_member_id() OR public.cc_is_elder(care_profile_id)));
CREATE POLICY item_read ON task_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM tasks t WHERE t.id=task_id));
CREATE POLICY notification_read ON notifications FOR SELECT TO authenticated USING(recipient_id=public.cc_member_id() AND ((event_id IS NULL AND task_id IS NULL) OR EXISTS(SELECT 1 FROM care_events e WHERE e.id=event_id) OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=task_id)));
CREATE POLICY audit_read ON audit_logs FOR SELECT TO authenticated USING(actor_id=public.cc_member_id());
-- Sem políticas INSERT/UPDATE/DELETE para authenticated: mutações só pela API
-- privilegiada, que deve reaplicar as verificações do domínio antes de gravar.
CREATE INDEX event_profile_time ON care_events(care_profile_id,event_time);
CREATE INDEX routine_due ON routines(enabled,next_run_at);
CREATE INDEX task_profile_status ON tasks(care_profile_id,status);
CREATE INDEX notification_recipient ON notifications(recipient_id,created_at);