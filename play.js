// 학생 화면
import { initDB, isDemo } from './db.js';
import * as G from './game.js';
import { $, esc, nl2br, patch, startTimers, sfx, confetti, toast } from './ui.js';

const app = $('#app');
const LS = 'quizshow-player';
let db, code, uid;
const S = {};
let subs = [], qSub = null, qSubIdx = null, lastKey = '';

const P = (p = '') => `rooms/${code}${p ? '/' + p : ''}`;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const tag = (t) => {
  const x = S.teams?.[t];
  return x ? `<span class="tag" style="--c:${x.color}">${x.emoji} ${esc(x.name)}</span>` : '';
};

async function main() {
  app.innerHTML = '<div class="center"><div class="spinner"></div></div>';
  try {
    db = await initDB();
  } catch (e) {
    app.innerHTML = `<div class="card error">서버에 연결하지 못했어요. 선생님께 알려 주세요.<br><small>${esc(e.message)}</small></div>`;
    return;
  }
  uid = db.uid;
  startTimers(db.now);
  const urlCode = new URLSearchParams(location.search).get('room');
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS)); } catch {}
  if (saved?.code && (!urlCode || urlCode === saved.code)) {
    const me = await db.get(`rooms/${saved.code}/players/${uid}`).catch(() => null);
    if (me) { code = saved.code; return enter(); }
  }
  renderJoin(urlCode || saved?.code || '', saved?.name || '');
}

// ───────────────────────── 참여하기 ─────────────────────────
function renderJoin(prefCode, prefName) {
  app.innerHTML = `<div class="join">
    <div class="hero small"><div class="hero-emoji">🐻🦆🐸🐶🐹🦦</div><h1>동물 친구 퀴즈쇼</h1></div>
    ${isDemo ? '<p class="demo small">🧪 체험 모드 (같은 브라우저의 탭끼리만 연결돼요)</p>' : ''}
    <div class="card">
      <label class="field">방 코드<input id="jcode" inputmode="numeric" maxlength="4" placeholder="0000" value="${esc(prefCode)}"></label>
      <label class="field">내 이름<input id="jname" maxlength="8" placeholder="이름 (8글자까지)" value="${esc(prefName)}"></label>
      <button class="btn big primary wide" id="jnext">다음 ▶</button>
    </div>
    <a class="teacher-link" href="host.html">선생님이신가요? 게임 방 만들기 →</a>
  </div>`;
  const go = async () => {
    const c = $('#jcode').value.trim();
    const name = $('#jname').value.trim();
    if (!/^\d{4}$/.test(c)) return toast('방 코드 4자리를 입력해요');
    if (!name) return toast('이름을 입력해요');
    $('#jnext').disabled = true;
    const host = await db.get(`rooms/${c}/host`).catch(() => null);
    if (!host) { $('#jnext').disabled = false; return toast('그런 방이 없어요. 방 코드를 확인해요!'); }
    code = c;
    const [teams, players, state] = await Promise.all([db.get(P('teams')), db.get(P('players')), db.get(P('state'))]);
    if (state?.phase === 'final') { $('#jnext').disabled = false; return toast('이미 끝난 게임이에요'); }
    renderTeamPick(name, teams, players || {});
  };
  $('#jnext').onclick = go;
  $('#jname').onkeydown = (e) => e.key === 'Enter' && go();
  (prefCode ? $('#jname') : $('#jcode')).focus();
}

function renderTeamPick(name, teams, players) {
  const counts = {};
  Object.values(players).forEach((p) => (counts[p.team] = (counts[p.team] || 0) + 1));
  app.innerHTML = `<div class="join">
    <h2 class="center-text">${esc(name)}, 우리 모둠을 골라요!</h2>
    <div class="team-pick">${G.teamIds(teams).map((t) => {
      const x = teams[t];
      return `<button class="team-btn" style="--c:${x.color}" data-t="${t}"><span class="big-emoji">${x.emoji}</span>${esc(x.name)}<small>${counts[t] || 0}명</small></button>`;
    }).join('')}</div>
    <button class="btn ghost wide" id="back">◀ 뒤로</button>
  </div>`;
  $('#back').onclick = () => renderJoin(code, name);
  app.querySelectorAll('.team-btn').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      await db.set(P(`players/${uid}`), { name, team: b.dataset.t, joinedAt: Date.now() });
    } catch (e) {
      b.disabled = false;
      return toast('들어가지 못했어요: ' + e.message);
    }
    localStorage.setItem(LS, JSON.stringify({ code, name }));
    sfx('pop');
    enter();
  }));
}

