'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ProfileId = 'linan' | 'jinhua';
type Confidence = 'A' | 'B' | 'C' | 'D';
type Reading = { character: string; position: string; ipa: string; meaning: string; evidence: string; confidence: Confidence; tone: 1 | 2 | 3 | 4 };

const sampleText = '春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。';
const baseReadings: Record<string, Reading> = {
  春: { character: '春', position: '清三合真平', ipa: 'tɕʰwin', meaning: '春季', evidence: '《廣韻》諄韻；切韻系音韻地位', confidence: 'A', tone: 1 },
  眠: { character: '眠', position: '明三開先平', ipa: 'miɛn', meaning: '睡眠', evidence: '《廣韻》先韻；宋代韻圖對照', confidence: 'A', tone: 1 },
  不: { character: '不', position: '幫三合物入', ipa: 'pɨʔ', meaning: '否定詞', evidence: '《廣韻》物韻；入聲尾弱化為本方案假設', confidence: 'B', tone: 4 },
  覺: { character: '覺', position: '見二開覺入', ipa: 'kjaʊʔ', meaning: '察覺', evidence: '《廣韻》覺韻；臨安方案採入聲短促處理', confidence: 'B', tone: 4 },
  曉: { character: '曉', position: '曉四開篠上', ipa: 'xjɛʊ˧˩', meaning: '天明', evidence: '《廣韻》篠韻', confidence: 'A', tone: 3 },
  處: { character: '處', position: '昌三開御去', ipa: 'tɕʰjo˥˩', meaning: '處所', evidence: '《廣韻》御韻；此處取去聲義', confidence: 'A', tone: 4 },
  聞: { character: '聞', position: '微三合文平', ipa: 'mɨn', meaning: '聽聞', evidence: '《廣韻》文韻', confidence: 'A', tone: 1 },
  啼: { character: '啼', position: '定四開齊平', ipa: 'dei', meaning: '鳥鳴', evidence: '《廣韻》齊韻；濁塞音實際音值有爭議', confidence: 'B', tone: 2 },
  鳥: { character: '鳥', position: '端四開篠上', ipa: 'tew˧˩', meaning: '鳥類', evidence: '《廣韻》篠韻', confidence: 'A', tone: 3 },
  夜: { character: '夜', position: '以三開麻去', ipa: 'jæ˥˩', meaning: '夜晚', evidence: '《廣韻》禡韻', confidence: 'A', tone: 4 },
  來: { character: '來', position: '來一開咍平', ipa: 'lɒi', meaning: '到來', evidence: '《廣韻》咍韻', confidence: 'A', tone: 1 },
  風: { character: '風', position: '幫三合東平', ipa: 'pjuŋ', meaning: '風聲', evidence: '《廣韻》東韻；詞義為名詞', confidence: 'A', tone: 1 },
  雨: { character: '雨', position: '云三合遇上', ipa: 'ɨo˧˩', meaning: '雨水', evidence: '《廣韻》遇韻；此處取名詞上聲義', confidence: 'B', tone: 3 },
  聲: { character: '聲', position: '書三開清平', ipa: 'ɕiɛŋ', meaning: '聲音', evidence: '《廣韻》清韻', confidence: 'A', tone: 1 },
  花: { character: '花', position: '曉二合麻平', ipa: 'xwa', meaning: '花朵', evidence: '《廣韻》麻韻', confidence: 'A', tone: 1 },
  落: { character: '落', position: '來一開鐸入', ipa: 'lɑʔ', meaning: '落下', evidence: '《廣韻》鐸韻；入聲尾弱化為本方案假設', confidence: 'B', tone: 4 },
  知: { character: '知', position: '知三開支平', ipa: 'ʈʂi', meaning: '知道', evidence: '《廣韻》支韻；宋代知組演變存在地域差異', confidence: 'B', tone: 1 },
  多: { character: '多', position: '端一開歌平', ipa: 'tɑ', meaning: '多寡', evidence: '《廣韻》歌韻', confidence: 'A', tone: 1 },
  少: { character: '少', position: '書三開小上', ipa: 'ɕjɛʊ˧˩', meaning: '多少', evidence: '《廣韻》小韻；此處取上聲義', confidence: 'A', tone: 3 },
};
const profiles = {
  linan: { name: '臨安行都', subtitle: '共同語擬音 · 1127–1279', note: '以切韻系音韻地位為底座，加入宋代通語與行都語音的審慎推斷。' },
  jinhua: { name: '婺州／金華', subtitle: '地方讀音擬音 · 1127–1279', note: '以婺州地方證據約束的候選方案；與臨安差異均標示為推斷，不視為定論。' },
} as const;
const confidenceLabel: Record<Confidence, string> = { A: '强证据', B: '有力推断', C: '合理假设', D: '待考 / 合成策略' };
const isHan = (character: string) => /[\u3400-\u9fff]/.test(character);

