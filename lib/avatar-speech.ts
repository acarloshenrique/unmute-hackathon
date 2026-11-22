export type Mouth = { open: number; round: number; wide: number; teeth: number };

export const REST: Mouth = { open: 0, round: 0, wide: 0, teeth: 0 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const frequencies = [250, 350, 450, 550, 650, 750, 850, 950, 1150, 1350, 1550, 1750, 1950, 2200, 2450, 2700, 3000, 3400, 3900];
const rate = 10000;

// Fit a short all-pole spectral envelope. Its first two resonances distinguish
// open, rounded and spread vowels even when their playback volume is identical.
export function createSpeechReader() {
  const windowed = new Float64Array(320);
  const corr = new Float64Array(13);
  const lpc = new Float64Array(13);
  const previous = new Float64Array(13);
  const power = new Float64Array(frequencies.length);
  const phase = frequencies.map(f => Array.from({length: 13}, (_, k) => {
    const a = 2 * Math.PI * f * k / rate;
    return [Math.cos(a), Math.sin(a)];
  }));

  return (samples: Float32Array, sampleRate: number): Mouth => {
    if (sampleRate < rate || !samples.length) return REST;
    const step = sampleRate / rate;
    const count = Math.min(windowed.length, Math.floor(samples.length / step));
    if (count < 80) return REST;
    let energy = 0;
    let crossings = 0;
    let last = 0;
    for (let i = 0; i < count; i++) {
      // Average over each interval when downsampling the agent's PCM.
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      let value = 0;
      for (let j = start; j < end; j++) value += samples[j];
      value /= end - start;
      energy += value * value;
      if (value * last < 0) crossings++;
      const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (count - 1));
      windowed[i] = (value - 0.94 * last) * hann;
      last = value;
    }
    const rms = Math.sqrt(energy / count);
    if (!(rms > 0.004)) return REST;
    for (let k = 0; k < corr.length; k++) {
      let sum = 0;
      for (let i = k; i < count; i++) sum += windowed[i] * windowed[i - k];
      corr[k] = sum;
    }
    lpc.fill(0);
    lpc[0] = 1;
    let error = corr[0] * 1.001;
    for (let order = 1; order < lpc.length; order++) {
      let sum = corr[order];
      for (let j = 1; j < order; j++) sum += lpc[j] * corr[order - j];
      const reflection = Math.max(-0.98, Math.min(0.98, -sum / Math.max(1e-12, error)));
      previous.set(lpc);
      for (let j = 1; j < order; j++) lpc[j] = previous[j] + reflection * previous[order - j];
      lpc[order] = reflection;
      error *= 1 - reflection * reflection;
    }
    for (let i = 0; i < power.length; i++) {
      let real = 1, imaginary = 0;
      for (let k = 1; k < lpc.length; k++) {
        real += lpc[k] * phase[i][k][0];
        imaginary += lpc[k] * phase[i][k][1];
      }
      power[i] = 1 / (real * real + imaginary * imaginary + 1e-8);
    }
    const peak = (lo: number, hi: number) => {
      let best = lo;
      for (let i = lo + 1; i <= hi; i++) if (power[i] > power[best]) best = i;
      return best;
    };
    const strongestLow = peak(0, 7);
    let low = strongestLow;
    for (let i = 1; i < strongestLow; i++) {
      if (power[i] > power[i-1] && power[i] > power[i+1] && power[i] > power[strongestLow]*0.08) {
        low = i;
        break;
      }
    }
    const high = peak(Math.max(low+2,7), 15);
    const strength = clamp((rms - 0.004) * 18) ** 0.55;
    // Nasal murmur and closures have little upper-band energy. A lip seal is
    // estimated acoustically; it isn't a word- or phoneme-timestamp service.
    if (low <= 1 && power[high] < power[low] * 0.036 && crossings / count < 0.095) return REST;
    const hiss = clamp((crossings / count - 0.23) * 5);
    const open = clamp((frequencies[low] - 400) / 390);
    const spread = clamp((frequencies[high] - 1470) / 750);
    const vowel = strength * (1 - hiss);
    return {
      open: vowel * open,
      round: vowel * (1 - open) * (1 - spread),
      wide: vowel * (1 - open) * spread,
      teeth: strength * hiss,
    };
  };
}
