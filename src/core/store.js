/* ==========================================================================
   SN.store – eine Store-Schnittstelle, zwei Backends
   --------------------------------------------------------------------------
   demo : alles im Speicher (Demo-Datensatz), Abos werden asynchron wie bei
          der db benachrichtigt.
   db   : gemeinsame Live-Datenbank des Artifacts über claude.use('db').
          Je Collection genau EIN onSnapshot (beim Start), Schreiben pro
          Dokument nacheinander (eine Schreiboperation gleichzeitig),
          patch = db.update() mit tiefem Merge, Fallback auf set, wenn das
          Dokument noch fehlt. 10-s-Ladezeitlimit, Fehlercodes behandelt.

   Beide Modi: Schreiben wirkt sofort im lokalen Cache (optimistisch), die
   Abonnenten erfahren es asynchron. Schreib-Promises werden nie verworfen,
   sie liefern {ok, code?}; Fehler gehen zusätzlich an onError-Hörer.

   Außerdem hier: SN.session (angemeldetes Konto, PIN, „zuletzt genutzt“).
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util;

  // Collections mit Abo (eine Ebene, Dokument-ID = Element-ID)
  const COLS = ['staff', 'items', 'chats', 'templates', 'plans', 'settings', 'mood', 'trucks', 'goods', 'rest', 'breakage', 'log'];
  // Collections ohne Abo, nur per get() (große Fotos, ein Dokument je Foto)
  const LAZY = ['media'];
  const ROOT = 'sn/v2/'; // db-Pfad-Präfix: sn/v2/<collection>/<id>
  const LOAD_LIMIT_MS = 10000;

  const STATUS_TEXT = { demo: 'Demo', loading: 'Lädt …', live: 'Live', stale: 'Evtl. veraltet', offline: 'Offline' };
  const ERROR_TEXT = {
    invalid_argument: 'Speichern nicht möglich: Daten ungültig oder keine Schreibrechte.',
    resource_exhausted: 'Gerade zu viele Anfragen. Bitte kurz warten und erneut versuchen.',
    quota_exceeded: 'Der Speicher der Filiale ist voll. Bitte alte Vorgänge löschen (Admin → Einstellungen).',
    unavailable: 'Verbindung gestört. Änderung wurde nicht gespeichert.',
    revoked: 'Zugriff auf die Filialdaten wurde beendet.',
    not_granted: 'Kein Zugriff auf die Filialdaten.',
    capability_disabled: 'Filialbetrieb ist hier nicht verfügbar.',
    capability_removed: 'Filialbetrieb ist hier nicht verfügbar.',
    transform_error: 'Speichern nicht möglich: Daten ungültig.',
  };
  const TERMINAL = ['revoked', 'not_granted', 'capability_disabled', 'capability_removed'];

  /* ---------- Zustand -------------------------------------------------- */
  const S = {
    mode: null, status: 'loading', readOnly: false, ready: false,
    cache: {},     // col → Map(id → eingefrorenes Dokument, inkl. id)
    remote: {},    // nur db: col → Map(id → Dokument laut letztem Snapshot)
    lists: {},     // col → Array (Memo für list())
    loaded: {},    // col → erster bestätigter Snapshot da
    subs: {},      // col → Set(cb); '*' = jede Änderung
    dirty: new Set(), flushT: null,
    statusL: new Set(), errorL: new Set(),
    backend: null,
  };
  const viewer = { id: null, canWrite: null, isOwner: false, canEdit: false };

  function resetCache() {
    for (const c of COLS.concat(LAZY)) { S.cache[c] = new Map(); S.remote[c] = new Map(); S.lists[c] = null; S.loaded[c] = false; }
  }
  resetCache();

  const known = (col) => COLS.includes(col) || LAZY.includes(col);
  function check(col, id) {
    if (!known(col)) throw new TypeError('Unbekannte Collection: ' + col);
    if (id !== undefined && !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(String(id))) throw new TypeError('Ungültige Dokument-ID: ' + id);
  }
  const withId = (id, data) => U.deepFreeze(Object.assign({}, data, { id }));

  /* ---------- Benachrichtigung (immer asynchron) ------------------------ */
  function touch(col) {
    S.lists[col] = null;
    S.dirty.add(col);
    if (!S.flushT) S.flushT = setTimeout(flush, 0);
  }
  function flush() {
    S.flushT = null;
    const cols = Array.from(S.dirty); S.dirty.clear();
    for (const col of cols) {
      const docs = list(col);
      for (const cb of Array.from(S.subs[col] || [])) safe(cb, docs, col);
      for (const cb of Array.from(S.subs['*'] || [])) safe(cb, col);
    }
  }
  function safe(cb, a, b) { try { cb(a, b); } catch (e) { console.error('[SN.store] Abo-Fehler', e); } }

  function setStatus(st) {
    if (S.status === st) return;
    S.status = st;
    for (const cb of Array.from(S.statusL)) safe(cb, st);
  }
  function emitError(code, ctx) {
    const err = Object.assign({ code, message: ERROR_TEXT[code] || ERROR_TEXT.unavailable }, ctx || {});
    for (const cb of Array.from(S.errorL)) safe(cb, err);
    return err;
  }

  /* ---------- Lesen ------------------------------------------------------ */
  /** Alle Dokumente einer Collection (synchron aus dem Cache, eingefroren) */
  function list(col) {
    check(col);
    if (!S.lists[col]) S.lists[col] = Array.from(S.cache[col].values());
    return S.lists[col];
  }
  /** Ein Dokument synchron aus dem Cache, oder null */
  function peek(col, id) { check(col); return S.cache[col].get(id) || null; }

  /** Ein Dokument asynchron (Cache, bei LAZY-Collections aus der db) */
  async function get(col, id) {
    check(col, id);
    const c = S.cache[col].get(id);
    if (c || S.mode !== 'db' || !LAZY.includes(col)) return c || null;
    const doc = await S.backend.get(col, id);
    if (doc) { S.cache[col].set(id, doc); S.lists[col] = null; }
    return doc;
  }

  /**
   * Abo auf eine Collection: cb(arrayOfDocs, col). col '*' → cb(col) bei jeder Änderung.
   * Einmal je Collection beim Start registrieren, nie aus render() heraus.
   * Gibt eine Abmeldefunktion zurück. Erste Lieferung asynchron, sobald Daten da sind.
   */
  function sub(col, cb) {
    if (col !== '*') check(col);
    (S.subs[col] = S.subs[col] || new Set()).add(cb);
    if (col !== '*' && (S.mode === 'demo' || S.loaded[col])) setTimeout(() => { if (S.subs[col].has(cb)) safe(cb, list(col), col); }, 0);
    return () => S.subs[col] && S.subs[col].delete(cb);
  }

  /* ---------- Schreiben -------------------------------------------------- */
  function applyLocal(col, id, op, data) {
    const cur = S.cache[col].get(id);
    if (op === 'del') S.cache[col].delete(id);
    else if (op === 'put') S.cache[col].set(id, withId(id, U.clone(data)));
    else S.cache[col].set(id, withId(id, U.deepMerge(cur || {}, data)));
    touch(col);
  }
  function write(col, id, op, data) {
    check(col, id);
    if (op !== 'del' && !U.isObj(data)) throw new TypeError('Dokument muss ein Objekt sein');
    if (S.readOnly) return Promise.resolve({ ok: false, code: 'read_only' });
    if (data && 'id' in data) { data = Object.assign({}, data); delete data.id; }
    applyLocal(col, id, op, data);
    return S.backend.write(col, id, op, data);
  }
  /** Dokument komplett schreiben (ersetzen) */
  const put = (col, id, obj) => write(col, id, 'put', obj);
  /** Teil-Update mit tiefem Merge: patch('items', id, {acks: {[empId]: ts}}) */
  const patch = (col, id, partial) => write(col, id, 'patch', partial);
  /** Dokument löschen */
  const del = (col, id) => write(col, id, 'del', null);

  /* ---------- Backend: Demo ----------------------------------------------- */
  function demoBackend(data) {
    return {
      start() {
        for (const col of COLS.concat(LAZY)) {
          for (const d of (data && data[col]) || []) S.cache[col].set(d.id, withId(d.id, U.clone(d)));
          S.loaded[col] = true; touch(col);
        }
      },
      // Daten liegen schon im Cache; Bestätigung asynchron wie bei der db
      write() { return new Promise((r) => setTimeout(() => r({ ok: true }), 0)); },
      get(col, id) { return Promise.resolve(S.cache[col].get(id) || null); },
      stop() {},
    };
  }

  /* ---------- Backend: db ------------------------------------------------- */
  let dbPromise = null;
  /** claude.use('db') genau einmal; null, wenn nicht verfügbar. Nie window.claude.db lesen. */
  function useCap(name) {
    try {
      const c = window.claude;
      if (!c || typeof c.use !== 'function') return Promise.resolve(null);
      return Promise.resolve(c.use(name)).catch(() => null);
    } catch (e) { return Promise.resolve(null); }
  }
  function useDb() { if (!dbPromise) dbPromise = useCap('db'); return dbPromise; }

  function dbBackend(db) {
    const unsubs = {};
    const queues = {};   // 'col/id' → Promise-Kette (eine Schreiboperation je Dokument)
    const overlay = {};  // 'col/id' → noch nicht abgeschickte Operationen [{op, data}]
    const wrapped = new WeakMap(); // data() → eingefrorenes Dokument (gleiche Objekte bei unveränderten Docs)
    let timer = null, resubAt = {};
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });

    const ref = (col, id) => db.doc(ROOT + col + '/' + id);
    const allLoaded = () => COLS.every((c) => S.loaded[c]);

    // Cache einer Collection = letzter Snapshot + noch wartende eigene Schreibvorgänge
    function rebuild(col) {
      const m = new Map(S.remote[col]);
      for (const key of Object.keys(overlay)) {
        const [c, id] = key.split('/');
        if (c !== col) continue;
        for (const o of overlay[key]) {
          if (o.op === 'del') m.delete(id);
          else if (o.op === 'put') m.set(id, withId(id, U.clone(o.data)));
          else m.set(id, withId(id, U.deepMerge(m.get(id) || {}, o.data)));
        }
      }
      S.cache[col] = m; touch(col);
    }

    function subscribe(col) {
      unsubs[col] = db.collection(ROOT + col).onSnapshot((snap) => {
        const m = new Map();
        for (const d of snap.docs) {
          const raw = d.data();
          if (!raw) continue;
          let w = wrapped.get(raw);
          if (!w) { w = withId(d.id, raw); wrapped.set(raw, w); }
          m.set(d.id, w);
        }
        S.remote[col] = m;
        if (!snap.metadata.fromCache) S.loaded[col] = true;
        rebuild(col);
        if (allLoaded()) { clearTimeout(timer); setStatus(S.readOnly ? 'offline' : 'live'); resolveReady(); }
      }, (err) => {
        const code = (err && err.code) || 'unavailable';
        unsubs[col] = null;
        if (TERMINAL.includes(code)) {
          S.readOnly = true; setStatus('offline'); emitError(code, { col }); resolveReady();
        } else if (code === 'unavailable') {
          // Host antwortet nicht mehr: einmal neu abonnieren (höchstens alle 30 s)
          setStatus('stale');
          const t = Date.now();
          if (!resubAt[col] || t - resubAt[col] > 30000) { resubAt[col] = t; setTimeout(() => subscribe(col), 2000 + Math.random() * 2000); }
        } else {
          emitError(code, { col });
        }
      });
    }

    async function run(col, id, op, data) {
      const r = ref(col, id);
      if (op === 'put') return r.set(data);
      if (op === 'del') return r.delete();
      try {
        return await r.update(data);
      } catch (e) {
        if (!e || e.code !== 'invalid_argument') throw e;
        // update verlangt ein bestehendes Dokument → fehlt es, mit set anlegen
        const snap = await r.get();
        if (snap.exists) throw e;
        return r.set(U.deepMerge({}, data));
      }
    }

    async function attempt(col, id, op, data) {
      try { await run(col, id, op, data); return { ok: true }; } catch (e) {
        const code = (e && e.code) || 'unavailable';
        if (code === 'unavailable') {
          // vorübergehend: genau einmal nach kurzer, zufälliger Pause wiederholen
          await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
          try { await run(col, id, op, data); return { ok: true }; } catch (e2) { return { ok: false, code: (e2 && e2.code) || 'unavailable' }; }
        }
        return { ok: false, code };
      }
    }

    return {
      async start() {
        setStatus('loading');
        for (const col of COLS) subscribe(col);
        // Ladezeitlimit: ohne bestätigten Snapshot nach 10 s → „offline“ bzw. „veraltet“
        timer = setTimeout(() => {
          if (allLoaded()) return;
          const any = COLS.some((c) => S.remote[c].size);
          setStatus(any ? 'stale' : 'offline');
          resolveReady();
        }, LOAD_LIMIT_MS);
        return readyP;
      },
      write(col, id, op, data) {
        const key = col + '/' + id;
        const entry = { op, data };
        (overlay[key] = overlay[key] || []).push(entry);
        const prev = queues[key] || Promise.resolve();
        const p = prev.then(async () => {
          // ab jetzt kennt die db die Änderung (Latenzausgleich) → aus dem Overlay nehmen
          const i = overlay[key].indexOf(entry);
          if (i >= 0) overlay[key].splice(i, 1);
          if (!overlay[key].length) delete overlay[key];
          const res = await attempt(col, id, op, data);
          if (!res.ok) {
            if (res.code === 'invalid_argument' && viewer.canWrite !== true) { S.readOnly = true; setStatus('offline'); }
            if (TERMINAL.includes(res.code)) { S.readOnly = true; setStatus('offline'); }
            emitError(res.code, { col, id, op });
            rebuild(col); // optimistische Änderung zurücknehmen
          }
          return res;
        }).catch((e) => { console.error('[SN.store] Schreibfehler', e); return { ok: false, code: 'unavailable' }; });
        queues[key] = p;
        p.then(() => { if (queues[key] === p) delete queues[key]; });
        return p;
      },
      async get(col, id) {
        try {
          const s = await ref(col, id).get();
          return s.exists ? withId(id, s.data()) : null;
        } catch (e) { emitError((e && e.code) || 'unavailable', { col, id }); return null; }
      },
      stop() {
        clearTimeout(timer);
        for (const c of Object.keys(unsubs)) if (unsubs[c]) unsubs[c]();
      },
      prefRef(uid) { return db.doc('data/users/' + uid + '/prefs'); },
    };
  }

  /* ---------- Backend: eigener Server (SSE + REST) ------------------------- */
  // cfg = {url: 'https://…', key: 'Filial-Schlüssel'}. Server ist die Wahrheit; eigene Änderungen
  // werden sofort lokal gezeigt und vom Server per Event bestätigt. Ohne Netz: Warteschlange.
  function serverBackend(cfg) {
    const base = String(cfg.url || '').replace(/\/+$/, '');
    const hdr = (json) => Object.assign(cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}, json ? { 'Content-Type': 'application/json' } : {});
    const OUTBOX = 'outbox.' + base;
    let es = null, retryT = null, stopped = false;
    let outbox = U.ls.get(OUTBOX, []);
    const saveOutbox = () => U.ls.set(OUTBOX, outbox);

    function applyRemote(col, id, doc) {
      if (!S.cache[col]) return;
      if (doc) S.cache[col].set(id, withId(id, U.clone(doc))); else S.cache[col].delete(id);
      touch(col);
    }
    async function snapshot() {
      const r = await fetch(base + '/api/snapshot', { headers: hdr() });
      if (r.status === 401) { const e = new Error('unauthorized'); e.code = 'not_granted'; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      for (const col of COLS) {
        S.cache[col] = new Map();
        for (const d of (j.cols && j.cols[col]) || []) S.cache[col].set(d.id, withId(d.id, U.clone(d)));
        S.loaded[col] = true; touch(col);
      }
      // noch nicht übertragene eigene Änderungen wieder darüberlegen
      for (const o of outbox) applyLocal(o.col, o.id, o.op, o.data);
    }
    function listen() {
      if (es) es.close();
      es = new EventSource(base + '/api/events' + (cfg.key ? '?key=' + encodeURIComponent(cfg.key) : ''));
      es.onopen = () => { setStatus('live'); flushOutbox(); };
      es.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (!outbox.some((o) => o.col === m.col && o.id === m.id)) applyRemote(m.col, m.id, m.doc); } catch (e) { /* ignorieren */ } };
      es.onerror = () => {
        setStatus('offline');
        if (es && es.readyState === 2 && !stopped) { clearTimeout(retryT); retryT = setTimeout(() => resync(), 4000); }
      };
    }
    async function resync() { try { await snapshot(); listen(); } catch (e) { setStatus('offline'); retryT = setTimeout(resync, 6000); } }
    async function sendOne(o) {
      const u = base + '/api/doc/' + o.col + '/' + encodeURIComponent(o.id);
      const r = await fetch(u, { method: o.op === 'del' ? 'DELETE' : o.op === 'put' ? 'PUT' : 'PATCH', headers: hdr(true), body: o.op === 'del' ? undefined : JSON.stringify(o.data) });
      if (r.status === 401) return { ok: false, code: 'not_granted' };
      if (!r.ok) return { ok: false, code: r.status === 413 ? 'invalid_argument' : 'unavailable', fatal: r.status >= 400 && r.status < 500 };
      return { ok: true };
    }
    let flushing = false;
    async function flushOutbox() {
      if (flushing) return; flushing = true;
      try {
        while (outbox.length) {
          let r;
          try { r = await sendOne(outbox[0]); } catch (e) { r = { ok: false, code: 'unavailable' }; }
          if (!r.ok && !r.fatal) { setStatus('offline'); break; }
          outbox.shift(); saveOutbox();
        }
      } finally { flushing = false; }
    }
    window.addEventListener('online', () => { flushOutbox(); });
    return {
      async start() {
        setStatus('loading');
        try { await snapshot(); } catch (e) {
          if (e.code === 'not_granted') { emitError('not_granted', {}); throw e; }
          // offline gestartet: zuletzt bekannte Daten gibt es nicht – leer starten, später nachladen
          for (const col of COLS) S.loaded[col] = true;
          setStatus('offline'); retryT = setTimeout(resync, 5000); return;
        }
        listen();
      },
      async write(col, id, op, data) {
        const o = { col, id, op, data: data ? U.clone(data) : null };
        if (outbox.length) { outbox.push(o); saveOutbox(); flushOutbox(); return { ok: true, queued: true }; }
        try {
          const r = await sendOne(o);
          if (r.ok || r.fatal) return r;
        } catch (e) { /* Netz weg */ }
        outbox.push(o); saveOutbox(); setStatus('offline');
        return { ok: true, queued: true };
      },
      get(col, id) { return Promise.resolve(S.cache[col].get(id) || null); },
      stop() { stopped = true; if (es) es.close(); clearTimeout(retryT); },
      /** Foto hochladen → absolute URL (mit Schlüssel, damit <img> lädt) */
      async upload(blob) {
        const r = await fetch(base + '/api/media', { method: 'POST', headers: Object.assign(hdr(), { 'Content-Type': blob.type || 'image/jpeg' }), body: blob });
        if (!r.ok) throw new Error('Upload fehlgeschlagen (' + r.status + ')');
        const j = await r.json();
        return base + j.url + (cfg.key ? '?key=' + encodeURIComponent(cfg.key) : '');
      },
      pending: () => outbox.length,
      async login(id, pin) {
        try {
          const r = await fetch(base + '/api/login', { method: 'POST', headers: hdr(true), body: JSON.stringify({ id, pin }) });
          if (r.status === 429) return { ok: false, reason: 'Zu viele Versuche. Bitte 5 Minuten warten.' };
          if (!r.ok) return { ok: false, reason: r.status === 403 ? 'PIN falsch.' : 'Anmelden nicht möglich (' + r.status + ').' };
          return { ok: true };
        } catch (e) { return { ok: false, offline: true, reason: 'Keine Verbindung zum Server.' }; }
      },
    };
  }

  /* ---------- Start ------------------------------------------------------ */
  /** Ist der Filialbetrieb möglich? → {db: boolean} */
  async function detect() { return { db: !!(await useDb()) }; }

  /**
   * Store starten. mode 'demo' | 'db'.
   * opts.data: eigener Datensatz für Demo (Standard SN.demo.build()); opts.empty: leer.
   * Löst auf mit {ok, mode, status, fallback?}. Ist db nicht verfügbar, wird Demo genutzt.
   */
  async function init(mode, opts) {
    opts = opts || {};
    if (S.backend) S.backend.stop();
    clearTimeout(S.flushT); S.flushT = null; S.dirty.clear();
    resetCache();
    S.ready = false; S.readOnly = false; S.status = 'loading';
    let fallback = false;
    if (mode === 'server') {
      S.mode = 'server';
      S.backend = serverBackend(opts.server || {});
      try { await S.backend.start(); } catch (e) { S.backend.stop(); return { ok: false, mode: 'server', code: e.code || 'unavailable' }; }
      S.ready = true;
      return { ok: true, mode: 'server', status: S.status };
    }
    if (mode === 'db') {
      const db = await useDb();
      if (db) {
        const user = await useCap('user');
        if (user) {
          // Werte des user-Namensraums lösen immer auf, nie Fehler
          viewer.id = await user.id();
          viewer.canWrite = await user.can('data.write');
          viewer.isOwner = await user.isOwner();
          viewer.canEdit = await user.canEdit();
        }
        if (viewer.canWrite === false) S.readOnly = true;
        S.mode = 'db';
        S.backend = dbBackend(db);
        await S.backend.start();
        S.ready = true;
        return { ok: true, mode: 'db', status: S.status };
      }
      fallback = true;
    }
    S.mode = 'demo';
    const data = opts.empty ? {} : (opts.data || (SN.demo ? SN.demo.build(SN.clock.now()) : {}));
    S.backend = demoBackend(data);
    S.backend.start();
    setStatus('demo');
    S.ready = true;
    return { ok: true, mode: 'demo', status: S.status, fallback };
  }

  /**
   * Foto speichern → URL zum Anzeigen. Server: echte Datei auf dem Server.
   * Sonst (Demo, Claude-db): verkleinerte data:-URL im Dokument (db-Limit 256 KiB).
   */
  async function upload(blob, dataUrl) {
    if (S.backend && S.backend.upload) return S.backend.upload(blob);
    return dataUrl;
  }

  /* ---------- Viewer-Einstellungen (zuletzt genutztes Konto) ------------- */
  const prefs = {
    async get() {
      if (S.mode === 'db' && viewer.id && S.backend.prefRef) {
        try { const s = await S.backend.prefRef(viewer.id).get(); return s.exists ? U.clone(s.data()) : {}; } catch (e) { return {}; }
      }
      return U.ls.get('prefs.' + (S.mode || 'demo'), {});
    },
    async set(obj) {
      if (S.mode === 'db' && viewer.id && S.backend.prefRef) {
        try { await S.backend.prefRef(viewer.id).set(U.clone(obj)); } catch (e) { /* eigener Bereich nicht beschreibbar: egal */ }
        return;
      }
      U.ls.set('prefs.' + (S.mode || 'demo'), obj);
    },
  };

  SN.store = {
    COLS, LAZY, STATUS_TEXT, ERROR_TEXT,
    get mode() { return S.mode; },
    get status() { return S.status; },
    get statusText() { return STATUS_TEXT[S.status] || S.status; },
    get readOnly() { return S.readOnly; },
    get ready() { return S.ready; },
    viewer,
    detect, init, sub, list, peek, get, put, patch, del, prefs, upload,
    get pending() { return S.backend && S.backend.pending ? S.backend.pending() : 0; },
    onStatus(cb) { S.statusL.add(cb); return () => S.statusL.delete(cb); },
    onError(cb) { S.errorL.add(cb); return () => S.errorL.delete(cb); },
    /** Wartet, bis alle anstehenden Benachrichtigungen ausgeliefert sind (Tests). */
    settle() { return new Promise((r) => setTimeout(r, 0)).then(() => new Promise((r) => setTimeout(r, 0))); },
  };

  /* ==========================================================================
     SN.session – angemeldetes Konto (Konto wählen + PIN, Demo-PIN 1234)
     ========================================================================== */
  const sessL = new Set();
  let current = null;
  SN.session = {
    DEMO_PIN: '1234',
    get id() { return current; },
    /** Angemeldete Person (Dokument aus staff) oder null */
    me() { return current ? SN.store.peek('staff', current) : null; },
    /**
     * Anmelden → Promise {ok, reason?}. Server-Modus: der Server prüft (PIN-Hashes kommen nie aufs Gerät).
     * Sonst: pinHash im Konto, alte Klartext-PIN wird beim ersten Anmelden in einen Hash umgewandelt,
     * ohne PIN gilt die Demo-PIN.
     */
    async login(empId, pin) {
      const e = SN.store.peek('staff', empId);
      if (!e) return { ok: false, reason: 'Konto nicht gefunden.' };
      pin = String(pin == null ? '' : pin).trim();
      if (S.mode === 'server' && S.backend.login) {
        const r = await S.backend.login(empId, pin);
        if (!r.ok) {
          // ohne Netz: nur das zuletzt auf diesem Gerät angemeldete Konto
          const last = (await prefs.get()).empId;
          if (!(r.offline && last === empId)) return r;
        }
      } else if (e.pinHash) {
        if (U.pinHash(empId, pin) !== e.pinHash) return { ok: false, reason: 'PIN falsch.' };
      } else if (e.pin) {
        if (pin !== String(e.pin)) return { ok: false, reason: 'PIN falsch.' };
        const next = U.clone(e); delete next.pin; next.pinHash = U.pinHash(empId, pin);
        SN.store.put('staff', empId, next); // Klartext-PIN entfernen
      } else if (pin !== SN.session.DEMO_PIN) return { ok: false, reason: 'PIN falsch.' };
      current = empId;
      prefs.get().then((p) => prefs.set(Object.assign({}, p, { empId })));
      for (const cb of Array.from(sessL)) safe(cb, empId);
      return { ok: true };
    },
    /** PIN-Hash für ein Konto (beim Anlegen/Ändern speichern statt der PIN) */
    hash(empId, pin) { return U.pinHash(empId, pin);
    },
    logout() { current = null; for (const cb of Array.from(sessL)) safe(cb, null); },
    /** Zuletzt genutztes Konto dieses Viewers (Filialmodus: pro claude.ai-Konto) */
    async last() { const p = await prefs.get(); return p.empId && SN.store.peek('staff', p.empId) ? p.empId : null; },
    onChange(cb) { sessL.add(cb); return () => sessL.delete(cb); },
  };
})(window.SN = window.SN || {});
