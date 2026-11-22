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

  SN.clock = clock;
  SN.util = {
    MIN, HOUR, DAY,
    esc, fmt, startOfDay, id, clone, deepMerge, deepFreeze, isObj, uniq, sortBy, slug, debounce,
    ls, $, $$, vibrate, dataUrlToBlob, shrinkImage,
  };
})(window.SN = window.SN || {});
