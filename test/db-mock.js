/* ==========================================================================
   test/db-mock.js – In-Memory-Nachbildung von claude.use('db'|'user'|'sample'|'dictation')
   --------------------------------------------------------------------------
   Für Playwright:
     const { installMock, shareDb } = require('./db-mock');
     await page.addInitScript(installMock, { user: { id: 'u_a' } });          // nur diese Seite
   Zwei Seiten mit GEMEINSAMER db (live wie im Filialbetrieb):
     const bus = await shareDb(context);                                       // vor dem Öffnen der Seiten
     await pageA.addInitScript(installMock, { shared: true, user: { id: 'u_a' } });
     await pageB.addInitScript(installMock, { shared: true, user: { id: 'u_b' } });
     bus.docs → Map(path → Dokument) zum Prüfen in Node

   Verhalten wie die Plattform (siehe db.d.ts): Pfad-Grammatik (gerade/ungerade
   Segmente), update() merged tief und verlangt ein bestehendes Dokument
   (sonst invalid_argument), Snapshots asynchron und eingefroren, metadata.
   Optionen: user {id, canWrite, isOwner, canEdit}, readOnly (Schreiben →
   invalid_argument), noDb (use('db') → null), silent (keine Snapshots →
   Ladezeitlimit), sample (true = Mock-KI), dictation (Text, der „gesprochen“ wird).
   ========================================================================== */
'use strict';

