import type { Reading } from './phonology';

export const RESEARCH_SAMPLE_RATE = 48_000;

const formants: Record<string, [number, number, number, number]> = {
  i: [310, 2550, 3300, 4050], y: [320, 1850, 2750, 3900], ɨ: [390, 1650, 2650, 3900], ɯ: [390, 1250, 2450, 3850],
  e: [430, 2250, 3000, 3950], ɛ: [620, 1900, 2800, 3900], ə: [540, 1500, 2500, 3800], ʌ: [650, 1250, 2500, 3800],
  a: [900, 1550, 2650, 3850], ɑ: [760, 1200, 2550, 3800], ɒ: [620, 1050, 2500, 3800], ɐ: [720, 1450, 2600, 3850],
  o: [500, 950, 2500, 3800], u: [360, 850, 2350, 3700], œ: [570, 1750, 2700, 3850], ø: [430, 1850, 2750, 3900],
};

const vowelPattern = /[iyɨɯeɛəʌaɑɒɐouœø]/g;
const fricativePattern = /^(?:s|z|ʂ|ʐ|ɕ|ʑ|x|ɣ|h|f|v|ʋ)/;
const stopPattern = /^(?:pʰ?|b|tʰ?|d|kʰ?|ɡ|q|tsʰ?|dz|tʂʰ?|dʐ|tɕʰ?|dʑ)/;
const nasalPattern = /^(?:m|n|ŋ|ɳ|ȵ)/;

function toneFree(ipa: string) {
  return ipa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

function seedFrom(text: string) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.codePointAt(0)!, 16777619);
  return value >>> 0;
}

function randomGenerator(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223 >>> 0;
    return state / 4294967296 * 2 - 1;
  };
}

function interpolate(a: number, b: number, position: number) {
  return a + (b - a) * position;
}

function tonePitch(reading: Reading, position: number) {
  if (reading.position.endsWith('入')) return 218 - position * 12;
  if (reading.tone === 3) return interpolate(185, 238, position);
  if (reading.tone === 4) return interpolate(238, 178, position);
  if (reading.tone === 2) return interpolate(195, 225, position);
  return interpolate(214, 196, position);
}

