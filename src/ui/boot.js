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

  /* ---------- Server-Verbindung (APK, eigene Filial-Server) ------------- */
  const isApp = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  async function sameOriginServer() {
    if (!/^https?:$/.test(location.protocol) || isApp()) return null;
    try { const r = await fetch('/api/health', { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return j && j.ok ? { url: location.origin, keyRequired: j.keyRequired } : null; } catch (e) { return null; }
  }
  async function testServer(cfg) {
    const base = cfg.url.replace(/\/+$/, '');
    const h = await fetch(base + '/api/health', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (!h || !h.ok) return 'Server nicht erreichbar. Adresse prüfen (mit https://).';
    const r = await fetch(base + '/api/snapshot', { headers: cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {} }).catch(() => null);
    if (!r) return 'Server nicht erreichbar.';
    if (r.status === 401) return 'Filial-Schlüssel falsch.';
    return r.ok ? '' : 'Server meldet Fehler ' + r.status + '.';
  }
  function serverForm(pre, msg) {
    return new Promise((resolve) => {
      const v = byId('view');
      v.innerHTML = '<section class="sn-login"><h2 class="sn-section-title">Mit Filial-Server verbinden</h2>'
        + '<p class="sn-muted">Einmalig pro Gerät. Adresse und Filial-Schlüssel bekommst du von der Filialleitung.</p>'
        + (msg ? '<div class="sn-alert sn-alert--warn sn-alert--card" role="alert"><p class="sn-alert__title">' + U.esc(msg) + '</p></div>' : '')
        + '<div class="sn-field"><label class="sn-label" for="sv-url">Server-Adresse</label><input class="sn-input" id="sv-url" inputmode="url" autocomplete="url" placeholder="https://schicht.example.de" value="' + U.esc(pre.url || '') + '"></div>'
        + '<div class="sn-field"><label class="sn-label" for="sv-key">Filial-Schlüssel</label><input class="sn-input" id="sv-key" type="password" autocomplete="off" value="' + U.esc(pre.key || '') + '"></div>'
        + '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" id="sv-go">Verbinden</button>'
        + '<button type="button" class="sn-btn sn-btn--ghost sn-btn--block" id="sv-demo">Erst mal Demo ansehen</button></section>';
      byId('sv-demo').onclick = () => resolve(null);
      byId('sv-go').onclick = async () => {
        const cfg = { url: byId('sv-url').value.trim(), key: byId('sv-key').value.trim() };
        if (!/^https?:\/\//.test(cfg.url)) cfg.url = 'https://' + cfg.url;
        byId('sv-go').textContent = 'Verbinde …';
        const err = await testServer(cfg);
        if (err) { resolve(serverForm(cfg, err)); return; }
        U.ls.set('server', cfg);
        resolve(cfg);
      };
    });
  }
  /** Ermittelt {mode, server?}: URL-Parameter → gespeicherte Verbindung → gleicher Server → App → Claude-db → Demo */
  async function pickServer() {
    const qs = param('server');
    if (qs) { const cfg = { url: qs, key: param('key') || '' }; U.ls.set('server', cfg); return cfg; }
    const saved = U.ls.get('server', null);
    if (saved && saved.url) return saved;
    const same = await sameOriginServer();
    if (same) return serverForm({ url: same.url }, '');
    if (isApp()) return serverForm({ url: window.SN_DEFAULT_SERVER || '' }, '');
    return null;
  }
  SN.serverReset = () => { U.ls.set('server', null); location.reload(); };

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
    let server = null;
    if (forced !== 'demo' && forced !== 'db') server = await pickServer();
    if (server) mode = 'server';
    else if (forced !== 'demo') {
      const caps = await SN.store.detect();
      if (caps.db) mode = forced === 'db' ? 'db' : await chooseMode();
    }
    if (mode === 'demo' && !param('realtime')) {
      const off = SN.demo.clockOffset(Date.now());
      if (off) SN.clock.offset(off);
    }
    SN.store.onStatus(showStatus);
    showStatus('loading');
    let r = await SN.store.init(mode, server ? { server } : undefined);
    if (!r.ok && mode === 'server') {
      // Verbindung fehlgeschlagen (z. B. Schlüssel geändert) → neu eingeben
      const cfg = await serverForm(server, r.code === 'not_granted' ? 'Filial-Schlüssel ungültig.' : 'Server nicht erreichbar.');
      r = await SN.store.init(cfg ? 'server' : 'demo', cfg ? { server: cfg } : undefined);
    }
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
