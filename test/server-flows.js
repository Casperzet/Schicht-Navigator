/* ==========================================================================
   test/server-flows.js – zwei Geräte über den echten Server (SSE + REST)
   Voraussetzung: Server läuft, z. B.
     PORT=8090 FILIAL_KEY=langenfeld-test DATA_DIR=/tmp/sn-data node server/server.js
   Aufruf: SN_SERVER=http://localhost:8090 SN_KEY=langenfeld-test node test/server-flows.js
   ========================================================================== */
'use strict';
const path = require('path');
const zlib = require('zlib');
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = process.env.SN_SERVER || 'http://localhost:8090';
const KEY = process.env.SN_KEY || 'langenfeld-test';
let fails = 0, passes = 0;
const ok = (c, t) => { if (c) passes++; else fails++; console.log((c ? 'OK   ' : 'FAIL ') + t); };

// kleines PNG als „Kamerafoto“
function png(file) {
  const w = 64, h = 48, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = 20; raw[o + 2] = y * 5; }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

async function device(b, label) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(label + ': ' + e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(BASE + '/?server=' + encodeURIComponent(BASE) + '&key=' + encodeURIComponent(KEY));
  await p.waitForFunction(() => document.documentElement.dataset.snReady === '1', null, { timeout: 15000 });
  return p;
}
const act = (p, sel) => p.click(sel).then(() => p.waitForTimeout(150));

