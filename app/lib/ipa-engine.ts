import { AutoTokenizer, StyleTextToSpeech2Model, Tensor } from '@huggingface/transformers';
import { IPA_MODEL, IPA_MODEL_REVISION, IPA_VOICE, assertTokenIdentity, type IpaProbe } from './neural-ipa.ts';

export type IpaEngineOptions = {
  device: 'webgpu' | 'wasm' | 'cpu';
  dtype?: 'q8' | 'fp32';
  localModel?: string;
  voiceData?: Float32Array;
  onProgress?: (message: string) => void;
};

async function loadVoice(): Promise<Float32Array> {
  const url = `https://huggingface.co/${IPA_MODEL}/resolve/${IPA_MODEL_REVISION}/voices/${IPA_VOICE}.bin`;
  let cache: Cache | undefined;
  try { cache = await caches.open('song-ci-ipa-voice-v1'); } catch { /* Private browsing may disallow CacheStorage. */ }
  const cached = await cache?.match(url);
  const response = cached ?? await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`声线下载失败：HTTP ${response.status}`);
  const copy = response.clone();
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== 510 * 256 * 4) throw new Error('声线文件长度不符合固定版本，拒绝加载');
  if (!cached && cache) try { await cache.put(url, copy); } catch { /* Caching is optional. */ }
  return new Float32Array(bytes);
}

/** Shared by the browser worker and the optional Mac CPU smoke test. No G2P. */
export async function createIpaEngine(options: IpaEngineOptions) {
  const location = options.localModel ?? IPA_MODEL;
  const progress_callback = (event: { status?: string; file?: string; progress?: number }) => {
    if (event.status === 'progress' && typeof event.progress === 'number') {
      options.onProgress?.(`下载 ${event.file?.split('/').at(-1) ?? '模型'}：${Math.round(event.progress)}%`);
    }
  };
  // Load the tokenizer/voice first so an error cannot leak a loaded model.
  const tokenizer = await AutoTokenizer.from_pretrained(location, { revision: IPA_MODEL_REVISION, progress_callback });
  const voice = options.voiceData ?? await loadVoice();
  if (voice.length !== 510 * 256 || voice.some((x) => !Number.isFinite(x))) throw new Error('无效女声风格数据');
  const model = await StyleTextToSpeech2Model.from_pretrained(location, {
    revision: IPA_MODEL_REVISION, device: options.device, dtype: options.dtype ?? 'q8', progress_callback,
  });
  return {
    async generate(probe: IpaProbe, speed: number): Promise<Float32Array> {
      const { input_ids } = tokenizer(probe.phonemes, { truncation: false });
      assertTokenIdentity(probe, input_ids.data as BigInt64Array);
      const count = probe.ids.length - 2;
      if (count < 1 || count > 509 || !Number.isFinite(speed) || speed < 0.65 || speed > 1.15) throw new Error('无效音素数量或语速');
      const { waveform } = await model({
        input_ids,
        style: new Tensor('float32', voice.slice(count * 256, (count + 1) * 256), [1, 256]),
        speed: new Tensor('float32', Float32Array.of(speed), [1]),
      });
      return new Float32Array(waveform.data as Float32Array);
    },
    dispose: () => model.dispose(),
  };
}
