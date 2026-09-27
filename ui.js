export const $ = (s, r = document) => r.querySelector(s);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

// 화면을 다시 그리되, 입력 중인 글자와 커서는 그대로 유지
export function patch(el, html) {
  if (el._last === html) return false;
  el._last = html;
  const vals = {};
  el.querySelectorAll('input[id],textarea[id]').forEach((i) => (vals[i.id] = i.value));
  const a = document.activeElement;
  const fid = a && a.id && el.contains(a) ? a.id : null;
  let sel = null;
  try { sel = fid && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch {}
  el.innerHTML = html;
  for (const [id, v] of Object.entries(vals)) {
    const n = document.getElementById(id);
    if (n && 'value' in n && n.type !== 'checkbox') n.value = v;
  }
  if (fid) {
    const n = document.getElementById(fid);
    if (n) {
      n.focus();
      if (sel) try { n.setSelectionRange(...sel); } catch {}
    }
  }
  return true;
}

// 타이머 표시: data-deadline 속성이 있는 요소를 갱신
export function startTimers(now) {
  setInterval(() => {
    document.querySelectorAll('[data-deadline]').forEach((el) => {
      const left = Math.max(0, Math.ceil((+el.dataset.deadline - now()) / 1000));
      el.textContent = left > 0 ? `⏱ ${left}초` : '⏱ 시간 끝!';
      el.classList.toggle('urgent', left <= 10);
    });
  }, 250);
}

let actx;
export function sfx(kind) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const seq = {
      pop: [[660, 0.08]],
      ok: [[523, 0.1], [659, 0.1], [784, 0.18]],
      no: [[300, 0.15], [220, 0.25]],
      open: [[392, 0.08], [523, 0.08], [659, 0.08], [1047, 0.25]],
      fanfare: [[523, 0.12], [523, 0.12], [523, 0.12], [698, 0.4]],
    }[kind] || [[440, 0.1]];
    let t = actx.currentTime;
    for (const [f, d] of seq) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + d);
      t += d;
    }
  } catch {}
}

export function confetti(n = 120) {
  const colors = ['#FF8A65', '#4FC3F7', '#81C784', '#FFD54F', '#F06292', '#9575CD'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = colors[i % colors.length];
    d.style.animationDelay = Math.random() * 1.2 + 's';
    d.style.animationDuration = 2.5 + Math.random() * 2 + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }
}

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