function enter() {
  subs.forEach((u) => u());
  subs = [];
  for (const k of ['info', 'state', 'teams', 'players', 'pscores']) {
    subs.push(db.on(P(k), (v) => {
      S[k] = v;
      S.loaded = { ...(S.loaded || {}), [k]: true };
      if (k === 'state') watchQ();
      render();
    }));
  }
}

function watchQ() {
  const qi = S.state?.qi;
  if (qi == null || qi < 0 || qi === qSubIdx) return;
  qSub?.();
  qSubIdx = qi;
  S.qd = null;
  qSub = db.on(P(`q/${qi}`), (v) => { S.qd = v || {}; render(); });
}

function leave(msg) {
  subs.forEach((u) => u());
  qSub?.();
  subs = []; qSub = null; qSubIdx = null;
  localStorage.removeItem(LS);
  toast(msg);
  renderJoin('', '');
}

// ───────────────────────── 화면 ─────────────────────────
function render() {
  const L = S.loaded || {};
  if (!L.info || !L.state || !L.teams || !L.players) return;
  if (!S.info) return leave('게임 방이 닫혔어요');
  const me = S.players?.[uid];
  if (!me) return leave('방에서 나왔어요. 다시 들어와 주세요');
  const team = S.teams[me.team];
  const s = S.state;

  const key = `${s.phase}:${s.qi}`;
  if (key !== lastKey) {
    if (lastKey) onPhase(s.phase);
    lastKey = key;
  }

  const head = `<header class="ptop" style="--c:${team.color}">
    <span class="pteam">${team.emoji} ${esc(team.name)}</span>
    <span class="pname">${esc(me.name)}</span>
    <span class="pscore">모둠 <b>${team.score}</b> · 나 <b>${S.pscores?.[uid] || 0}</b></span>
  </header>`;
  const views = { lobby: vLobby, question: vQuestion, reveal: vReveal, pick: vPick, boxes: vBoxes, score: vScore, final: vFinal };
  const needQ = ['question', 'reveal', 'pick', 'boxes'].includes(s.phase);
  const body = needQ && !S.qd ? '<div class="center"><div class="spinner"></div></div>' : views[s.phase](me, team);
  patch(app, head + `<main class="pmain">${body}</main>`);
}

function onPhase(ph) {
  if (ph === 'question') sfx('pop');
  if (ph === 'reveal') {
    setTimeout(() => {
      const r = S.qd?.result?.players?.[uid];
      sfx(r ? 'ok' : 'no');
    }, 200);
  }
  if (ph === 'boxes') sfx('open');
  if (ph === 'final') { sfx('fanfare'); confetti(80); }
}

const mates = (t) => Object.entries(S.players || {}).filter(([, p]) => p.team === t);
const itemsLine = (x) => `🎫 ${x.freePass || 0} · ✨ ${x.double || 0} · ⭐ ${x.stars || 0}`;

function vLobby(me, team) {
  return `<div class="wait">
    <div class="bounce">${team.emoji}</div>
    <h2>${esc(team.name)} 모둠에 들어왔어요!</h2>
    <p>선생님이 게임을 시작할 때까지 기다려요.</p>
    <div class="card"><h3>우리 모둠 친구들</h3><div class="members">${mates(me.team).map(([, p]) => `<span class="member">${esc(p.name)}</span>`).join('')}</div></div>
    <div class="card small-card"><b>우리 모둠 아이템</b><br>${itemsLine(team)}</div>
  </div>`;
}

function answerInput(kind, type, choices, current, disabled) {
  const qi = S.state.qi;
  const dis = disabled ? 'disabled' : '';
  if (type === 'ox')
    return `<div class="ox-row small">${['O', 'X'].map((v) => `<button class="ox ${v.toLowerCase()} ${current === v ? 'sel' : ''}" data-act="${kind}" data-v="${v}" ${dis}>${v}</button>`).join('')}</div>`;
  if (type === 'choice')
    return `<div class="choices small">${choices.map((c, i) => `<button class="choice ${String(current) === String(i + 1) ? 'sel' : ''}" data-act="${kind}" data-v="${i + 1}" ${dis}><b>${G.CIRCLED[i]}</b> ${esc(c)}</button>`).join('')}</div>`;
  return `<div class="row"><input id="${kind}-${qi}" class="ans-input" maxlength="30" placeholder="정답을 써요" autocomplete="off" ${dis}>
    <button class="btn primary" data-act="${kind}" ${dis}>제출</button></div>`;
}

