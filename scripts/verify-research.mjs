import assert from 'node:assert/strict';
import { prosodyOf, readingsFor } from '../app/lib/phonology.ts';
import { RESEARCH_SAMPLE_RATE, RESEARCH_VOICE_VERSION, renderResearchVoice, waveBlob } from '../app/lib/synth.ts';

const rms = (samples) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, samples.length));
const windowOf = (samples, start, end) => samples.slice(Math.floor(start * RESEARCH_SAMPLE_RATE), Math.floor(end * RESEARCH_SAMPLE_RATE));
const differenceRms = (samples) => {
  let squareSum = 0;
  for (let index = 1; index < samples.length; index += 1) squareSum += (samples[index] - samples[index - 1]) ** 2;
  return Math.sqrt(squareSum / Math.max(1, samples.length - 1));
};
const spectralCentroid = (samples) => {
  let energySum = 0;
  let weightedSum = 0;
  for (let frequency = 200; frequency <= 8_000; frequency += 100) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const phase = Math.PI * 2 * frequency * index / RESEARCH_SAMPLE_RATE;
      real += samples[index] * Math.cos(phase);
      imaginary -= samples[index] * Math.sin(phase);
    }
    const energy = real * real + imaginary * imaginary;
    energySum += energy;
    weightedSum += frequency * energy;
  }
  return weightedSum / Math.max(Number.EPSILON, energySum);
};
const renderCharacter = (character) => renderResearchVoice(readingsFor(character, 'tongyu'), () => 0.63, () => 0);

const text = '春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。';
const readings = readingsFor(text, 'tongyu');
assert.equal(RESEARCH_VOICE_VERSION, 'v6-source-filter-clarity');
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

// 声学代理指标只防止工程退步，不等于真实听辨或历史音值验证。
const labialStop = renderCharacter('巴');
const aspiratedLabialStop = renderCharacter('怕');
const alveolarStop = renderCharacter('都');
const velarStop = renderCharacter('家');
const stableLabialVowel = windowOf(labialStop, 0.18, 0.45);
const relativeRoughness = differenceRms(stableLabialVowel) / rms(stableLabialVowel);
assert.ok(relativeRoughness < 0.121, `稳态元音高频粗糙度回退：${relativeRoughness.toFixed(3)}`);

const unaspiratedTail = rms(windowOf(labialStop, 0.084, 0.092));
const aspiratedTail = rms(windowOf(aspiratedLabialStop, 0.084, 0.092));
assert.ok(aspiratedTail > 0.01 && aspiratedTail > unaspiratedTail * 100, '送气段必须与不送气闭锁明显分离');

const burstWindow = (samples) => windowOf(samples, 0.070, 0.079);
const labialCentroid = spectralCentroid(burstWindow(labialStop));
const velarCentroid = spectralCentroid(burstWindow(velarStop));
const alveolarCentroid = spectralCentroid(burstWindow(alveolarStop));
assert.ok(labialCentroid + 900 < velarCentroid && velarCentroid + 700 < alveolarCentroid,
  `塞音爆破频谱次序异常：${labialCentroid.toFixed(0)} / ${velarCentroid.toFixed(0)} / ${alveolarCentroid.toFixed(0)} Hz`);

for (const character of ['沙', '叉', '花']) {
  const onsetRms = rms(windowOf(renderCharacter(character), 0.050, 0.105));
  assert.ok(onsetRms > 0.02, `${character} 的摩擦／塞擦起始过弱：${onsetRms.toFixed(3)}`);
}
for (const character of ['巴', '都', '家', '搭', '發', '格']) {
  const vowelRms = rms(windowOf(renderCharacter(character), 0.18, 0.36));
  assert.ok(vowelRms > 0.18 && vowelRms < 0.29, `${character} 的稳态元音响度异常：${vowelRms.toFixed(3)}`);
}

console.log(`research verification passed: ${readings.length} syllables, ${(first.length / RESEARCH_SAMPLE_RATE).toFixed(2)} s, peak ${peak.toFixed(3)}, roughness ${relativeRoughness.toFixed(3)}, stops ${labialCentroid.toFixed(0)}/${velarCentroid.toFixed(0)}/${alveolarCentroid.toFixed(0)} Hz`);
