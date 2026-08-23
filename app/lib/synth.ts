import type { Reading } from './phonology';

export const RESEARCH_SAMPLE_RATE = 48_000;
export const RESEARCH_VOICE_VERSION = 'v6-source-filter-clarity';

const formants: Record<string, [number, number, number, number]> = {
  i: [310, 2550, 3300, 4050], y: [320, 1850, 2750, 3900], ɨ: [390, 1650, 2650, 3900], ɯ: [390, 1250, 2450, 3850],
  e: [430, 2250, 3000, 3950], ɛ: [620, 1900, 2800, 3900], ə: [540, 1500, 2500, 3800], ʌ: [650, 1250, 2500, 3800],
  a: [900, 1550, 2650, 3850], ɑ: [760, 1200, 2550, 3800], ɒ: [620, 1050, 2500, 3800], ɐ: [720, 1450, 2600, 3850],
  o: [500, 950, 2500, 3800], u: [360, 850, 2350, 3700], œ: [570, 1750, 2700, 3850], ø: [430, 1850, 2750, 3900],
};

const vowelPattern = /[iyɨɯeɛəʌaɑɒɐouœø]/g;
type FormantSet = [number, number, number, number];
type ResonatorState = { previous: number; previousPrevious: number };
type ConsonantKind = 'stop' | 'affricate' | 'fricative' | 'nasal' | 'liquid' | 'glide' | 'none';
type ConsonantFeature = { kind: ConsonantKind; onset: number; noiseCenter?: number; aspirated?: boolean; voiced?: boolean; locus?: FormantSet };