(async () => {
  const health = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  ok(health && health.ok && health.keyRequired, 'Server erreichbar, Schlüssel verlangt');
  const denied = await fetch(BASE + '/api/snapshot').then((r) => r.status);
  ok(denied === 401, 'Ohne Filial-Schlüssel kein Zugriff (401)');

  const b = await chromium.launch();
  const A = await device(b, 'Filialleitung');
  ok(await A.evaluate(() => SN.store.mode) === 'server', 'Gerät A im Server-Modus');
  if (await A.isVisible('[data-act=setup]')) {
    await A.fill('#su-n', 'Sabine Test'); await A.selectOption('#su-r', 'fl'); await A.fill('#su-p', '4711');
    await act(A, '[data-act=setup]');
  } else {
    const id = await A.evaluate(() => SN.model.staff().find((e) => e.role === 'fl').id);
    await A.evaluate(async (i) => SN.session.login(i, '4711'), id);
  }
  ok(await A.evaluate(() => !!SN.session.me()), 'Filialleitung angemeldet');
  // Team anlegen: Schichtleitung + 6 Mitarbeitende (Früh, Plan für jeden Tag)
  await A.evaluate(async () => {
    const put = (id, o) => SN.store.put('staff', id, Object.assign({ id, sh: 'Früh', h: 8, lang: 'de', acts: ['Warenverräumung'] }, o));
    await put('e-sl', { name: 'Julia Test', role: 'sl', dept: 'Obst und Gemüse', scope: ['Obst und Gemüse', 'MoPro'], pin: '1111' });
    const depts = ['Drogerie', 'MoPro', 'Konserven', 'Getränkeabteilung', 'Trocken sortiment', 'Obst und Gemüse'];
    for (let i = 0; i < 6; i++) await put('e-m' + i, { name: 'Mitarbeiter ' + (i + 1) + ' Test', role: 'emp', dept: depts[i], pin: '2222' });
  });
  const B = await device(b, 'Schichtleitung');
  await B.waitForFunction(() => SN.model.staff().length >= 8, null, { timeout: 8000 }).catch(() => {});
  ok(await B.evaluate(() => SN.model.staff().length) >= 8, 'Gerät B sieht das Team live vom Server');
  ok(await B.evaluate(async () => (await SN.session.login('e-sl', '1111')).ok), 'Schichtleitung meldet sich auf Gerät B an');

  // Fotobericht mit echtem Upload
  const img = path.join(require('os').tmpdir(), 'sn-test.png'); png(img);
  await B.evaluate(() => SN.ui.go('photo', {}));
  await B.setInputFiles('#ph-cam', img);
  await B.waitForSelector('[data-act=ph-send]', { timeout: 5000 });
  await B.waitForTimeout(600);
  await B.click('[data-act=ph-cat][data-k=goods]');
  await B.fill('#ph-text', '3 KKP gemischt an der Rampe');
  await act(B, '[data-act=ph-send]');
  await B.waitForTimeout(400);
  const rep = await B.evaluate(() => SN.comm.sentBy(SN.session.id, 'photo')[0]);
  ok(rep && rep.photos && /^http.*\/media\//.test(rep.photos[0]), 'Foto liegt als Datei auf dem Server (' + (rep && rep.photos ? rep.photos[0].split('/media/')[1].slice(0, 12) + '…' : '-') + ')');
  const imgStatus = await fetch(rep.photos[0]).then((r) => r.status);
  ok(imgStatus === 200, 'Foto ist abrufbar (mit Schlüssel)');
  await A.waitForFunction((id) => !!SN.comm.get(id), rep.id, { timeout: 5000 }).catch(() => {});
  await A.evaluate(() => SN.ui.go('photo', {}));
  await A.waitForTimeout(200);
  ok(await A.isVisible('[data-item="' + rep.id + '"]'), 'Filialleitung sieht den Fotobericht LIVE (ohne Neuladen)');
  ok(await A.evaluate(() => SN.ui.views.photo.badge(SN.session.me())) >= 1, 'Badge „Foto“ zeigt Ungesehenes');
  await act(A, '[data-item="' + rep.id + '"] [data-act=ph-reply][data-x="Danke, gut gemacht"]');
  await B.waitForFunction((id) => (SN.comm.get(id).thread || []).length > 0, rep.id, { timeout: 5000 }).catch(() => {});
  const seen = await B.evaluate((id) => { const it = SN.comm.get(id); return { seen: Object.keys(it.seen || {}).length, reply: (it.thread || [])[0] && it.thread[0].text }; }, rep.id);
  ok(seen.seen > 0 && seen.reply === 'Danke, gut gemacht', 'Schichtleitung sieht „gesehen“ und die Antwort LIVE');

  // Lieferung: KKP mit gemischten Abteilungen → Touren
  const plan = await B.evaluate(() => SN.ops.planDelivery([{ type: 'kkp', depts: ['Drogerie', 'MoPro', 'Konserven', 'Getränkeabteilung', 'Trocken sortiment'] }, { type: 'kkp', depts: ['Drogerie', 'MoPro', 'Obst und Gemüse', 'Konserven'] }, { type: 'pal', depts: ['Getränkeabteilung'] }, { type: 'box', depts: ['Drogerie'] }, { type: 'box', depts: ['MoPro'] }], undefined, { available: 6 }));
  ok(plan.min === (4 + 3 * 5) + (4 + 3 * 4) + 8 + 2 + 2, 'Aufwand: KKP mit 5 Abt. = 19 Min, mit 4 Abt. = 16 Min, Palette 8, Box 2 → ' + plan.min + ' Min');
  ok(plan.people === 1, 'Personen nach Zielzeit 60 Min: ' + plan.people);
  ok(plan.rounds[0].depts[0] === 'Trocken sortiment' || plan.rounds[0].depts.length >= 5, 'Tour mit Laufweg in Filial-Reihenfolge: ' + plan.rounds[0].depts.join(' → '));
  const big = await B.evaluate(() => SN.ops.planDelivery(SN.ops.unitsFromCounts({ kkp: 12, pal: 6, box: 10, avg: 5 }), undefined, { available: 6 }));
  ok(big.people === Math.min(6, Math.ceil(big.min / 60)), '12 KKP · 6 Paletten · 10 Boxen = ' + big.min + ' Min → ' + big.people + ' Personen (max. 6 frei)');

  // Wochenplan: Prognose + Verteilung, nie über Limit
  const wk = await A.evaluate(async () => {
    const d = SN.ops.week().find((x) => x.wd === 2);
    await SN.ops.setForecast(d.key, { kkp: 10, pal: 4, box: 8, avg: 5 });
    const r = await SN.ops.distributeDay(SN.session.id, d);
    const L = SN.ops.dayLoad(d);
    const over = L.staff.filter((e) => SN.store.list('items').filter((it) => it.plannedFor === d.key && it.owner === e.id).reduce((s, it) => s + it.min, 0) > SN.dist.limitOf(e));
    return { made: r.made, need: L.need, planned: L.planned, over: over.length };
  });
  ok(wk.made > 0 && wk.over === 0, 'Wochenplan Mi: ' + wk.made + ' Aufgaben verteilt (' + wk.planned + ' von ' + wk.need + ' Min), niemand über Limit');
  await B.evaluate(() => SN.ui.go('week', {}));
  ok(await B.isVisible('.sn-week-strip'), 'Wochenplan auf Gerät B sichtbar');

  // Offline-Warteschlange
  await B.context().setOffline(true);
  await B.evaluate(() => SN.comm.report(SN.session.id, { cat: 'gap', body: 'offline gemeldet' }));
  await B.waitForTimeout(300);
  const pend = await B.evaluate(() => SN.store.pending);
  ok(pend >= 1, 'Ohne Netz: Meldung wartet in der Warteschlange (' + pend + ')');
  await B.context().setOffline(false);
  await B.evaluate(() => window.dispatchEvent(new Event('online')));
  await B.waitForFunction(() => SN.store.pending === 0, null, { timeout: 8000 }).catch(() => {});
  ok(await B.evaluate(() => SN.store.pending) === 0, 'Wieder online: Warteschlange übertragen');
  await A.waitForFunction(() => SN.store.list('items').some((i) => i.body === 'offline gemeldet'), null, { timeout: 8000 }).catch(() => {});
  ok(await A.evaluate(() => SN.store.list('items').some((i) => i.body === 'offline gemeldet')), 'Offline-Meldung kommt bei der Leitung an');

  ok(A.errs.length + B.errs.length === 0, 'Keine JS-Fehler' + (A.errs.concat(B.errs).length ? ': ' + A.errs.concat(B.errs).join(' | ') : ''));
  await b.close();
  console.log('\n' + passes + ' OK, ' + fails + ' FAIL');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