/** Läuft IM BROWSER (per addInitScript) – darf nichts aus Node verwenden */
function installMock(opts) {
  opts = opts || {};
  const docs = new Map(); // Pfad → JSON-Daten
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const merge = (a, b) => {
    const o = isObj(a) ? Object.assign({}, a) : {};
    for (const k of Object.keys(b)) o[k] = isObj(b[k]) ? merge(o[k], b[k]) : clone(b[k]);
    return o;
  };
  const freeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach((k) => freeze(o[k])); } return o; };
  const err = (code, message) => Object.assign(new Error(message || code), { code, message: message || code });
  const segs = (p) => String(p).split('/');
  function checkPath(p, wantDoc) {
    const s = segs(p);
    if (!p || s.some((x) => !x || x === '.' || x === '..' || !/^[A-Za-z0-9_\-.~:@+]+$/.test(x))) throw new TypeError('Ungültiger Pfad: ' + p);
    if (wantDoc && s.length % 2 !== 0) throw new TypeError('Dokumentpfad braucht gerade Segmentzahl: ' + p);
    if (!wantDoc && s.length % 2 !== 1) throw new TypeError('Collection-Pfad braucht ungerade Segmentzahl: ' + p);
  }
  const parentOf = (p) => segs(p).slice(0, -1).join('/');
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = (path, data) => {
    const d = data === undefined ? undefined : freeze(clone(data));
    return { id: segs(path).pop(), exists: d !== undefined, data: () => d, metadata: meta };
  };
  const bus = () => (opts.shared ? window.__snDbBus : null);

  // Änderung anwenden und betroffene Hörer (asynchron) benachrichtigen
  function apply(path, data) {
    if (data === null) docs.delete(path); else docs.set(path, data);
    if (opts.silent) return;
    for (const l of listeners) if (l.matches(path)) setTimeout(() => l.fire(), opts.delayMs || 0);
  }
  window.__snDbApply = (path, data) => apply(path, data);

  let loaded = Promise.resolve();
  if (opts.shared) {
    loaded = new Promise((resolve) => {
      const tryLoad = () => {
        const b = bus();
        if (!b) return setTimeout(tryLoad, 5);
        b({ op: 'load' }).then((all) => { for (const [p, d] of all) docs.set(p, d); resolve(); });
      };
      tryLoad();
    });
  }

  async function write(path, kind, data) {
    await loaded;
    if (opts.readOnly) throw err('invalid_argument', 'Keine Schreibrechte');
    if (kind !== 'delete' && !isObj(data)) throw err('invalid_argument', 'Dokument muss ein Objekt sein');
    if (opts.shared) {
      const r = await bus()({ op: 'write', path, kind, data: clone(data) });
      if (r && r.error) throw err(r.error);
      return;
    }
    if (kind === 'update' && !docs.has(path)) throw err('invalid_argument', 'Dokument fehlt');
    apply(path, kind === 'delete' ? null : kind === 'update' ? merge(docs.get(path), data) : clone(data));
  }

  function docRef(path) {
    checkPath(path, true);
    return {
      id: segs(path).pop(), path,
      get: async () => { await loaded; return snapDoc(path, docs.get(path)); },
      set: (d) => write(path, 'set', d),
      update: (d) => write(path, 'update', d),
      delete: () => write(path, 'delete'),
      acquire: async () => ({ acquired: true, version: 1, expiresAt: new Date(Date.now() + 30000).toISOString() }),
      collection: (sub) => colRef(path + '/' + sub),
      onSnapshot(next, error) {
        const l = { matches: (p) => p === path, fire: () => { if (l.on) next(snapDoc(path, docs.get(path))); }, on: true };
        listeners.add(l);
        loaded.then(() => { if (!opts.silent) setTimeout(l.fire, opts.delayMs || 0); });
        void error;
        return () => { l.on = false; listeners.delete(l); };
      },
    };
  }

  function query(path, filters, order, lim) {
    const run = () => {
      let list = Array.from(docs.entries()).filter(([p]) => parentOf(p) === path).map(([p, d]) => ({ p, d }));
      for (const [f, op, v] of filters) {
        list = list.filter(({ d }) => {
          const x = d[f];
          switch (op) {
            case '==': return x === v; case '!=': return x !== v; case '<': return x < v; case '<=': return x <= v;
            case '>': return x > v; case '>=': return x >= v; case 'in': return v.includes(x); case 'not-in': return !v.includes(x);
            case 'array-contains': return Array.isArray(x) && x.includes(v); default: return false;
          }
        });
      }
      list.sort((a, b) => (a.p < b.p ? -1 : 1));
      if (order) list.sort((a, b) => ((a.d[order[0]] < b.d[order[0]] ? -1 : a.d[order[0]] > b.d[order[0]] ? 1 : 0) * (order[1] === 'desc' ? -1 : 1)));
      if (lim) list = list.slice(0, lim);
      return list.map(({ p, d }) => snapDoc(p, d));
    };
    const snapOf = (docsNow, prev) => {
      const ids = new Map(prev.map((d, i) => [d.id, i]));
      const changes = docsNow.map((d, i) => ({ type: ids.has(d.id) ? 'modified' : 'added', doc: d, oldIndex: ids.has(d.id) ? ids.get(d.id) : -1, newIndex: i }));
      const now = new Set(docsNow.map((d) => d.id));
      prev.forEach((d, i) => { if (!now.has(d.id)) changes.push({ type: 'removed', doc: d, oldIndex: i, newIndex: -1 }); });
      return { docs: docsNow, size: docsNow.length, empty: !docsNow.length, docChanges: () => changes, metadata: meta };
    };
    return {
      where: (f, op, v) => query(path, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => query(path, filters, [f, dir || 'asc'], lim),
      limit: (n) => query(path, filters, order, n),
      get: async () => { await loaded; return snapOf(run(), []); },
      onSnapshot(next, error) {
        let prev = [];
        const l = { on: true, matches: (p) => parentOf(p) === path, fire: () => { if (!l.on) return; const d = run(); const s = snapOf(d, prev); prev = d; next(s); } };
        listeners.add(l);
        loaded.then(() => { if (!opts.silent) setTimeout(l.fire, opts.delayMs || 0); });
        void error;
        return () => { l.on = false; listeners.delete(l); };
      },
    };
  }
  function colRef(path) {
    checkPath(path, false);
    const q = query(path, [], null, 0);
    let n = 0;
    return Object.assign(q, {
      path,
      doc: (id) => docRef(path + '/' + (id || 'auto' + Date.now().toString(36) + (n++))),
      add: async (d) => { const r = docRef(path + '/auto' + Date.now().toString(36) + (n++)); await r.set(d); return r; },
    });
  }
  const db = Object.freeze({ doc: docRef, collection: colRef });

  const u = Object.assign({ id: 'u_test', canWrite: true, isOwner: false, canEdit: false }, opts.user || {});
  const user = Object.freeze({
    id: async () => u.id,
    can: async (c) => (c === 'data.write' ? (opts.readOnly ? false : u.canWrite) : null),
    isOwner: async () => !!u.isOwner,
    canEdit: async () => !!u.canEdit,
    me: async () => ({ id: u.id, name: u.name || '', avatarUrl: 'data:,', color: '#888', email: null, isOwner: !!u.isOwner, canEdit: !!u.canEdit }),
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: '', avatarUrl: 'data:,', color: '#888', email: null, isMe: i === u.id, guest: false }])),
    name: async () => u.name || '', email: async () => null, avatarUrl: async () => null, search: async () => [],
  });

  // Mock-KI: Übersetzung kennzeichnet den Text, JSON-Antworten minimal
  const sample = async (input) => ({ text: '[KI] ' + String(typeof input === 'string' ? input : input[input.length - 1].content).slice(0, 80), truncated: false, modelTierApplied: 'quick' });
  sample.json = async (input) => {
    const s = String(typeof input === 'string' ? input : '');
    const m = s.match(/Text: (".*")\s*$/s);
    if (/Übersetze/.test(s) && m) return { text: 'Übersetzt: ' + JSON.parse(m[1]), from: 'tr' };
    return {};
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 5e6, mediaTypes: ['image/jpeg', 'image/png'] } });

  const dictH = { partial: new Set(), final: new Set(), state: new Set() };
  let dictActive = false;
  const dictation = Object.freeze({
    start: async () => {
      dictActive = true; dictH.state.forEach((h) => h({ state: 'listening' }));
      setTimeout(() => { dictH.final.forEach((h) => h({ text: String(opts.dictation) })); }, 10);
    },
    stop: async () => { dictActive = false; dictH.state.forEach((h) => h({ state: 'idle', reason: 'stopped' })); },
    active: () => dictActive,
    onPartial: (h) => { dictH.partial.add(h); return () => dictH.partial.delete(h); },
    onFinal: (h) => { dictH.final.add(h); return () => dictH.final.delete(h); },
    onState: (h) => { dictH.state.add(h); return () => dictH.state.delete(h); },
  });

  const caps = { db: opts.noDb ? null : db, user, sample: opts.sample ? sample : null, dictation: opts.dictation ? dictation : null };
  window.claude = Object.freeze({ use: (name) => Promise.resolve(Object.prototype.hasOwnProperty.call(caps, name) ? caps[name] : null) });
  window.__snMock = { docs, opts };
}

