// 데이터 저장소: Firebase Realtime Database, 또는 설정 전이면 '체험 모드'(같은 브라우저 탭끼리 공유)
import { firebaseConfig } from './firebase-config.js';

export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('YOUR');

let impl;
export async function initDB() {
  if (!impl) impl = isDemo ? createLocal() : await createFirebase();
  return impl;
}

async function createFirebase() {
  const V = '10.12.2';
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const [{ initializeApp }, A, D] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const cred = await A.signInAnonymously(A.getAuth(app));
  const db = D.getDatabase(app);
  const r = (p) => D.ref(db, p);
  let offset = 0;
  D.onValue(r('.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  return {
    uid: cred.user.uid,
    now: () => Date.now() + offset,
    get: async (p) => (await D.get(r(p))).val(),
    set: (p, v) => D.set(r(p), v),
    update: (p, v) => D.update(r(p), v),
    remove: (p) => D.remove(r(p)),
    on: (p, cb) => D.onValue(r(p), (s) => cb(s.val())),
  };
}

function createLocal() {
  const KEY = 'quizshow-demo-db';
  const ch = new BroadcastChannel('quizshow-demo');
  let uid = sessionStorage.getItem('demo-uid');
  if (!uid) {
    uid = 'u' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('demo-uid', uid);
  }
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const parts = (p) => p.split('/').filter(Boolean);
  const getAt = (root, p) => parts(p).reduce((o, k) => (o == null ? null : o[k] ?? null), root);
  // Firebase처럼 null과 빈 객체는 저장하지 않음
  const clean = (v) => {
    if (v == null) return null;
    if (typeof v !== 'object') return v;
    const out = Array.isArray(v) ? [] : {};
    for (const [k, x] of Object.entries(v)) {
      const c = clean(x);
      if (c != null) out[k] = c;
    }
    return Object.keys(out).length ? out : null;
  };
  const setAt = (root, p, v) => {
    const ks = parts(p);
    if (!ks.length) return v ?? {};
    let o = root;
    for (const k of ks.slice(0, -1)) {
      if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
      o = o[k];
    }
    if (v == null) delete o[ks.at(-1)];
    else o[ks.at(-1)] = v;
    return root;
  };
  const subs = new Set();
  const notify = () => {
    const root = clean(load()) || {};
    for (const s of subs) {
      const j = JSON.stringify(getAt(root, s.p));
      if (j !== s.last) { s.last = j; s.cb(JSON.parse(j)); }
    }
  };
  const write = (mut) => {
    localStorage.setItem(KEY, JSON.stringify(clean(mut(load())) || {}));
    ch.postMessage(1);
    setTimeout(notify, 0);
  };
  ch.onmessage = notify;
  return {
    uid,
    demo: true,
    now: () => Date.now(),
    get: async (p) => getAt(clean(load()) || {}, p),
    set: async (p, v) => write((root) => setAt(root, p, clean(v))),
    update: async (p, obj) =>
      write((root) => {
        for (const [k, v] of Object.entries(obj)) root = setAt(root, `${p}/${k}`, clean(v));
        return root;
      }),
    remove: async (p) => write((root) => setAt(root, p, null)),
    on: (p, cb) => {
      const s = { p, cb, last: undefined };
      subs.add(s);
      setTimeout(() => {
        s.last = JSON.stringify(getAt(clean(load()) || {}, p));
        cb(JSON.parse(s.last));
      }, 0);
      return () => subs.delete(s);
    },
  };
}
