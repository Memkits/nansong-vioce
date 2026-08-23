import assert from 'node:assert/strict';
import { prosodyOf, readingsFor } from '../app/lib/phonology.ts';
import { RESEARCH_SAMPLE_RATE, renderResearchVoice, waveBlob } from '../app/lib/synth.ts';

const text = '春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。';
const readings = readingsFor(text, 'tongyu');
assert.ok(readings.every((reading) => reading.confidence === 'B'), '宋代文人通语基线应标为 B');
assert.equal(readings.length, 20);
assert.ok(readings.find((reading) => reading.character === '不')?.position.endsWith('入'));
assert.ok(readings.find((reading) => reading.character === '覺')?.position.endsWith('入'));

const endings = ['曉', '鳥', '聲', '少'].map((character) => prosodyOf(readings.findLast((reading) => reading.character === character)));
assert.equal(endings[0].pingshui, '上聲十七篠');
assert.equal(endings[1].pingshui, '上聲十七篠');
assert.equal(endings[2].pingshui, '下平八庚');
assert.equal(endings[3].pingshui, '上聲十七篠');

const durationFor = (reading) => reading.position.endsWith('入') ? 0.39 : 0.63;
const gapFor = (index) => [4, 9, 14, 19].includes(index) ? 270 : 40;
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

const entering = readings.find((reading) => reading.position.endsWith('入'));
assert.ok(entering);
const enteringAudio = renderResearchVoice([entering], () => 0.39, () => 0);
const enteringEnd = Math.floor((0.04 + 0.39) * RESEARCH_SAMPLE_RATE);
const silentTail = enteringAudio.slice(enteringEnd - Math.floor(0.012 * RESEARCH_SAMPLE_RATE), enteringEnd);
assert.ok(silentTail.every((sample) => sample === 0), '入声末尾必须保留无释放闭锁静音');

console.log(`research verification passed: ${readings.length} syllables, ${(first.length / RESEARCH_SAMPLE_RATE).toFixed(2)} s, peak ${peak.toFixed(3)}`);