/**
 * Gemeinsame db für alle Seiten eines Browser-Kontexts (Node-Seite).
 * Muss vor dem Öffnen der Seiten aufgerufen werden. → {docs: Map, pages: Set}
 */
async function shareDb(context) {
  const docs = new Map();
  const pages = new Set();
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const merge = (a, b) => {
    const o = isObj(a) ? Object.assign({}, a) : {};
    for (const k of Object.keys(b)) o[k] = isObj(b[k]) ? merge(o[k], b[k]) : JSON.parse(JSON.stringify(b[k]));
    return o;
  };
  await context.exposeBinding('__snDbBus', async (source, msg) => {
    const page = source.page;
    if (msg.op === 'load') { pages.add(page); page.once('close', () => pages.delete(page)); return Array.from(docs.entries()); }
    if (msg.op === 'write') {
      const { path, kind, data } = msg;
      if (kind === 'update' && !docs.has(path)) return { error: 'invalid_argument' };
      const next = kind === 'delete' ? null : kind === 'update' ? merge(docs.get(path), data) : data;
      if (next === null) docs.delete(path); else docs.set(path, next);
      // an alle Seiten (auch die schreibende) verteilen: letzter Schreiber gewinnt
      await Promise.all(Array.from(pages).map((p) => p.evaluate(([pp, dd]) => window.__snDbApply && window.__snDbApply(pp, dd), [path, next]).catch(() => {})));
      return { ok: true };
    }
    return { error: 'invalid_argument' };
  });
  return { docs, pages };
}

module.exports = { installMock, shareDb };
