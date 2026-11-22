"use client";

import { useEffect, useRef } from "react";
import type { IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import { prepareAvatar } from "@/lib/avatar-renderer";
import { createSpeechReader, REST, type Mouth } from "@/lib/avatar-speech";

type Props = {
  name: string;
  live: boolean;
  canSpeak: boolean;
  listening: boolean;
  track: IRemoteAudioTrack | null;
};
const keys = ["open","round","wide","teeth"] as const;

export function ConversationAvatar({ name, live, canSpeak, listening, track }: Props) {
  const gpu = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLCanvasElement>(null);
  const read = useRef<() => Mouth>(() => REST);
  const refresh = useRef<(() => void) | undefined>(undefined);
  const attention = useRef({ listening: false, since: 0 });

  useEffect(() => {
    attention.current = { listening, since: performance.now() };
    refresh.current?.();
  }, [listening]);

  useEffect(() => {
    if (!live || !canSpeak || !track) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const classify = createSpeechReader();
    let mouth = REST;
    let last = -Infinity;
    let active = true;
    let installed = false;
    try {
      track.setAudioFrameCallback(buffer => {
        if (!active || document.hidden || reduce.matches || !track.isPlaying) return;
        mouth = classify(buffer.getChannelData(0),buffer.sampleRate);
        last = performance.now();
      },1024);
      installed = true;
    } catch { /* The playback level still supplies jaw motion on restricted devices. */ }
    read.current = () => {
      if (!track.isPlaying) return REST;
      if (performance.now()-last < 110) return mouth;
      if (last !== -Infinity) return REST;
      return { ...REST, open: Math.min(0.65,track.getVolumeLevel()*1.3) };
    };
    return () => {
      active = false;
      read.current = () => REST;
      if (installed) {
        try { track.setAudioFrameCallback(null); } catch { /* Track already unpublished. */ }
      }
      refresh.current?.();
    };
  }, [live, canSpeak, track]);

  useEffect(() => {
    const canvas = gpu.current;
    const flat = fallback.current;
    if (!canvas || !flat || !live) return;
    const controller = new AbortController();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ctx = flat.getContext("2d");
    const atlas = new Image();
    let renderer: Awaited<ReturnType<typeof prepareAvatar>>;
    let loading = false;
    let lastPose = "";
    let mouth: Mouth = {...REST};
    let nextBlink = performance.now()+3900+Math.random()*1700;

    // Canvas fallback needs only the photographic poses, even without WebGL.
    function paintFlat(pose: Mouth, blink: number, nod: number) {
      if (!ctx || !flat || !atlas.complete || !atlas.naturalWidth) return;
      const pixels = Math.max(1,Math.min(640,Math.round(flat.clientWidth*Math.min(2,window.devicePixelRatio||1))));
      if (flat.width !== pixels || flat.height !== pixels) { flat.width=pixels; flat.height=pixels; }
      const tile = atlas.naturalWidth/3;
      const frame = (n: number) => ctx.drawImage(atlas,(n%3)*tile,Math.floor(n/3)*tile,tile,tile,0,0,pixels,pixels);
      ctx.clearRect(0,0,pixels,pixels);
      ctx.save();
      ctx.translate(0,pixels * nod * -.15);
      ctx.globalAlpha = 1;
      frame(0);
      // Source-over weights are normalized to reproduce the same linear blend as WebGL.
      const weights = keys.map(k=>pose[k]);
      let remaining = Math.max(0,1-weights.reduce((a,b)=>a+b,0));
      weights.forEach((w,i)=>{
        remaining += w;
        if (w>0) { ctx.globalAlpha=Math.min(1,w/remaining); frame(i+1); }
      });
      if (blink>0) {
        ctx.globalAlpha=blink;
        ctx.beginPath(); ctx.rect(0,pixels*.42,pixels,pixels*.15); ctx.clip(); frame(5);
      }
      ctx.restore();
      flat.style.visibility="visible";
    }
    const render = () => {
      if (document.hidden) return;
      if (media.matches) {
        canvas.style.visibility="hidden"; flat.style.visibility="hidden";
        lastPose=""; mouth={...REST};
        return;
      }
      const now=performance.now();
      const target=read.current();
      const silent=!keys.some(k=>target[k]>0.001);
      for (const k of keys) mouth[k]=silent ? 0 : mouth[k]+.68*(target[k]-mouth[k]);
      if (now>nextBlink+195) nextBlink=now+3900+Math.random()*2600;
      const elapsed=now-nextBlink;
      const blink=elapsed<0 ? 0 : Math.max(0,Math.sin(Math.PI*Math.min(1,elapsed/195)))**1.4;
      const age=now-attention.current.since;
      const nod=attention.current.listening && age<550 ? .014*Math.sin(Math.PI*age/550) : 0;
      const signature=[...keys.map(k=>mouth[k]),blink,nod*40].map(w=>Math.round(w*40)).join(",");
      if (signature===lastPose) return;
      lastPose=signature;
      if (renderer) {
        renderer.draw(mouth,blink,nod);
        canvas.style.visibility="visible"; flat.style.visibility="hidden";
      } else {
        paintFlat(mouth,blink,nod);
      }
    };
    const redraw=()=>{lastPose="";render();};
    const load = () => {
      if (!media.matches && !atlas.src) atlas.src="/avatars/lia-expressoes.webp";
      if (!media.matches && !renderer && !loading) {
        loading=true;
        void prepareAvatar(canvas,controller.signal).then(value=>{
          if (controller.signal.aborted) { value?.dispose(); return; }
          renderer=value; redraw();
        }).catch(()=>{ /* The 2D portrait uses the same visemes. */ })
          .finally(()=>{loading=false;});
      }
      redraw();
    };
    const contextLost=(event: Event)=>{
      event.preventDefault();
      renderer?.dispose(); renderer=undefined;
      canvas.style.visibility="hidden"; redraw();
    };
    const visibility=()=>{
      if (document.hidden) { mouth={...REST}; lastPose=""; return; }
      redraw();
    };
    refresh.current=redraw;
    atlas.onload=redraw;
    canvas.addEventListener("webglcontextlost",contextLost);
    canvas.addEventListener("webglcontextrestored",load);
    media.addEventListener("change",load);
    document.addEventListener("visibilitychange",visibility);
    window.addEventListener("resize",redraw);
    const timer=window.setInterval(render,33);
    load();
    return ()=>{
      controller.abort(); atlas.onload=null; refresh.current=undefined;
      window.clearInterval(timer); window.removeEventListener("resize",redraw);
      document.removeEventListener("visibilitychange",visibility);
      media.removeEventListener("change",load);
      canvas.removeEventListener("webglcontextlost",contextLost);
      canvas.removeEventListener("webglcontextrestored",load);
      renderer?.dispose();
      canvas.style.visibility=""; flat.style.visibility="";
    };
  }, [live]);

  return (
    <div className="conversation-avatar" role="img" aria-label={`${name}, assistente virtual`}>
      <canvas ref={fallback} className="avatar-canvas" aria-hidden="true" />
      <canvas ref={gpu} className="avatar-canvas" aria-hidden="true" />
    </div>
  );
}
