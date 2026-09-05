import type { Reading } from './phonology';

export const IPA_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const IPA_MODEL_REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
export const IPA_VOICE = 'af_heart';
export const IPA_SAMPLE_RATE = 24_000;
export const IPA_EXPERIMENT_VERSION = 'v1-kokoro-phoneme-probe';
export const IPA_MAX_CHARACTERS = 40;

// Audited against v1.0-ONNX/tokenizer.json. These are token identities, NOT
// evidence that a voice learned every phone. Compare the runtime IDs as well:
// the upstream tokenizer silently removes out-of-vocabulary characters.
export const IPA_TOKEN_IDS: Readonly<Record<string, number>> = {
  ' ': 16, '̃': 17, 'ʣ': 18, 'ʥ': 19, 'ʦ': 20, 'ʨ': 21,
  a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51,
  j: 52, k: 53, l: 54, m: 55, n: 56, o: 57, p: 58, q: 59,
  r: 60, s: 61, t: 62, u: 63, v: 64, w: 65, x: 66, y: 67, z: 68,
  'ɑ': 69, 'ɐ': 70, 'ɒ': 71, 'æ': 72, 'β': 75, 'ɔ': 76, 'ɕ': 77,
  'ç': 78, 'ɖ': 80, 'ð': 81, 'ʤ': 82, 'ə': 83, 'ɚ': 85, 'ɛ': 86,
  'ɜ': 87, 'ɟ': 90, 'ɡ': 92, 'ɥ': 99, 'ɨ': 101, 'ɪ': 102, 'ʝ': 103,
  'ɯ': 110, 'ɰ': 111, 'ŋ': 112, 'ɳ': 113, 'ɲ': 114, 'ɴ': 115,
  'ø': 116, 'ɸ': 118, 'θ': 119, 'œ': 120, 'ɹ': 123, 'ɾ': 125,
  'ɻ': 126, 'ʁ': 128, 'ɽ': 129, 'ʂ': 130, 'ʃ': 131, 'ʈ': 132,
  'ʧ': 133, 'ʊ': 135, 'ʋ': 136, 'ʌ': 138, 'ɣ': 139, 'ɤ': 140,
  'χ': 142, 'ʎ': 143, 'ʒ': 147, 'ʔ': 148, 'ˈ': 156, 'ˌ': 157,
  'ː': 158, 'ʰ': 162, 'ʲ': 164,
};

export type IpaProbe = {
  character: string;
  sourceIpa: string;
  phonemes: string;
  ids: number[];
  tone: string;
  changes: string[];
  unsupported: string[];
};

export function probeReading(reading: Reading, allowApproximation = false): IpaProbe {
  const tone = reading.position.match(/[平上去入]$/)?.[0] ?? '待考';
  const changes: string[] = [];
  // Only the three n_song tone marks are removed. Do not strip nasalization,
  // syllabicity or arbitrary combining marks to make an input appear supported.
  let phonemes = reading.ipa.normalize('NFD').replace(/[\u0300\u0301\u030c]/g, '');
  if (phonemes !== reading.ipa.normalize('NFD')) changes.push('调号分离：本实验尚不控制平上去调形');
  const aliases: [string, string][] = [['tɕ', 'ʨ'], ['dʑ', 'ʥ'], ['ts', 'ʦ'], ['dz', 'ʣ']];
  for (const [from, to] of aliases) {
    if (phonemes.includes(from)) {
      phonemes = phonemes.replaceAll(from, to);
      changes.push(`${from} → ${to}（同一塞擦音的模型记号）`);
    }
  }
  if (allowApproximation) {
    for (const [from, to, reason] of [
      ['ʐ', 'ʒ', '发音部位近似，非等价'],
      ['ʑ', 'ʒ', '发音部位近似，非等价'],
      ['ˤ', '', '咽化未实现'],
    ]) {
      if (phonemes.includes(from)) {
        phonemes = phonemes.replaceAll(from, to);
        changes.push(`${from} → ${to || '∅'}（${reason}）`);
      }
    }
  }
  const unsupported = [...new Set(Array.from(phonemes).filter((phone) => IPA_TOKEN_IDS[phone] === undefined))];
  if (reading.source === 'unresolved' || !/[aeiouyɑɐɒæɔəɛɜɨɪɯøœʊʌɤ]/u.test(phonemes)) {
    unsupported.push('无可合成韵核／字音待考');
  }
  // English female voice style is an acoustic source, not a historical voice.
  // Stress makes isolated-syllable probes less likely to reduce their vowels.
  phonemes = `ˈ${phonemes}`;
  return {
    character: reading.character, sourceIpa: reading.ipa, phonemes, tone, changes, unsupported,
    ids: unsupported.length ? [] : [0, ...Array.from(phonemes, (phone) => IPA_TOKEN_IDS[phone]), 0],
  };
}