function syllableSamples(reading: Reading, duration: number, sampleRate: number, index: number) {
  const ipa = toneFree(reading.ipa);
  const vowels = ipa.match(vowelPattern) ?? ['ə'];
  const coda = ipa.match(/[mnŋptk]$/)?.[0] ?? '';
  const first = formants[vowels[0]] ?? formants.ə;
  const last = formants[vowels[vowels.length - 1]] ?? first;
  const initial = ipa.slice(0, Math.max(0, ipa.search(vowelPattern)));
  const isFricative = fricativePattern.test(initial);
  const isStop = stopPattern.test(initial);
  const isNasal = nasalPattern.test(initial);
  const onsetSeconds = isFricative ? 0.072 : isStop ? 0.052 : isNasal ? 0.045 : 0.026;
  const onset = Math.min(Math.floor(onsetSeconds * sampleRate), Math.floor(duration * sampleRate * 0.3));
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const output = new Float32Array(length);
  const random = randomGenerator(seedFrom(`${reading.character}:${reading.ipa}:${index}`));
  const lowestPitch = 175;
  const harmonicCount = Math.min(34, Math.floor(9_500 / lowestPitch));
  let phase = 0;
  let previousNoise = 0;

  for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
    const overall = sampleIndex / Math.max(1, length - 1);
    const vowelPosition = Math.max(0, (sampleIndex - onset) / Math.max(1, length - onset - 1));
    const attack = Math.min(1, sampleIndex / Math.max(1, Math.floor(0.022 * sampleRate)));
    const release = Math.min(1, (length - 1 - sampleIndex) / Math.max(1, Math.floor(0.035 * sampleRate)));
    const envelope = Math.sin(Math.min(1, attack) * Math.PI / 2) * Math.sin(Math.min(1, release) * Math.PI / 2);
    const vowelEnvelope = sampleIndex < onset ? (isNasal ? 0.32 : 0.05) : Math.min(1, (sampleIndex - onset) / Math.max(1, 0.018 * sampleRate));
    const pitch = tonePitch(reading, overall);
    phase += Math.PI * 2 * pitch / sampleRate;
    const currentFormants = first.map((frequency, formantIndex) => interpolate(frequency, last[formantIndex], vowelPosition));
    let voiced = 0;
    let weightTotal = 0;
    for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
      const frequency = pitch * harmonic;
      const spectralTilt = 1 / Math.pow(harmonic, 1.42);
      const resonance = currentFormants.reduce((sum, formant, formantIndex) => {
        const bandwidth = [95, 135, 180, 240][formantIndex];
        const distance = (frequency - formant) / bandwidth;
        return sum + [1.0, 0.72, 0.38, 0.18][formantIndex] * Math.exp(-0.5 * distance * distance);
      }, 0);
      const weight = spectralTilt * (0.2 + resonance * 2.4);
      voiced += Math.sin(phase * harmonic) * weight;
      weightTotal += weight;
    }
    voiced /= Math.max(0.001, weightTotal);
    if (/[mnŋ]/.test(coda) && overall > 0.76) {
      const nasalBlend = Math.min(0.78, (overall - 0.76) / 0.24 * 0.78);
      const nasalVoice = Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.16;
      voiced = interpolate(voiced, nasalVoice, nasalBlend);
    }

    const noise = random();
    const highNoise = noise - previousNoise * 0.82;
    previousNoise = noise;
    let consonant = 0;
    if (sampleIndex < onset) {
      const onsetPosition = sampleIndex / Math.max(1, onset);
      if (isFricative) consonant = highNoise * 0.2 * Math.sin(onsetPosition * Math.PI);
      if (isStop && onsetPosition > 0.62 && onsetPosition < 0.8) consonant = highNoise * 0.28 * Math.sin((onsetPosition - 0.62) / 0.18 * Math.PI);
      if (isNasal) consonant = Math.sin(phase) * 0.16;
    }
    const breath = highNoise * 0.012 * vowelEnvelope;
    output[sampleIndex] = (voiced * 0.72 * vowelEnvelope + consonant + breath) * envelope;
  }

  // 入聲的塞尾以短閉鎖結束，不添加現代普通話式舒展尾音。
  if (reading.position.endsWith('入')) {
    const closure = Math.min(length, Math.floor(0.018 * sampleRate));
    for (let i = 0; i < closure; i += 1) output[length - closure + i] *= 1 - i / closure;
  }
  return output;
}

export function renderResearchVoice(
  readings: Reading[],
  durationFor: (reading: Reading, index: number) => number,
  gapFor: (index: number) => number,
  sampleRate = RESEARCH_SAMPLE_RATE,
) {
  const syllables = readings.map((reading, index) => syllableSamples(reading, durationFor(reading, index), sampleRate, index));
  const totalLength = syllables.reduce((total, samples, index) => total + samples.length + Math.floor(gapFor(index) / 1000 * sampleRate), Math.floor(0.06 * sampleRate));
  const output = new Float32Array(totalLength);
  let cursor = Math.floor(0.04 * sampleRate);
  syllables.forEach((samples, index) => {
    output.set(samples, cursor);
    cursor += samples.length + Math.floor(gapFor(index) / 1000 * sampleRate);
  });

  let peak = 0;
  let squareSum = 0;
  let activeCount = 0;
  output.forEach((sample) => {
    peak = Math.max(peak, Math.abs(sample));
    if (Math.abs(sample) > 0.008) { squareSum += sample * sample; activeCount += 1; }
  });
  const rms = Math.sqrt(squareSum / Math.max(1, activeCount));
  const gain = Math.min(0.88 / Math.max(0.001, peak), 0.17 / Math.max(0.001, rms));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Math.tanh(output[index] * gain * 1.12) / Math.tanh(1.12);
  }
  return output;
}

export function waveBlob(samples: Float32Array, sampleRate = RESEARCH_SAMPLE_RATE) {
  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  const write = (offset: number, value: string) => Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true));
  return new Blob([wav], { type: 'audio/wav' });
}
