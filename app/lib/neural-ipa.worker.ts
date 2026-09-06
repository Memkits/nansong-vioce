import { createIpaEngine } from './ipa-engine';
import { env } from '@huggingface/transformers';
import {
  IPA_SAMPLE_RATE, IPA_MAX_CHARACTERS,
  prepareNeuralClip, assembleNeuralClips, makeIpaBatches,
  type IpaWorkerRequest, type IpaWorkerResponse, type IpaPrecision,
} from './neural-ipa';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<IpaWorkerRequest>) => void) | null;
  postMessage: (message: IpaWorkerResponse, transfer?: Transferable[]) => void;
};
// CDN deployments need neither COOP/COEP nor SharedArrayBuffer. Single-thread
// WASM also bounds CPU use on a laptop; WebGPU remains an optional accelerator.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
env.allowLocalModels = false;
let enginePromise: ReturnType<typeof createIpaEngine> | undefined;
let backend = 'WASM / q8';
let busy = false;
const cache = new Map<string, Float32Array>();
const progress = (message: string) => scope.postMessage({ type: 'progress', message });

async function engine(precision: IpaPrecision) {
  if (!enginePromise) enginePromise = (async () => {
    if ('gpu' in navigator) {
      try {
        const model = await createIpaEngine({ device: 'webgpu', dtype: precision, onProgress: progress });
        backend = `WebGPU / ${precision}`;
        return model;
      } catch {
        progress(`WebGPU 初始化失败，切换 WASM / ${precision}；不偷偷降低精度。`);
      }
    }
    backend = `WASM / ${precision}`;
    return createIpaEngine({ device: 'wasm', dtype: precision, onProgress: progress });
  })().catch((error) => { enginePromise = undefined; throw error; });
  return enginePromise;
}

scope.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    const { probes, speed, gapsMs, initialGapMs, precision, grouped } = data;
    if (precision !== 'fp32' && precision !== 'q8') throw new Error('无效模型精度');
    if (!probes.length || probes.length > IPA_MAX_CHARACTERS || !Number.isFinite(speed) || speed < 0.65 || speed > 1.15) {
      throw new Error(`实验仅支持 1–${IPA_MAX_CHARACTERS} 字及 0.65–1.15 倍语速`);
    }
    if (probes.some((p) => p.unsupported.length)) throw new Error('存在未支持音素，请先检查输入审计');
    progress('准备免训练女声模型；首次需要下载，文本与 IPA 不上传。');
    // Validate the silence budget before downloading or running a model.
    assembleNeuralClips(probes.map(() => new Float32Array()), gapsMs, initialGapMs);
    const batches = makeIpaBatches(probes, gapsMs, grouped ? 4 : 1);
    let tts = await engine(precision);
    const clips: Float32Array[] = [];
    for (const [index, { probe }] of batches.entries()) {
      progress(`${backend} · 生成第 ${index + 1}/${batches.length} 段「${probe.character}」 ${probe.phonemes}`);
      const key = `${probe.phonemes}/${speed}`;
      let clip = cache.get(key);
      if (!clip) {
        let audio: Float32Array;
        try { audio = await tts.generate(probe, speed); }
        catch (error) {
          if (!backend.startsWith('WebGPU')) throw error;
          progress('WebGPU 推理失败，切换 WASM 重试当前音节。');
          await tts.dispose();
          backend = `WASM / ${precision}`;
          enginePromise = createIpaEngine({ device: 'wasm', dtype: precision, onProgress: progress });
          tts = await enginePromise;
          audio = await tts.generate(probe, speed);
        }
        clip = prepareNeuralClip(audio);
        if (clip.length > IPA_SAMPLE_RATE * 12) throw new Error('模型单段输出异常过长');
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, clip);
      }
      clips.push(clip);
      // Transfer a copy including explicit silence, retaining the clean clip
      // for the final gap-correct download/replay. Do not wait for all 40 words.
      const chunk = assembleNeuralClips([clip], [batches[index].gapMs], index === 0 ? initialGapMs : 0);
      scope.postMessage({ type: 'chunk', samples: chunk, index, backend }, [chunk.buffer]);
    }
    const samples = assembleNeuralClips(clips, batches.map((b) => b.gapMs), initialGapMs);
    scope.postMessage({ type: 'done', samples, seconds: samples.length / IPA_SAMPLE_RATE, backend }, [samples.buffer]);
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
};