function vQuestion(me, team) {
  const s = S.state;
  const d = S.qd || {};
  const t = me.team;
  const timeUp = s.deadline && db.now() > s.deadline;
  const mine = d.ans?.[uid]?.text;
  const ta = d.teamAns?.[t];
  const fpOn = !!d.req?.[t]?.freePass;
  return `<div class="pq">
    <div class="qhead"><span class="qbadge">QUIZ ${s.qi + 1}</span>${s.deadline ? `<span class="timer" data-deadline="${s.deadline}"></span>` : ''}</div>
    <div class="qtext small">${nl2br(s.q.text)}</div>
    <section class="card step-card">
      <h3>① 나의 정답</h3>
      ${answerInput('myAns', s.q.type, s.q.choices, mine, timeUp)}
      <div class="status">${mine != null ? `✅ 제출했어요: <b>${esc(G.givenLabel(s.q.type, mine))}</b> <small>(정답 공개 전까지 바꿀 수 있어요)</small>` : '아직 제출하지 않았어요'}</div>
    </section>
    <section class="card step-card">
      <h3>② 모둠 친구들의 생각</h3>
      <div class="mate-list">${mates(t).map(([u, p]) => {
        const a = d.ans?.[u]?.text;
        return `<div class="mate ${u === uid ? 'me' : ''}"><span>${esc(p.name)}</span><b>${a != null ? esc(G.givenLabel(s.q.type, a)) : '<span class="muted">생각 중…</span>'}</b></div>`;
      }).join('')}</div>
    </section>
    <section class="card step-card team-step" style="--c:${team.color}">
      <h3>③ 우리 모둠 정답 <small>(의논해서 한 명이 제출)</small></h3>
      ${answerInput('teamAns', s.q.type, s.q.choices, ta?.text, timeUp)}
      <div class="status">${ta ? `📮 모둠 정답: <b>${esc(G.givenLabel(s.q.type, ta.text))}</b> <small>(${esc(ta.name)} 제출)</small>` : '아직 모둠 정답이 없어요'}</div>
      ${(team.freePass || 0) > 0 || fpOn ? `<button class="btn item ${fpOn ? 'on' : ''}" data-act="freePass">🎫 프리 패스 ${fpOn ? '사용 중! (누르면 취소)' : `사용하기 (남은 ${team.freePass}개)`}</button>` : ''}
    </section>
    ${timeUp ? '<div class="allwrong">⏱ 시간이 끝났어요!</div>' : ''}
  </div>`;
}

function vReveal(me) {
  const res = S.qd?.result;
  if (!res) return '<div class="center"><div class="spinner"></div></div>';
  const s = S.state;
  const d = S.qd;
  const mine = d.ans?.[uid]?.text;
  const myOk = res.players?.[uid];
  const tr = res.teams?.[me.team] || {};
  return `<div class="pq">
    <div class="answer-banner">정답 <b>${esc(res.answer)}</b></div>
    ${res.explain ? `<div class="explain">💡 ${esc(res.explain)}</div>` : ''}
    <div class="result-card ${myOk ? 'ok' : 'bad'}">
      <div class="big-emoji">${mine == null ? '🤔' : myOk ? '⭕' : '❌'}</div>
      <div>나의 답: <b>${esc(G.givenLabel(s.q.type, mine))}</b></div>
      <div>${mine == null ? '답을 내지 않았어요' : myOk ? '정답! 개인 점수 +1' : '아쉬워요! 다시 기억해 둬요'}</div>
    </div>
    <div class="result-card ${tr.correct ? 'ok' : 'bad'}">
      <div>우리 모둠: <b>${esc(G.givenLabel(s.q.type, tr.ans))}</b></div>
      <div>${tr.correct ? (tr.fp ? '🎫 프리 패스로 정답 인정!' : '⭕ 모둠 정답!') + ' 곧 보물 상자를 골라요 🎁' : '❌ 이번엔 아쉬워요'}</div>
    </div>
  </div>`;
}

