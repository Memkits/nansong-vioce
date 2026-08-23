import assert from 'node:assert/strict';
import { prosodyOf, readingsFor } from '../app/lib/phonology.ts';
import { RESEARCH_SAMPLE_RATE, renderResearchVoice, waveBlob } from '../app/lib/synth.ts';

const text = '春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。';
const readings = readingsFor(text, 'linan');
assert.equal(readings.length, 20);
assert.ok(readings.find((reading) => reading.character === '不')?.position.endsWith('入'));
assert.ok(readings.find((reading) => reading.character === '覺')?.position.endsWith('入'));

const endings = ['曉', '鳥', '聲', '少'].map((character) => prosodyOf(readings.findLast((reading) => reading.character === character)));
assert.equal(endings[0].pingshui, '上聲十七篠');
assert.equal(endings[1].pingshui, '上聲十七篠');
assert.equal(endings[2].pingshui, '下平八庚');
assert.equal(endings[3].pingshui, '上聲十七篠');

const durationFor = (reading) => reading.position.endsWith('入') ? 0.25 : 0.38;
const gapFor = (index) => [4, 9, 14, 19].includes(index) ? 270 : 12;
const first = renderResearchVoice(readings, durationFor, gapFor);
const second = renderResearchVoice(readings, durationFor, gapFor);
assert.equal(first.length, second.length);
assert.deepEqual(first, second, '研究声音必须可复现');
assert.ok(first.every(Number.isFinite));

let peak = 0;
for (const sample of first) peak = Math.max(peak, Math.abs(sample));
assert.ok(peak > 0.3 && peak < 0.95, `异常峰值 ${peak}`);
const wav = await waveBlob(first).arrayBuffer();
assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
assert.equal(new DataView(wav).getUint32(24, true), RESEARCH_SAMPLE_RATE);

console.log(`research verification passed: ${readings.length} syllables, ${(first.length / RESEARCH_SAMPLE_RATE).toFixed(2)} s, peak ${peak.toFixed(3)}`);
