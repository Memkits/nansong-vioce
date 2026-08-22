'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { candidatesFor, confidenceLabel, isHan, readingFor, type ProfileId, type Reading } from './lib/phonology';

const sampleText = '春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。';
const profiles = {
  linan: { name: '臨安行都', subtitle: '共同語擬音 · 1127–1279', note: '以切韻系音韻地位為底座，加入宋代通語與行都語音的審慎推斷。' },
  jinhua: { name: '婺州／金華', subtitle: '地方讀音擬音 · 1127–1279', note: '以婺州地方證據約束的候選方案；與臨安差異均標示為推斷，不視為定論。' },
} as const;
function pickChineseVoice() {
  return window.speechSynthesis.getVoices().find((voice) => /zh|Chinese/i.test(`${voice.lang} ${voice.name}`)) ?? null;
}
const vowelFormants: Record<string, [number, number, number]> = { i: [280, 2250, 3100], e: [390, 2050, 2850], ɛ: [610, 1840, 2600], a: [850, 1350, 2500], ɑ: [720, 1100, 2400], ɒ: [550, 920, 2400], u: [330, 760, 2200], ɨ: [350, 1550, 2450], o: [470, 900, 2450] };

function scheduleResearchSyllable(context: BaseAudioContext, reading: Reading, start: number, duration: number) {
  const vowel = Array.from(reading.ipa).reverse().find((symbol) => vowelFormants[symbol]) ?? 'a';
  const [f1, f2, f3] = vowelFormants[vowel];
  const source = context.createOscillator();
  const gain = context.createGain();
  source.type = 'sawtooth';
  source.frequency.setValueAtTime(205, start);
  const targetPitch = reading.tone === 2 ? 232 : reading.tone === 3 ? 180 : reading.tone === 4 ? 165 : 208;
  source.frequency.exponentialRampToValueAtTime(targetPitch, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.06, start + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(gain);
  [f1, f2, f3].forEach((frequency, formantIndex) => {
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = formantIndex === 0 ? 5 : 10;
    gain.connect(filter);
    filter.connect(context.destination);
  });
  source.start(start);
  source.stop(start + duration);
}

function waveBlob(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0);
  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  const write = (offset: number, value: string) => Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
  return new Blob([wav], { type: 'audio/wav' });
}

