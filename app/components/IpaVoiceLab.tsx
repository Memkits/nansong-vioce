import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reading } from '../lib/phonology';
import { waveBlob } from '../lib/synth';
import {
  IPA_MODEL, IPA_VOICE, IPA_SAMPLE_RATE, IPA_MAX_CHARACTERS,
  probeReading, type IpaWorkerResponse, type IpaPrecision,
} from '../lib/neural-ipa';

type Props = { readings: Reading[]; rate: number; gapsMs: number[]; initialGapMs: number; onStart: () => void; onLoadSample: () => void };

export default function IpaVoiceLab({ readings, rate, gapsMs, initialGapMs, onStart, onLoadSample }: Props) {
  const [allowApproximation, setAllowApproximation] = useState(false);
  const [precision, setPrecision] = useState<IpaPrecision>('fp32');
  const [grouped, setGrouped] = useState(true);
  const [status, setStatus] = useState('完整精度约 327 MB，省资源版约 93 MB；另有约 22 MB WASM。首次下载不可能保证 10 秒内完成。');
  const [phase, setPhase] = useState<'idle' | 'generating' | 'playing'>('idle');
  const [result, setResult] = useState<{ samples: Float32Array; fingerprint: string } | null>(null);
  const worker = useRef<Worker | null>(null);
  const context = useRef<AudioContext | null>(null);
  const sources = useRef(new Set<AudioBufferSourceNode>());
  const generation = useRef(0);
  const probes = useMemo(() => readings.map((r) => probeReading(r, allowApproximation)), [readings, allowApproximation]);
  const fingerprint = JSON.stringify([probes, rate, gapsMs, initialGapMs, precision, grouped]);
  const currentFingerprint = useRef(fingerprint);
  const currentResult = result?.fingerprint === fingerprint ? result : null;
  const blocked = !probes.length || probes.length > IPA_MAX_CHARACTERS || probes.some((p) => p.unsupported.length);

  function stop() {
    generation.current++;
    worker.current?.terminate(); worker.current = null;
    for (const node of sources.current) node.stop(); sources.current.clear();
    void context.current?.close(); context.current = null;
    setPhase('idle');
  }

  // Cancel an in-flight old text, reading override, rate, or mapping selection.
  useEffect(() => {
    const activeSources = sources.current;
    currentFingerprint.current = fingerprint;
    return () => {
      generation.current++;
      worker.current?.terminate(); worker.current = null;
      for (const node of activeSources) node.stop(); activeSources.clear();
      void context.current?.close(); context.current = null;
    };
  }, [fingerprint]);
  // Remount on changed input in the parent; no stale result can be downloaded.

  async function play() {
    stop(); onStart();
    const token = generation.current;
    const requestFingerprint = fingerprint;
    setPhase('generating');
    setStatus('正在准备音素直驱实验…');
    try {
      const audioContext = new AudioContext({ sampleRate: IPA_SAMPLE_RATE });
      context.current = audioContext;
      await audioContext.resume();
      if (token !== generation.current) return;
      let nextStart = audioContext.currentTime;
      let complete = false;
      let bufferingGaps = 0;
      let received = 0;
      const finishIfReady = () => {
        if (complete && !sources.current.size && token === generation.current) {
          setPhase('idle');
          void audioContext.close(); context.current = null;
        }
      };
      const enqueueAudio = (samples: Float32Array) => {
        const buffer = audioContext.createBuffer(1, samples.length, IPA_SAMPLE_RATE);
        buffer.copyToChannel(new Float32Array(samples), 0);
        const node = audioContext.createBufferSource(); sources.current.add(node);
        node.buffer = buffer; node.connect(audioContext.destination);
        node.onended = () => {
          if (token === generation.current) {
            sources.current.delete(node);
            if (!complete && !sources.current.size) {
              setPhase('generating');
              setStatus('正在生成后续音节；首次试听可能有缓冲等待，生成完后重播可连续听。');
            }
            finishIfReady();
          }
        };
        if (received > 0 && nextStart < audioContext.currentTime) bufferingGaps++;
        const start = Math.max(nextStart, audioContext.currentTime + 0.02);
        nextStart = start + samples.length / IPA_SAMPLE_RATE;
        received++;
        node.start(start); setPhase('playing');
      };
      if (currentResult) {
        complete = true; enqueueAudio(currentResult.samples);
        setStatus('重播本次已生成结果 · 自然度、音素实现与历史准确性仍未经听辨验证。');
        return;
      }
      const instance = new Worker(new URL('../lib/neural-ipa.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      const fail = (message: string) => {
        if (token !== generation.current) return;
        stop(); setStatus(`生成失败：${message}。未改用普通话或跳过字音；可切回研究合成。`);
      };
      instance.onerror = (event) => fail(event.message || '浏览器无法加载语音运行时');
      instance.onmessage = ({ data }: MessageEvent<IpaWorkerResponse>) => {
        if (token !== generation.current || requestFingerprint !== currentFingerprint.current) return;
        if (data.type === 'progress') setStatus(data.message);
        else if (data.type === 'error') fail(data.message);
        else if (data.type === 'chunk') {
          try { enqueueAudio(data.samples); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
        }
        else {
          instance.terminate(); worker.current = null;
          setResult({ samples: data.samples, fingerprint: requestFingerprint });
          complete = true;
          setStatus(`${data.backend} · ${data.seconds.toFixed(1)} 秒 · 24 kHz。${bufferingGaps ? `首次试听发生 ${bufferingGaps} 次缓冲，重播／下载没有这些等待。` : ''}声调及入声尚未受控。`);
          finishIfReady();
        }
      };
      instance.postMessage({ probes, speed: rate, gapsMs, initialGapMs, precision, grouped });
    } catch (error) {
      if (token === generation.current) {
        stop(); setStatus(`生成失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  function download() {
    if (!currentResult) return;
    const url = URL.createObjectURL(waveBlob(currentResult.samples, IPA_SAMPLE_RATE));
    const link = document.createElement('a'); link.href = url; link.download = `UNVALIDATED-kokoro-ipa-${precision}-${grouped ? 'grouped' : 'syllables'}-24k.wav`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="ipa-lab">
    <b>免训练女声 · IPA 音质实验</b>
    <p>读取本页拟音，直接输入模型音素，不把 IPA 当英文文本朗读。但当前 af_heart 是美式英语女声风格，仍可能带英语口音；不是中文、吴语或宋代真人声线。</p>
    <p className="ipa-warning">AI vibe coding／未经验证。此入口暂不控制平上去调形、630/390 ms 字长或入声无释放；不能替代研究合成。标点仍逐枚插入一个舒声音节的静音。</p>
    <p className="ipa-warning">已确认的区别丢失：相／想、衣／意、古／故去掉调号后输入相同，模型无法按原调区分；这不是已经验证的古代同音。更高精度不会补回声调。</p>
    <label className="ipa-quality">模型精度 <select value={precision} disabled={phase !== 'idle'} onChange={(e) => setPrecision(e.target.value as IpaPrecision)}><option value="fp32">完整精度 FP32 · 约 327 MB</option><option value="q8">省资源 Q8 · 约 93 MB</option></select></label>
    <p>以模型已加载后约 10 秒内首段出声为目标，不保证所有设备达标；边生成边试听，完成后可无缓冲重播。完整精度减少量化误差，不等于已经证明更好听。</p>
    <label className="ipa-consent"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} disabled={phase !== 'idle'} />最多四字连读（不跨标点，减少重复起音和拼接）</label>
    <p>{grouped ? '连读组内由模型衔接，暂不插入每字 40 ms 空白；标点停顿保留。四字分组只是计算分块，不是吴语词组划分或连读变调。取消勾选可逐字审计。' : '逐字生成，每字后保留额外 40 ms 空白；生成较慢，首次播放可能等待下一字。'}</p>
    <label className="ipa-consent"><input type="checkbox" checked={allowApproximation} onChange={(e) => setAllowApproximation(e.target.checked)} disabled={phase !== 'idle'} />允许明确标注的近似（ʐ/ʑ → ʒ，ˤ 咽化省略）</label>
    <p>语速沿用研究合成中的 {rate.toFixed(2)}× 设置；建议先输入“明月，清風。”作无近似音质对照。</p>
    <button className="export-audio" disabled={phase !== 'idle'} onClick={onLoadSample}>载入“明月，清風。”对照文本</button>
    <details><summary>输入审计：{probes.length} 字／上限 {IPA_MAX_CHARACTERS} 字 · {probes.filter((p) => p.unsupported.length).length} 字阻止生成</summary>
      <p>词表包含不等于模型会读。ˈ 是单音节重音提示，不是历史声调；调号已分离且尚未重新施加。</p>
      <div className="ipa-audit">{probes.map((p, i) => <div key={i}><b>{p.character}</b><code>{p.sourceIpa} → {p.phonemes}</code><small>{p.unsupported.length ? `不支持：${p.unsupported.join('、')}` : p.changes.join('；') || '符号保留；声学实现待验'}</small></div>)}</div>
    </details>
    <p role="status" aria-live="polite">{status}</p>
    <div className="player-row">
      <button className={phase === 'idle' ? 'play-button' : 'stop-button'} disabled={phase === 'idle' && blocked} onClick={phase === 'idle' ? play : () => { stop(); setStatus('已停止；后台推理已终止。'); }}>{phase === 'generating' ? '■ 取消生成' : phase === 'playing' ? '■ 停止' : currentResult ? '▶ 重播实验' : '▶ 生成并试听'}</button>
      {currentResult && <button className="export-audio" onClick={download}>下载实验 WAV（未验证）</button>}
    </div>
    {blocked && <p className="ipa-warning">请使用 1–{IPA_MAX_CHARACTERS} 个已收录汉字；不支持项见输入审计。未勾选近似时不会擅自替换。</p>}
    <small>{IPA_MODEL} · {IPA_VOICE} · 模型 Apache-2.0 · 首次联网下载，随后本机浏览器计算。</small>
  </div>;
}
