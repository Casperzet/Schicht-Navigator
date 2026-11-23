/* ==========================================================================
   test/server.test.js – Server ohne Browser: Schlüssel, Live-Events, Löschfrist
   Startet den Server selbst auf einem freien Port mit eigenem Datenordner.
   Aufruf: node test/server.test.js
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
let fails = 0;
const ok = (c, t) => { if (!c) fails++; console.log((c ? '  ✓ ' : '  ✗ ') + t); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-srv-'));
  const media = path.join(dir, 'media');
  fs.mkdirSync(media, { recursive: true });
  const old = Date.now() - 40 * 864e5;
  // altes und neues Foto, je ein Vorgang dazu
  fs.writeFileSync(path.join(media, 'alt.jpg'), 'x'); fs.utimesSync(path.join(media, 'alt.jpg'), old / 1000, old / 1000);
  fs.writeFileSync(path.join(media, 'neu.jpg'), 'y');
  fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify({
    'ph-alt': { kind: 'photo', createdAt: old, photos: ['/media/alt.jpg'], title: 'alt' },
    'ph-neu': { kind: 'photo', createdAt: Date.now(), photos: ['/media/neu.jpg'], title: 'neu' },
  }));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: dir, FILIAL_KEY: 'k1', MEDIA_DAYS: '30' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/health'); break; } catch (e) { await wait(100); } }
  try {
    console.log('Server');
    const h = await (await fetch(base + '/api/health')).json();
    ok(h.ok && h.keyRequired && h.mediaDays === 30, 'Health: Schlüssel verlangt, Löschfrist 30 Tage');
    ok((await fetch(base + '/api/snapshot')).status === 401, 'Ohne Schlüssel: 401');
    ok((await fetch(base + '/api/snapshot', { headers: { Authorization: 'Bearer falsch' } })).status === 401, 'Falscher Schlüssel: 401');
    ok(!fs.existsSync(path.join(media, 'alt.jpg')) && fs.existsSync(path.join(media, 'neu.jpg')), 'Löschfrist: altes Foto gelöscht, neues bleibt');
    const snap = await (await fetch(base + '/api/snapshot', { headers: { Authorization: 'Bearer k1' } })).json();
    const a = snap.cols.items.find((x) => x.id === 'ph-alt'), n = snap.cols.items.find((x) => x.id === 'ph-neu');
    ok(a.photos.length === 0 && a.photosRemoved === 1 && n.photos.length === 1, 'Löschfrist: Vorgang als „Fotos entfernt“ markiert, neuer unverändert');
    // Live-Event über SSE
    const ctl = new AbortController();
    const ev = await fetch(base + '/api/events?key=k1', { signal: ctl.signal });
    const reader = ev.body.getReader();
    await fetch(base + '/api/doc/items/t1', { method: 'PATCH', headers: { Authorization: 'Bearer k1', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Test', acks: { a: 1 } }) });
    await fetch(base + '/api/doc/items/t1', { method: 'PATCH', headers: { Authorization: 'Bearer k1', 'Content-Type': 'application/json' }, body: JSON.stringify({ acks: { b: 2 } }) });
    let txt = '';
    const t0 = Date.now();
    while (Date.now() - t0 < 3000 && (txt.match(/"col":"items"/g) || []).length < 2) { const r = await reader.read(); txt += Buffer.from(r.value || []).toString(); }
    ctl.abort();
    ok(/"acks":\{"a":1,"b":2\}/.test(txt), 'PATCH mergt tief (gleichzeitige Quittungen gehen nicht verloren) und kommt live per SSE');
    ok((await fetch(base + '/api/doc/unbekannt/x', { method: 'PUT', headers: { Authorization: 'Bearer k1' }, body: '{}' })).status === 400, 'Unbekannte Collection: 400');
    ok((await fetch(base + '/api/media', { method: 'POST', headers: { Authorization: 'Bearer k1', 'Content-Type': 'text/html' }, body: '<script>' })).status === 415, 'Nur Bilder als Upload (415 sonst)');
  } finally {
    srv.kill('SIGTERM');
    await wait(300);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(fails ? '\n' + fails + ' Fehler' : '\nServer: alle Tests grün');
  if (fails) { console.log(log); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
