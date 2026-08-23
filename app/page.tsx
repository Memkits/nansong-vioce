import { useEffect, useMemo, useRef, useState } from 'react';
import OpenCC from 'opencc-js/cn2t';
import { candidatesFor, isHan, prosodyOf, readingsFor, type ProfileId, type Reading } from './lib/phonology';
import { RESEARCH_SAMPLE_RATE, renderResearchVoice, waveBlob } from './lib/synth';

const sampleText = '春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。';
const toTraditional = OpenCC.Converter({ from: 'cn', to: 't' });
const neuralModel = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
const neuralVoicePath = `https://huggingface.co/${neuralModel}/resolve/main/voices`;
const neuralRuntime = 'https://cdn.jsdelivr.net/npm/@uzen/kokoro-js@1.2.4/dist/kokoro.web.js';
type NeuralAudio = { toBlob: () => Blob };
type NeuralEngine = { stream: (text: string, options: { voice: string; speed: number; maxChunkLength: number }) => AsyncIterable<{ audio: NeuralAudio }> };
type NeuralRuntimeModule = { KokoroTTS: { from_pretrained: (model: string, options: Record<string, unknown>) => Promise<NeuralEngine> } };
type NeuralProgressEvent = { status?: string; progress?: number; file?: string; loaded?: number; total?: number };
let neuralEnginePromise: Promise<NeuralEngine> | null = null;

