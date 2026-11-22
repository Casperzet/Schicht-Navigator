/* ==========================================================================
   SN.ai – Hülle für claude.use('sample') und claude.use('dictation')
   --------------------------------------------------------------------------
   Null-Verhalten: Ist die KI nicht verfügbar oder schlägt ein Aufruf fehl,
   liefern alle Funktionen null (nie eine Ausnahme). Der letzte Fehler steht
   in SN.ai.lastError {code, message} mit deutschem Text für die Oberfläche.
   KI nur auf ausdrückliche Nutzeraktion aufrufen, nie aus Schleifen/Takt.
   Diktat: start() MUSS synchron im Klick-Handler aufgerufen werden – daher
   wird der Namensraum vorab in init() aufgelöst.
   ========================================================================== */
(function (SN) {
  'use strict';

  const ERR = {
    not_granted: 'KI wurde nicht erlaubt.',
    sampling_disabled: 'KI ist hier ausgeschaltet.',
    not_declared: 'KI ist für diese Seite nicht freigeschaltet.',
    rate_limited: 'Gerade zu viele KI-Anfragen. Bitte gleich noch einmal.',
    refused: 'Die KI hat die Anfrage abgelehnt.',
    invalid_json: 'Die KI-Antwort war nicht lesbar. Bitte noch einmal versuchen.',
    images_unavailable: 'Bilder können hier nicht an die KI gesendet werden.',
    image_rejected: 'Das Foto wurde nicht angenommen.',
    prompt_too_large: 'Zu viel Text auf einmal.',
    cancelled: 'Abgebrochen.',
    session_expired: 'Sitzung abgelaufen. Bitte Seite neu laden.',
    unavailable: 'KI ist hier nicht verfügbar (nur in Claude).',
    upstream_error: 'KI gerade gestört. Bitte später noch einmal.',
    no_gesture: 'Diktat bitte direkt mit dem Knopf starten.',
    dismissed: 'Diktat wurde nicht erlaubt.',
    stopped: 'Diktat beendet.',
  };
  const errorText = (code) => ERR[code] || ERR.upstream_error;

  const LANGS = {
    de: 'Deutsch', en: 'Englisch', tr: 'Türkisch', pl: 'Polnisch', ru: 'Russisch', uk: 'Ukrainisch', ar: 'Arabisch',
    ro: 'Rumänisch', it: 'Italienisch', hr: 'Kroatisch', el: 'Griechisch', vi: 'Vietnamesisch', es: 'Spanisch', fa: 'Persisch',
  };

  let sample = null, dict = null, limits = null, initP = null;
  const state = { lastError: null };

  function useCap(name) {
    try {
      const c = window.claude;
      if (!c || typeof c.use !== 'function') return Promise.resolve(null);
      return Promise.resolve(c.use(name)).catch(() => null);
    } catch (e) { return Promise.resolve(null); }
  }

  /** Einmal beim Start aufrufen; löst auf mit {text, images, dictation} */
  function init() {
    if (!initP) {
      initP = Promise.all([useCap('sample'), useCap('dictation')]).then(async ([s, d]) => {
        sample = s; dict = d;
        if (sample && typeof sample.limits === 'function') limits = await sample.limits().catch(() => null);
        return available();
      });
    }
    return initP;
  }
  /** Was geht in dieser Ansicht? */
  const available = () => ({ text: !!sample, images: !!(limits && limits.images), dictation: !!dict });

  function setErr(e) {
    const code = (e && e.code) || 'upstream_error';
    state.lastError = { code, message: errorText(code), text: (e && e.text) || '' };
    return null;
  }

  /** Text-Antwort oder null. opts: {tier, onText, signal, images[]} */
  async function text(prompt, opts) {
    await init(); opts = opts || {};
    if (!sample) return setErr({ code: 'unavailable' });
    try {
      const r = await sample(prompt, buildOpts(opts));
      state.lastError = null;
      return r.text;
    } catch (e) { return setErr(e); }
  }
  /** JSON-Antwort oder null (Felder bitte selbst prüfen) */
  async function json(prompt, opts) {
    await init(); opts = opts || {};
    if (!sample) return setErr({ code: 'unavailable' });
    try {
      const r = await sample.json(prompt, buildOpts(opts));
      state.lastError = null;
      return r;
    } catch (e) { return setErr(e); }
  }
  /** Bild(er) auswerten → JSON oder null. images: Blob[] (z. B. aus SN.util.shrinkImage) */
  async function image(prompt, images, opts) {
    await init();
    if (!sample) return setErr({ code: 'unavailable' });
    if (!available().images) return setErr({ code: 'images_unavailable' });
    return json(prompt, Object.assign({ tier: 'default' }, opts || {}, { images: [].concat(images || []) }));
  }
  function buildOpts(o) {
    const out = { modelTier: o.tier || 'quick', cache: o.cache === undefined ? false : o.cache };
    if (o.onText) out.onText = o.onText;
    if (o.signal) out.signal = o.signal;
    if (o.images && o.images.length) out.images = o.images;
    return out;
  }

  /**
   * Übersetzen. to = Sprachcode (Standard 'de').
   * → {text, from} oder null (dann Original anzeigen)
   */
  async function translate(src, to) {
    to = to || 'de';
    if (!String(src || '').trim()) return null;
    const r = await json('Übersetze den folgenden Text ins ' + (LANGS[to] || to) + '. Sachlich, kurz, Bedeutung genau erhalten. '
      + 'Antworte NUR mit JSON {"text":"Übersetzung","from":"zweistelliger Sprachcode des Originals"}.\n\nText: ' + JSON.stringify(String(src)));
    if (!r || typeof r.text !== 'string') return r === null ? null : setErr({ code: 'invalid_json' });
    return { text: r.text, from: typeof r.from === 'string' ? r.from.slice(0, 5) : null };
  }
  /** Ins Deutsche (für Meldungen/Nachrichten): Original bleibt beim Aufrufer */
  const toGerman = (src) => translate(src, 'de');

  /* ---------- Diktat -------------------------------------------------------- */
  const dictation = {
    available: () => !!dict,
    /**
     * Zuhören starten – SYNCHRON im Klick-Handler aufrufen.
     * h = {onPartial(text), onFinal(text), onState(state, reason)} → Promise<boolean>
     */
    start(h, language) {
      h = h || {};
      if (!dict) { setErr({ code: 'unavailable' }); return Promise.resolve(false); }
      const offs = [];
      if (h.onPartial) offs.push(dict.onPartial((e) => h.onPartial(e.text)));
      if (h.onFinal) offs.push(dict.onFinal((e) => h.onFinal(e.text)));
      offs.push(dict.onState((e) => {
        if (h.onState) h.onState(e.state, e.reason);
        if (e.state === 'idle') offs.splice(0).forEach((f) => f());
      }));
      return dict.start(language ? { language } : undefined).then(() => true, (e) => {
        offs.splice(0).forEach((f) => f());
        setErr({ code: (e && e.code) || 'upstream_error' });
        return false;
      });
    },
    stop() { return dict ? dict.stop().catch(() => {}) : Promise.resolve(); },
    active() { return !!(dict && dict.active()); },
  };

  SN.ai = {
    LANGS, init, available, text, json, image, translate, toGerman, dictation, errorText,
    get lastError() { return state.lastError; },
  };
})(window.SN = window.SN || {});