export default function Home() {
  const [text, setText] = useState(sampleText);
  const [profile, setProfile] = useState<ProfileId>('linan');
  const [selected, setSelected] = useState(0);
  const [rate, setRate] = useState(0.86);
  const [pause, setPause] = useState(270);
  const [mode, setMode] = useState<'study' | 'system'>('study');
  const [isPlaying, setIsPlaying] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [showAlternatives, setShowAlternatives] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const stopRef = useRef(false);
  const readings = useMemo(
    () => Array.from(text).filter(isHan).map((character, index) => readingFor(character, profile, overrides[index] ?? 0)),
    [text, profile, overrides],
  );
  const active = readings[selected] ?? readings[0];
  const alternatives = active ? candidatesFor(active.character, profile) : [];
  const covered = readings.filter((reading) => reading.confidence !== 'D').length;

  useEffect(() => { setSelected((current) => Math.min(current, Math.max(readings.length - 1, 0))); }, [readings.length]);
  useEffect(() => () => window.speechSynthesis.cancel(), []);
  function stop() {
    stopRef.current = true; window.speechSynthesis.cancel(); audioContext.current?.close(); audioContext.current = null; setIsPlaying(false);
  }
  async function playStudyVoice() {
    const Context = window.AudioContext || window.webkitAudioContext;
    const context = new Context(); audioContext.current = context; stopRef.current = false; setIsPlaying(true);
    let cursor = context.currentTime + 0.08;
    for (let index = 0; index < readings.length; index += 1) {
      if (stopRef.current) break;
      const reading = readings[index]; setSelected(index);
      const duration = reading.tone === 4 ? 0.26 / rate : 0.42 / rate;
      scheduleResearchSyllable(context, reading, cursor, duration);
      cursor += duration + pause / 1000;
    }
    window.setTimeout(() => { if (!stopRef.current) setIsPlaying(false); }, Math.max(0, (cursor - context.currentTime) * 1000 + 120));
  }
  function playSystemVoice() {
    stopRef.current = false; setIsPlaying(true);
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'zh-CN'; utterance.rate = rate; utterance.pitch = 1.18;
    const voice = pickChineseVoice(); if (voice) utterance.voice = voice;
    utterance.onend = () => setIsPlaying(false); utterance.onerror = () => setIsPlaying(false);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  function downloadAnnotation() {
    const payload = { system: '南宋吴地拟音古文朗读系统', profile: profiles[profile], dataVersion: '0.1.0-prototype', createdAt: new Date().toISOString(), sourceText: text, readings };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'nansong-phonology-annotation.json'; anchor.click(); URL.revokeObjectURL(href);
  }
  async function downloadResearchAudio() {
    const sampleRate = 44100;
    const span = readings.reduce((total, reading) => total + (reading.tone === 4 ? 0.26 / rate : 0.42 / rate) + pause / 1000, 0) + 0.2;
    const context = new OfflineAudioContext(1, Math.ceil(span * sampleRate), sampleRate);
    let cursor = 0.06;
    readings.forEach((reading) => {
      const duration = reading.tone === 4 ? 0.26 / rate : 0.42 / rate;
      scheduleResearchSyllable(context, reading, cursor, duration);
      cursor += duration + pause / 1000;
    });
    const href = URL.createObjectURL(waveBlob(await context.startRendering()));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `nansong-${profile}-research-voice.wav`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 500);
  }
  return <main className="site-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="南宋吴地拟音首页"><span>宋</span><b>南宋声景</b></a><div className="topbar-note">研究性拟音 · 数据版 0.1</div><button className="text-button" onClick={downloadAnnotation}>导出注释</button></header>
    <section className="hero" id="top"><div><p className="eyebrow">SOUNDING SOUTHERN SONG</p><h1>让古文以一套<br /><em>可说明来处</em>的声音被听见。</h1><p className="hero-copy">不是“唯一古音”，而是可追溯、可比较、可修订的南宋吴地朗读方案。</p></div><aside className="principle-card"><span className="card-kicker">当前方案</span><strong>{profiles[profile].name}</strong><p>{profiles[profile].note}</p><div><span className="dot" />每一个判断均标注证据等级</div></aside></section>
    <section className="workspace" aria-label="古文拟音工作台"><div className="controls-column"><div className="section-heading"><span>01</span><h2>选择声景</h2></div><div className="profile-switch" role="radiogroup" aria-label="选择拟音方案">{(Object.keys(profiles) as ProfileId[]).map((id) => <button key={id} className={profile === id ? 'profile active' : 'profile'} onClick={() => setProfile(id)} role="radio" aria-checked={profile === id}><b>{profiles[id].name}</b><small>{profiles[id].subtitle}</small></button>)}</div><div className="method-note"><b>方案说明</b><p>“临安”侧重行都的共同语语境；“金华”是地方证据约束下的候选读法。差异不等同于已经证实的口语事实。</p></div></div>
      <div className="input-column"><div className="section-heading"><span>02</span><h2>粘贴古文</h2><small>{text.length} 字符</small></div><textarea value={text} onChange={(event) => { setText(event.target.value); setOverrides({}); }} aria-label="古文文本输入" placeholder="在这里粘贴古文、诗词或词作…" /><div className="input-footer"><button className="sample-button" onClick={() => { setText(sampleText); setOverrides({}); }}>载入《春晓》示例</button><span>《廣韻》可查字以规则推导；未录字标为待考</span></div></div></section>
    <section className="analysis-section"><div className="analysis-header"><div><p className="eyebrow">PHONOLOGICAL TRACE</p><h2>逐字拟音</h2></div><div className="coverage"><b>{covered}<small> / {readings.length}</small></b><span>已具可审查读音</span></div></div><div className="token-grid">{readings.length === 0 ? <p className="empty-state">请输入至少一个汉字以开始分析。</p> : readings.map((reading, index) => <button className={selected === index ? `token confidence-${reading.confidence} selected` : `token confidence-${reading.confidence}`} onClick={() => setSelected(index)} key={`${reading.character}-${index}`}><b>{reading.character}</b><span>{reading.ipa}</span><i>{reading.confidence}</i></button>)}</div>
      {active && <article className="evidence-panel"><div className="character-mark">{active.character}</div><div><span className={`confidence-badge confidence-${active.confidence}`}>{active.confidence} · {confidenceLabel[active.confidence]}</span><h3>{active.position}</h3><p><b>释义：</b>{active.meaning}　<b>拟音：</b><code>{active.ipa}</code></p><p className="evidence"><b>依据：</b>{active.evidence}</p>{showAlternatives && <div className="alternative-list">{alternatives.map((candidate, index) => <button key={`${candidate.position}-${index}`} className={candidate.position === active.position ? 'chosen' : ''} onClick={() => { setOverrides((current) => ({ ...current, [selected]: index })); setShowAlternatives(false); }}><b>{candidate.position}</b><code>{candidate.ipa}</code><span>{candidate.meaning}</span></button>)}</div>}</div><button className="change-reading" onClick={() => setShowAlternatives((open) => !open)}>{showAlternatives ? '收起候选' : `选择替代读法${alternatives.length > 1 ? `（${alternatives.length}）` : ''}`}</button></article>}</section>
    <section className="listen-section"><div><p className="eyebrow">LISTENING ROOM</p><h2>聆听这个方案</h2><p className="listen-copy">研究合成以目标 IPA 的元音共振峰、声调与入声时值产生教学声响；系统女声预听则用于连贯性参考，不能当作历史拟音本体。</p></div><div className="voice-panel"><div className="mode-tabs"><button onClick={() => setMode('study')} className={mode === 'study' ? 'active' : ''}>研究合成 <small>IPA 控制</small></button><button onClick={() => setMode('system')} className={mode === 'system' ? 'active' : ''}>系统女声 <small>流畅预听</small></button></div><div className="sliders"><label>语速 <output>{rate.toFixed(2)}×</output><input type="range" min="0.65" max="1.15" step="0.01" value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label><label>句间停顿 <output>{pause}ms</output><input type="range" min="120" max="720" step="30" value={pause} onChange={(event) => setPause(Number(event.target.value))} /></label></div><div className="player-row"><button className={isPlaying ? 'stop-button' : 'play-button'} onClick={isPlaying ? stop : mode === 'study' ? playStudyVoice : playSystemVoice}>{isPlaying ? '■ 停止' : '▶ 开始朗读'}</button>{mode === 'study' && <button className="export-audio" onClick={downloadResearchAudio}>下载 WAV</button>}<span>{mode === 'study' ? '女声音高 · IPA 元音与调型控制' : '调用设备可用的中文女声（若存在）'}</span></div></div></section>
    <footer><span>南宋声景 · 研究性拟音原型</span><span>请将听感与史实区分：声音的自然度不等于历史结论。</span></footer>
  </main>;
}
