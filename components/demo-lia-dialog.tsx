"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, type Data } from "@/lib/client";
import { CAREGIVERS } from "@/lib/caregivers";
import { demoScenarios, type DemoScenarioId } from "@/lib/demo-scenarios";
import styles from "./demo-experience.module.css";

const VoicePanel = dynamic(
  () => import("./voice-panel").then((m) => m.VoicePanel),
  { ssr: false, loading: () => <p role="status">Abrindo a voz da Lia…</p> },
);
const noRefresh = async () => {};
export function DemoLiaDialog({
  scenario,
  onClose,
}: {
  scenario: DemoScenarioId;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<Data | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let closed = false;
    async function connect() {
      await api("/api/demo", { action: "login", persona: "helena" });
      if (closed) return;
      const data = await api<Data>("/api/snapshot");
      if (!closed) setInfo(data);
    }
    void connect().catch(() => {
      if (!closed) setError(true);
    });
    return () => {
      closed = true;
      element?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.voiceDialog}
      aria-labelledby="lia-dialog-title"
      onCancel={onClose}
    >
      <header>
        <h2 id="lia-dialog-title">Conversar com a Lia</h2>
        <button onClick={onClose} autoFocus>
          Fechar
        </button>
      </header>
      <p>
        {demoScenarios.find((s) => s.id === scenario)?.title} · Perfil de Helena
      </p>
      {error && (
        <p role="alert">
          Não foi possível abrir o perfil de demonstração. Feche e tente de
          novo.
        </p>
      )}
      {!info && !error && <p role="status">Abrindo a conversa de Helena…</p>}
      {info && (
        <>
          <VoicePanel
            caregiver={CAREGIVERS.lia}
            configured={info.agora_configured}
            consented={info.consents.some((c) => c.scope === "checkins")}
            demoScenario={scenario}
            startOnOpen
            onChange={noRefresh}
          />
          {!info.consents.some((c) => c.scope === "checkins") && (
            <Link href="/idoso">Abrir as permissões de Helena</Link>
          )}
        </>
      )}
    </dialog>
  );
}
