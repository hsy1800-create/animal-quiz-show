// 게임 규칙 (원본 PPT의 '게임 플레이 방법' · '게임 아이템 설명' 슬라이드 기준)

export const TEAM_PRESETS = [
  { name: '꼬미', emoji: '🐻', color: '#FF8A65' },
  { name: '둥둥오링', emoji: '🦆', color: '#4FC3F7' },
  { name: '굴개굴개', emoji: '🐸', color: '#81C784' },
  { name: '댕댕이', emoji: '🐶', color: '#FFB74D' },
  { name: '토실이', emoji: '🐹', color: '#F06292' },
  { name: '여울이', emoji: '🦦', color: '#9575CD' },
  { name: '냥냥이', emoji: '🐱', color: '#4DB6AC' },
  { name: '판다곰', emoji: '🐼', color: '#90A4AE' },
];

export const ITEMS = {
  freePass: { name: '프리 패스', emoji: '🎫', desc: '정답 공개 전에 쓰면 틀려도 정답으로 인정! (정답이면 아이템은 그대로 남아요)' },
  double: { name: '더블 포인트', emoji: '✨', desc: '보물 상자 공개 전에 쓰면 기본 점수가 2배!' },
  star: { name: '황금 별', emoji: '⭐', desc: '최종 점수에 보너스! 1개 50 · 2개 120 · 3개 200 · 4개 300점' },
  dice: { name: '복불복 주사위', emoji: '🎲', desc: '주사위 수(-2, -1, 1, 2, 3, 4) × 이번 라운드 획득 점수만큼 더 얻거나 잃어요.' },
  steal: { name: '점수 스틸', emoji: '🦝', solo: true, desc: '지목한 모둠의 이번 라운드 획득 점수를 빼앗아 와요. (한 모둠만)' },
  copy: { name: '점수 복사', emoji: '📋', solo: true, desc: '라운드가 끝난 뒤 지목한 모둠의 총점을 그대로 복사해요. (한 모둠만, 반드시 사용)' },
  swap: { name: '점수 교환', emoji: '🔄', solo: true, desc: '라운드가 끝난 뒤 지목한 모둠과 총점을 서로 바꿔요. (한 모둠만, 반드시 사용)' },
};

// 원본 아이템 상자 구성: 30개
export const ITEM_POOL = [
  ...Array(14).fill('star'), ...Array(4).fill('dice'),
  ...Array(4).fill('steal'), ...Array(4).fill('copy'), ...Array(4).fill('swap'),
];

export const BOX = {
  plus: { label: '기본 점수 +10', emoji: '🌟' },
  base: { label: '기본 점수 획득', emoji: '💰' },
  minus: { label: '기본 점수 -10', emoji: '💧' },
  item: { label: '아이템 상자!', emoji: '🎁' },
  fail: { label: '꽝! 0점', emoji: '💥' },
};

export const BASES = [20, 30, 40, 50];
export const DICE_FACES = [-2, -1, 1, 2, 3, 4];

export const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const pick = (a) => a[Math.floor(Math.random() * a.length)];

// 네 상자: +10 / 기본 / -10 / (아이템 상자 또는 꽝) — 원본 보상 슬라이드 구성과 동일
export const makeBoxes = () => ({
  types: shuffle(['plus', 'base', 'minus', Math.random() < 0.5 ? 'item' : 'fail']),
  base: pick(BASES),
});

export function boxGain(type, base, dbl) {
  const b = base * (dbl ? 2 : 1);
  return { plus: b + 10, base: b, minus: b - 10, item: b, fail: 0 }[type] ?? 0;
}

export const starBonus = (n) =>
  n <= 0 ? 0 : n === 1 ? 50 : n === 2 ? 120 : n === 3 ? 200 : 300 + (n - 4) * 100;

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/°/g, '도')
    .replace(/[\s()[\]{}.,!?~'"‘’“”·\-]/g, '')
    .replace(/^약/, '');
}

export function isCorrect(q, given) {
  if (given == null || given === '') return false;
  if (q.type === 'ox') return String(given).toUpperCase() === q.answer;
  if (q.type === 'choice') return Number(given) === q.answer;
  const g = normalize(given);
  return [q.answer, ...(q.accept || [])].some((a) => normalize(a) === g);
}

export const CIRCLED = ['①', '②', '③', '④'];

export function answerLabel(q) {
  if (q.type === 'choice') return `${CIRCLED[q.answer - 1]} ${q.choices[q.answer - 1]}`;
  return q.answer;
}

// 학생이 낸 답을 보기 좋게
export function givenLabel(type, given) {
  if (given == null || given === '') return '—';
  if (type === 'choice') return CIRCLED[Number(given) - 1] || String(given);
  return String(given);
}

export const teamIds = (teams) =>
  Object.keys(teams || {}).sort((a, b) => (teams[a].order ?? 0) - (teams[b].order ?? 0));
