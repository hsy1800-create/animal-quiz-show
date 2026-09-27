// 선생님(진행자) 화면 — 게임 상태를 결정하고 점수를 계산하는 쪽
import { initDB, isDemo } from './db.js';
import { QUIZ } from './questions.js';
import * as G from './game.js';
import { $, esc, nl2br, patch, startTimers, sfx, confetti, toast } from './ui.js';

const app = $('#app');
const LS = 'quizshow-host-room';
const QS = QUIZ.questions;
const ui = { help: false, adjust: false };
let db, code, R, unsub, lastPhaseKey = '';
const rolling = new Set();

const P = (p = '') => `rooms/${code}${p ? '/' + p : ''}`;
const tids = () => G.teamIds(R.teams);
const curQ = () => QS[R.secret.order[R.state.qi]];
const qd = () => (R.q && R.q[R.state.qi]) || {};
const membersOf = (t) => Object.entries(R.players || {}).filter(([, p]) => p.team === t);
const joinURL = () => new URL(`index.html?room=${code}`, location.href).href;
const typeName = (t) => ({ short: '단답형', ox: 'O / X', choice: '객관식' }[t]);
const tag = (t) => {
  const x = R.teams[t];
  return `<span class="tag" style="--c:${x.color}">${x.emoji} ${esc(x.name)}</span>`;
};
const itemsHTML = (x) =>
  `<span title="프리 패스">🎫${x.freePass || 0}</span><span title="더블 포인트">✨${x.double || 0}</span><span title="황금 별">⭐${x.stars || 0}</span>`;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

async function main() {
  app.innerHTML = '<div class="center"><div class="spinner"></div></div>';
  try {
    db = await initDB();
  } catch (e) {
    app.innerHTML = `<div class="card error">Firebase 연결에 실패했어요: ${esc(e.message)}<br>README의 설정 방법(익명 로그인 사용 설정 등)을 확인해 주세요.</div>`;
    return;
  }
  startTimers(db.now);
  const saved = localStorage.getItem(LS);
  if (saved) {
    const h = await db.get(`rooms/${saved}/host`).catch(() => null);
    if (h === db.uid) return renderResume(saved);
    localStorage.removeItem(LS);
  }
  renderSetup();
}

function renderResume(saved) {
  app.innerHTML = `<div class="setup"><div class="card center-card">
    <h2>진행 중이던 게임이 있어요</h2>
    <p>방 코드 <b class="big-code">${saved}</b></p>
    <div class="row center"><button class="btn big primary" id="resume">이어서 진행하기</button>
    <button class="btn big ghost" id="fresh">새 게임 만들기</button></div></div></div>`;
  $('#resume').onclick = () => { code = saved; attach(); };
  $('#fresh').onclick = () => { localStorage.removeItem(LS); renderSetup(); };
}

