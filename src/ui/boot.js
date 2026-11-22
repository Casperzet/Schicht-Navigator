/* ==========================================================================
   boot.js – startet die App (immer das LETZTE Modul im Build)
   --------------------------------------------------------------------------
   1. KI-Hülle vorbereiten (SN.ai.init, parallel)
   2. Modus wählen: db verfügbar → Auswahl „Demo“ / „Filialbetrieb“, sonst Demo.
      URL-Parameter ?mode=demo|db überspringt die Auswahl (Tests).
   3. SN.store.init(mode); im Demo außerhalb 06–21:30 Uhr spielt die Uhr um 10:30
      (abschaltbar mit ?realtime=1).
   4. SN.ui.start({mode}) aufrufen, falls die Oberfläche (src/ui/shell.js) da ist,
      sonst eine einfache Platzhalterseite.
   SN.ready: Promise, löst nach dem Start auf mit {mode, fallback}.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util;
  const byId = (id) => document.getElementById(id);

  function param(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; }
  }

  function showStatus(st) {
    const el = byId('hdr-status');
    if (!el) return;
    el.dataset.status = st;
    el.textContent = SN.store.STATUS_TEXT[st] || st;
  }

  /** Einfache Modus-Auswahl (die Oberfläche kann SN.ui.chooseMode() selbst anbieten) */
  function chooseMode() {
    if (SN.ui && typeof SN.ui.chooseMode === 'function') return Promise.resolve(SN.ui.chooseMode());
    const last = U.ls.get('mode', 'db');
    return new Promise((resolve) => {
      const v = byId('view');
      v.innerHTML = '<h2 class="sn-section-title">Wie möchtest du starten?</h2>'
        + '<div class="sn-boot-choice">'
        + '<button type="button" data-mode="db"' + (last === 'db' ? ' autofocus' : '') + '><strong>🏪 Filialbetrieb</strong><span>Gemeinsame Live-Daten für alle mit Zugriff</span></button>'
        + '<button type="button" data-mode="demo"' + (last === 'demo' ? ' autofocus' : '') + '><strong>🧪 Demo</strong><span>Ausprobieren mit Beispieldaten, nichts wird gespeichert</span></button>'
        + '</div>';
      v.addEventListener('click', function onClick(ev) {
        const b = ev.target.closest('[data-mode]');
        if (!b) return;
        v.removeEventListener('click', onClick);
        U.ls.set('mode', b.dataset.mode);
        v.innerHTML = '<p class="sn-boot">Wird geladen …</p>';
        resolve(b.dataset.mode);
      });
    });
  }

  /** Platzhalter, solange es noch keine Oberfläche (SN.ui) gibt */
  function placeholder(r) {
    const staff = SN.store.list('staff');
    const items = SN.store.list('items');
    byId('view').innerHTML = '<div class="sn-card" style="padding:16px">'
      + '<h2 class="sn-section-title" style="margin-top:0">Kern geladen</h2>'
      + '<p>Modus: <strong>' + U.esc(r.mode === 'db' ? 'Filialbetrieb' : 'Demo') + '</strong>'
      + (r.fallback ? ' (Filialbetrieb nicht verfügbar)' : '') + '</p>'
      + '<p>' + U.esc(U.fmt.count(staff.length, 'Konto', 'Konten')) + ' · ' + U.esc(U.fmt.count(items.length, 'Vorgang', 'Vorgänge')) + '</p>'
      + '<p class="sn-muted">Die Oberfläche (src/ui/shell.js) ist noch nicht eingebaut.</p></div>';
  }

  async function boot() {
    const aiReady = SN.ai.init().catch(() => null);
    const forced = param('mode');
    let mode = 'demo';
    if (forced !== 'demo') {
      const caps = await SN.store.detect();
      if (caps.db) mode = forced === 'db' ? 'db' : await chooseMode();
    }
    if (mode === 'demo' && !param('realtime')) {
      const off = SN.demo.clockOffset(Date.now());
      if (off) SN.clock.offset(off);
    }
    SN.store.onStatus(showStatus);
    showStatus('loading');
    const r = await SN.store.init(mode);
    showStatus(SN.store.status);
    await aiReady;
    document.documentElement.dataset.snMode = r.mode;
    if (SN.ui && typeof SN.ui.start === 'function') await SN.ui.start({ mode: r.mode, fallback: !!r.fallback });
    else placeholder(r);
    document.documentElement.dataset.snReady = '1';
    return { mode: r.mode, fallback: !!r.fallback };
  }

  function start() {
    SN.ready = boot().catch((e) => {
      console.error('[SN] Start fehlgeschlagen', e);
      const v = byId('view');
      if (v) v.innerHTML = '<p role="alert">Der Schicht-Navigator konnte nicht starten. Bitte Seite neu laden.</p>';
      throw e;
    });
    SN.ready.catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window.SN = window.SN || {});