export function assertTokenIdentity(probe: IpaProbe, actual: Iterable<number | bigint>) {
  const ids = Array.from(actual, Number);
  if (probe.unsupported.length || ids.length !== probe.ids.length || ids.some((id, i) => id !== probe.ids[i])) {
    throw new Error(`「${probe.character}」音素被删改或词表不匹配；已停止，未降级为普通话。`);
  }
}

export function makeIpaBatches(probes: readonly IpaProbe[], gapsMs: readonly number[], groupSize: 1 | 4) {
  if (probes.length !== gapsMs.length || (groupSize !== 1 && groupSize !== 4)) throw new Error('无效连读计划');
  const batches: Array<{ probe: IpaProbe; start: number; end: number; gapMs: number }> = [];
  for (let start = 0; start < probes.length;) {
    let end = start;
    // Normal inter-character gaps are 40 ms; punctuation gaps are >=548 ms
    // in the supported rate range. Never cross a punctuation boundary.
    while (end + 1 < probes.length && end - start + 1 < groupSize && gapsMs[end] === 40) end++;
    const group = probes.slice(start, end + 1);
    const phonemes = group.map((p) => p.phonemes).join(' ');
    const unsupported = group.flatMap((p) => p.unsupported);
    batches.push({
      start, end, gapMs: gapsMs[end],
      probe: {
        character: group.map((p) => p.character).join(''),
        sourceIpa: group.map((p) => p.sourceIpa).join(' '),
        phonemes, tone: group.map((p) => p.tone).join(''),
        changes: group.flatMap((p) => p.changes.map((change) => `${p.character}：${change}`)),
        unsupported,
        ids: unsupported.length ? [] : [0, ...Array.from(phonemes, (p) => IPA_TOKEN_IDS[p]), 0],
      },
    });
    start = end + 1;
  }
  return batches;
}

/** Remove only near-digital silence; preserve low-energy aspiration and codas. */
export function prepareNeuralClip(input: Float32Array): Float32Array {
  if (!input.length || input.some((x) => !Number.isFinite(x))) throw new Error('模型返回无效波形');
  const peak = input.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (peak < 0.001) throw new Error('模型返回静音，不能计为成功发音');
  const threshold = peak * 0.001;
  let start = 0;
  let end = input.length;
  while (start < end && Math.abs(input[start]) < threshold) start++;
  while (end > start && Math.abs(input[end - 1]) < threshold) end--;
  const margin = Math.round(IPA_SAMPLE_RATE * 0.025);
  const clip = input.slice(Math.max(0, start - margin), Math.min(input.length, end + margin));
  // Only prevent clipping. Do not boost hiss, denoise away consonants, or
  // resample 24 kHz to 48 kHz and call it improved source quality.
  if (peak > 0.95) for (let i = 0; i < clip.length; i++) clip[i] *= 0.95 / peak;
  const fade = Math.min(48, Math.floor(clip.length / 2));
  for (let i = 0; i < fade; i++) {
    const gain = 0.5 - 0.5 * Math.cos(Math.PI * i / fade);
    clip[i] *= gain;
    clip[clip.length - 1 - i] *= gain;
  }
  return clip;
}

export function assembleNeuralClips(clips: readonly Float32Array[], gapsMs: readonly number[], initialGapMs: number) {
  if (clips.length !== gapsMs.length || ![initialGapMs, ...gapsMs].every((n) => Number.isFinite(n) && n >= 0 && n <= 120_000)) {
    throw new Error('无效停顿计划');
  }
  const gapFrames = gapsMs.map((ms) => Math.round(ms / 1000 * IPA_SAMPLE_RATE));
  const leading = Math.round(initialGapMs / 1000 * IPA_SAMPLE_RATE);
  const length = clips.reduce((n, clip, i) => n + clip.length + gapFrames[i], leading);
  if (length > IPA_SAMPLE_RATE * 300) throw new Error('实验音频超过五分钟上限');
  const output = new Float32Array(length);
  let offset = leading;
  clips.forEach((clip, i) => { output.set(clip, offset); offset += clip.length + gapFrames[i]; });
  return output;
}

export type IpaPrecision = 'fp32' | 'q8';
export type IpaWorkerRequest = { probes: IpaProbe[]; speed: number; gapsMs: number[]; initialGapMs: number; precision: IpaPrecision; grouped: boolean };
export type IpaWorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'chunk'; samples: Float32Array; index: number; backend: string }
  | { type: 'done'; samples: Float32Array; seconds: number; backend: string }
  | { type: 'error'; message: string };
