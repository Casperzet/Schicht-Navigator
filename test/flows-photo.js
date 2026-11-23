/* ==========================================================================
   test/flows-photo.js – Foto entlang der Hierarchie (statt Messenger)
   Mitarbeiterin → Schichtleitung → Filialleitung, Eskalation bei Nichtbeachtung,
   Foto im Chat, Referenzfoto von oben nach unten.
   Aufruf: node test/flows-photo.js
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const FILE = 'file://' + path.resolve(__dirname, '../dist/index.html') + '?mode=demo';
let fails = 0, passes = 0;
const ok = (c, t) => { if (c) passes++; else fails++; console.log((c ? 'OK   ' : 'FAIL ') + t); };
// 2×2-PNG als „Kamerafoto“
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII=', 'base64');

(async () => {
  const img = path.join(os.tmpdir(), 'sn-foto-test.png'); fs.writeFileSync(img, PNG);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(FILE);
  await p.waitForFunction(() => document.documentElement.dataset.snReady === '1');
  await p.evaluate(() => SN.clock.set(SN.clock.now()));
  const id = (n) => p.evaluate((x) => (SN.model.staff().find((e) => e.name === x) || {}).id, n);
  const login = (i) => p.evaluate(async (x) => { SN.session.logout(); return (await SN.session.login(x, '1234')).ok; }, i);
  const act = (sel) => p.click(sel).then(() => p.waitForTimeout(160));
  const anna = await id('Anna Müller'), kemal = await id('Kemal Aydın'), sabine = await id('Sabine Krämer'), mustafa = await id('Mustafa');

  // 1. Mitarbeiterin: Empfänger sind die zuständige Schichtleitung und die Filialleitung
  await login(anna);
  const opts = await p.evaluate(() => SN.ops.photoTargetOptions(SN.session.me()).map((o) => ({ key: o.key, names: o.ids.map(SN.model.name) })));
  ok(opts[0].key === 'sl' && opts[0].names.includes('Kemal Aydın') && opts[1].key === 'fl', 'Mitarbeiterin: Standard = zuständige Schichtleitung (' + opts[0].names.join(', ') + '), zweite Wahl Filialleitung');
  ok(await p.isVisible('.sn-tile[data-go=photo]'), 'Start zeigt die Kachel „Foto an Vorgesetzte“');
  await act('.sn-tile[data-go=photo]');
  await p.setInputFiles('#ph-cam', img);
  await p.waitForSelector('#ph-send', { timeout: 5000 });
  await p.waitForTimeout(300);
  await p.fill('#ph-text', 'Regal Waschmittel leer');
  await act('#ph-send');
  const sent = await p.evaluate((a) => SN.comm.sentBy(a, 'photo')[0], anna);
  ok(sent && sent.photos.length === 1 && sent.to.ids.length >= 1 && sent.to.ids.includes(kemal), 'Foto der Mitarbeiterin geht an ihre Schichtleitung');

  // 2. Schichtleitung: Badge, Eingang, Antwort
  await login(kemal);
  ok(await p.evaluate(() => SN.ui.views.photo.badge(SN.session.me())) >= 1, 'Schichtleitung: Badge „Foto“ zeigt das neue Foto');
  await p.evaluate(() => SN.ui.go('photo', {}));
  await p.waitForTimeout(150);
  ok(await p.isVisible('[data-item="' + sent.id + '"]'), 'Schichtleitung sieht das Foto im Reiter „Von Mitarbeitenden“');
  await act('[data-item="' + sent.id + '"] [data-act=ph-reply][data-x="Danke, gut gemacht"]');
  await login(anna);
  await p.evaluate(() => SN.ui.go('home', {}));
  await p.waitForTimeout(150);
  ok((await p.textContent('.sn-main, #view')).includes('Antworten auf deine Fotos'), 'Mitarbeiterin sieht die Antwort auf Start („Antworten auf deine Fotos“)');

  // 3. Nicht gesehen → Eskalation eine Stufe höher
  await login(anna);
  const ph2 = await p.evaluate(async (a) => (await SN.ops.photoReport(a, { cat: 'order', dept: 'Drogerie', photos: ['data:image/png;base64,AA'], to: 'sl' })).item, anna);
  await p.evaluate(async () => { SN.clock.advance(25 * 60000); SN.comm.escalateDue(); await SN.store.settle(); });
  const esc = await p.evaluate((i) => { const it = SN.comm.get(i); return { lvl: it.esc.level, who: SN.comm.currentIds(it).map(SN.model.name) }; }, ph2.id);
  ok(esc.lvl >= 1 && !esc.who.includes('Kemal Aydın'), 'Ohne Reaktion rückt das Foto nach 25 Min eine Stufe höher (' + esc.who.join(', ') + ')');

  // 4. Schichtleitung → Filialleitung (Standard), mit Auswahl
  await login(kemal);
  const o2 = await p.evaluate(() => SN.ops.photoTargetOptions(SN.session.me()).map((o) => o.key));
  ok(o2[0] === 'fl' && o2.includes('admin'), 'Schichtleitung: Standard = Filialleitung, dazu Admin vom Dienst (' + o2.join(', ') + ')');
  const up = await p.evaluate(async (k) => (await SN.ops.photoReport(k, { cat: 'goods', dept: 'Drogerie', photos: ['data:image/png;base64,AA'] })).item, kemal);
  await login(sabine);
  ok(up.to.ids.includes(sabine) && await p.evaluate((i) => SN.ui.views.photo.badge(SN.model.emp(i)), sabine) >= 1, 'Filialleitung bekommt das Foto der Schichtleitung');

  // 5. Foto im Chat
  await login(anna);
  await p.evaluate((k) => SN.chatOpen(SN.comm.threadId.dm(SN.session.id, k)), kemal);
  await p.waitForSelector('#chat-photo', { state: 'attached' });
  await p.waitForTimeout(500);
  await p.setInputFiles('#chat-photo', img);
  await p.waitForFunction((k) => { const t = SN.comm.threadId.dm(SN.session.id, k); return SN.comm.messages(t).some((m) => !!m.photo); }, kemal, { timeout: 8000 }).catch(() => {});
  await p.waitForSelector('.sn-bubble img', { timeout: 5000 }).catch(() => {});
  const chatPhoto = await p.evaluate((k) => { const t = SN.comm.threadId.dm(SN.session.id, k); return SN.comm.messages(t).some((m) => !!m.photo); }, kemal);
  ok(chatPhoto && await p.isVisible('.sn-bubble img'), 'Foto im Chat gesendet und angezeigt');

  // 6. Referenzfoto von oben nach unten (Anweisung mit Foto)
  await login(mustafa);
  const post = await p.evaluate(async (a) => (await SN.comm.post(SN.session.id, { to: { type: 'person', ids: [a] }, title: 'So soll die Aktionsfläche aussehen', needAck: true, photos: ['data:image/png;base64,AA'] })).item, anna);
  await login(anna);
  await p.evaluate(() => SN.ui.go('home', {}));
  await p.waitForTimeout(150);
  ok(await p.isVisible('[data-item="' + post.id + '"] .sn-photos img'), 'Mitarbeiterin sieht das Referenzfoto in der Anweisung von oben');

  ok(errs.length === 0, 'Keine JS-Fehler' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + passes + ' OK, ' + fails + ' FAIL');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
