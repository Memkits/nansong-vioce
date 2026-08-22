import { 資料 as qieyunData } from 'qieyun';

export type ProfileId = 'linan' | 'jinhua';
export type Confidence = 'A' | 'B' | 'C' | 'D';
export type Reading = {
  character: string;
  position: string;
  ipa: string;
  meaning: string;
  evidence: string;
  confidence: Confidence;
  tone: 1 | 2 | 3 | 4;
  source: 'reviewed' | 'guangyun-derived' | 'unresolved';
};

type SeedReading = Omit<Reading, 'source'>;

const reviewedReadings: Record<string, SeedReading> = {
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

const initials: Record<string, string> = {
  幫: 'p', 滂: 'pʰ', 並: 'b', 明: 'm', 端: 't', 透: 'tʰ', 定: 'd', 泥: 'n', 來: 'l',
  知: 'ʈʂ', 徹: 'ʈʂʰ', 澄: 'ɖʐ', 孃: 'ɳ', 精: 'ts', 清: 'tsʰ', 從: 'dz', 心: 's', 邪: 'z',
  莊: 'ʈʂ', 初: 'ʈʂʰ', 崇: 'ɖʐ', 生: 'ʂ', 俟: 'ʐ', 章: 'tɕ', 昌: 'tɕʰ', 常: 'dʑ', 書: 'ɕ',
  船: 'ʑ', 日: 'ȵ', 見: 'k', 溪: 'kʰ', 羣: 'ɡ', 疑: 'ŋ', 影: 'ʔ', 曉: 'x', 匣: 'ɣ', 云: 'ɦ', 以: 'j',
};
const rimes: Record<string, string> = {
  東: 'uŋ', 冬: 'uŋ', 鍾: 'yoŋ', 江: 'aŋ', 支: 'i', 脂: 'i', 之: 'ɨ', 微: 'ɨi',
  魚: 'ɨ', 虞: 'y', 模: 'u', 齊: 'ei', 祭: 'iej', 泰: 'ai', 佳: 'ɛ', 皆: 'ɛi', 夬: 'ai', 灰: 'uei', 咍: 'əi', 廢: 'ɐi',
  眞: 'in', 臻: 'in', 文: 'un', 欣: 'ɨn', 元: 'ɐn', 魂: 'uən', 痕: 'ən', 寒: 'an', 刪: 'æn', 山: 'æn', 先: 'en', 仙: 'ien',
  蕭: 'eu', 宵: 'ieu', 肴: 'au', 豪: 'ɑu', 歌: 'ɑ', 麻: 'a', 陽: 'iaŋ', 唐: 'ɑŋ', 庚: 'æŋ', 耕: 'ɛŋ', 清: 'iɛŋ', 青: 'eŋ',
  蒸: 'iŋ', 登: 'əŋ', 尤: 'iu', 侯: 'u', 幽: 'iəu', 侵: 'im', 覃: 'ɑm', 談: 'ɑm', 鹽: 'iɛm', 添: 'iɛm', 咸: 'æm', 銜: 'am', 嚴: 'iɐm', 凡: 'iɐm',
};
const enteringCoda: Record<string, string> = {
  侵: 'p', 覃: 'p', 談: 'p', 鹽: 'p', 添: 'p', 咸: 'p', 銜: 'p', 嚴: 'p', 凡: 'p',
  眞: 't', 臻: 't', 文: 't', 欣: 't', 元: 't', 魂: 't', 痕: 't', 寒: 't', 刪: 't', 山: 't', 先: 't', 仙: 't',
  東: 'k', 冬: 'k', 鍾: 'k', 江: 'k', 陽: 'k', 唐: 'k', 庚: 'k', 耕: 'k', 清: 'k', 青: 'k', 蒸: 'k', 登: 'k',
};

function toneFromCategory(tone: string): 1 | 2 | 3 | 4 {
  return tone === '上' ? 3 : tone === '去' || tone === '入' ? 4 : tone === '平' ? 1 : 2;
}
function contour(tone: string, profile: ProfileId) {
  if (tone === '平') return '˧';
  if (tone === '上') return '˧˩';
  if (tone === '去') return '˥˩';
  return profile === 'linan' ? 'ʔ' : '';
}
function deriveIpa(position: { 母: string; 韻: string; 聲: string }, profile: ProfileId) {
  const onset = initials[position.母] ?? 'ə';
  let final = rimes[position.韻] ?? 'ə';
  if (position.聲 === '入') {
    const coda = enteringCoda[position.韻] ?? 'k';
    final = final.replace(/[mnpŋ]$/, '') + (profile === 'jinhua' ? coda : 'ʔ');
  }
  return `${onset}${final}${contour(position.聲, profile)}`;
}

export function candidatesFor(character: string, profile: ProfileId): Reading[] {
  const reviewed = reviewedReadings[character];
  if (reviewed) {
    const regional = profile === 'jinhua' && reviewed.confidence !== 'A'
      ? { ...reviewed, ipa: reviewed.ipa.replaceAll('ʔ', 'k'), evidence: `${reviewed.evidence}；婺州方案暫保留較明顯的塞尾（C 級假設）。`, confidence: 'C' as Confidence }
      : reviewed;
    return [{ ...regional, source: 'reviewed' }];
  }
  const results = qieyunData.query字頭(character);
  if (results.length) {
    return results.map((result) => ({
      character,
      position: result.音韻地位.描述,
      ipa: deriveIpa(result.音韻地位, profile),
      meaning: result.解釋.replace(/[一二三四五六七八九十]+$/, '').slice(0, 72),
      evidence: `《廣韻》${result.韻部原貌}韻，反切「${result.反切 ?? '未載'}」；IPA 由本项目 v0.2 切韻規則推導。`,
      confidence: 'C',
      tone: toneFromCategory(result.音韻地位.聲),
      source: 'guangyun-derived',
    }));
  }
  return [{ character, position: '待考', ipa: '—', meaning: '尚未收錄', evidence: '此字未命中当前《廣韻》底座；請手動指定或保留待考狀態。', confidence: 'D', tone: 1, source: 'unresolved' }];
}

export function readingFor(character: string, profile: ProfileId, candidateIndex = 0) {
  const candidates = candidatesFor(character, profile);
  return candidates[Math.min(candidateIndex, candidates.length - 1)];
}

export function prosodyOf(reading: Reading) {
  const category = (reading.position.match(/(平|上|去|入)$/)?.[1] ?? '待考') as '平' | '上' | '去' | '入' | '待考';
  const rhyme = Object.keys(rimes).find((name) => reading.position.endsWith(`${name}${category}`))
    ?? reading.position.match(/(.)(平|上|去|入)$/)?.[1]
    ?? null;
  return {
    category,
    level: category === '平' ? '平' : category === '待考' ? '？' : '仄',
    rhyme,
    entering: category === '入',
  };
}

export const confidenceLabel: Record<Confidence, string> = { A: '强证据', B: '有力推断', C: '规则推导 / 合理假设', D: '待考 / 合成策略' };
export const isHan = (character: string) => /[\u3400-\u9fff]/.test(character);
