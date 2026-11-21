"use client";
import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import type { RTMClient } from "agora-rtm";
import type { AgoraVoiceAI } from "agora-agent-client-toolkit";
import { api } from "@/lib/client";
import { makeCleanup } from "@/lib/voice-cleanup";
import { voiceFailure, type VoiceStage } from "@/lib/voice-feedback";
type State =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "reconnecting"
  | "error"
  | "disconnected";
const stateText: Record<State, string> = {
  idle: "Pronta para conversar",
  requesting_permission: "Aguardando permissão do microfone",
  connecting: "Conectando à Agora…",
  listening: "Lia está ouvindo",
  thinking: "Lia está preparando a resposta",
  speaking: "Lia está falando",
  interrupted: "Você interrompeu a resposta",
  reconnecting: "Reconectando à Agora…",
  error: "A conversa precisa de atenção",
  disconnected: "Conversa encerrada",
};
type Session = {
  session_id: string;
  app_id: string;
  channel: string;
  uid: number;
  token: string;
  agent_uid: number;
  expires_at: string;
};
export function VoicePanel({
  configured,
  consented,
  onChange,
}: {
  configured: boolean;
  consented: boolean;
  onChange: () => Promise<void>;
}) {
  const [state, setState] = useState<State>("idle"),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(false),
    [caption, setCaption] = useState(""),
    [joined, setJoined] = useState(false),
    [hasSession, setHasSession] = useState(false),
    [microphone, setMicrophone] = useState<"off" | "capturing" | "published">(
      "off",
    ),
    [microphoneLevel, setMicrophoneLevel] = useState(0),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const refs = useRef<{
    rtc?: IAgoraRTCClient;
    mic?: IMicrophoneAudioTrack;
    rtm?: RTMClient;
    ai?: AgoraVoiceAI;
    session?: Session;
    cleanup?: () => Promise<string[]>;
    timer?: ReturnType<typeof setTimeout>;
    meter?: ReturnType<typeof setInterval>;
  }>({});
  const cancelled = useRef(false);
  const alive = useRef(true),
    busy = useRef(false);
  const cleanup = async () => {
    cancelled.current = true;
    const r = refs.current;
    clearTimeout(r.timer);
    clearInterval(r.meter);
    const failures = await r.cleanup?.();
    if (alive.current) {
      setJoined(false);
      setCaption("");
      setMuted(false);
      setMicrophone("off");
      setMicrophoneLevel(0);
      setDevices([]);
      if (failures?.includes("stopAgent")) {
        setError(
          "O microfone foi desligado, mas o servidor ainda não confirmou o encerramento. Tente encerrar novamente.",
        );
        setState("error");
      } else {
        setState("disconnected");
        setHasSession(false);
        refs.current = {};
      }
      await onChange();
    }
  };
  useEffect(() => {
    alive.current = true;
    const pagehide = () => {
      const r = refs.current;
      r.mic?.stop();
      r.mic?.close();
      if (r.session)
        navigator.sendBeacon(
          "/api/voice/stop",
          new Blob([JSON.stringify({ session_id: r.session.session_id })], {
            type: "application/json",
          }),
        );
    };
    window.addEventListener("pagehide", pagehide);
    return () => {
      alive.current = false;
      cancelled.current = true;
      window.removeEventListener("pagehide", pagehide);
      clearTimeout(refs.current.timer);
      clearInterval(refs.current.meter);
      void refs.current.cleanup?.();
    };
  }, []);
  async function start() {
    if (busy.current) return;
    busy.current = true;
    cancelled.current = false;
    const owned = refs.current;
    let stage: VoiceStage = "microphone";
    let reportedError = "";
    function fail(message: string) {
      reportedError = message;
      cancelled.current = true;
      clearTimeout(owned.timer);
      void owned.cleanup?.().then((failures) => {
        if (alive.current) {
          if (!failures.includes("stopAgent")) setHasSession(false);
          setState("error");
          setError(reportedError);
          setJoined(false);
        }
      });
    }
    function ensureActive() {
      if (!alive.current || cancelled.current)
        throw new Error("Conversa cancelada.");
    }
    setError("");
    setCaption("");
    try {
      if (!configured)
        throw new Error(
          "A voz real ainda precisa das credenciais Agora e da URL HTTPS pública.",
        );
      if (owned.session) {
        await api("/api/voice/stop", {
          session_id: owned.session.session_id,
        });
        owned.session = undefined;
        setHasSession(false);
        owned.cleanup = undefined;
      }
      setState("requesting_permission");
      const rtcModule = await import("agora-rtc-sdk-ng"),
        RTC = rtcModule.default;
      RTC.setLogLevel(3);
      RTC.onAutoplayFailed = () => {
        if (alive.current)
          setError(
            "O navegador bloqueou a saída de áudio. Toque em “Ouvir a Lia” para liberar.",
          );
      };
      const mic = await RTC.createMicrophoneAudioTrack();
      if (!alive.current || cancelled.current) {
        mic.stop();
        mic.close();
        return;
      }
      owned.mic = mic;
      setMicrophone("capturing");
      owned.meter = setInterval(() => {
        if (alive.current && mic.getMediaStreamTrack().readyState === "live")
          setMicrophoneLevel(mic.getVolumeLevel());
      }, 150);
      setState("connecting");
      const rtc = RTC.createClient({ mode: "rtc", codec: "vp8" });
      owned.rtc = rtc;
      let rtm: RTMClient | undefined, ai: AgoraVoiceAI | undefined;
      owned.cleanup = makeCleanup({
        closeMicrophone: () => {
          clearInterval(owned.meter);
          if (alive.current) {
            setMicrophone("off");
            setMicrophoneLevel(0);
          }
          mic.stop();
          mic.close();
        },
        destroyToolkit: () => {
          ai?.unsubscribe();
          ai?.destroy();
        },
        leaveRtc: async () => {
          rtc.removeAllListeners();
          await rtc.leave();
        },
        logoutRtm: async () => {
          await rtm?.logout();
        },
        stopAgent: async () => {
          if (owned.session)
            await api("/api/voice/stop", {
              session_id: owned.session.session_id,
            });
        },
      });
      mic.on("track-ended", () => {
        if (alive.current && !cancelled.current)
          fail(
            "A captura do microfone foi interrompida pelo navegador. Confira o dispositivo e tente novamente.",
          );
      });
      stage = "agent";
      const session = await api<Session>("/api/voice/start", {});
      owned.session = session;
      if (alive.current) setHasSession(true);
      if (!alive.current || cancelled.current) {
        await api("/api/voice/stop", { session_id: session.session_id });
        await owned.cleanup();
        return;
      }
      stage = "rtm";
      const { default: AgoraRTM } = await import("agora-rtm");
      rtm = new AgoraRTM.RTM(session.app_id, String(session.uid));
      owned.rtm = rtm;
      await rtm.login({ token: session.token });
      ensureActive();
      await rtm.subscribe(session.channel);
      ensureActive();
      rtc.on("connection-state-change", (current) => {
        if (!alive.current) return;
        if (current === "RECONNECTING") setState("reconnecting");
        if (current === "DISCONNECTED") {
          setJoined(false);
          setState("disconnected");
        }
        if (current === "CONNECTED") setState("connecting");
      });
      rtc.on("user-joined", (user) => {
        if (user.uid === session.agent_uid && alive.current) setJoined(true);
      });
      rtc.on("user-left", (user) => {
        if (user.uid === session.agent_uid && alive.current) {
          fail(
            "Lia saiu do canal. O microfone foi desligado. Tente novamente.",
          );
        }
      });
      rtc.on("user-published", async (user, media) => {
        try {
          await rtc.subscribe(user, media);
          if (media === "audio") {
            user.audioTrack?.play();
            if (alive.current) setJoined(true);
          }
        } catch {
          if (alive.current)
            setError("Não foi possível reproduzir o áudio da Lia.");
        }
      });
      stage = "rtc";
      await rtc.join(
        session.app_id,
        session.channel,
        session.token,
        session.uid,
      );
      ensureActive();
      stage = "toolkit";
      const toolkit = await import("agora-agent-client-toolkit");
      ai = await toolkit.AgoraVoiceAI.init({
        rtcEngine: rtc,
        rtmEngine: rtm,
        renderMode: toolkit.TranscriptHelperMode.TEXT,
        enableLog: false,
      });
      owned.ai = ai;
      ensureActive();
      ai.on(toolkit.AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) => {
        if (
          alive.current &&
          ["listening", "thinking", "speaking", "idle"].includes(event.state)
        )
          setState(event.state as State);
      });
      ai.on(toolkit.AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (transcript) => {
        const last = transcript[transcript.length - 1];
        if (last && alive.current) {
          setCaption(
            `${String(last.uid) === String(session.agent_uid) ? "Lia" : "Você"}: ${last.text || ""}`,
          );
          if (last.status === toolkit.TurnStatus.INTERRUPTED)
            setState("interrupted");
        }
      });
      ai.on(toolkit.AgoraVoiceAIEvents.AGENT_ERROR, (_, event) => {
        // Never log provider payloads, keys or conversation text.
        fail(voiceFailure(event, "agent"));
      });
      ai.subscribeMessage(session.channel);
      stage = "publish";
      await rtc.publish([mic]);
      ensureActive();
      setMicrophone("published");
      try {
        setDevices(await RTC.getPlaybackDevices(true));
      } catch {
        /* Device selection is optional and browser-dependent. */
      }
      owned.timer = setTimeout(() => void cleanup(), 14 * 60000 + 30000);
      await onChange();
    } catch (err) {
      clearInterval(owned.meter);
      const failures = await owned.cleanup?.();
      if (alive.current && !failures?.includes("stopAgent"))
        setHasSession(false);
      // Re-run local teardown for resources acquired after cancellation.
      if (cancelled.current || !alive.current) {
        owned.mic?.stop();
        owned.mic?.close();
        try {
          owned.ai?.unsubscribe();
          owned.ai?.destroy();
        } catch {}
        await Promise.allSettled([
          owned.rtc?.leave(),
          owned.rtm?.logout(),
          owned.session
            ? api("/api/voice/stop", { session_id: owned.session.session_id })
            : Promise.resolve(),
        ]);
      }
      if (!owned.cleanup) {
        owned.mic?.stop();
        owned.mic?.close();
      }
      if (alive.current) {
        setState("error");
        setError(reportedError || voiceFailure(err, stage));
        setJoined(false);
      }
    } finally {
      busy.current = false;
    }
  }
  const active = [
    "connecting",
    "listening",
    "thinking",
    "speaking",
    "interrupted",
    "reconnecting",
    "requesting_permission",
  ].includes(state);
  return (
    <section className="voice-card">
      <div className="voice-top">
        <span className="eyebrow">UMA CONVERSA COM LIA</span>
        <span className="soft-label">
          {joined ? "AGENTE NO CANAL AGORA" : "VOZ AO VIVO · AGORA"}
        </span>
      </div>
      <div className={`voice-orb ${state === "speaking" ? "is-speaking" : ""}`}>
        <div className="voice-orb-inner">
          <AudioLines size={58} strokeWidth={1.3} />
        </div>
      </div>
      <h2>{stateText[state]}</h2>
      <p aria-live="polite" className="voice-status">
        {joined
          ? "Conexão do agente observada no canal."
          : "A conversa só começa quando você escolher entrar."}
      </p>
      <div className="microphone-status">
        <p role="status">
          {microphone === "off"
            ? "Microfone desligado"
            : microphone === "capturing"
              ? "Microfone captando neste dispositivo; ainda não publicado."
              : muted
                ? "Microfone silenciado"
                : "Microfone publicado na Agora"}
        </p>
        {microphone !== "off" && (
          <label>
            Nível do microfone
            <meter
              aria-label="Nível do microfone"
              min={0}
              max={1}
              value={muted ? 0 : microphoneLevel}
            />
          </label>
        )}
      </div>
      <div className="voice-actions">
        {!active ? (
          <button
            className="button talk-button"
            disabled={!configured || !consented}
            onClick={() => void start()}
          >
            <Mic size={23} /> Conversar com Lia
          </button>
        ) : (
          <>
            <button
              className="button button-light"
              onClick={async () => {
                try {
                  await refs.current.mic?.setEnabled(muted);
                  setMuted(!muted);
                } catch {
                  setError("Não foi possível alterar o microfone.");
                }
              }}
            >
              {muted ? <MicOff size={20} /> : <Mic size={20} />}{" "}
              {muted ? "Ligar microfone" : "Silenciar"}
            </button>
            <button className="button danger" onClick={() => void cleanup()}>
              <PhoneOff size={20} /> Encerrar conversa
            </button>
          </>
        )}
      </div>
      {state === "requesting_permission" && (
        <p role="status">
          <LoaderCircle className="spin" size={16} /> Permita o microfone na
          janela do navegador.
        </p>
      )}
      {caption && (
        <p className="captions" aria-live="polite">
          {caption}
        </p>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {state === "error" && hasSession && (
        <button
          className="subtle-button"
          onClick={async () => {
            try {
              await api("/api/voice/stop", {
                session_id: refs.current.session?.session_id,
              });
              refs.current = {};
              setHasSession(false);
              setState("disconnected");
              setError("");
              await onChange();
            } catch {
              setError(
                "Encerramento ainda pendente. O worker tentará novamente.",
              );
            }
          }}
        >
          Tentar encerrar no servidor
        </button>
      )}
      {active && (
        <>
          <button
            className="text-button"
            onClick={() =>
              refs.current.rtc?.remoteUsers.forEach((u) => u.audioTrack?.play())
            }
          >
            <Volume2 size={17} /> Ouvir a Lia
          </button>
          {devices.length > 0 && (
            <label className="audio-output">
              Saída de áudio
              <select
                aria-label="Saída de áudio"
                onChange={async (e) => {
                  try {
                    await Promise.all(
                      refs.current.rtc?.remoteUsers.map((u) =>
                        u.audioTrack?.setPlaybackDevice(e.target.value),
                      ) || [],
                    );
                  } catch {
                    setError(
                      "Este navegador não permite escolher a saída. Use a saída de áudio do sistema.",
                    );
                  }
                }}
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Saída padrão"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {!consented && (
        <p className="voice-missing">
          Autorize os convites de conversa nos controles de privacidade para
          ligar o microfone.
        </p>
      )}
      {!configured && (
        <p className="voice-missing">
          Voz real aguardando configuração Agora e HTTPS. O teste por texto
          abaixo é separado e não usa áudio.
        </p>
      )}
      <p className="fine-print">
        <ShieldCheck size={15} /> Legendas são temporárias. Só pedidos revisados
        e autorizados são compartilhados.
      </p>
    </section>
  );
}
