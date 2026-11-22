-- Aplicar após postgres.sql. Não executado no ambiente SQLite local.
CREATE TABLE IF NOT EXISTS public.caregiver_preferences(
  care_profile_id UUID PRIMARY KEY REFERENCES public.care_profiles(id) ON DELETE CASCADE,
  caregiver_id TEXT NOT NULL CHECK(caregiver_id IN ('lia','clara','rosa')),
  updated_by UUID NOT NULL REFERENCES public.members(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.caregiver_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY caregiver_preferences_read ON public.caregiver_preferences
  FOR SELECT TO authenticated USING(public.cc_shared_access(care_profile_id));
-- Sem política de escrita de cliente: a mutação exige autorização no servidor.
