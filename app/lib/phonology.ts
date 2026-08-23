import * as TshetUinhExamples from 'tshet-uinh-examples';

export type ProfileId = 'tongyu' | 'linan';
export type Confidence = 'A' | 'B' | 'C' | 'D';
export type Reading = {
  character: string;
  position: string;
  ipa: string;
  baxter: string;
  meaning: string;
  evidence: string;
  confidence: Confidence;
  categoryConfidence: Confidence;
  periodConfidence: Confidence;
  regionalConfidence: Confidence;
  tone: 1 | 2 | 3 | 4;
  source: 'song-derived' | 'unresolved';
  sourceRhyme: string | null;
  rime: string | null;
};

type ToneCategory = '平' | '上' | '去' | '入';
type RhymeFamily = { rimes: string; labels: Record<ToneCategory, string | null> };

// 《廣韻》韻類到平水 106 韻的合併層。它只回答「詩韻是否同部」，
// 不用來倒推臨安或婺州的實際元音。
const rhymeFamilies: RhymeFamily[] = [
  { rimes: '東', labels: { 平: '上平一東', 上: '上聲一董', 去: '去聲一送', 入: '入聲一屋' } },
  { rimes: '冬鍾', labels: { 平: '上平二冬', 上: '上聲二腫', 去: '去聲二宋', 入: '入聲二沃' } },
  { rimes: '江', labels: { 平: '上平三江', 上: '上聲三講', 去: '去聲三絳', 入: '入聲三覺' } },
  { rimes: '支脂之', labels: { 平: '上平四支', 上: '上聲四紙', 去: '去聲四寘', 入: null } },
  { rimes: '微', labels: { 平: '上平五微', 上: '上聲五尾', 去: '去聲五未', 入: null } },
  { rimes: '魚', labels: { 平: '上平六魚', 上: '上聲六語', 去: '去聲六御', 入: null } },
  { rimes: '虞模', labels: { 平: '上平七虞', 上: '上聲七麌', 去: '去聲七遇', 入: null } },
  { rimes: '齊祭', labels: { 平: '上平八齊', 上: '上聲八薺', 去: '去聲八霽', 入: null } },
  { rimes: '佳皆夬', labels: { 平: '上平九佳', 上: '上聲九蟹', 去: '去聲十卦', 入: null } },
  { rimes: '灰咍泰廢', labels: { 平: '上平十灰', 上: '上聲十賄', 去: '去聲十一隊', 入: null } },
  { rimes: '真眞諄臻', labels: { 平: '上平十一真', 上: '上聲十一軫', 去: '去聲十二震', 入: '入聲四質' } },
  { rimes: '文欣', labels: { 平: '上平十二文', 上: '上聲十二吻', 去: '去聲十三問', 入: '入聲五物' } },
  { rimes: '元魂痕', labels: { 平: '上平十三元', 上: '上聲十三阮', 去: '去聲十四願', 入: '入聲六月' } },
  { rimes: '寒桓', labels: { 平: '上平十四寒', 上: '上聲十四旱', 去: '去聲十五翰', 入: '入聲七曷' } },
  { rimes: '刪山', labels: { 平: '上平十五刪', 上: '上聲十五潸', 去: '去聲十六諫', 入: '入聲八黠' } },
  { rimes: '先仙', labels: { 平: '下平一先', 上: '上聲十六銑', 去: '去聲十七霰', 入: '入聲九屑' } },
  { rimes: '蕭宵', labels: { 平: '下平二蕭', 上: '上聲十七篠', 去: '去聲十八嘯', 入: null } },
  { rimes: '肴', labels: { 平: '下平三肴', 上: '上聲十八巧', 去: '去聲十九效', 入: null } },
  { rimes: '豪', labels: { 平: '下平四豪', 上: '上聲十九皓', 去: '去聲二十號', 入: null } },
  { rimes: '歌戈', labels: { 平: '下平五歌', 上: '上聲二十哿', 去: '去聲二十一箇', 入: null } },
  { rimes: '麻', labels: { 平: '下平六麻', 上: '上聲二十一馬', 去: '去聲二十二禡', 入: null } },
  { rimes: '陽唐', labels: { 平: '下平七陽', 上: '上聲二十二養', 去: '去聲二十三漾', 入: '入聲十藥' } },
  { rimes: '庚耕清', labels: { 平: '下平八庚', 上: '上聲二十三梗', 去: '去聲二十四敬', 入: '入聲十一陌' } },
  { rimes: '青', labels: { 平: '下平九青', 上: '上聲二十四迥', 去: '去聲二十五徑', 入: '入聲十二錫' } },
  { rimes: '蒸登', labels: { 平: '下平十蒸', 上: null, 去: null, 入: '入聲十三職' } },
  { rimes: '尤侯幽', labels: { 平: '下平十一尤', 上: '上聲二十五有', 去: '去聲二十六宥', 入: null } },
  { rimes: '侵', labels: { 平: '下平十二侵', 上: '上聲二十六寢', 去: '去聲二十七沁', 入: '入聲十四緝' } },
  { rimes: '覃談', labels: { 平: '下平十三覃', 上: '上聲二十七感', 去: '去聲二十八勘', 入: '入聲十五合' } },
  { rimes: '鹽添嚴', labels: { 平: '下平十四鹽', 上: '上聲二十八儉', 去: '去聲二十九豔', 入: '入聲十六葉' } },
  { rimes: '咸銜凡', labels: { 平: '下平十五咸', 上: '上聲二十九豏', 去: '去聲三十陷', 入: '入聲十七洽' } },
];

