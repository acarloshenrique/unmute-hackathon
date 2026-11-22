import { describe, expect, it } from "vitest";
import { createSpeechReader, REST } from "../lib/avatar-speech";

// Synthetic vowels share a pitch, duration and RMS. Only their formants differ.
function vowel(f1: number, f2: number, sampleRate = 48000, gain = 0.07) {
  const samples = Float32Array.from({ length: 1024 }, (_, i) => {
    let value = 0;
    for (let hz = 130; hz < 4600; hz += 130) {
      const first = Math.exp(-((hz-f1)**2)/(2*95**2));
      const second = f2 ? 0.64*Math.exp(-((hz-f2)**2)/(2*120**2)) : 0;
      value += (first+second)*Math.sin(2*Math.PI*hz*i/sampleRate + 0.42*hz/130);
    }
    return value;
  });
  const rms = Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length);
  return samples.map(x=>x*gain/rms);
}

describe("Lia: movimentos orais estimados a partir de PCM", () => {
  for (const rate of [44100,48000]) {
    it(`separa vogais de mesmo volume a ${rate} Hz`, () => {
      const read = createSpeechReader();
      expect(read(vowel(780,1400,rate),rate).open).toBeGreaterThan(.55);
      expect(read(vowel(370,980,rate),rate).round).toBeGreaterThan(.55);
      expect(read(vowel(330,2400,rate),rate).wide).toBeGreaterThan(.55);
    });
  }
  it("fecha a boca no silêncio e no murmúrio nasal", () => {
    const read = createSpeechReader();
    read(vowel(780,1400),48000);
    expect(read(new Float32Array(1024),48000)).toEqual(REST);
    expect(read(vowel(255,0),48000)).toEqual(REST);
  });
  it("usa os dentes para uma fricativa e ignora quadros inválidos", () => {
    const read = createSpeechReader();
    const noise = Float32Array.from({length:1024},(_,i)=>.12*Math.sin(2*Math.PI*3700*i/48000));
    expect(read(noise,48000).teeth).toBeGreaterThan(.55);
    expect(read(noise,0)).toEqual(REST);
    expect(read(new Float32Array(0),48000)).toEqual(REST);
  });
});