function vPick(me, team) {
  const d = S.qd || {};
  const ok = d.result?.teams?.[me.team]?.correct;
  if (!ok) return `<div class="wait"><div class="bounce">🙈</div><h2>이번 문제는 쉬어가요</h2><p>다른 모둠이 보물 상자를 고르는 중이에요!</p></div>`;
  const cur = d.picks?.[me.team];
  const dOn = !!d.req?.[me.team]?.double;
  return `<div class="pq">
    <h2 class="center-text">보물 상자를 골라요! <span class="basepill">기본 점수 <b>${S.state.base}점</b></span></h2>
    <div class="chests small">${[0, 1, 2, 3].map((b) => `
      <button class="chest ${cur?.box === b ? 'sel' : ''}" data-act="pickBox" data-b="${b}"><div class="chest-lid"></div><div class="chest-body">${b + 1}</div></button>`).join('')}
    </div>
    <div class="status center-text">${cur ? `🎯 ${cur.box + 1}번 상자 선택 <small>(${esc(cur.name)})</small>` : '모둠 친구들과 의논해서 골라요'}</div>
    ${(team.double || 0) > 0 || dOn ? `<button class="btn item wide ${dOn ? 'on' : ''}" data-act="double">✨ 더블 포인트 ${dOn ? '사용 중! (누르면 취소)' : `사용하기 (남은 ${team.double}개)`}</button>` : ''}
  </div>`;
}

function vBoxes(me) {
  const B = S.qd?.boxes;
  if (!B) return '<div class="center"><div class="spinner"></div></div>';
  const t = me.team;
  const my = B.picks?.[t];
  const gain = B.gains?.[t];
  const acts = (B.actions || []).filter(Boolean);
  const notes = [];
  acts.forEach((a) => {
    const it = G.ITEMS[a.type];
    if (!a.team && (a.candidates || []).includes(t)) notes.push(`${it.emoji} <b>${it.name}</b>을(를) 여러 모둠이 골랐어요! 가위바위보로 정해요 ✊✌️🖐`);
    if (a.team === t && a.type === 'dice')
      notes.push(a.roll == null
        ? `🎲 <b>복불복 주사위</b>! <button class="btn primary" data-act="rollReq" ${S.qd?.req?.[t]?.dice ? 'disabled' : ''}>주사위 굴리기</button>`
        : `🎲 주사위 <b class="dice">${a.roll}</b> → <b>${signed(a.amount)}점</b>`);
    if (a.team === t && ['steal', 'copy', 'swap'].includes(a.type) && !a.skipped)
      notes.push(a.target ? `${it.emoji} <b>${it.name}</b> ➜ ${tag(a.target)}` : `${it.emoji} <b>${it.name}</b> 획득! 선생님께 지목할 모둠을 말해요`);
    if (a.target === t && a.team) notes.push(`😱 ${tag(a.team)} 이(가) 우리 모둠에 <b>${it.name}</b>을(를) 썼어요!`);
  });
  if (B.item === 'star' && (B.itemTeams || []).includes(t)) notes.push('⭐ <b>황금 별</b> 획득! 최종 점수에 보너스가 붙어요');
  return `<div class="pq">
    <div class="mini-chests">${[0, 1, 2, 3].map((b) => {
      const type = B.types[b];
      const label = type === 'item' && B.item ? `${G.ITEMS[B.item].emoji} ${G.ITEMS[B.item].name}` : G.BOX[type].label;
      return `<div class="mini ${my === b ? 'mine' : ''}"><div class="n">${b + 1}</div><div class="e">${G.BOX[type].emoji}</div><small>${label}</small></div>`;
    }).join('')}</div>
    ${gain != null ? `<div class="result-card ${gain > 0 ? 'ok' : 'bad'}"><div>우리 모둠 이번 라운드</div><div class="big-num">${signed(gain)}점</div>${B.dbl?.[t] ? '<small>✨ 더블 포인트 적용</small>' : ''}</div>`
      : '<div class="result-card bad">이번 라운드는 쉬어가요</div>'}
    ${notes.map((n) => `<div class="card note">${n}</div>`).join('')}
  </div>`;
}

function ranked(list, key) {
  return list.map((x) => ({ ...x, rank: list.findIndex((y) => y[key] === x[key]) + 1 }));
}
const medal = (r) => ['🥇', '🥈', '🥉'][r - 1] || `${r}위`;