// 这是用于区分音素的工程参数，不是经实验验证的南宋声学重建。按最长声母优先匹配，
// 让爆破／塞擦、发音部位、送气与浊音拥有不同的时值、噪声和元音过渡。
const consonantFeatures: Array<[string, ConsonantFeature]> = [
  ['tɕʰ', { kind: 'affricate', onset: 0.085, noiseCenter: 4700, aspirated: true, locus: [330, 2350, 3200, 4000] }],
  ['tʂʰ', { kind: 'affricate', onset: 0.082, noiseCenter: 3000, aspirated: true, locus: [390, 1700, 2750, 3800] }],
  ['tsʰ', { kind: 'affricate', onset: 0.078, noiseCenter: 6500, aspirated: true, locus: [350, 1850, 2900, 3900] }],
  ['tɕ', { kind: 'affricate', onset: 0.071, noiseCenter: 4700, locus: [330, 2350, 3200, 4000] }],
  ['tʂ', { kind: 'affricate', onset: 0.069, noiseCenter: 3000, locus: [390, 1700, 2750, 3800] }],
  ['ts', { kind: 'affricate', onset: 0.066, noiseCenter: 6500, locus: [350, 1850, 2900, 3900] }],
  ['dʑ', { kind: 'affricate', onset: 0.064, noiseCenter: 4500, voiced: true, locus: [330, 2350, 3200, 4000] }],
  ['dʐ', { kind: 'affricate', onset: 0.063, noiseCenter: 2850, voiced: true, locus: [390, 1700, 2750, 3800] }],
  ['dz', { kind: 'affricate', onset: 0.061, noiseCenter: 6100, voiced: true, locus: [350, 1850, 2900, 3900] }],
  ['pʰ', { kind: 'stop', onset: 0.066, noiseCenter: 900, aspirated: true, locus: [520, 760, 2400, 3700] }],
  ['tʰ', { kind: 'stop', onset: 0.064, noiseCenter: 3600, aspirated: true, locus: [420, 1850, 2850, 3900] }],
  ['kʰ', { kind: 'stop', onset: 0.065, noiseCenter: 2300, aspirated: true, locus: [380, 2200, 3000, 3900] }],
  ['q', { kind: 'stop', onset: 0.058, noiseCenter: 2700, locus: [430, 1550, 2700, 3800] }],
  ['p', { kind: 'stop', onset: 0.054, noiseCenter: 900, locus: [520, 760, 2400, 3700] }],
  ['b', { kind: 'stop', onset: 0.052, noiseCenter: 800, voiced: true, locus: [520, 760, 2400, 3700] }],
  ['t', { kind: 'stop', onset: 0.053, noiseCenter: 3600, locus: [420, 1850, 2850, 3900] }],
  ['d', { kind: 'stop', onset: 0.051, noiseCenter: 3400, voiced: true, locus: [420, 1850, 2850, 3900] }],
  ['k', { kind: 'stop', onset: 0.054, noiseCenter: 2300, locus: [380, 2200, 3000, 3900] }],
  ['ɡ', { kind: 'stop', onset: 0.052, noiseCenter: 2200, voiced: true, locus: [380, 2200, 3000, 3900] }],
  ['ɕ', { kind: 'fricative', onset: 0.078, noiseCenter: 4800, locus: [330, 2350, 3200, 4000] }],
  ['ʑ', { kind: 'fricative', onset: 0.075, noiseCenter: 4400, voiced: true, locus: [330, 2350, 3200, 4000] }],
  ['ʂ', { kind: 'fricative', onset: 0.076, noiseCenter: 2900, locus: [390, 1700, 2750, 3800] }],
  ['ʐ', { kind: 'fricative', onset: 0.073, noiseCenter: 2700, voiced: true, locus: [390, 1700, 2750, 3800] }],
  ['s', { kind: 'fricative', onset: 0.076, noiseCenter: 6900, locus: [350, 1850, 2900, 3900] }],
  ['z', { kind: 'fricative', onset: 0.072, noiseCenter: 6200, voiced: true, locus: [350, 1850, 2900, 3900] }],
  ['x', { kind: 'fricative', onset: 0.072, noiseCenter: 1700, locus: [480, 1450, 2600, 3800] }],
  ['ɣ', { kind: 'fricative', onset: 0.069, noiseCenter: 1550, voiced: true, locus: [480, 1450, 2600, 3800] }],
  ['f', { kind: 'fricative', onset: 0.068, noiseCenter: 1100, locus: [520, 900, 2450, 3700] }],
  ['h', { kind: 'fricative', onset: 0.056, noiseCenter: 900, locus: [540, 1500, 2500, 3800] }],
  ['m', { kind: 'nasal', onset: 0.052, voiced: true, locus: [330, 1050, 2200, 3600] }],
  ['n', { kind: 'nasal', onset: 0.050, voiced: true, locus: [350, 1750, 2700, 3800] }],
  ['ŋ', { kind: 'nasal', onset: 0.050, voiced: true, locus: [360, 2250, 2900, 3900] }],
  ['ȵ', { kind: 'nasal', onset: 0.050, voiced: true, locus: [340, 2300, 3100, 4000] }],
  ['ɳ', { kind: 'nasal', onset: 0.050, voiced: true, locus: [360, 1600, 2600, 3800] }],
  ['l', { kind: 'liquid', onset: 0.040, voiced: true, locus: [400, 1750, 2700, 3900] }],
  ['j', { kind: 'glide', onset: 0.036, voiced: true, locus: [300, 2450, 3200, 4050] }],
  ['w', { kind: 'glide', onset: 0.036, voiced: true, locus: [350, 850, 2350, 3700] }],
  ['ɥ', { kind: 'glide', onset: 0.036, voiced: true, locus: [320, 1850, 2750, 3900] }],
  ['ʋ', { kind: 'glide', onset: 0.038, voiced: true, locus: [400, 1050, 2450, 3750] }],
  ['ʔ', { kind: 'stop', onset: 0.036, noiseCenter: 700 }],
];
const codaLoci: Partial<Record<string, FormantSet>> = {
  m: [330, 1050, 2200, 3600], n: [350, 1750, 2700, 3800], ŋ: [360, 2250, 2900, 3900],
  p: [520, 760, 2400, 3700], t: [420, 1850, 2850, 3900], k: [380, 2200, 3000, 3900],
};
const formantBandwidths: FormantSet = [82, 110, 155, 220];
const fallbackFeature: ConsonantFeature = { kind: 'none', onset: 0.026 };

function featureFor(initial: string) {
  return consonantFeatures.find(([segment]) => initial.startsWith(segment))?.[1] ?? fallbackFeature;
}

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

