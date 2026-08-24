export const COMFORTABLE_SYLLABLE_MS = 630;
export const ENTERING_SYLLABLE_MS = 390;
export const INTER_CHARACTER_GAP_MS = 40;

export type PunctuationTiming = {
  beforeFirst: number;
  afterReading: Map<number, number>;
  totalMarks: number;
};

const hanPattern = /\p{Script=Han}/u;
const punctuationPattern = /\p{P}/u;

/**
 * Preserve punctuation timing even though the phonology layer intentionally
 * returns readings for Han characters only. Counts are per mark, so “……” is
 * two pauses rather than one sentence boundary.
 */
export function punctuationTiming(text: string): PunctuationTiming {
  const afterReading = new Map<number, number>();
  let readingIndex = -1;
  let beforeFirst = 0;
  let totalMarks = 0;

  for (const character of Array.from(text)) {
    if (hanPattern.test(character)) {
      readingIndex += 1;
      continue;
    }
    if (!punctuationPattern.test(character)) continue;

    totalMarks += 1;
    if (readingIndex < 0) beforeFirst += 1;
    else afterReading.set(readingIndex, (afterReading.get(readingIndex) ?? 0) + 1);
  }

  return { beforeFirst, afterReading, totalMarks };
}

export function punctuationPauseMs(rate: number) {
  return COMFORTABLE_SYLLABLE_MS / Math.max(0.01, rate);
}

export function gapAfterReadingMs(index: number, timing: PunctuationTiming, rate: number) {
  const punctuationCount = timing.afterReading.get(index) ?? 0;
  return punctuationCount > 0 ? punctuationCount * punctuationPauseMs(rate) : INTER_CHARACTER_GAP_MS;
}

export function leadingPunctuationPauseMs(timing: PunctuationTiming, rate: number) {
  return timing.beforeFirst * punctuationPauseMs(rate);
}