function vScore(me) {
  const list = ranked(G.teamIds(S.teams).map((t) => ({ t, ...S.teams[t] })).sort((a, b) => b.score - a.score), 'score');
  return `<div class="pq"><h2 class="center-text">📊 점수판</h2>
    <div class="board small">${list.map((x) => `
      <div class="brow ${x.t === me.team ? 'mine' : ''}" style="--c:${x.color}">
        <div class="brank">${medal(x.rank)}</div><div class="bemoji">${x.emoji}</div><div class="bname">${esc(x.name)}</div>
        ${x.lastGain ? `<div class="bgain ${x.lastGain < 0 ? 'neg' : ''}">${signed(x.lastGain)}</div>` : ''}
        <div class="bscore">${x.score}</div></div>`).join('')}</div>
    <p class="center-text muted">다음 문제를 기다려요…</p></div>`;
}

function vFinal(me, team) {
  const list = ranked(G.teamIds(S.teams).map((t) => ({ t, ...S.teams[t], fin: S.teams[t].final ?? S.teams[t].score })).sort((a, b) => b.fin - a.fin), 'fin');
  const mine = list.find((x) => x.t === me.team);
  const myScore = S.pscores?.[uid] || 0;
  return `<div class="pq">
    <div class="wait"><div class="bounce">${team.emoji}</div>
    <h2>우리 모둠 ${medal(mine.rank)}</h2>
    <div class="big-num">${mine.fin}점</div>
    <small>게임 ${mine.score}점 + 황금 별 ${mine.stars || 0}개 보너스 ${G.starBonus(mine.stars || 0)}점</small></div>
    <div class="result-card ok"><div>나의 개인 점수</div><div class="big-num">${myScore} / ${S.info.total}</div></div>
    <div class="board small">${list.map((x) => `<div class="brow ${x.t === me.team ? 'mine' : ''}" style="--c:${x.color}"><div class="brank">${medal(x.rank)}</div><div class="bemoji">${x.emoji}</div><div class="bname">${esc(x.name)}</div><div class="bscore">${x.fin}</div></div>`).join('')}</div>
  </div>`;
}

// ───────────────────────── 동작 ─────────────────────────
async function submit(kind, v) {
  const s = S.state;
  const me = S.players[uid];
  if (s.phase !== 'question') return;
  if (s.deadline && db.now() > s.deadline) return toast('시간이 끝났어요');
  if (v == null) {
    v = $(`#${kind}-${s.qi}`)?.value.trim();
    if (!v) return toast('정답을 입력해요');
  }
  if (kind === 'myAns') await db.set(P(`q/${s.qi}/ans/${uid}`), { text: v, name: me.name, team: me.team });
  else await db.set(P(`q/${s.qi}/teamAns/${me.team}`), { text: v, name: me.name, uid });
  sfx('pop');
  if (s.q.type === 'short') {
    const el = $(`#${kind}-${s.qi}`);
    if (el) el.value = '';
  }
}

const H = {
  myAns: ({ v }) => submit('myAns', v),
  teamAns: ({ v }) => submit('teamAns', v),
  freePass: () => {
    const t = S.players[uid].team;
    const p = P(`q/${S.state.qi}/req/${t}/freePass`);
    return S.qd?.req?.[t]?.freePass ? db.remove(p) : db.set(p, true);
  },
  double: () => {
    const t = S.players[uid].team;
    const p = P(`q/${S.state.qi}/req/${t}/double`);
    return S.qd?.req?.[t]?.double ? db.remove(p) : db.set(p, true);
  },
  pickBox: ({ b }) => {
    const me = S.players[uid];
    sfx('pop');
    return db.set(P(`q/${S.state.qi}/picks/${me.team}`), { box: +b, name: me.name });
  },
  rollReq: () => db.set(P(`q/${S.state.qi}/req/${S.players[uid].team}/dice`), true),
};

app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || !H[b.dataset.act]) return;
  b.disabled = true;
  try {
    await H[b.dataset.act](b.dataset);
  } catch (err) {
    console.error(err);
    toast('전송하지 못했어요. 다시 눌러 봐요');
  } finally {
    if (b.isConnected) b.disabled = false;
  }
});
app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList?.contains('ans-input')) return;
  const kind = e.target.id.split('-')[0];
  submit(kind).catch(() => toast('전송하지 못했어요'));
});

// 제한 시간이 지나면 입력칸을 잠그기 위해 주기적으로 다시 그림
setInterval(() => S.state?.phase === 'question' && S.state.deadline && render(), 1000);

main();
