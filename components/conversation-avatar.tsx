"use client";

import { useEffect, useRef } from "react";
import { prepareAvatar } from "@/lib/avatar-renderer";

type Props = {
  name: string;
  live: boolean;
  canSpeak: boolean;
  agentLevel: () => number;
};

export function ConversationAvatar({ name, live, canSpeak, agentLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(canSpeak);

  useEffect(() => {
    speakingRef.current = canSpeak;
  }, [canSpeak]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    if (!canvas || !fallback || !live) return;

    const controller = new AbortController();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: Awaited<ReturnType<typeof prepareAvatar>>;
    let previous = -1;
    let smoothed = 0;

    const resetPose = () => {
      fallback.style.backgroundPosition = "";
      fallback.style.opacity = "";
      canvas.style.visibility = "";
    };

    const render = () => {
      if (document.hidden) return;
      const level = speakingRef.current ? agentLevel() : 0;
      const target = Number.isFinite(level)
        ? Math.max(0, Math.min(1, (level - 0.012) * 1.6))
        : 0;
      smoothed = target === 0 ? 0 : smoothed + (target - smoothed) * 0.66;
      const opening = reduced.matches ? 0 : Math.round(smoothed * 25) / 25;
      if (opening === previous) return;
      previous = opening;
      if (renderer) {
        renderer.draw(opening, opening * 0.012);
        canvas.style.visibility = "visible";
        fallback.style.opacity = "0";
      } else {
        const frame = Math.round(opening * 5);
        fallback.style.backgroundPosition = `${(frame % 3) * 50}% ${Math.floor(frame / 3) * 100}%`;
      }
    };

    const lost = (event: Event) => {
      event.preventDefault();
      renderer?.dispose();
      renderer = undefined;
      resetPose();
      previous = -1;
    };
    const refresh = () => {
      previous = -1;
      render();
    };

    canvas.addEventListener("webglcontextlost", lost);
    if (!reduced.matches) {
      void prepareAvatar(canvas, controller.signal).then(result => {
        if (controller.signal.aborted) {
          result?.dispose();
          return;
        }
        renderer = result;
        refresh();
      }).catch(() => { /* Pre-rendered poses also respond to the agent audio. */ });
    }
    const timer = window.setInterval(render, 60);
    window.addEventListener("resize", refresh);
    render();

    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("resize", refresh);
      canvas.removeEventListener("webglcontextlost", lost);
      renderer?.dispose();
      resetPose();
    };
  }, [live, agentLevel]);

  return (
    <div className="conversation-avatar" role="img" aria-label={`${name}, assistente virtual`}>
      <div ref={fallbackRef} className={live ? "avatar-poses avatar-live" : "avatar-poses"} />
      <canvas ref={canvasRef} className="avatar-canvas" aria-hidden="true" />
    </div>
  );
}
