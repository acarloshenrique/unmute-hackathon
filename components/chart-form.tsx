"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { X, Plus } from "lucide-react";
import { api, displayDate, localInput } from "@/lib/client";
import {
  quantityLabel,
  planStages,
  everydayTopics,
  observationSources,
  type FamilyPlan,
  visitTypes,
  type ChartProfile,
  type Medicine,
  type Intake,
  type Visit,
} from "@/lib/chart-model";

export type Editor =
  | { kind: "profile"; profile: ChartProfile | null }
  | { kind: "plan"; plan: FamilyPlan | null; today: string }
  | { kind: "observation"; today: string }
  | { kind: "note" }
  | { kind: "medicine" }
  | { kind: "visit" }
  | { kind: "revision"; med: Medicine }
  | { kind: "stock"; med: Medicine }
  | { kind: "stop"; med: Medicine }
  | { kind: "intake"; dose: Intake }
  | { kind: "visit_status"; visit: Visit };
const titles: Record<Editor["kind"], string> = {
  profile: "Editar ficha familiar",
  plan: "Registrar objetivo e apoio",
  observation: "Registrar relato do cotidiano",
  note: "Anotar no histórico",
  medicine: "Cadastrar medicamento",
  revision: "Registrar nova prescrição",
  stop: "Encerrar prescrição",
  stock: "Registrar reposição",
  intake: "Registrar tomada",
  visit: "Agendar atendimento",
  visit_status: "Atualizar atendimento",
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="chart-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ChartForm({
  editor,
  close,
  saved,
}: {
  editor: Editor;
  close: () => void;
  saved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = useRef<string | null>(null);
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [steps, setSteps] = useState<string[]>([]);
  const kind = editor.kind;
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const m = "med" in editor ? editor.med : null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const f = new FormData(e.currentTarget),
      value = (k: string) => String(f.get(k) ?? "").trim();
    const payload: Record<string, unknown> = { action: kind };
    switch (editor.kind) {
      case "profile":
        Object.assign(
          payload,
          { revision: editor.profile?.revision ?? 0 },
          Object.fromEntries(
            [
              "allergies",
              "conditions",
              "preferences",
              "reference",
              "source",
            ].map((k) => [k, value(k)]),
          ),
        );
        break;
      case "plan":
        Object.assign(payload, {
          goal: value("goal"),
          next_step: value("next_step"),
          helper: value("helper"),
          review_on: value("review_on"),
          stage: value("stage"),
          previous: editor.plan?.version_id ?? null,
        });
        break;
      case "observation":
        Object.assign(payload, {
          topic: value("topic"),
          account: value("account"),
          source: value("source"),
          observed_on: value("observed_on"),
        });
        break;
      case "note":
        payload.note = value("note");
        break;
      case "medicine":
      case "revision": {
        if (editor.kind === "medicine")
          Object.assign(payload, {
            name: value("name"),
            unit: value("unit"),
            stock: Number(value("stock")),
          });
        else payload.regimenId = editor.med.regimen_id;
        const times = value("times")
          .split(/[,;\s]+/)
          .filter(Boolean);
        if (
          !times.length ||
          times.length > 12 ||
          times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) ||
          new Set(times).size !== times.length
        ) {
          setError(
            "Informe até 12 horários distintos no formato 08:00, 20:00.",
          );
          return;
        }
        Object.assign(payload, {
          dose: value("dose"),
          source: value("source"),
          quantity: Number(value("quantity")),
          times,
        });
        break;
      }
      case "stop":
        Object.assign(payload, {
          regimenId: editor.med.regimen_id,
          source: value("source"),
        });
        break;
      case "stock":
        Object.assign(payload, {
          medicineId: editor.med.id,
          amount: Number(value("amount")),
        });
        break;
      case "intake":
        Object.assign(payload, {
          regimenId: editor.dose.regimen_id,
          scheduledAt: editor.dose.scheduled_at,
          previousRecord: editor.dose.version_id,
          status: value("status"),
          reporter: value("reporter"),
        });
        break;
      case "visit":
        Object.assign(
          payload,
          Object.fromEntries(
            [
              "title",
              "kind",
              "location",
              "source",
              "reminder",
              "scheduled",
            ].map((k) => [k, value(k)]),
          ),
          {
            steps: steps.map((k) => ({
              instruction: value("instruction-" + k),
              due: value("due-" + k),
            })),
          },
        );
        break;
      case "visit_status":
        Object.assign(payload, {
          visitId: editor.visit.id,
          status: value("status"),
        });
        break;
    }
    key.current ??= crypto.randomUUID();
    setError("");
    setSaving(true);
    try {
      await api("/api/prontuario", { ...payload, requestId: key.current });
      saved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="chart-form-title"
      className="chart-dialog"
      onCancel={(e) => {
        if (saving) e.preventDefault();
        else close();
      }}
    >
      <header>
        <h2 id="chart-form-title">
          {editor.kind === "intake" && editor.dose.status
            ? "Corrigir relato de tomada"
            : titles[kind]}
        </h2>
        <button
          type="button"
          aria-label="Fechar formulário"
          disabled={saving}
          onClick={close}
        >
          <X />
        </button>
      </header>
      <form onSubmit={submit}>
        {editor.kind === "plan" && (
          <>
            <Field label="O que é importante para a pessoa?">
              <textarea
                name="goal"
                required
                maxLength={700}
                defaultValue={editor.plan?.goal}
                placeholder="Ex. Quero voltar a escolher as frutas na feira."
              />
            </Field>
            <Field label="O que foi combinado?">
              <select
                name="stage"
                defaultValue={editor.plan?.stage ?? planStages[0]}
              >
                {planStages.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Próximo passo">
              <textarea
                name="next_step"
                required
                maxLength={700}
                defaultValue={editor.plan?.next_step}
              />
            </Field>
            <Field label="Quem pode ajudar?">
              <input
                name="helper"
                required
                maxLength={150}
                defaultValue={editor.plan?.helper}
              />
            </Field>
            <Field label="Data de revisão">
              <input
                type="date"
                name="review_on"
                required
                defaultValue={editor.plan?.review_on ?? editor.today}
              />
            </Field>
          </>
        )}
        {editor.kind === "observation" && (
          <>
            <Field label="Assunto do relato">
              <select name="topic" required defaultValue="">
                <option value="" disabled>
                  Escolha um assunto
                </option>
                {everydayTopics.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Quem informou?">
              <select name="source" required defaultValue="">
                <option value="" disabled>
                  Escolha a origem do relato
                </option>
                {observationSources.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Data da observação">
              <input
                type="date"
                required
                name="observed_on"
                defaultValue={editor.today}
                max={editor.today}
              />
            </Field>
            <Field label="O que aconteceu ou que apoio foi pedido?">
              <textarea
                required
                maxLength={700}
                name="account"
                placeholder="Registre o que foi relatado. Estes dados ficam visíveis a quem tem acesso ao prontuário."
              />
            </Field>
          </>
        )}
        {editor.kind === "profile" && (
          <>
            {(
              [
                ["allergies", "Alergias registradas"],
                ["conditions", "Condições documentadas"],
                ["preferences", "Preferências e apoio na rotina"],
                ["reference", "Pessoa ou serviço de referência"],
              ] as const
            ).map(([name, label]) => (
              <Field key={name} label={label}>
                <textarea
                  name={name}
                  maxLength={700}
                  defaultValue={editor.profile?.[name]}
                />
              </Field>
            ))}
            <Field label="Fonte das informações">
              <input
                required
                name="source"
                maxLength={150}
                defaultValue={editor.profile?.source}
              />
            </Field>
          </>
        )}
        {kind === "note" && (
          <Field label="O que aconteceu e quem informou?">
            <textarea required name="note" maxLength={700} />
          </Field>
        )}
        {kind === "medicine" && (
          <>
            <Field label="Nome conforme a receita">
              <input required name="name" maxLength={150} />
            </Field>
            <div className="chart-pair">
              <Field label="Unidade de estoque">
                <input
                  required
                  name="unit"
                  maxLength={150}
                  placeholder="Ex. comprimidos ou mL"
                />
              </Field>
              <Field label="Quantidade em estoque">
                <input
                  required
                  name="stock"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                />
              </Field>
            </div>
          </>
        )}
        {m && (
          <p className="chart-form-context">
            <strong>{m.name}</strong> · {m.dose} ·{" "}
            {m.times.replaceAll(",", ", ")}
            <br />
            Saldo registrado de {quantityLabel(m.stock)} {m.unit}.
          </p>
        )}
        {(kind === "medicine" || kind === "revision") && (
          <>
            <Field label="Dose e via conforme a prescrição">
              <input
                required
                name="dose"
                maxLength={150}
                defaultValue={m?.dose}
              />
            </Field>
            <div className="chart-pair">
              <Field
                label={
                  m
                    ? "Quantidade por tomada (" + m.unit + ")"
                    : "Unidades de estoque por tomada"
                }
              >
                <input
                  required
                  type="number"
                  min="0.01"
                  max="100000"
                  step="0.01"
                  name="quantity"
                  defaultValue={m?.quantity}
                />
              </Field>
              <Field label="Horários diários (São Paulo)">
                <input
                  required
                  name="times"
                  placeholder="08:00, 20:00"
                  defaultValue={m?.times}
                />
              </Field>
            </div>
            <p className="muted">
              O plano diário entra em vigor ao salvar. Os horários anteriores
              conservam a prescrição vigente na ocasião.
            </p>
          </>
        )}
        {["medicine", "revision", "stop"].includes(kind) && (
          <Field label="Profissional ou documento de origem">
            <input
              required
              maxLength={150}
              name="source"
              placeholder="Fonte e data da orientação médica"
            />
          </Field>
        )}
        {kind === "stop" && (
          <p>
            O encerramento interrompe os próximos lembretes deste plano e fica
            registrado no histórico.
          </p>
        )}
        {kind === "stock" && (
          <Field label={"Quantidade recebida (" + m?.unit + ")"}>
            <input
              type="number"
              required
              name="amount"
              min="0.01"
              max="100000"
              step="0.01"
            />
          </Field>
        )}
        {editor.kind === "intake" && (
          <>
            <p className="chart-form-context">
              <strong>{editor.dose.name}</strong> · {editor.dose.dose}
              <br />
              Horário previsto {displayDate(editor.dose.scheduled_at)}.
            </p>
            <Field label="O que foi informado?">
              <select required name="status" defaultValue="">
                <option disabled value="">
                  Selecione o relato
                </option>
                <option value="taken">Tomou</option>
                <option value="skipped">Não tomou</option>
              </select>
            </Field>
            <Field label="Origem da informação">
              <select required name="reporter" defaultValue="">
                <option disabled value="">
                  Selecione a origem
                </option>
                <option>Relato da pessoa acompanhada</option>
                <option>Observação do familiar</option>
              </select>
            </Field>
          </>
        )}
        {kind === "visit" && (
          <>
            <Field label="Tipo de atendimento">
              <select name="kind">
                {visitTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Nome do atendimento">
              <input name="title" required maxLength={150} />
            </Field>
            <Field label="Local ou serviço">
              <input required name="location" maxLength={150} />
            </Field>
            <div className="chart-pair">
              <Field label="Data e hora do atendimento">
                <input
                  required
                  name="scheduled"
                  type="datetime-local"
                  min={localInput(new Date().toISOString())}
                />
              </Field>
              <Field label="Lembrar a família em">
                <input required name="reminder" type="datetime-local" />
              </Field>
            </div>
            <Field label="Fonte da orientação">
              <input
                required
                name="source"
                maxLength={150}
                placeholder="Ex. guia da clínica"
              />
            </Field>
            <h3>Preparo orientado pelo serviço</h3>
            {steps.map((k, i) => (
              <fieldset key={k}>
                <legend>Etapa {i + 1}</legend>
                <Field label="Instrução recebida">
                  <textarea
                    required
                    name={"instruction-" + k}
                    maxLength={700}
                  />
                </Field>
                <Field label="Horário do preparo">
                  <input name={"due-" + k} type="datetime-local" required />
                </Field>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setSteps(steps.filter((s) => s !== k))}
                >
                  Remover etapa
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="button button-light"
              disabled={steps.length >= 20}
              onClick={() => setSteps([...steps, crypto.randomUUID()])}
            >
              <Plus size={15} /> Adicionar etapa de preparo
            </button>
          </>
        )}
        {editor.kind === "visit_status" && (
          <>
            <p>
              {editor.visit.title} · {displayDate(editor.visit.scheduled_at)}
            </p>
            <Field label="Situação do atendimento">
              <select required defaultValue="" name="status">
                <option disabled value="">
                  Selecione
                </option>
                {editor.visit.scheduled_at <= new Date().toISOString() && (
                  <option value="done">Compareceu</option>
                )}
                <option value="cancelled">Cancelado</option>
              </select>
            </Field>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="button button-light"
            disabled={saving}
            onClick={close}
          >
            Voltar
          </button>
          <button className="button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar registro"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
