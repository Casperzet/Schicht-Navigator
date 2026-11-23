/* ==========================================================================
   SN.util · SN.clock – kleine Helfer ohne Fachlogik
   --------------------------------------------------------------------------
   - SN.clock: einzige Zeitquelle der App (in Tests überschreibbar)
   - Text/HTML: esc, fmt.*
   - Daten: id, clone, deepMerge, deepFreeze, uniq, sortBy
   - DOM: $, $$, shrinkImage, dataUrlToBlob, vibrate
   - Lokaler Speicher: ls.get/ls.set (immer in try/catch)
   ========================================================================== */
(function (SN) {
  'use strict';

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  /* ---------- Uhr ---------------------------------------------------- */
  // Zeitquelle: Date.now() + Versatz, oder eine feste Zeit (Tests).
  let fixed = null;
  let offset = 0;
  const clock = {
    now() { return fixed !== null ? fixed : Date.now() + offset; },
    /** Feste Zeit setzen (Zahl oder Date); null hebt sie auf. */
    set(ts) { fixed = ts === null ? null : +ts; },
    /** Uhr um ms vorspulen (feste Zeit oder Versatz). */
    advance(ms) { if (fixed !== null) fixed += ms; else offset += ms; },
    /** Laufende Uhr mit Versatz (z. B. Demo außerhalb der Ladenzeiten). */
    offset(ms) { fixed = null; offset = ms; },
    reset() { fixed = null; offset = 0; },
  };

  /* ---------- Text ---------------------------------------------------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** HTML-sicher maskieren (für alle Nutzerinhalte in Template-Strings). */
  function esc(v) {
    return v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  const pad = (n) => (n < 10 ? '0' : '') + n;
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  const fmt = {
    /** 09:05 */
    time(ts) { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); },
    /** Mo, 23.11. */
    date(ts) { const d = new Date(ts); return WD[d.getDay()] + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; },
    /** Heute 09:05 · Gestern 18:10 · Mo, 23.11. 09:05 */
    when(ts) {
      const k = fmt.dayKey(ts);
      const now = clock.now();
      if (k === fmt.dayKey(now)) return 'Heute ' + fmt.time(ts);
      if (k === fmt.dayKey(now - DAY)) return 'Gestern ' + fmt.time(ts);
      return fmt.date(ts) + ' ' + fmt.time(ts);
    },
    /** Minuten → „45 Min“ / „1 Std 30 Min“ */
    dur(min) {
      min = Math.max(0, Math.round(min));
      if (min < 60) return min + ' Min';
      const h = Math.floor(min / 60), m = min % 60;
      return h + ' Std' + (m ? ' ' + m + ' Min' : '');
    },
    /** „gerade eben“ / „vor 4 Min“ / „vor 2 Std“ */
    ago(ts) {
      const m = Math.floor((clock.now() - ts) / MIN);
      if (m < 1) return 'gerade eben';
      if (m < 60) return 'vor ' + m + ' Min';
      const h = Math.floor(m / 60);
      if (h < 24) return 'vor ' + h + ' Std';
      return fmt.date(ts);
    },
    /** Restzeit bis ts: {text, late, soon} – „noch 12 Min“ / „überfällig seit 3 Min“ */
    left(ts) {
      const m = Math.round((ts - clock.now()) / MIN);
      if (m < 0) return { text: 'überfällig seit ' + fmt.dur(-m), late: true, soon: true };
      return { text: 'noch ' + fmt.dur(m), late: false, soon: m < 15 };
    },
    /** 2026-11-22 (lokales Datum) */
    dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    /** Wochentag-Kürzel Mo..So */
    weekday(ts) { return WD[new Date(ts).getDay()]; },
    /** „06:00“ → Minuten seit Mitternacht */
    hm(s) { const p = String(s || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); },
    /** Zahl mit deutscher Endung: 1 Auftrag / 3 Aufträge */
    count(n, one, many) { return n + ' ' + (n === 1 ? one : many); },
  };

  /** Mitternacht (lokal) des Tages von ts */
  function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

  /* ---------- Daten ---------------------------------------------------- */
  let seq = 0;
  /** Eindeutige ID, nur Zeichen, die die db erlaubt: [a-z0-9-] */
  function id(prefix) {
    seq = (seq + 1) % 1296;
    const r = Math.random().toString(36).slice(2, 7);
    return (prefix ? prefix + '-' : '') + clock.now().toString(36) + seq.toString(36) + r;
  }

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  /** Tiefe Kopie (nur JSON-Daten) */
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /**
   * Tiefes Zusammenführen wie db.update(): verschachtelte Objekte werden
   * rekursiv gemischt, alles andere (auch Arrays und null) ersetzt.
   * Erzeugt neue Objekte, verändert keine Eingabe.
   */
  function deepMerge(base, patch) {
    if (!isObj(patch)) return clone(patch);
    const out = isObj(base) ? Object.assign({}, base) : {};
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (v === undefined) continue;
      out[k] = isObj(v) ? deepMerge(isObj(out[k]) ? out[k] : {}, v) : clone(v);
    }
    return out;
  }

  /** Objekt rekursiv einfrieren (Cache-Dokumente dürfen nie verändert werden) */
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) deepFreeze(o[k]);
    }
    return o;
  }

  const uniq = (a) => Array.from(new Set(a.filter((x) => x !== null && x !== undefined)));

  /** Stabil sortieren nach Schlüsselfunktion (aufsteigend) */
  function sortBy(arr, key) {
    return arr.map((v, i) => [key(v), i, v])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]))
      .map((x) => x[2]);
  }

  /** Text → db-taugliche ID: „Obst und Gemüse“ → „obst-und-gemuese“ */
  function slug(s) {
    return String(s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function debounce(fn, ms) {
    let t = null;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  }

  /* ---------- Lokaler Speicher (nur Komfort) --------------------------- */
  const ls = {
    get(key, fallback) {
      try { const v = window.localStorage.getItem('sn2.' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem('sn2.' + key, JSON.stringify(value)); } catch (e) { /* privat/blockiert: egal */ }
    },
  };

  /* ---------- DOM ------------------------------------------------------ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 15); } catch (e) { /* egal */ } }

  /** data:-URL → Blob (für KI-Bilder) */
  function dataUrlToBlob(url) {
    const [head, b64] = String(url).split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64 || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /**
   * Foto verkleinern: File/Blob → {dataUrl, blob}. Lange Kante max px,
   * JPEG-Qualität q. Klein halten: Dokumentlimit der db ist 256 KiB.
   */
  function shrinkImage(file, max, q) {
    max = max || 900; q = q || 0.6;
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('Foto konnte nicht gelesen werden'));
      r.onload = () => {
        const im = new Image();
        im.onerror = () => reject(new Error('Foto konnte nicht geöffnet werden'));
        im.onload = () => {
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          const dataUrl = c.toDataURL('image/jpeg', q);
          resolve({ dataUrl, blob: dataUrlToBlob(dataUrl), w: c.width, h: c.height });
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ---------- SHA-256 (PIN nie im Klartext speichern) -------------------- */
  function sha256js(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = Array.from(unescape(encodeURIComponent(str)), (c) => c.charCodeAt(0)); // UTF-8, ohne TextEncoder
    const l = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < bytes.length; i += 64) {
      const w = [];
      for (let j = 0; j < 16; j++) w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
      for (let j = 16; j < 64; j++) {
        const s0 = r(w[j - 15], 7) ^ r(w[j - 15], 18) ^ (w[j - 15] >>> 3), s1 = r(w[j - 2], 17) ^ r(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let j = 0; j < 64; j++) {
        const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = h.map((x, k) => (x + [a, b, c, d, e, f, g, hh][k]) | 0);
    }
    return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  /** PIN-Hash: sha256("sn-pin:" + Personal-ID + ":" + PIN) als Hex */
  function pinHash(empId, pin) { return sha256js('sn-pin:' + empId + ':' + String(pin)); }

  SN.clock = clock;
  SN.util = {
    MIN, HOUR, DAY,
    esc, fmt, startOfDay, id, clone, deepMerge, deepFreeze, isObj, uniq, sortBy, slug, debounce,
    ls, $, $$, vibrate, dataUrlToBlob, shrinkImage, sha256: sha256js, pinHash,
  };
})(window.SN = window.SN || {});