function toneFromCategory(tone: string): 1 | 2 | 3 | 4 {
  return tone === '上' ? 3 : tone === '去' || tone === '入' ? 4 : tone === '平' ? 1 : 2;
}

function stripToneMarks(ipa: string) {
  return ipa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

function realizeProfile(ipa: string, profile: ProfileId) {
  // 目前「宋代文人通語」直接採北宋橋接；「南宋臨安」尚未做沒有逐條出處的地方化。
  // 兩者分開是為了準確表達研究層級，不暗示已存在兩套不同音值。
  void profile;
  return ipa;
}

export function candidatesFor(character: string, profile: ProfileId): Reading[] {
  const results = TshetUinhExamples.from字頭(['position', 'baxter', 'n_song'] as const, character);
  if (results.length) {
    return results.map((result) => {
      const [position, baxter, northernSong] = result.推導結果;
      const sourceRhyme = result.來源?.韻目 ?? result.音韻地位.韻;
      const rime = result.音韻地位.韻;
      const ipa = realizeProfile(northernSong, profile);
      const isTongyu = profile === 'tongyu';
      return {
        character,
        position,
        ipa,
        baxter,
        meaning: result.釋義.replace(/[一二三四五六七八九十]+$/, '').slice(0, 96),
        evidence: `《廣韻》${sourceRhyme}韻，反切「${result.反切 ?? '未載'}」；白一平轉寫 ${baxter}；音值採 TshetUinh《聲音唱和圖》北宋推導 ${northernSong} 作時代橋接。${isTongyu ? '宋詞實際用韻與宋人音注尚未完成逐字校驗。' : '臨安城市共同語層尚無足以逐字改寫的直接證據，故暫與通語基線同音。'}`,
        confidence: isTongyu ? 'B' : 'C',
        categoryConfidence: 'A',
        periodConfidence: 'B',
        regionalConfidence: isTongyu ? 'B' : 'C',
        tone: toneFromCategory(result.音韻地位.聲),
        source: 'song-derived',
        sourceRhyme,
        rime,
      };
    });
  }
  return [{
    character,
    position: '待考',
    ipa: '—',
    baxter: '—',
    meaning: '尚未收錄',
    evidence: '此字未命中當前《廣韻》底座；請手動指定或保留待考狀態。',
    confidence: 'D', categoryConfidence: 'D', periodConfidence: 'D', regionalConfidence: 'D',
    tone: 1, source: 'unresolved', sourceRhyme: null, rime: null,
  }];
}

function preferredIndex(hanText: string, index: number, candidates: Reading[]) {
  const character = hanText[index];
  const previous = hanText[index - 1] ?? '';
  const next = hanText[index + 1] ?? '';
  const choose = (category: ToneCategory) => {
    const found = candidates.findIndex((reading) => reading.position.endsWith(category));
    return found < 0 ? 0 : found;
  };
  if (character === '不') return choose('入');
  if (character === '覺') return previous === '睡' ? choose('去') : choose('入');
  if (character === '處') return next === '所' || previous === '到' || next === '處' || previous === '處' ? choose('去') : 0;
  if (character === '聞') return previous === '名' || previous === '令' ? choose('去') : choose('平');
  if (character === '雨') return next && /[雪我師澤]/.test(next) ? choose('去') : choose('上');
  if (character === '少') return next && /[年女小主]/.test(next) ? choose('去') : choose('上');
  return 0;
}

export function readingsFor(text: string, profile: ProfileId, overrides: Record<number, number> = {}) {
  const characters = Array.from(text).filter(isHan);
  const hanText = characters.join('');
  return characters.map((character, index) => {
    const candidates = candidatesFor(character, profile);
    const selected = overrides[index] ?? preferredIndex(hanText, index, candidates);
    return candidates[Math.min(selected, candidates.length - 1)];
  });
}

export function prosodyOf(reading: Reading) {
  const category = (reading.position.match(/(平|上|去|入)$/)?.[1] ?? '待考') as ToneCategory | '待考';
  const family = reading.rime ? rhymeFamilies.find((entry) => entry.rimes.includes(reading.rime!)) : undefined;
  const pingshui = category === '待考' ? null : family?.labels[category] ?? null;
  return {
    category,
    level: category === '平' ? '平' : category === '待考' ? '？' : '仄',
    sourceRhyme: reading.sourceRhyme,
    pingshui,
    rhymeKey: pingshui ? pingshui.replace(/^(上平|下平|上聲|去聲|入聲)[一二三四五六七八九十]+/, '') : null,
    entering: category === '入',
    audibleFinal: stripToneMarks(reading.ipa).replace(/^[^aeiouyɨɯɛɑɒəʌœøɐ]+/, ''),
  };
}

export const confidenceLabel: Record<Confidence, string> = {
  A: '韻書音韻地位', B: '宋代橋接推導', C: '地域音值待校', D: '待考／合成策略',
};
export const isHan = (character: string) => /[\u3400-\u9fff]/.test(character);