function loadNeuralEngine(onProgress: (event: NeuralProgressEvent) => void) {
  if (!neuralEnginePromise) {
    neuralEnginePromise = import(/* @vite-ignore */ neuralRuntime).then(async (runtime) => {
      const { KokoroTTS } = runtime as NeuralRuntimeModule;
      const webGpuAvailable = 'gpu' in navigator;
      const progressCallback = (event: unknown) => onProgress(event as NeuralProgressEvent);
      if (webGpuAvailable) {
        try {
          return await KokoroTTS.from_pretrained(neuralModel, { device: 'webgpu', dtype: 'q4f16', voicePath: neuralVoicePath, progress_callback: progressCallback });
        } catch {
          onProgress({ status: 'fallback' });
        }
      }
      return KokoroTTS.from_pretrained(neuralModel, { device: 'wasm', dtype: 'q8', voicePath: neuralVoicePath, progress_callback: progressCallback });
    }).catch((error) => {
      neuralEnginePromise = null;
      throw error;
    });
  }
  return neuralEnginePromise;
}
const profiles = {
  linan: { name: '臨安行都', subtitle: '共同語擬音 · 1127–1279', note: '以切韻系音韻地位為底座，加入宋代通語與行都語音的審慎推斷。' },
  jinhua: { name: '婺州／金華', subtitle: '地方讀音擬音 · 1127–1279', note: '以婺州地方證據約束的候選方案；與臨安差異均標示為推斷，不視為定論。' },
} as const;
function UnverifiedNotice({ area, className = '' }: { area: string; className?: string }) {
  return <p className={`unverified-notice ${className}`}><b>AI 原型／未经验证</b>　{area}由 AI 辅助的 vibe coding 生成；其历史音值、地域差异、押韵提示与听感均未经过语言学、方言史、语音学或听辨测试验证，只可作为探索入口。</p>;
}
export default function Home() {
  const [text, setText] = useState(sampleText);
  const [profile, setProfile] = useState<ProfileId>('linan');
  const [selected, setSelected] = useState(0);
  const [rate, setRate] = useState(0.86);
  const [pause, setPause] = useState(270);
  const [mode, setMode] = useState<'study' | 'neural' | 'system'>('study');
  const [isPlaying, setIsPlaying] = useState(false);
  const [neuralStatus, setNeuralStatus] = useState('首次使用将从 Hugging Face 下载并缓存较大的开放模型。');
  const [emphasizeRhyme, setEmphasizeRhyme] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState('');
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [showAlternatives, setShowAlternatives] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const audioSource = useRef<AudioBufferSourceNode | null>(null);
  const neuralAudio = useRef<HTMLAudioElement | null>(null);
  const neuralAudioUrl = useRef<string | null>(null);
  const finishNeuralChunk = useRef<(() => void) | null>(null);
  const stopRef = useRef(false);
  const analysisText = useMemo(() => toTraditional(text), [text]);
  const readings = useMemo(() => readingsFor(analysisText, profile, overrides), [analysisText, profile, overrides]);
  const selectedIndex = Math.min(selected, Math.max(readings.length - 1, 0));
  const active = readings[selectedIndex] ?? readings[0];
  const alternatives = active ? candidatesFor(active.character, profile) : [];
  const covered = readings.filter((reading) => reading.confidence !== 'D').length;
  const sentenceData = useMemo(() => {
    const chunks = analysisText.match(/[^，、。！？；]+[，、。！？；]?/gu) ?? [];
    return chunks.reduce<{ cursor: number; sentences: Array<{ chunk: string; start: number; end: number; ending: Reading | undefined; prosody: ReturnType<typeof prosodyOf> | null }> }>((result, chunk) => {
      const count = Array.from(chunk).filter(isHan).length;
      const end = result.cursor + count;
      const ending = readings[end - 1];
      return {
        cursor: end,
        sentences: [...result.sentences, { chunk, start: result.cursor, end: end - 1, ending, prosody: ending ? prosodyOf(ending) : null }],
      };
    }, { cursor: 0, sentences: [] }).sentences;
  }, [analysisText, readings]);
  const rhymeFinals = useMemo(() => new Set(sentenceData.map((sentence) => sentence.end).filter((index) => index >= 0)), [sentenceData]);
  const dominantRhyme = useMemo(() => {
    const counts = new Map<string, number>();
    sentenceData.forEach((sentence) => {
      const rhyme = sentence.prosody?.pingshui;
      if (rhyme) counts.set(rhyme, (counts.get(rhyme) ?? 0) + 1);
    });
    const winner = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return winner && winner[1] > 1 ? winner[0] : null;
  }, [sentenceData]);
  const durationFor = (reading: Reading, index: number) => {
    const entering = reading.position.endsWith('入');
    const basic = (entering ? 0.39 : 0.63) / rate;
    return emphasizeRhyme && rhymeFinals.has(index) ? basic * (entering ? 1.08 : 1.20) : basic;
  };
  const gapFor = (index: number) => rhymeFinals.has(index) ? pause : 40;

  useEffect(() => () => {
    window.speechSynthesis.cancel();
    audioSource.current?.stop();
    audioContext.current?.close();
    neuralAudio.current?.pause();
    finishNeuralChunk.current?.();
    if (neuralAudioUrl.current) URL.revokeObjectURL(neuralAudioUrl.current);
  }, []);
  useEffect(() => {
    const loadVoices = () => {
      const chineseVoices = window.speechSynthesis.getVoices().filter((voice) => /zh|Chinese/i.test(`${voice.lang} ${voice.name}`));
      setVoices(chineseVoices);
      setVoiceUri((current) => current || chineseVoices.find((voice) => /female|woman|女/i.test(voice.name))?.voiceURI || chineseVoices[0]?.voiceURI || '');
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);
  function stop() {
    stopRef.current = true;
    window.speechSynthesis.cancel();
    audioSource.current?.stop(); audioSource.current = null;
    audioContext.current?.close(); audioContext.current = null;
    neuralAudio.current?.pause(); neuralAudio.current = null;
    finishNeuralChunk.current?.(); finishNeuralChunk.current = null;
    if (neuralAudioUrl.current) URL.revokeObjectURL(neuralAudioUrl.current);
    neuralAudioUrl.current = null;
    setIsPlaying(false);
  }
  async function playStudyVoice() {
    stop();
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const samples = renderResearchVoice(readings, durationFor, gapFor);
    const context = new Context(); audioContext.current = context; stopRef.current = false; setIsPlaying(true);
    const buffer = context.createBuffer(1, samples.length, RESEARCH_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource(); audioSource.current = source;
    source.buffer = buffer; source.connect(context.destination);
    source.onended = () => { if (!stopRef.current) setIsPlaying(false); };
    source.start();
  }
  async function playNeuralVoice() {
    stop(); stopRef.current = false; setIsPlaying(true);
    try {
      setNeuralStatus('正在准备浏览器端神经女声…');
      const engine = await loadNeuralEngine((event) => {
        if (event.status === 'fallback') return setNeuralStatus('WebGPU 不可用，正在切换到兼容性较好的 WASM 模式…');
        if (typeof event.progress === 'number') {
          const percent = event.progress <= 1 ? event.progress * 100 : event.progress;
          setNeuralStatus(`正在下载并缓存模型 ${Math.max(0, Math.min(100, Math.round(percent)))}%`);
        } else if (event.file) setNeuralStatus(`正在准备 ${event.file.split('/').at(-1) ?? '模型文件'}…`);
      });
      if (stopRef.current) return;
      let chunk = 0;
      for await (const result of engine.stream(analysisText, { voice: 'zf_001', speed: rate, maxChunkLength: 120 })) {
        if (stopRef.current) break;
        chunk += 1; setNeuralStatus(`正在生成并播放第 ${chunk} 段现代普通话代理声线…`);
        const url = URL.createObjectURL(result.audio.toBlob()); neuralAudioUrl.current = url;
        const element = new Audio(url); neuralAudio.current = element;
        await new Promise<void>((resolve, reject) => {
          finishNeuralChunk.current = resolve;
          element.onended = () => resolve();
          element.onerror = () => reject(new Error('神经声线音频播放失败'));
          element.play().catch(reject);
        });
        finishNeuralChunk.current = null; neuralAudio.current = null;
        URL.revokeObjectURL(url); neuralAudioUrl.current = null;
      }
      if (!stopRef.current) setNeuralStatus('已完成。此声线是现代普通话自然度基准，不代表南宋拟音。');
    } catch (error) {
      setNeuralStatus(`加载失败：${error instanceof Error ? error.message : '浏览器或网络不支持此模型'}`);
    } finally {
      if (!stopRef.current) setIsPlaying(false);
    }
  }
  function playSystemVoice() {
    stop(); stopRef.current = false; setIsPlaying(true);
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'zh-CN'; utterance.rate = rate; utterance.pitch = 1.18;
    const voice = voices.find((candidate) => candidate.voiceURI === voiceUri); if (voice) utterance.voice = voice;
    utterance.onend = () => setIsPlaying(false); utterance.onerror = () => setIsPlaying(false);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  function downloadAnnotation() {
    const payload = { system: '南宋吴地拟音古文朗读系统', profile: profiles[profile], dataVersion: '0.7.0-experimental', createdAt: new Date().toISOString(), sourceText: text, analysisText, readings, sentenceData, dominantRhyme, emphasizeRhyme, audio: { sampleRate: RESEARCH_SAMPLE_RATE, renderer: 'deterministic-checked-coda-v5', characterPaddingMs: 20, neuralProxy: neuralModel } };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'nansong-phonology-annotation.json'; anchor.click(); URL.revokeObjectURL(href);
  }
  async function downloadResearchAudio() {
    const samples = renderResearchVoice(readings, durationFor, gapFor);
    const href = URL.createObjectURL(waveBlob(samples));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `nansong-${profile}-research-voice.wav`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 500);
  }
  return <main className="site-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="南宋吴地拟音首页"><span>宋</span><b>南宋声景</b></a><div className="topbar-note">AI vibe 原型 · 未经验证</div><button className="text-button" onClick={downloadAnnotation}>导出注释</button></header>
    <div className="global-disclaimer"><UnverifiedNotice area="本网站所有入口与导出均应按此状态理解。" /></div>
    <section className="hero" id="top"><div><p className="eyebrow">SOUNDING SOUTHERN SONG · UNVALIDATED</p><h1>让古文以一套<br /><em>可说明来处</em>的声音被听见。</h1><p className="hero-copy">这是可追溯、可比较、可修订的探索方案，不是已证实的“唯一古音”。</p></div><aside className="principle-card"><span className="card-kicker">当前未验证方案</span><strong>{profiles[profile].name}</strong><p>{profiles[profile].note}</p><div><span className="dot" />证据等级是资料标记，不是验证结论</div></aside></section>
    <section className="workspace" aria-label="古文拟音工作台"><div className="controls-column"><div className="section-heading"><span>01</span><h2>选择声景</h2></div><div className="profile-switch" role="radiogroup" aria-label="选择拟音方案">{(Object.keys(profiles) as ProfileId[]).map((id) => <button key={id} className={profile === id ? 'profile active' : 'profile'} onClick={() => setProfile(id)} role="radio" aria-checked={profile === id}><b>{profiles[id].name}</b><small>{profiles[id].subtitle}</small></button>)}</div><div className="method-note"><b>方案说明</b><p>“临安”侧重行都的共同语语境；“金华”是地方证据约束下的候选读法。差异不等同于已经证实的口语事实。</p><UnverifiedNotice area="地域选择" className="inline-notice" /></div></div>
      <div className="input-column"><div className="section-heading"><span>02</span><h2>粘贴古文</h2><small>{text.length} 字符</small></div><textarea value={text} onChange={(event) => { setText(event.target.value); setOverrides({}); }} aria-label="古文文本输入" placeholder="在这里粘贴古文、诗词或词作…" /><div className="input-footer"><button className="sample-button" onClick={() => { setText(sampleText); setOverrides({}); }}>载入《春晓》示例</button><span>{analysisText === text ? '《廣韻》可查字以规则推导；未录字标为待考' : '已在本地转为繁体字形后查《廣韻》；原文保持不变'}</span></div><UnverifiedNotice area="自动查字、断句与义读" className="inline-notice" /></div></section>
    <section className="analysis-section"><div className="analysis-header"><div><p className="eyebrow">PHONOLOGICAL TRACE</p><h2>逐字拟音</h2><UnverifiedNotice area="韵书地位到宋代／地域 IPA 的转换" className="inline-notice" /></div><div className="coverage"><b>{covered}<small> / {readings.length}</small></b><span>已具可审查读音（非验证）</span></div></div><div className="token-grid">{readings.length === 0 ? <p className="empty-state">请输入至少一个汉字以开始分析。</p> : readings.map((reading, index) => <button className={selectedIndex === index ? `token confidence-${reading.confidence} selected` : `token confidence-${reading.confidence}`} onClick={() => setSelected(index)} key={`${reading.character}-${index}`}><b>{reading.character}</b><span>{reading.ipa}</span><i>{reading.confidence}</i></button>)}</div>
      {active && <article className="evidence-panel"><div className="character-mark">{active.character}</div><div><div><span className={`confidence-badge confidence-${active.categoryConfidence}`}>{active.categoryConfidence} · 韻書地位</span> <span className={`confidence-badge confidence-${active.periodConfidence}`}>{active.periodConfidence} · 宋代橋接</span> <span className={`confidence-badge confidence-${active.regionalConfidence}`}>{active.regionalConfidence} · 地域音值</span></div><h3>{active.position}</h3><p><b>释义：</b>{active.meaning}　<b>拟音：</b><code>{active.ipa}</code>　<b>白一平转写：</b><code>{active.baxter}</code></p><p className="evidence"><b>依据：</b>{active.evidence}</p>{showAlternatives && <div className="alternative-list">{alternatives.map((candidate, index) => <button key={`${candidate.position}-${index}`} className={candidate.position === active.position ? 'chosen' : ''} onClick={() => { setOverrides((current) => ({ ...current, [selectedIndex]: index })); setShowAlternatives(false); }}><b>{candidate.position}</b><code>{candidate.ipa}</code><span>{candidate.meaning}</span></button>)}</div>}</div><button className="change-reading" onClick={() => setShowAlternatives((open) => !open)}>{showAlternatives ? '收起候选' : `选择替代读法${alternatives.length > 1 ? `（${alternatives.length}）` : ''}`}</button></article>}</section>
    <section className="prosody-section"><div className="prosody-heading"><div><p className="eyebrow">RHYME & CADENCE</p><h2>断句与韵脚</h2><UnverifiedNotice area="押韵提示" className="inline-notice" /></div><p>同时显示《廣韻》原始韻目与《禮部韻略》—平水 106 韻合并层。主韻只按本段句末多数项提示；换韵、词牌及作者实际用韵仍须人工校勘。</p></div><div className="sentence-grid">{sentenceData.map((sentence, index) => <button key={`${sentence.chunk}-${index}`} className={selectedIndex === sentence.end ? 'sentence-card active' : 'sentence-card'} onClick={() => setSelected(sentence.end)}><span>第 {index + 1} 句{dominantRhyme && sentence.prosody?.pingshui === dominantRhyme ? ' · 与主韵同部' : dominantRhyme ? ' · 异于主韵' : ''}</span><b>{sentence.chunk}</b><div><code>{sentence.ending?.character ?? '—'} · {sentence.prosody?.pingshui ?? '平水待考'}</code><i>《廣韻》{sentence.prosody?.sourceRhyme ?? '？'}韻 · {sentence.prosody?.level ?? '？'} · {sentence.prosody?.category ?? '待考'}{sentence.prosody?.entering ? ' · 入聲' : ''}</i></div></button>)}</div></section>
    <section className="listen-section"><div><p className="eyebrow">LISTENING ROOM</p><h2>聆听这个方案</h2><p className="listen-copy">研究合成 v5 把普通字延长到 v4 的 1.5 倍，字间保留约前后各 20 ms；入声仍明显较短，并以 `/p t k/` 提前闭锁、无释放和末尾静音结束。</p><UnverifiedNotice area="研究合成、神经代理与设备声线" className="inline-notice" /></div><div className="voice-panel"><div className="mode-tabs"><button onClick={() => setMode('study')} className={mode === 'study' ? 'active' : ''}>研究合成 <small>IPA 可控 · v5</small></button><button onClick={() => setMode('neural')} className={mode === 'neural' ? 'active' : ''}>神经代理 <small>现代普通话</small></button><button onClick={() => setMode('system')} className={mode === 'system' ? 'active' : ''}>设备声线 <small>系统预听</small></button></div>{mode === 'neural' && <div className="neural-note"><b>Kokoro 中文女声 · 在线模型</b><p>首次使用需下载并缓存上百 MB；之后在浏览器本地推理。它不读取本页 IPA，也不能验证临安／金华发音。</p><span>{neuralStatus}</span></div>}{mode === 'system' && <label className="voice-picker">选择设备声线 <select value={voiceUri} onChange={(event) => setVoiceUri(event.target.value)} disabled={!voices.length}>{voices.length ? voices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} · {voice.lang}</option>) : <option>未检测到中文声线</option>}</select><small>请在设备提供的中文声线中选择女性声线。</small></label>}<div className={mode === 'study' ? 'sliders' : 'sliders single'}><label>语速 <output>{rate.toFixed(2)}×</output><input type="range" min="0.65" max="1.15" step="0.01" value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label>{mode === 'study' && <label>句间停顿 <output>{pause}ms</output><input type="range" min="120" max="720" step="30" value={pause} onChange={(event) => setPause(Number(event.target.value))} /></label>}</div>{mode === 'study' && <label className="rhyme-toggle"><input type="checkbox" checked={emphasizeRhyme} onChange={(event) => setEmphasizeRhyme(event.target.checked)} />强化句末韵脚时值 <small>入声只轻微延长，仍保持短促</small></label>}<div className="player-row"><button className={isPlaying ? 'stop-button' : 'play-button'} onClick={isPlaying ? stop : mode === 'study' ? playStudyVoice : mode === 'neural' ? playNeuralVoice : playSystemVoice}>{isPlaying ? '■ 停止' : mode === 'neural' ? '▶ 加载并朗读' : '▶ 开始朗读'}</button>{mode === 'study' && <button className="export-audio" onClick={downloadResearchAudio}>下载 48 kHz WAV</button>}<span>{mode === 'study' ? '舒声约 630 ms · 入声约 390 ms' : mode === 'neural' ? '自然度比较 · 非历史拟音' : '取决于设备声线'}</span></div></div></section>
    <footer><span>南宋声景 · AI vibe coding 未验证原型</span><span>请将听感与史实区分；详见 README 的问题与可行方案。</span></footer>
  </main>;
}