// A compact source-filter oscillator: an asymmetric glottal-flow pulse feeds a
// cascade of time-varying formant resonators. This is an engineering model in
// the spirit of classic formant synthesis, not a reconstruction of a historic
// speaker's vocal tract.
function glottalFlow(cycle: number) {
  const openingEnd = 0.56;
  const closingEnd = 0.78;
  if (cycle < openingEnd) return 0.5 - 0.5 * Math.cos(Math.PI * cycle / openingEnd);
  if (cycle < closingEnd) return Math.cos(Math.PI / 2 * (cycle - openingEnd) / (closingEnd - openingEnd));
  return 0;
}

function resonate(input: number, frequency: number, bandwidth: number, sampleRate: number, state: ResonatorState) {
  const radius = Math.exp(-Math.PI * bandwidth / sampleRate);
  const output = (1 - radius) * input
    + 2 * radius * Math.cos(Math.PI * 2 * frequency / sampleRate) * state.previous
    - radius * radius * state.previousPrevious;
  state.previousPrevious = state.previous;
  state.previous = output;
  return output;
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
  const entering = reading.position.endsWith('入');
  const vowels = ipa.match(vowelPattern) ?? ['ə'];
  const coda = ipa.match(/[mnŋptk]$/)?.[0] ?? '';
  const first = formants[vowels[0]] ?? formants.ə;
  const last = formants[vowels[vowels.length - 1]] ?? first;
  const initial = ipa.slice(0, Math.max(0, ipa.search(vowelPattern)));
  const feature = featureFor(initial);
  const onsetSeconds = feature.onset;
  const onset = Math.min(Math.floor(onsetSeconds * sampleRate), Math.floor(duration * sampleRate * 0.3));
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const output = new Float32Array(length);
  const voiceTrack = new Float32Array(length);
  const consonantTrack = new Float32Array(length);
  const random = randomGenerator(seedFrom(`${reading.character}:${reading.ipa}:${index}`));
  let phase = 0;
  let previousGlottalFlow = 0;
  const resonators: ResonatorState[] = Array.from({ length: 4 }, () => ({ previous: 0, previousPrevious: 0 }));
  let noiseLow = 0;
  let noiseHigh = 0;
  const noiseCenter = feature.noiseCenter ?? 1800;
  const noiseHalfWidth = Math.max(300, noiseCenter * (feature.kind === 'affricate' ? 0.20 : feature.kind === 'fricative' ? 0.34 : 0.38));
  const lowAlpha = 1 - Math.exp(-Math.PI * 2 * Math.max(120, noiseCenter - noiseHalfWidth) / sampleRate);
  const highAlpha = 1 - Math.exp(-Math.PI * 2 * Math.min(sampleRate * 0.46, noiseCenter + noiseHalfWidth) / sampleRate);

  for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
    const overall = sampleIndex / Math.max(1, length - 1);
    const vowelPosition = Math.max(0, (sampleIndex - onset) / Math.max(1, length - onset - 1));
    const attack = Math.min(1, sampleIndex / Math.max(1, Math.floor(0.022 * sampleRate)));
    const release = Math.min(1, (length - 1 - sampleIndex) / Math.max(1, Math.floor(0.024 * sampleRate)));
    const envelope = Math.sin(Math.min(1, attack) * Math.PI / 2) * Math.sin(Math.min(1, release) * Math.PI / 2);
    const preVoicing = feature.kind === 'nasal' ? 0.20
      : feature.kind === 'liquid' || feature.kind === 'glide' ? 0.12
        : feature.voiced ? 0.035 : 0;
    const vowelEnvelope = sampleIndex < onset ? preVoicing : Math.min(1, (sampleIndex - onset) / Math.max(1, 0.016 * sampleRate));
    const seconds = sampleIndex / sampleRate;
    // 固定的微幅基频／振幅扰动用于减少机械蜂鸣；幅度刻意保持很小，不承担语气表达。
    const pitch = tonePitch(reading, overall) * (1 + 0.0032 * Math.sin(Math.PI * 2 * 5.1 * seconds + index * 0.73) + 0.0012 * Math.sin(Math.PI * 2 * 3.2 * seconds + index));
    phase += Math.PI * 2 * pitch / sampleRate;
    let currentFormants = first.map((frequency, formantIndex) => interpolate(frequency, last[formantIndex], vowelPosition)) as FormantSet;
    const transitionEnd = onset + Math.floor(0.052 * sampleRate);
    if (feature.locus && sampleIndex < transitionEnd) {
      const transitionStart = Math.floor(onset * 0.35);
      const transition = Math.max(0, Math.min(1, (sampleIndex - transitionStart) / Math.max(1, transitionEnd - transitionStart)));
      currentFormants = currentFormants.map((frequency, formantIndex) => interpolate(feature.locus![formantIndex], frequency, transition)) as FormantSet;
    }
    const codaLocus = codaLoci[coda];
    const codaTransitionStart = entering ? 0.62 : 0.73;
    let codaDamping = 1;
    if (codaLocus && overall > codaTransitionStart) {
      const codaTransition = Math.min(1, (overall - codaTransitionStart) / (1 - codaTransitionStart));
      const locusBlend = codaTransition * (entering ? 0.62 : 0.82);
      currentFormants = currentFormants.map((frequency, formantIndex) => interpolate(frequency, codaLocus[formantIndex], locusBlend)) as FormantSet;
      codaDamping = interpolate(1, entering ? 0.18 : 0.62, Math.pow(codaTransition, 1.15));
    }
    const cycle = (phase / (Math.PI * 2)) % 1;
    const flow = glottalFlow(cycle);
    // Differentiating glottal flow approximates lip radiation. Scaling by the
    // period keeps the excitation level stable while the lexical tone moves F0.
    const excitation = (flow - previousGlottalFlow) * sampleRate / pitch;
    previousGlottalFlow = flow;
    let filteredVoice = excitation * 0.22;
    for (let formantIndex = 0; formantIndex < resonators.length; formantIndex += 1) {
      filteredVoice = resonate(filteredVoice, currentFormants[formantIndex], formantBandwidths[formantIndex], sampleRate, resonators[formantIndex]);
    }

    let voiced = filteredVoice * 90;
    if (/[mnŋ]/.test(coda) && overall > 0.76) {
      const nasalBlend = Math.min(0.78, (overall - 0.76) / 0.24 * 0.78);
      const nasalVoice = Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.16;
      voiced = interpolate(voiced, nasalVoice, nasalBlend);
    }

    const noise = random();
    noiseLow += highAlpha * (noise - noiseLow);
    noiseHigh += lowAlpha * (noise - noiseHigh);
    // 两个一阶低通的差形成稳定噪声带，比以正弦乘白噪声更少金属感。
    const shapedNoise = (noiseLow - noiseHigh) * 1.18;
    let consonant = 0;
    if (sampleIndex < onset) {
      const onsetPosition = sampleIndex / Math.max(1, onset);
      const onsetBell = Math.sin(onsetPosition * Math.PI);
      if (feature.kind === 'fricative') consonant = shapedNoise * 0.23 * onsetBell + (feature.voiced ? Math.sin(phase) * 0.050 : 0);
      if (feature.kind === 'stop') {
        if (feature.voiced && onsetPosition < 0.56) consonant += Math.sin(phase) * 0.1;
        if (onsetPosition > 0.58 && onsetPosition < 0.68) consonant += shapedNoise * 0.66 * Math.sin((onsetPosition - 0.58) / 0.10 * Math.PI);
        if (feature.aspirated && onsetPosition >= 0.66) consonant += shapedNoise * 0.14 * Math.sin((onsetPosition - 0.66) / 0.34 * Math.PI);
      }
      if (feature.kind === 'affricate') {
        if (feature.voiced && onsetPosition < 0.32) consonant += Math.sin(phase) * 0.08;
        if (onsetPosition > 0.34 && onsetPosition < 0.45) consonant += shapedNoise * 0.58 * Math.sin((onsetPosition - 0.34) / 0.11 * Math.PI);
        if (onsetPosition > 0.42) consonant += shapedNoise * (feature.aspirated ? 0.25 : 0.19) * Math.sin((onsetPosition - 0.42) / 0.58 * Math.PI);
      }
      if (feature.kind === 'nasal') consonant = Math.sin(phase) * 0.16 + Math.sin(phase * 2) * 0.04;
      if (feature.kind === 'liquid' || feature.kind === 'glide') consonant = Math.sin(phase) * 0.11;
    }
    const shimmer = 0.994 + 0.006 * Math.sin(Math.PI * 2 * 4.3 * seconds + index * 0.37);
    const breath = noise * 0.0012 * vowelEnvelope;
    voiceTrack[sampleIndex] = voiced * 0.72 * shimmer * vowelEnvelope * envelope * codaDamping;
    consonantTrack[sampleIndex] = (consonant + breath) * envelope;
  }

  // Formant filters can have very different gains at different F0/vowel
  // combinations. Equalise only the stable vowel track before mixing the
  // consonant track so stops and fricatives stay audible without making some
  // vowels collapse into a whisper.
  const coreStart = Math.min(length - 1, onset + Math.floor(0.070 * sampleRate));
  const coreEnd = Math.max(coreStart + 1, Math.floor(length * (entering ? 0.58 : 0.76)));
  let coreSquareSum = 0;
  for (let sampleIndex = coreStart; sampleIndex < coreEnd; sampleIndex += 1) coreSquareSum += voiceTrack[sampleIndex] * voiceTrack[sampleIndex];
  const coreRms = Math.sqrt(coreSquareSum / Math.max(1, coreEnd - coreStart));
  const voiceGain = Math.max(0.55, Math.min(18, 0.18 / Math.max(0.001, coreRms)));
  for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
    const limitedConsonant = Math.tanh(consonantTrack[sampleIndex] / 0.38) * 0.38;
    output[sampleIndex] = voiceTrack[sampleIndex] * voiceGain + limitedConsonant;
  }

  // 入聲提前向 /p t k/（或候選喉塞）閉鎖，末段完全靜音且不除阻。
  // 時值與收尾形態只取現代吳、粵入聲作比較參照，不宣稱等同南宋實際音值。
  if (entering) {
    const closure = Math.min(length, Math.floor(0.052 * sampleRate));
    const silentTail = Math.min(closure, Math.floor(0.014 * sampleRate));
    const closingSamples = Math.max(1, closure - silentTail);
    for (let i = 0; i < closure; i += 1) {
      const outputIndex = length - closure + i;
      if (i >= closingSamples) output[outputIndex] = 0;
      else {
        const position = i / closingSamples;
        output[outputIndex] *= Math.pow(Math.cos(position * Math.PI / 2), 1.35);
      }
    }
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
  const enteringSilences: Array<[number, number]> = [];
  let cursor = Math.floor(0.04 * sampleRate);
  syllables.forEach((samples, index) => {
    output.set(samples, cursor);
    if (readings[index].position.endsWith('入')) {
      const end = cursor + samples.length;
      enteringSilences.push([end - Math.floor(0.014 * sampleRate), end]);
    }
    cursor += samples.length + Math.floor(gapFor(index) / 1000 * sampleRate);
  });

  // 去直流、抑制超高频毛刺，并轻推 2 kHz 以上的清晰度频段；48 kHz 采样率不变。
  let previousInput = 0;
  let highPassed = 0;
  let lowPassed = 0;
  let presenceLow = 0;
  const lowPassAlpha = 1 - Math.exp(-Math.PI * 2 * 11_500 / sampleRate);
  const presenceAlpha = 1 - Math.exp(-Math.PI * 2 * 2_000 / sampleRate);
  for (let index = 0; index < output.length; index += 1) {
    const current = output[index];
    highPassed = current - previousInput + 0.992 * highPassed;
    previousInput = current;
    lowPassed += lowPassAlpha * (highPassed - lowPassed);
    presenceLow += presenceAlpha * (lowPassed - presenceLow);
    output[index] = lowPassed + (lowPassed - presenceLow) * 0.10;
  }
  // 後級濾波會在零值尾端留下極短殘響；重新置零，確保入聲閉鎖後沒有拖尾或釋放聲。
  enteringSilences.forEach(([start, end]) => output.fill(0, start, end));

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
