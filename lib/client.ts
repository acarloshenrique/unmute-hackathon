import type { CaregiverProfile } from "./caregivers";
import type { FamilyCheckinReport } from "./checkin-report";
export type Item = { label: string; quantity?: string | null };
export type CareEvent = {
  id: string;
  summary: string;
  evidence_type: string;
  event_time: string;
  simulated: number;
  event_type: string;
};
export type Task = {
  id: string;
  title: string;
  status: string;
  assigned_to: string;
  updated_at: string;
  items: Item[];
};
export type Routine = {
  id: string;
  title: string;
  prompt: string;
  next_run_at: string;
  enabled: number;
  cancelled_at: string | null;
  schedule_expression: string;
};
export type Proposal = {
  id: string;
  kind: string;
  payload: {
    title?: string;
    items?: Item[];
    assignee_id?: string;
    response?: string;
    _realtime?: { revision: number; time: string | null; saturday: string };
    changes?: { title?: string; items?: Item[] };
  };
};
export type Data = {
  actor: { id: string; display_name: string; role: string };
  profile: { id: string; display_name: string };
  caregiver: CaregiverProfile;
  can_choose_caregiver: boolean;
  can_manage_chart: boolean;
  chart_readers: string[];
  events: CareEvent[];
  checkin_report: FamilyCheckinReport | null;
  tasks: Task[];
  routines: Routine[];
  runs: {
    id: string;
    status: string;
    scheduled_at: string;
    routine_id: string;
  }[];
  members: { id: string; display_name: string; role: string }[];
  consents: { id: string; scope: string; recipient_id: string | null }[];
  notifications: {
    id: string;
    message: string;
    status: string;
    read_at: string | null;
    type: string;
    created_at: string;
  }[];
  proposals: Proposal[];
  sessions: { id: string; status: string; started_at: string }[];
  audit: { id: string; action: string; timestamp: string }[];
  demo: boolean;
  demo_clock: string;
  agora_configured: boolean;
  openai_configured: boolean;
};
export type CopilotResult = {
  answer: string;
  sources: { id: string; event_time: string; status: string }[];
  mode: string;
  notice?: string;
  requires_confirmation?: boolean;
  routine?: {
    title: string;
    prompt: string;
    local_datetime: string;
    repeat: string;
  };
};
export const statusLabel: Record<string, string> = {
  confirmed: "Confirmado",
  reported: "Relatado",
  unanswered: "Sem resposta",
  pending: "Pendente",
  completed: "Concluído",
  accepted: "Aceita",
  cancelled: "Cancelada",
  invited: "Convite enviado",
  answered: "Respondido",
  failed: "Falhou",
  active: "Servidor iniciado",
  disconnected: "Encerrada",
  error: "Falha",
  starting: "Iniciando",
  stop_failed: "Encerramento pendente",
};
export function displayTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function localInput(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(" ", "T");
}
export async function api<T>(path: string, input?: unknown): Promise<T> {
  const response = await fetch(
    path,
    input === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.message || "Não foi possível concluir.");
  return value;
}
