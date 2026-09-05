// Optional real inference check. Downloads only with --download, never in CI.
// Development artifacts only; no Python, MLX or Node is served to visitors.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { env } from '@huggingface/transformers';
import { createIpaEngine } from '../app/lib/ipa-engine.ts';
import { readingsFor } from '../app/lib/phonology.ts';
import { renderResearchVoice, waveBlob } from '../app/lib/synth.ts';
import { IPA_MODEL, IPA_MODEL_REVISION, IPA_VOICE, IPA_SAMPLE_RATE, probeReading, prepareNeuralClip, assembleNeuralClips, makeIpaBatches } from '../app/lib/neural-ipa.ts';
import { punctuationTiming, gapAfterReadingMs, leadingPunctuationPauseMs } from '../app/lib/timing.ts';

const output = resolve('outputs/ipa-smoke');
const modelDirectory = resolve(output, IPA_MODEL_REVISION);
const dtype = process.argv.includes('--fp32') ? 'fp32' : 'q8';
const modelFile = dtype === 'fp32' ? 'onnx/model.onnx' : 'onnx/model_quantized.onnx';
const files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', modelFile, `voices/${IPA_VOICE}.bin`];
for (const file of files) {
  const target = resolve(modelDirectory, file);
  try { await access(target); } catch {
    if (!process.argv.includes('--download')) throw new Error(`Missing ${file}. Add --download (q8 about 93 MB; fp32 about 327 MB).`);
    await mkdir(dirname(target), { recursive: true });
    console.log(`Downloading pinned ${file}`);
    const response = spawnSync('curl', ['--fail', '--location', '--show-error', '--retry', '2', '--max-time', '180',
      `https://huggingface.co/${IPA_MODEL}/resolve/${IPA_MODEL_REVISION}/${file}`, '--output', `${target}.partial`], { stdio: 'inherit' });
    if (response.status !== 0) throw new Error(`Download failed: ${file}`);
    await rename(`${target}.partial`, target);
  }
}
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.backends.onnx.wasm.numThreads = 1;
const device = process.argv.includes('--wasm') ? 'wasm' : 'cpu';
const bytes = await readFile(resolve(modelDirectory, `voices/${IPA_VOICE}.bin`));
const voiceData = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
async function wasmEngine() {
  // Use the actual web WASM runtime, not the native CPU provider with a label.
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(await readFile(resolve(modelDirectory, modelFile))), { executionProviders: ['wasm'] });
  const { model: { vocab } } = JSON.parse(await readFile(resolve(modelDirectory, 'tokenizer.json'), 'utf8'));
  return {
    async generate(probe, speed) {
      assert.deepEqual([0, ...Array.from(probe.phonemes, (p) => vocab[p]), 0], probe.ids);
      const count = probe.ids.length - 2;
      const result = await session.run({
        input_ids: new ort.Tensor('int64', BigInt64Array.from(probe.ids, BigInt), [1, probe.ids.length]),
        style: new ort.Tensor('float32', voiceData.slice(count * 256, (count + 1) * 256), [1, 256]),
        speed: new ort.Tensor('float32', Float32Array.of(speed), [1]),
      });
      return new Float32Array(result.waveform.data);
    },
    dispose: () => session.release(),
  };
}
const initStarted = performance.now();
const tts = device === 'wasm' ? await wasmEngine() : await createIpaEngine({ device, dtype, localModel: `${modelDirectory}/`, voiceData });
const summary = { model: IPA_MODEL, revision: IPA_MODEL_REVISION, voice: IPA_VOICE, device, dtype, modelInitMs: Math.round(performance.now() - initStarted), sampleRate: IPA_SAMPLE_RATE, unvalidated: true, generatedAt: new Date().toISOString(), measurements: [], grouped: [] };
const metrics = (pcm) => ({ seconds: pcm.length / IPA_SAMPLE_RATE, peak: pcm.reduce((m, x) => Math.max(m, Math.abs(x)), 0), rms: Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length) });
const matchLevel = (pcm) => {
  const { rms, peak } = metrics(pcm);
  const gain = Math.min(0.09 / Math.max(rms, 1e-6), 0.94 / Math.max(peak, 1e-6));
  return Float32Array.from(pcm, (x) => x * gain);
};
try {
  const text = '明月，清風。';
  const readings = readingsFor(text, 'tongyu');
  const timing = punctuationTiming(text);
  const gaps = readings.map((_, i) => gapAfterReadingMs(i, timing, 0.86));
  const batches = makeIpaBatches(readings.map((r) => probeReading(r)), gaps, 4);
  const groupedClips = [];
  for (const batch of batches) {
    const started = performance.now();
    const clip = prepareNeuralClip(await tts.generate(batch.probe, 0.86));
    const result = { label: batch.probe.character, inferenceMs: Math.round(performance.now() - started), ...metrics(clip) };
    summary.grouped.push(result); console.log('Grouped probe', result);
    groupedClips.push(clip);
  }
  const grouped = assembleNeuralClips(groupedClips, batches.map((b) => b.gapMs), leadingPunctuationPauseMs(timing, 0.86));
  await writeFile(resolve(output, `grouped-ipa-${device}-${dtype}-UNVALIDATED.wav`), Buffer.from(await waveBlob(matchLevel(grouped), IPA_SAMPLE_RATE).arrayBuffer()));
  const clips = [];
  for (const reading of readings) {
    const probe = probeReading(reading);
    assert.deepEqual(probe.unsupported, []);
    const started = performance.now();
    const clip = prepareNeuralClip(await tts.generate(probe, 0.86));
    const result = { label: reading.character, ipa: reading.ipa, phonemes: probe.phonemes, inferenceMs: Math.round(performance.now() - started), ...metrics(clip) };
    assert.ok(result.seconds > 0.05 && result.seconds < 12 && result.rms > 0.005);
    summary.measurements.push(result); console.log(result);
    clips.push(clip);
  }
  const neural = assembleNeuralClips(clips, gaps, leadingPunctuationPauseMs(timing, 0.86));
  await writeFile(resolve(output, `neural-ipa-${device}-${dtype}-UNVALIDATED.wav`), Buffer.from(await waveBlob(matchLevel(neural), IPA_SAMPLE_RATE).arrayBuffer()));
  const dsp = renderResearchVoice(readings, (r) => (r.position.endsWith('入') ? 0.39 : 0.63) / 0.86, (i) => gaps[i], 48_000);
  await writeFile(resolve(output, 'research-v7-reference.wav'), Buffer.from(await waveBlob(matchLevel(dsp), 48_000).arrayBuffer()));
  const pairClips = [];
  for (const ipa of ['pa', 'pʰa', 'ta', 'tʰa', 'ka', 'kʰa', 'am', 'an', 'aŋ', 'ap', 'at', 'ak']) {
    const probe = probeReading({ ...readings[0], ipa });
    const started = performance.now();
    const clip = prepareNeuralClip(await tts.generate(probe, 0.86));
    summary.measurements.push({ label: ipa, inferenceMs: Math.round(performance.now() - started), ...metrics(clip), sha256: createHash('sha256').update(new Uint8Array(clip.buffer)).digest('hex') });
    pairClips.push(clip); console.log(`Generated contrast probe /${ipa}/`);
  }
  assert.equal(new Set(summary.measurements.filter((m) => m.sha256).map((m) => m.sha256)).size, 12, 'Contrast probes must not collapse to identical waveforms');
  const pairs = assembleNeuralClips(pairClips, pairClips.map(() => 630), 0);
  await writeFile(resolve(output, `consonant-coda-probes-${device}-${dtype}-UNVALIDATED.wav`), Buffer.from(await waveBlob(matchLevel(pairs), IPA_SAMPLE_RATE).arrayBuffer()));
  summary.modelSha256 = createHash('sha256').update(await readFile(resolve(modelDirectory, modelFile))).digest('hex');
  summary.maxRss = process.resourceUsage().maxRSS;
  await writeFile(resolve(output, `report-${device}-${dtype}.json`), JSON.stringify(summary, null, 2));
  console.log(`Real ${device} inference passed. Samples: ${output}. Non-silence/different waveforms do not prove intelligibility or historical accuracy.`);
} finally { await tts.dispose(); }
