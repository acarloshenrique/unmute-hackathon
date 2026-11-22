"use client";
import { useState } from "react";
import { CAREGIVER_OPTIONS, type CaregiverId } from "@/lib/caregivers";
import type { Data } from "@/lib/client";
export function CaregiverPicker({
  data,
  save,
}: {
  data: Data;
  save: (id: CaregiverId) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <section
      className="card caregiver-picker"
      aria-labelledby="caregiver-heading"
    >
      <span className="eyebrow">DO JEITO QUE ELA PREFERE</span>
      <h2 id="caregiver-heading">Escolher cuidadora virtual</h2>
      <p>
        Para {data.profile.display_name}. Ativa:{" "}
        <strong>
          {data.caregiver.name} · {data.caregiver.style}
        </strong>
        .
      </p>
      <fieldset disabled={!data.can_choose_caregiver || saving}>
        <legend className="sr-only">Estilo de fala da cuidadora virtual</legend>
        {CAREGIVER_OPTIONS.map((option) => (
          <label className="caregiver-option" key={option.id}>
            <input
              type="radio"
              name={`caregiver-${data.profile.id}`}
              value={option.id}
              aria-label={`${option.name} · ${option.style}`}
              checked={data.caregiver.id === option.id}
              onChange={() => {
                setSaving(true);
                void save(option.id)
                  .catch(() => {})
                  .finally(() => setSaving(false));
              }}
            />
            <span>
              <strong>
                {option.name} · {option.style}
              </strong>
              <small>{option.description}</small>
            </span>
            {data.caregiver.id === option.id && (
              <span className="caregiver-active">Ativa</span>
            )}
          </label>
        ))}
      </fieldset>
      <p className="fine-print">
        Os três perfis usam a mesma voz. A diferença é o estilo de fala.
      </p>
      <p className="fine-print" role="status">
        {saving
          ? "Salvando escolha…"
          : "A escolha vale para a próxima conversa. Uma sessão em andamento continua como está."}
      </p>
      {!data.can_choose_caregiver && (
        <p className="fine-print">
          A alteração exige autorização desta pessoa para o familiar nos
          controles de privacidade.
        </p>
      )}
    </section>
  );
}