function readingFor(character: string, profile: ProfileId): Reading {
  const found = baseReadings[character];
  if (!found) return { character, position: '待考', ipa: '—', meaning: '尚未收錄', evidence: '此字尚無已審核的音韻資料；請手動指定或保留待考狀態。', confidence: 'D', tone: 1 };
  if (profile === 'jinhua' && found.confidence !== 'A') return { ...found, ipa: found.ipa.replaceAll('ʔ', 'k'), evidence: `${found.evidence}；婺州方案暫保留較明顯的塞尾（C 級假設）。`, confidence: 'C' };
  return found;
}
function pickChineseVoice() {
  return window.speechSynthesis.getVoices().find((voice) => /zh|Chinese/i.test(`${voice.lang} ${voice.name}`)) ?? null;
}

export default function Home() {
  const [text, setText] = useState(sampleText);
  const [profile, setProfile] = useState<ProfileId>('linan');
  const [selected, setSelected] = useState(0);
  const [rate, setRate] = useState(0.86);
  const [pause, setPause] = useState(270);
  const [mode, setMode] = useState<'study' | 'system'>('study');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const stopRef = useRef(false);
  const readings = useMemo(() => Array.from(text).filter(isHan).map((character) => readingFor(character, profile)), [text, profile]);
  const active = readings[selected] ?? readings[0];
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
    const vowels: Record<string, [number, number, number]> = { i: [280, 2250, 3100], e: [390, 2050, 2850], ɛ: [610, 1840, 2600], a: [850, 1350, 2500], ɑ: [720, 1100, 2400], ɒ: [550, 920, 2400], u: [330, 760, 2200], ɨ: [350, 1550, 2450], o: [470, 900, 2450] };
    for (let index = 0; index < readings.length; index += 1) {
      if (stopRef.current) break;
      const reading = readings[index]; setSelected(index);
      const duration = reading.tone === 4 ? 0.26 / rate : 0.42 / rate;
      const vowel = Array.from(reading.ipa).reverse().find((symbol) => vowels[symbol]) ?? 'a';
      const [f1, f2, f3] = vowels[vowel]; const source = context.createOscillator(); const gain = context.createGain();
      source.type = 'sawtooth'; source.frequency.setValueAtTime(205, cursor);
      const targetPitch = reading.tone === 2 ? 232 : reading.tone === 3 ? 180 : reading.tone === 4 ? 165 : 208;
      source.frequency.exponentialRampToValueAtTime(targetPitch, cursor + duration);
      gain.gain.setValueAtTime(0.0001, cursor); gain.gain.exponentialRampToValueAtTime(0.06, cursor + 0.035); gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
      source.connect(gain);
      [f1, f2, f3].forEach((frequency, formantIndex) => { const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = formantIndex === 0 ? 5 : 10; gain.connect(filter); filter.connect(context.destination); });
      source.start(cursor); source.stop(cursor + duration); cursor += duration + pause / 1000;
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
  return <main className="site-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="南宋吴地拟音首页"><span>宋</span><b>南宋声景</b></a><div className="topbar-note">研究性拟音 · 数据版 0.1</div><button className="text-button" onClick={downloadAnnotation}>导出注释</button></header>
    <section className="hero" id="top"><div><p className="eyebrow">SOUNDING SOUTHERN SONG</p><h1>让古文以一套<br /><em>可说明来处</em>的声音被听见。</h1><p className="hero-copy">不是“唯一古音”，而是可追溯、可比较、可修订的南宋吴地朗读方案。</p></div><aside className="principle-card"><span className="card-kicker">当前方案</span><strong>{profiles[profile].name}</strong><p>{profiles[profile].note}</p><div><span className="dot" />每一个判断均标注证据等级</div></aside></section>
    <section className="workspace" aria-label="古文拟音工作台"><div className="controls-column"><div className="section-heading"><span>01</span><h2>选择声景</h2></div><div className="profile-switch" role="radiogroup" aria-label="选择拟音方案">{(Object.keys(profiles) as ProfileId[]).map((id) => <button key={id} className={profile === id ? 'profile active' : 'profile'} onClick={() => setProfile(id)} role="radio" aria-checked={profile === id}><b>{profiles[id].name}</b><small>{profiles[id].subtitle}</small></button>)}</div><div className="method-note"><b>方案说明</b><p>“临安”侧重行都的共同语语境；“金华”是地方证据约束下的候选读法。差异不等同于已经证实的口语事实。</p></div></div>
      <div className="input-column"><div className="section-heading"><span>02</span><h2>粘贴古文</h2><small>{text.length} 字符</small></div><textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="古文文本输入" placeholder="在这里粘贴古文、诗词或词作…" /><div className="input-footer"><button className="sample-button" onClick={() => setText(sampleText)}>载入《春晓》示例</button><span>支持编辑；未收录字将标为“待考”</span></div></div></section>
    <section className="analysis-section"><div className="analysis-header"><div><p className="eyebrow">PHONOLOGICAL TRACE</p><h2>逐字拟音</h2></div><div className="coverage"><b>{covered}<small> / {readings.length}</small></b><span>已具可审查读音</span></div></div><div className="token-grid">{readings.length === 0 ? <p className="empty-state">请输入至少一个汉字以开始分析。</p> : readings.map((reading, index) => <button className={selected === index ? `token confidence-${reading.confidence} selected` : `token confidence-${reading.confidence}`} onClick={() => setSelected(index)} key={`${reading.character}-${index}`}><b>{reading.character}</b><span>{reading.ipa}</span><i>{reading.confidence}</i></button>)}</div>
      {active && <article className="evidence-panel"><div className="character-mark">{active.character}</div><div><span className={`confidence-badge confidence-${active.confidence}`}>{active.confidence} · {confidenceLabel[active.confidence]}</span><h3>{active.position}</h3><p><b>释义：</b>{active.meaning}　<b>拟音：</b><code>{active.ipa}</code></p><p className="evidence"><b>依据：</b>{active.evidence}</p></div><button className="change-reading" onClick={() => window.alert('读音覆写将作为下一阶段的词级编辑功能加入；当前原型已保留数据结构与可追溯证据字段。')}>选择替代读法</button></article>}</section>
    <section className="listen-section"><div><p className="eyebrow">LISTENING ROOM</p><h2>聆听这个方案</h2><p className="listen-copy">研究合成以目标 IPA 的元音共振峰、声调与入声时值产生教学声响；系统女声预听则用于连贯性参考，不能当作历史拟音本体。</p></div><div className="voice-panel"><div className="mode-tabs"><button onClick={() => setMode('study')} className={mode === 'study' ? 'active' : ''}>研究合成 <small>IPA 控制</small></button><button onClick={() => setMode('system')} className={mode === 'system' ? 'active' : ''}>系统女声 <small>流畅预听</small></button></div><div className="sliders"><label>语速 <output>{rate.toFixed(2)}×</output><input type="range" min="0.65" max="1.15" step="0.01" value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label><label>句间停顿 <output>{pause}ms</output><input type="range" min="120" max="720" step="30" value={pause} onChange={(event) => setPause(Number(event.target.value))} /></label></div><div className="player-row"><button className={isPlaying ? 'stop-button' : 'play-button'} onClick={isPlaying ? stop : mode === 'study' ? playStudyVoice : playSystemVoice}>{isPlaying ? '■ 停止' : '▶ 开始朗读'}</button><span>{mode === 'study' ? '女声音高 · IPA 元音与调型控制' : '调用设备可用的中文女声（若存在）'}</span></div></div></section>
    <footer><span>南宋声景 · 研究性拟音原型</span><span>请将听感与史实区分：声音的自然度不等于历史结论。</span></footer>
  </main>;
}
