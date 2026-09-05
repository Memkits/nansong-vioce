import assert from 'node:assert/strict';
import { readingsFor } from '../app/lib/phonology.ts';
import { probeReading, assertTokenIdentity, prepareNeuralClip, assembleNeuralClips, makeIpaBatches, IPA_SAMPLE_RATE } from '../app/lib/neural-ipa.ts';
import { gapAfterReadingMs, leadingPunctuationPauseMs, punctuationTiming } from '../app/lib/timing.ts';

const base = readingsFor('明', 'tongyu')[0];
const probe = (ipa, approximate = false) => probeReading({ ...base, ipa }, approximate);
assert.equal(probe('mìŋ').phonemes, 'ˈmiŋ');
assert.equal(probe('tsʰá').phonemes, 'ˈʦʰa');
assert.equal(probe('dʑa').phonemes, 'ˈʥa');
assert.equal(probe('ɥɛt').phonemes, 'ˈɥɛt');
assert.equal(probe('ã').phonemes, 'ˈã', '不得误删鼻化');
assert.ok(probe('a̩').unsupported.includes('̩'), '不能删除未支持附加符号');
assert.ok(probe('ʐa').unsupported.includes('ʐ'));
assert.ok(probe('iˤk').unsupported.includes('ˤ'));
assert.equal(probe('ʐa', true).phonemes, 'ˈʒa');
assert.equal(probe('iˤk', true).phonemes, 'ˈik');
assert.ok(probe('iˤk', true).changes.some((s) => s.includes('咽化未实现')));
assert.ok(probe('🙂').unsupported.length);
assert.ok(probeReading({ ...base, source: 'unresolved' }).unsupported.length);
const nasal = probe('mìŋ');
assertTokenIdentity(nasal, nasal.ids.map(BigInt));
assert.throws(() => assertTokenIdentity(nasal, nasal.ids.slice(1)), /被删改/);
assert.throws(() => assertTokenIdentity(nasal, nasal.ids.map((n, i) => i === 2 ? n + 1 : n)), /被删改/);

const segment = Float32Array.from({ length: 2400 }, (_, i) => Math.sin(i * 2 * Math.PI * 200 / IPA_SAMPLE_RATE) * 0.25);
const padded = new Float32Array(4800); padded.set(segment, 1200);
const trimmed = prepareNeuralClip(padded);
assert.ok(trimmed.length > segment.length && trimmed.length < padded.length);
assert.ok(trimmed.every(Number.isFinite));
assert.throws(() => prepareNeuralClip(new Float32Array(100)), /静音/);
assert.throws(() => prepareNeuralClip(Float32Array.of(NaN)), /无效/);
assert.ok(prepareNeuralClip(Float32Array.from(segment, (n) => n * 8)).every((n) => Math.abs(n) <= 0.951));

const punctuation = punctuationTiming('，明……月!');
const gaps = [0, 1].map((i) => gapAfterReadingMs(i, punctuation, 1));
const leading = leadingPunctuationPauseMs(punctuation, 1);
const samples = assembleNeuralClips([segment, segment], gaps, leading);
assert.equal(samples.length, 4800 + Math.round(IPA_SAMPLE_RATE * (0.63 + 1.26 + 0.63)));
assert.ok(samples.slice(0, IPA_SAMPLE_RATE * 0.63).every((n) => n === 0));
assert.ok(samples.slice(IPA_SAMPLE_RATE * 0.63 + segment.length, IPA_SAMPLE_RATE * (0.63 + 1.26) + segment.length).every((n) => n === 0));
assert.throws(() => assembleNeuralClips([segment], [], 0), /无效/);
assert.throws(() => assembleNeuralClips([segment], [NaN], 0), /无效/);
assert.throws(() => assembleNeuralClips([segment, segment], [120_000, 120_000], 120_000), /五分钟/);
const streamingPieces = [segment, segment].map((clip, i) => assembleNeuralClips([clip], [gaps[i]], i ? 0 : leading));
assert.deepEqual(Float32Array.from(streamingPieces.flatMap((p) => Array.from(p))), samples, '流式片段和无缓冲下载的计划静音必须一致');
const four = readingsFor('明月清風', 'tongyu').map((r) => probeReading(r));
const oneBatch = makeIpaBatches(four, [40, 40, 40, 630], 4);
assert.equal(oneBatch.length, 1);
assert.equal(oneBatch[0].probe.phonemes, four.map((p) => p.phonemes).join(' '));
assertTokenIdentity(oneBatch[0].probe, [0, ...four.flatMap((p, i) => [...(i ? [16] : []), ...p.ids.slice(1, -1)]), 0]);
assert.equal(makeIpaBatches(four, [40, 630, 40, 630], 4).length, 2, '连读不能跨标点');
assert.equal(makeIpaBatches(four, [40, 40, 40, 630], 1).length, 4);
assert.equal(makeIpaBatches([...four, ...four], Array(8).fill(40), 4).length, 2, '最多四字一组');
assert.throws(() => makeIpaBatches(four, [], 4), /无效/);
// Preserve source distinctions for future tone control. These checks do NOT
// assert that the current model renders tone: the limitation is reported below.
const toneCollisions = [];
for (const text of ['相想', '衣意', '古故']) {
  const pair = readingsFor(text, 'tongyu').map((r) => probeReading(r));
  assert.ok(pair.every((p) => p.unsupported.length === 0));
  assert.notEqual(pair[0].sourceIpa, pair[1].sourceIpa, `${text} 原拟音必须可区分`);
  assert.notEqual(pair[0].tone, pair[1].tone, `${text} 原调类不可丢失`);
  const batch = makeIpaBatches(pair, [40, 630], 4)[0].probe;
  assert.equal(batch.tone, pair.map((p) => p.tone).join(''));
  if (JSON.stringify(pair[0].ids) === JSON.stringify(pair[1].ids)) toneCollisions.push(text);
}
if (toneCollisions.length) console.warn(`KNOWN LIMITATION (not fixed): tone-distinct inputs collapse for ${toneCollisions.join(', ')}. Passing guards are not a pronunciation acceptance test.`);
for (const text of ['言元', '六力', '先宣']) {
  const pair = readingsFor(text, 'tongyu').map((r) => probeReading(r));
  assert.ok(pair.every((p) => p.unsupported.length === 0));
  assert.notDeepEqual(pair[0].ids, pair[1].ids, `${text} 音段区别不能在模型输入中丢失`);
  pair.forEach((p) => assertTokenIdentity(p, p.ids.map(BigInt)));
}
console.log('IPA audit, explicit approximation, token identity, waveform guards and punctuation tests passed. Not a listening/phonology validation.');
