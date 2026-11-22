import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import ts from "typescript";

test.use({launchOptions: {args: ["--enable-unsafe-swiftshader"]}});

test("o retrato 3D abre, arredonda os lábios, pisca e volta ao repouso (poses sintéticas)", async ({page}) => {
  // Serve the production renderer to this browser context only. No credentials,
  // microphone, provider call or shared demo state is needed for this test.
  const source = ts.transpileModule(readFileSync("lib/avatar-renderer.ts","utf8"), {
    compilerOptions: {module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText;
  await page.route("**/__test-renderer.mjs", route=>route.fulfill({contentType:"text/javascript",body:source}));
  await page.route("**/__test-portrait", route=>route.fulfill({contentType:"text/html",body:'<canvas style="width:300px;height:300px"></canvas>'}));
  await page.goto("/__test-portrait");
  const states=await page.evaluate(async (url)=>{
    const {prepareAvatar}=await import(url);
    const canvas=document.querySelector("canvas")!;
    const renderer=await prepareAvatar(canvas,new AbortController().signal);
    if (!renderer) throw new Error("O navegador de teste precisa de WebGL");
    const gl=canvas.getContext("webgl")!;
    const pose=(open=0,round=0,blink=0)=>{
      renderer.draw({open,round,wide:0,teeth:0},blink,0);
      const hash=(x:number,y:number,w:number,h:number)=>{
        const data=new Uint8Array(w*h*4);
        gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);
        return data.reduce((n,p)=>Math.imul(n^p,16777619)>>>0,2166136261);
      };
      const width=canvas.width;
      return {
        lips:hash(Math.floor(width*.43),Math.floor(width*.26),Math.ceil(width*.16),Math.ceil(width*.08)),
        eyes:hash(Math.floor(width*.33),Math.floor(width*.46),Math.ceil(width*.34),Math.ceil(width*.08)),
      };
    };
    try {
      const rest=pose(), opened=pose(1), rounded=pose(0,1), closedEyes=pose(0,0,1), listening=pose();
      return {rest,opened,rounded,closedEyes,listening,error:gl.getError()};
    } finally { renderer.dispose(); }
  },"/__test-renderer.mjs");
  expect(states.error).toBe(0);
  expect(states.opened.lips).not.toBe(states.rest.lips);
  expect(states.rounded.lips).not.toBe(states.opened.lips);
  expect(states.closedEyes.eyes).not.toBe(states.rest.eyes);
  expect(states.listening).toEqual(states.rest);
});