// ───────────────────────── 설정 화면 ─────────────────────────
function renderSetup() {
  const opts = (arr, sel) => arr.map((n) => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}</option>`).join('');
  app.innerHTML = `<div class="setup">
    <div class="hero">
      <div class="hero-emoji">${G.TEAM_PRESETS.slice(0, 6).map((t) => t.emoji).join('')}</div>
      <h1>${esc(QUIZ.title)}</h1>
      <p>${esc(QUIZ.subtitle)}</p>
      ${isDemo ? '<p class="demo">🧪 체험 모드 — Firebase 설정 전이라, 이 브라우저의 다른 탭에서만 학생으로 참여할 수 있어요.</p>' : ''}
    </div>
    <section class="card">
      <h2>모둠 설정</h2>
      <label class="inline">모둠 수 <select id="teamCount">${opts([2, 3, 4, 5, 6, 7, 8], 6)}</select></label>
      <div class="team-edits">${G.TEAM_PRESETS.map((t, i) => `
        <div class="team-edit" data-i="${i}" style="--c:${t.color}"><span class="emoji">${t.emoji}</span>
        <input id="tn${i}" maxlength="6" value="${esc(t.name)}" aria-label="${i + 1}모둠 이름"></div>`).join('')}
      </div>
      <p class="hint">모둠 이름은 6글자까지. 20~25명이면 6모둠(모둠당 4명 안팎)을 추천해요.</p>
    </section>
    <section class="card">
      <h2>진행 설정</h2>
      <div class="row wrap">
        <label class="inline">🎫 시작 프리 패스 <select id="startFP">${opts([0, 1, 2, 3], 1)}</select></label>
        <label class="inline">✨ 시작 더블 포인트 <select id="startDB">${opts([0, 1, 2, 3], 1)}</select></label>
        <label class="inline">⏱ 제한 시간 <select id="timer">
          <option value="0">없음</option><option value="30">30초</option><option value="60" selected>60초</option>
          <option value="90">90초</option><option value="120">120초</option></select></label>
        <label class="inline"><input type="checkbox" id="shuffleQ" checked> 문제 순서 섞기</label>
      </div>
    </section>
    <section class="card">
      <h2>문제 선택 <small id="qCount"></small></h2>
      <div class="row"><button class="btn small" id="qAll">전체 선택</button><button class="btn small ghost" id="qNone">전체 해제</button></div>
      <div class="qlist">${QS.map((q, i) => `
        <label class="qrow"><input type="checkbox" class="qchk" value="${i}" checked>
        <b>${i + 1}</b><span class="qtype">${typeName(q.type)}</span><span>${esc(q.q.replace(/\n/g, ' '))}</span></label>`).join('')}
      </div>
    </section>
    <button class="btn big primary wide" id="create">🎮 방 만들기</button>
  </div>`;
  const sync = () => {
    const n = +$('#teamCount').value;
    document.querySelectorAll('.team-edit').forEach((el) => (el.hidden = +el.dataset.i >= n));
    $('#qCount').textContent = `${document.querySelectorAll('.qchk:checked').length}문제`;
  };
  $('#teamCount').onchange = sync;
  document.querySelectorAll('.qchk').forEach((c) => (c.onchange = sync));
  $('#qAll').onclick = () => { document.querySelectorAll('.qchk').forEach((c) => (c.checked = true)); sync(); };
  $('#qNone').onclick = () => { document.querySelectorAll('.qchk').forEach((c) => (c.checked = false)); sync(); };
  $('#create').onclick = createRoom;
  sync();
}

async function createRoom() {
  let order = [...document.querySelectorAll('.qchk:checked')].map((c) => +c.value);
  if (!order.length) return toast('문제를 1개 이상 골라 주세요');
  if ($('#shuffleQ').checked) order = G.shuffle(order);
  $('#create').disabled = true;
  const n = +$('#teamCount').value;
  const fp = +$('#startFP').value;
  const dbl = +$('#startDB').value;
  const teams = {};
  for (let i = 0; i < n; i++) {
    const p = G.TEAM_PRESETS[i];
    teams['t' + (i + 1)] = {
      name: ($('#tn' + i).value.trim() || p.name).slice(0, 6), emoji: p.emoji, color: p.color,
      order: i, score: 0, stars: 0, freePass: fp, double: dbl, lastGain: 0,
    };
  }
  const boxes = {};
  order.forEach((_, i) => (boxes[i] = G.makeBoxes()));
  code = null;
  for (let tries = 0; tries < 30 && !code; tries++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!(await db.get(`rooms/${c}/host`))) code = c;
  }
  try {
    await db.set(P(), {
      host: db.uid,
      createdAt: Date.now(),
      info: { title: QUIZ.title, subtitle: QUIZ.subtitle, total: order.length, timer: +$('#timer').value },
      state: { phase: 'lobby', qi: -1 },
      teams,
      secret: { order, boxes, pool: G.shuffle(G.ITEM_POOL), poolIdx: 0 },
    });
  } catch (e) {
    $('#create').disabled = false;
    return toast('방을 만들지 못했어요: ' + e.message);
  }
  localStorage.setItem(LS, code);
  attach();
}

function attach() {
  unsub?.();
  unsub = db.on(P(), (v) => {
    if (!v || !v.state) {
      localStorage.removeItem(LS);
      location.reload();
      return;
    }
    R = v;
    const key = `${R.state.phase}:${R.state.qi}`;
    if (key !== lastPhaseKey) {
      if (lastPhaseKey) phaseFx(R.state.phase);
      lastPhaseKey = key;
    }
    autoDice();
    render();
  });
}

function phaseFx(ph) {
  if (ph === 'question') sfx('pop');
  if (ph === 'reveal') sfx('ok');
  if (ph === 'boxes') sfx('open');
  if (ph === 'final') { sfx('fanfare'); confetti(); }
}

// ───────────────────────── 화면 그리기 ─────────────────────────
function render() {
  const s = R.state;
  const views = { lobby: vLobby, question: vQuestion, reveal: vReveal, pick: vPick, boxes: vBoxes, score: vScore, final: vFinal };
  const top = `<header class="topbar">
    <div class="brand">🐾 ${esc(R.info.title)}</div>
    <div class="pill">방 코드 <b>${code}</b></div>
    ${s.qi >= 0 ? `<div class="pill">문제 <b>${s.qi + 1}</b> / ${R.info.total}</div>` : ''}
    <div class="spacer"></div>
    <button class="btn small ghost" data-act="help">게임 방법</button>
    <button class="btn small ghost" data-act="adjust">점수·아이템 조정</button>
  </header>`;
  const strip = ['question', 'reveal', 'pick', 'boxes'].includes(s.phase) ? vStrip() : '';
  patch(app, top + `<main class="stage">${views[s.phase]()}</main>` + strip +
    (ui.help ? vHelp() : '') + (ui.adjust ? vAdjust() : ''));
  const qr = $('#qr');
  if (qr && !qr.hasChildNodes() && window.QRCode) new window.QRCode(qr, { text: joinURL(), width: 200, height: 200 });
}

function vStrip() {
  const d = qd();
  const ph = R.state.phase;
  return `<footer class="strip">${tids().map((t) => {
    const x = R.teams[t];
    let st = '';
    if (ph === 'question') {
      st = d.teamAns?.[t] ? '<span class="st ok">모둠 정답 제출 ✓</span>' : '<span class="st">의논 중…</span>';
      if (d.req?.[t]?.freePass) st += '<span class="st fp">🎫 프리 패스</span>';
    }
    if (ph === 'reveal' || ph === 'pick') {
      const r = d.result?.teams?.[t];
      st = r ? (r.correct ? `<span class="st ok">정답 ⭕${r.fp ? ' 🎫' : ''}</span>` : '<span class="st bad">오답 ❌</span>') : '';
      if (ph === 'pick' && d.picks?.[t]) st += `<span class="st">상자 ${d.picks[t].box + 1}</span>`;
      if (ph === 'pick' && d.req?.[t]?.double) st += '<span class="st fp">✨ 더블</span>';
    }
    if (ph === 'boxes') {
      const g = d.boxes?.gains?.[t];
      if (g != null) st = `<span class="st gain ${g < 0 ? 'neg' : ''}">${signed(g)}</span>`;
    }
    return `<div class="tcard" style="--c:${x.color}">
      <div class="temoji">${x.emoji}</div><div class="tname">${esc(x.name)}</div>
      <div class="tscore">${x.score}</div><div class="titems">${itemsHTML(x)}</div>
      <div class="tstatus">${st}</div></div>`;
  }).join('')}</footer>`;
}

function vLobby() {
  const n = Object.keys(R.players || {}).length;
  return `<div class="lobby">
    <div class="card join-box">
      <div class="join-title">📱 참여 방법</div>
      <div class="join-url">${esc(joinURL().replace(/\?.*/, ''))}</div>
      <div class="join-label">방 코드</div>
      <div class="join-code">${code}</div>
      <div id="qr" class="qr"></div>
      ${isDemo ? '<p class="demo small">체험 모드: 이 주소를 같은 브라우저의 새 탭에서 열어 보세요.</p>' : ''}
    </div>
    <div class="lobby-right">
      <h2>들어온 친구들 <span class="count">${n}명</span></h2>
      <div class="team-grid">${tids().map((t) => {
        const x = R.teams[t];
        const ms = membersOf(t);
        return `<div class="team-box" style="--c:${x.color}">
          <div class="team-head">${x.emoji} ${esc(x.name)} <small>${ms.length}명</small></div>
          <div class="members">${ms.map(([uid, p]) => `<span class="member">${esc(p.name)}<button class="x" data-act="kick" data-uid="${uid}" title="내보내기">×</button></span>`).join('') || '<span class="empty">아직 없어요</span>'}</div>
        </div>`;
      }).join('')}</div>
      <button class="btn big primary wide" data-act="start">🚀 게임 시작!</button>
    </div>
  </div>`;
}

function choicesHTML(q, correct) {
  if (q.type === 'choice')
    return `<div class="choices">${q.choices.map((c, i) => `<div class="choice ${correct === i + 1 ? 'correct' : ''} ${correct && correct !== i + 1 ? 'dim' : ''}"><b>${G.CIRCLED[i]}</b> ${esc(c)}</div>`).join('')}</div>`;
  if (q.type === 'ox')
    return `<div class="ox-row"><div class="ox o ${correct === 'O' ? 'correct' : ''} ${correct === 'X' ? 'dim' : ''}">O</div><div class="ox x ${correct === 'X' ? 'correct' : ''} ${correct === 'O' ? 'dim' : ''}">X</div></div>`;
  return '';
}

function vQuestion() {
  const s = R.state;
  const d = qd();
  const nP = Object.keys(R.players || {}).length;
  const nA = Object.keys(d.ans || {}).length;
  const nT = Object.keys(d.teamAns || {}).length;
  return `<div class="qstage">
    <div class="qhead"><span class="qbadge">QUIZ ${s.qi + 1}</span><span class="qtype">${typeName(s.q.type)}</span>
      ${s.deadline ? `<span class="timer" data-deadline="${s.deadline}"></span>` : ''}</div>
    <div class="qtext">${nl2br(s.q.text)}</div>
    ${choicesHTML(s.q)}
    <div class="qsteps">
      <div class="step">① 개인 정답 <b>${nA}</b> / ${nP}명</div>
      <div class="step">② 모둠 의논 → 모둠 정답 <b>${nT}</b> / ${tids().length}모둠</div>
    </div>
    <div class="actions"><button class="btn big primary" data-act="reveal">정답 공개 🔔</button></div>
  </div>`;
}

function vReveal() {
  const q = curQ();
  const d = qd();
  const res = d.result;
  if (!res) return '';
  const anyCorrect = tids().some((t) => res.teams?.[t]?.correct);
  const rawCorrect = q.type === 'short' ? null : q.answer;
  return `<div class="qstage">
    <div class="qhead"><span class="qbadge">QUIZ ${R.state.qi + 1}</span><span class="qtype">정답 공개</span></div>
    <div class="qtext small">${nl2br(q.q)}</div>
    ${choicesHTML(q, rawCorrect)}
    <div class="answer-banner">정답 <b>${esc(res.answer)}</b></div>
    ${res.explain ? `<div class="explain">💡 ${esc(res.explain)}</div>` : ''}
    ${anyCorrect ? '' : '<div class="allwrong">모두 오답입니다! 😢 어려웠던 문제인 만큼 다시 공부하며 잘 기억해 두세요!</div>'}
    <div class="grade-table">${tids().map((t) => {
      const r = res.teams?.[t] || {};
      const ms = membersOf(t);
      return `<div class="grade-row">
        <div class="grade-team">${tag(t)}</div>
        <button class="judge ${r.correct ? 'ok' : 'bad'}" data-act="toggleTeam" data-t="${t}" title="눌러서 정답/오답 바꾸기">
          ${r.correct ? '⭕' : '❌'} ${esc(G.givenLabel(q.type, r.ans))}${r.fp ? ' <small>🎫 프리 패스</small>' : ''}</button>
        <div class="grade-members">${ms.map(([uid, p]) => {
          const a = d.ans?.[uid];
          if (!a) return `<span class="pchip none">${esc(p.name)}: —</span>`;
          const ok = res.players?.[uid];
          return `<button class="pchip ${ok ? 'ok' : 'bad'}" data-act="togglePlayer" data-uid="${uid}">${esc(p.name)}: ${esc(G.givenLabel(q.type, a.text))}</button>`;
        }).join('')}</div>
      </div>`;
    }).join('')}</div>
    <p class="hint">⭕/❌ 를 누르면 채점을 바꿀 수 있어요 (띄어쓰기·비슷한 표현 인정 등). 개인 정답은 1문제당 1점이에요.</p>
    <div class="actions">${anyCorrect
      ? '<button class="btn big primary" data-act="toPick">보물 상자 고르기 🎁</button>'
      : '<button class="btn big primary" data-act="skipRound">점수판 보기 ▶</button>'}</div>
  </div>`;
}

function vPick() {
  const d = qd();
  const correct = tids().filter((t) => d.result?.teams?.[t]?.correct);
  return `<div class="pickstage">
    <h2>정답 모둠은 보물 상자를 골라요! <span class="basepill">이번 문제 기본 점수 <b>${R.state.base}점</b></span></h2>
    <div class="chests">${[0, 1, 2, 3].map((b) => `
      <div class="chest-col">
        <div class="chest"><div class="chest-lid"></div><div class="chest-body">${b + 1}</div></div>
        <div class="chest-teams">${correct.map((t) => {
          const x = R.teams[t];
          const on = d.picks?.[t]?.box === b;
          return `<button class="chip ${on ? 'on' : ''}" style="--c:${x.color}" data-act="setPick" data-t="${t}" data-b="${b}">${x.emoji} ${esc(x.name)}</button>`;
        }).join('')}</div>
      </div>`).join('')}
    </div>
    <div class="double-row">${correct.filter((t) => (R.teams[t].double || 0) > 0 || d.req?.[t]?.double).map((t) => {
      const on = !!d.req?.[t]?.double;
      return `<button class="chip ${on ? 'on' : ''}" style="--c:${R.teams[t].color}" data-act="toggleDouble" data-t="${t}">✨ ${esc(R.teams[t].name)} 더블 포인트 ${on ? '사용!' : '안 씀'}</button>`;
    }).join('')}</div>
    <p class="hint">학생 기기에서 고르거나, 선생님이 모둠 버튼을 눌러 대신 고를 수 있어요. 같은 상자를 여러 모둠이 골라도 괜찮아요.</p>
    <div class="actions"><button class="btn big primary" data-act="openBoxes">상자 공개! 🎉</button></div>
  </div>`;
}

function boxContent(B, b) {
  const type = B.types[b];
  if (type === 'item' && B.item) {
    const it = G.ITEMS[B.item];
    return `<div class="box-emoji">🎁</div><div class="box-label">기본 점수 + 아이템</div><div class="box-item">${it.emoji} ${it.name}</div>`;
  }
  return `<div class="box-emoji">${G.BOX[type].emoji}</div><div class="box-label">${G.BOX[type].label}</div>`;
}

function vBoxes() {
  const d = qd();
  const B = d.boxes;
  if (!B) return '';
  const acts = B.actions || [];
  return `<div class="pickstage">
    <h2>보물 상자 공개! <span class="basepill">기본 점수 <b>${B.base}점</b></span></h2>
    <div class="chests">${[0, 1, 2, 3].map((b) => {
      const ts = Object.entries(B.picks || {}).filter(([, x]) => x === b).map(([t]) => t);
      return `<div class="chest-col"><div class="chest open t-${B.types[b]}">${boxContent(B, b)}</div>
        <div class="chest-teams">${ts.map((t) => tag(t) + (B.dbl?.[t] ? '<span class="st fp">✨x2</span>' : '')).join('')}</div></div>`;
    }).join('')}</div>
    ${acts.length ? `<div class="card actions-card"><h3>🎁 아이템 사용</h3>${acts.map((a, i) => vAction(a, i, B)).join('')}</div>` : ''}
    ${B.item === 'star' && B.itemTeams?.length ? `<div class="explain">⭐ 황금 별 획득: ${B.itemTeams.map(tag).join(' ')}</div>` : ''}
    <div class="actions"><button class="btn big primary" data-act="commit">점수 반영하기 ▶</button></div>
  </div>`;
}

function vAction(a, i, B) {
  const it = G.ITEMS[a.type];
  const head = `<b>${it.emoji} ${it.name}</b> <small>${esc(it.desc)}</small>`;
  const btns = (list, act) => list.map((t) => `<button class="chip" style="--c:${R.teams[t].color}" data-act="${act}" data-i="${i}" data-t="${t}">${R.teams[t].emoji} ${esc(R.teams[t].name)}</button>`).join('');
  if (!a.team)
    return `<div class="action">${head}<div>여러 모둠이 골랐어요! 가위바위보로 이긴 모둠을 눌러 주세요:
      ${btns(a.candidates || [], 'soloWinner')}<button class="chip" data-act="soloRandom" data-i="${i}">🎲 랜덤</button></div></div>`;
  if (a.skipped) return `<div class="action done">${head}<div>${tag(a.team)} — 넘어갔어요</div></div>`;
  if (a.type === 'dice') {
    if (a.roll == null)
      return `<div class="action">${head}<div>${tag(a.team)} <button class="btn small primary" data-act="roll" data-i="${i}">🎲 주사위 굴리기</button></div></div>`;
    return `<div class="action done">${head}<div>${tag(a.team)} 🎲 <b class="dice">${a.roll}</b> → <b>${signed(a.amount)}점</b></div></div>`;
  }
  if (a.target) {
    const msg = { steal: `의 점수 ${a.amount}점을 빼앗았어요!`, copy: '의 총점을 복사해요 (점수 반영 때 적용)', swap: '와(과) 총점을 바꿔요 (점수 반영 때 적용)' }[a.type];
    return `<div class="action done">${head}<div>${tag(a.team)} ➜ ${tag(a.target)}${msg}</div></div>`;
  }
  const others = tids().filter((t) => t !== a.team);
  const targets = a.type === 'steal' ? others.filter((t) => (B.gains?.[t] || 0) > 0) : others;
  return `<div class="action">${head}<div>${tag(a.team)} 이(가) 지목할 모둠: ${targets.length ? btns(targets, 'target') : '<span class="muted">빼앗을 점수가 있는 모둠이 없어요</span>'}
    <button class="chip" data-act="skipAction" data-i="${i}">넘어가기</button></div></div>`;
}

function rankOf(list, key) {
  return list.map((x, i) => ({ ...x, rank: list.findIndex((y) => y[key] === x[key]) + 1, i }));
}
const medal = (r) => ['🥇', '🥈', '🥉'][r - 1] || `${r}위`;

function vScore() {
  const last = R.state.qi + 1 >= R.info.total;
  const list = rankOf(tids().map((t) => ({ t, ...R.teams[t] })).sort((a, b) => b.score - a.score), 'score');
  return `<div class="scorestage">
    <h2>📊 ${R.state.qi + 1}번 문제까지 점수</h2>
    <div class="board">${list.map((x) => `
      <div class="brow" style="--c:${x.color}">
        <div class="brank">${medal(x.rank)}</div><div class="bemoji">${x.emoji}</div>
        <div class="bname">${esc(x.name)}<div class="titems">${itemsHTML(x)}</div></div>
        ${x.lastGain ? `<div class="bgain ${x.lastGain < 0 ? 'neg' : ''}">${signed(x.lastGain)}</div>` : '<div class="bgain zero"></div>'}
        <div class="bscore">${x.score}<small>점</small></div>
      </div>`).join('')}</div>
    <div class="actions">${last
      ? '<button class="btn big primary" data-act="final">🏆 최종 결과 보기</button>'
      : '<button class="btn big primary" data-act="next">다음 문제 ▶</button>'}</div>
  </div>`;
}

function vFinal() {
  const list = rankOf(tids().map((t) => ({ t, ...R.teams[t], fin: R.teams[t].final ?? R.teams[t].score })).sort((a, b) => b.fin - a.fin), 'fin');
  const ps = rankOf(Object.entries(R.players || {}).map(([uid, p]) => ({ uid, ...p, s: R.pscores?.[uid] || 0 })).sort((a, b) => b.s - a.s), 's');
  const podium = [list[1], list[0], list[2]].filter(Boolean);
  return `<div class="finalstage">
    <h1>🏆 최종 결과</h1>
    <div class="podium">${podium.map((x) => `
      <div class="pod r${x.rank}" style="--c:${x.color}"><div class="pod-emoji">${x.emoji}</div><div class="pod-name">${esc(x.name)}</div>
      <div class="pod-score">${x.fin}점</div><div class="pod-block">${medal(x.rank)}</div></div>`).join('')}</div>
    <div class="card"><h3>모둠 점수 (상대 평가)</h3><table class="tbl"><tr><th>순위</th><th>모둠</th><th>게임 점수</th><th>⭐ 황금 별</th><th>최종</th></tr>
      ${list.map((x) => `<tr><td>${medal(x.rank)}</td><td>${x.emoji} ${esc(x.name)}</td><td>${x.score}</td><td>${x.stars || 0}개 (+${G.starBonus(x.stars || 0)})</td><td><b>${x.fin}</b></td></tr>`).join('')}
    </table></div>
    <div class="card"><h3>개인 점수 (문제당 1점 · 절대 평가) — 총 ${R.info.total}문제</h3>
      <div class="pgrid">${ps.map((p) => `<div class="pcell" style="--c:${R.teams[p.team]?.color || '#ccc'}">${R.teams[p.team]?.emoji || ''} ${esc(p.name)} <b>${p.s}</b></div>`).join('') || '<span class="muted">참여한 학생이 없어요</span>'}</div>
    </div>
    <div class="actions"><button class="btn big primary" data-act="newGame">🎮 새 게임 만들기</button>
      <button class="btn big ghost" data-act="closeRoom">방 닫기 (기록 삭제)</button></div>
  </div>`;
}

function vHelp() {
  return `<div class="modal" data-act="closeModal"><div class="modal-card" data-stop>
    <h2>게임 방법</h2>
    <ol class="howto">
      <li>문제가 나오면 각자 기기에 <b>개인 정답</b>을 제출해요. (맞히면 개인 1점)</li>
      <li>모둠 친구들의 답을 보며 의논한 뒤, 누구든 한 명이 <b>모둠 정답</b>을 제출해요. (다시 내면 바뀌어요)</li>
      <li>정답을 맞힌 모둠은 <b>보물 상자 1~4번</b> 중 하나를 골라요. 여러 모둠이 같은 상자를 골라도 돼요.</li>
      <li>상자에는 <b>+10 / 기본 점수 / -10 / 아이템 상자 또는 꽝</b> 이 섞여 있어요.</li>
      <li>마지막에 <b>황금 별 보너스</b>를 더해 모둠 순위를 정하고, 개인 점수로 나의 성취를 확인해요.</li>
    </ol>
    <div class="items-help">${Object.values(G.ITEMS).map((it) => `<div class="ih"><span class="ih-emoji">${it.emoji}</span><div><b>${it.name}</b><br><small>${esc(it.desc)}</small></div></div>`).join('')}</div>
    <div class="actions"><button class="btn primary" data-act="closeModal">닫기</button></div>
  </div></div>`;
}

function vAdjust() {
  const k = (t, key, d, label) => `<button class="btn tiny" data-act="adj" data-t="${t}" data-k="${key}" data-d="${d}">${label}</button>`;
  return `<div class="modal" data-act="closeModal"><div class="modal-card wide" data-stop>
    <h2>점수 · 아이템 직접 조정</h2>
    <table class="tbl adj">${tids().map((t) => {
      const x = R.teams[t];
      return `<tr><td>${x.emoji} ${esc(x.name)}</td>
        <td>${k(t, 'score', -10, '-10')} <b class="num">${x.score}</b> ${k(t, 'score', 10, '+10')}</td>
        <td>🎫 ${k(t, 'freePass', -1, '-')} ${x.freePass || 0} ${k(t, 'freePass', 1, '+')}</td>
        <td>✨ ${k(t, 'double', -1, '-')} ${x.double || 0} ${k(t, 'double', 1, '+')}</td>
        <td>⭐ ${k(t, 'stars', -1, '-')} ${x.stars || 0} ${k(t, 'stars', 1, '+')}</td></tr>`;
    }).join('')}</table>
    <div class="actions"><button class="btn primary" data-act="closeModal">닫기</button></div>
  </div></div>`;
}

// ───────────────────────── 진행 동작 ─────────────────────────
async function startQuestion(qi) {
  const q = QS[R.secret.order[qi]];
  const up = {
    state: { phase: 'question', qi, q: { type: q.type, text: q.q, choices: q.choices || null }, deadline: R.info.timer ? db.now() + R.info.timer * 1000 : null },
  };
  for (const t of tids()) up[`teams/${t}/lastGain`] = 0;
  await db.update(P(), up);
}

function pscoresWith(qi, players) {
  const all = {};
  for (const [k, v] of Object.entries(R.q || {})) if (v?.result?.players) all[k] = v.result.players;
  all[qi] = players;
  const tally = {};
  for (const pl of Object.values(all)) for (const [uid, ok] of Object.entries(pl || {})) tally[uid] = (tally[uid] || 0) + (ok ? 1 : 0);
  return tally;
}

async function doReveal() {
  const q = curQ();
  const d = qd();
  const qi = R.state.qi;
  const up = {};
  const teams = {};
  for (const t of tids()) {
    const ta = d.teamAns?.[t];
    const auto = G.isCorrect(q, ta?.text);
    const fp = !auto && !!d.req?.[t]?.freePass && (R.teams[t].freePass || 0) > 0;
    if (fp) up[`teams/${t}/freePass`] = R.teams[t].freePass - 1;
    teams[t] = { ans: ta?.text ?? '', by: ta?.name ?? '', correct: auto || fp, fp };
  }
  const players = {};
  for (const [uid, a] of Object.entries(d.ans || {})) players[uid] = G.isCorrect(q, a.text);
  up[`q/${qi}/result`] = { answer: G.answerLabel(q), explain: q.explain || '', raw: q.type === 'short' ? null : q.answer, teams, players };
  up['state/phase'] = 'reveal';
  up['state/deadline'] = null;
  up.pscores = pscoresWith(qi, players);
  await db.update(P(), up);
}

async function openBoxes() {
  const qi = R.state.qi;
  const d = qd();
  const sb = R.secret.boxes[qi];
  const up = {};
  const correct = tids().filter((t) => d.result?.teams?.[t]?.correct);
  let item = null;
  if (sb.types.includes('item')) {
    const pool = R.secret.pool;
    const i = R.secret.poolIdx || 0;
    item = pool[i % pool.length];
    up['secret/poolIdx'] = i + 1;
  }
  const gains = {}, dbl = {}, picks = {}, itemTeams = [];
  for (const t of correct) {
    const p = d.picks?.[t];
    if (!p) { gains[t] = 0; continue; }
    picks[t] = p.box;
    const useD = !!d.req?.[t]?.double && (R.teams[t].double || 0) > 0;
    if (useD) { dbl[t] = true; up[`teams/${t}/double`] = R.teams[t].double - 1; }
    const type = sb.types[p.box];
    gains[t] = G.boxGain(type, sb.base, useD);
    if (type === 'item') itemTeams.push(t);
  }
  const actions = [];
  if (item && itemTeams.length) {
    if (item === 'star') itemTeams.forEach((t) => (up[`teams/${t}/stars`] = (R.teams[t].stars || 0) + 1));
    else if (item === 'dice') itemTeams.forEach((t) => actions.push({ type: 'dice', team: t }));
    else actions.push({ type: item, team: itemTeams.length === 1 ? itemTeams[0] : null, candidates: itemTeams });
  }
  up[`q/${qi}/boxes`] = { types: sb.types, base: sb.base, item, itemTeams, gains, dbl, picks, actions };
  up['state/phase'] = 'boxes';
  await db.update(P(), up);
}

async function rollDice(i) {
  const key = `${R.state.qi}-${i}`;
  if (rolling.has(key)) return;
  const B = qd().boxes;
  const a = B.actions[i];
  if (a.roll != null) return;
  rolling.add(key);
  const roll = G.pick(G.DICE_FACES);
  const gain = B.gains?.[a.team] || 0;
  const amount = roll * gain;
  sfx('pop');
  await db.update(P(`q/${R.state.qi}/boxes`), {
    [`actions/${i}/roll`]: roll, [`actions/${i}/amount`]: amount, [`gains/${a.team}`]: gain + amount,
  });
}

// 학생 기기에서 '주사위 굴리기'를 누르면 진행자 화면이 대신 굴림
function autoDice() {
  if (R.state.phase !== 'boxes') return;
  const d = qd();
  (d.boxes?.actions || []).forEach((a, i) => {
    if (a?.type === 'dice' && a.roll == null && d.req?.[a.team]?.dice) rollDice(i);
  });
}

async function commit() {
  const B = qd().boxes || {};
  const scores = {};
  for (const t of tids()) scores[t] = R.teams[t].score + (B.gains?.[t] || 0);
  for (const a of B.actions || []) {
    if (!a?.team || !a.target || a.skipped) continue;
    if (a.type === 'copy') scores[a.team] = scores[a.target];
    if (a.type === 'swap') [scores[a.team], scores[a.target]] = [scores[a.target], scores[a.team]];
  }
  const up = { 'state/phase': 'score' };
  for (const t of tids()) {
    up[`teams/${t}/score`] = scores[t];
    up[`teams/${t}/lastGain`] = scores[t] - R.teams[t].score;
  }
  await db.update(P(), up);
}

const H = {
  help: () => { ui.help = true; render(); },
  adjust: () => { ui.adjust = true; render(); },
  closeModal: () => { ui.help = ui.adjust = false; render(); },
  kick: ({ uid }) => confirm(`${R.players[uid]?.name} 학생을 내보낼까요?`) && db.remove(P(`players/${uid}`)),
  start: () => (Object.keys(R.players || {}).length || confirm('아직 참여한 학생이 없어요. 그래도 시작할까요?')) && startQuestion(0),
  reveal: doReveal,
  toggleTeam: ({ t }) => db.set(P(`q/${R.state.qi}/result/teams/${t}/correct`), !qd().result.teams?.[t]?.correct),
  togglePlayer: ({ uid }) => {
    const qi = R.state.qi;
    const players = { ...(qd().result.players || {}) };
    players[uid] = !players[uid];
    return db.update(P(), { [`q/${qi}/result/players/${uid}`]: players[uid], pscores: pscoresWith(qi, players) });
  },
  toPick: () => db.update(P('state'), { phase: 'pick', base: R.secret.boxes[R.state.qi].base }),
  skipRound: () => commit(),
  setPick: ({ t, b }) => {
    const p = P(`q/${R.state.qi}/picks/${t}`);
    return qd().picks?.[t]?.box === +b ? db.remove(p) : db.set(p, { box: +b, name: '선생님' });
  },
  toggleDouble: ({ t }) => {
    const p = P(`q/${R.state.qi}/req/${t}/double`);
    return qd().req?.[t]?.double ? db.remove(p) : db.set(p, true);
  },
  openBoxes,
  roll: ({ i }) => rollDice(+i),
  soloWinner: ({ i, t }) => db.set(P(`q/${R.state.qi}/boxes/actions/${i}/team`), t),
  soloRandom: ({ i }) => db.set(P(`q/${R.state.qi}/boxes/actions/${i}/team`), G.pick(qd().boxes.actions[i].candidates)),
  target: ({ i, t }) => {
    const B = qd().boxes;
    const a = B.actions[i];
    const base = P(`q/${R.state.qi}/boxes`);
    if (a.type !== 'steal') return db.set(`${base}/actions/${i}/target`, t);
    const amount = B.gains?.[t] || 0;
    sfx('no');
    return db.update(base, {
      [`actions/${i}/target`]: t, [`actions/${i}/amount`]: amount,
      [`gains/${t}`]: 0, [`gains/${a.team}`]: (B.gains?.[a.team] || 0) + amount,
    });
  },
  skipAction: ({ i }) => db.set(P(`q/${R.state.qi}/boxes/actions/${i}/skipped`), true),
  commit: () => {
    const open = (qd().boxes?.actions || []).some((a) => a && !a.skipped && (!a.team || (a.type === 'dice' ? a.roll == null : ['steal', 'copy', 'swap'].includes(a.type) && !a.target)));
    if (open && !confirm('아직 사용하지 않은 아이템이 있어요. 그래도 점수를 반영할까요?')) return;
    return commit();
  },
  next: () => startQuestion(R.state.qi + 1),
  final: () => {
    const up = { 'state/phase': 'final' };
    for (const t of tids()) up[`teams/${t}/final`] = R.teams[t].score + G.starBonus(R.teams[t].stars || 0);
    return db.update(P(), up);
  },
  adj: ({ t, k, d }) => db.set(P(`teams/${t}/${k}`), Math.max(k === 'score' ? -9999 : 0, (R.teams[t][k] || 0) + +d)),
  newGame: () => { unsub?.(); localStorage.removeItem(LS); lastPhaseKey = ''; renderSetup(); },
  closeRoom: async () => {
    if (!confirm('방을 닫으면 이 게임의 기록이 모두 지워져요. 닫을까요?')) return;
    unsub?.();
    await db.remove(P());
    localStorage.removeItem(LS);
    location.reload();
  },
};

app.addEventListener('click', async (e) => {
  if (e.target.closest('[data-stop]') && !e.target.closest('[data-act]:not(.modal)')) return;
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = H[b.dataset.act];
  if (!fn) return;
  if (b.tagName === 'BUTTON') b.disabled = true;
  try {
    await fn(b.dataset);
  } catch (err) {
    console.error(err);
    toast('문제가 생겼어요: ' + err.message);
  } finally {
    if (b.isConnected) b.disabled = false;
  }
});

main();
