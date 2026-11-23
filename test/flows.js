/* ==========================================================================
   test/flows.js – End-to-end-Abläufe der Kommunikation (M1–M8, S2)
   Teil A: Demo-Modus, eine Seite, Kontowechsel simuliert mehrere Geräte.
   Teil B: Filialbetrieb mit gemeinsamer db (Mock), ZWEI Seiten live.
   Aufruf: node test/flows.js
   ========================================================================== */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const { installMock, shareDb } = require('./db-mock');
const DIST = 'file://' + path.resolve(__dirname, '../dist/index.html');
let fails = 0, passes = 0;
const ok = (c, t) => { if (c) passes++; else fails++; console.log((c ? 'OK   ' : 'FAIL ') + t); };

async function open(ctx, url, init) {
  const p = await ctx.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (init) await p.addInitScript(installMock, init);
  await p.goto(url);
  await p.waitForFunction(() => document.documentElement.dataset.snReady === '1', null, { timeout: 15000 });
  p.errs = errs;
  return p;
}
const idOf = (p, name) => p.evaluate((n) => (SN.model.staff().find((e) => e.name === n) || {}).id, name);
const login = (p, id) => p.evaluate(async (i) => { SN.session.logout(); return (await SN.session.login(i, '1234')).ok; }, id);
const act = (p, sel) => p.click(sel).then(() => p.waitForTimeout(120));

(async () => {
  const b = await chromium.launch();

  /* ---------------- Teil A: Demo ---------------- */
  const ctx = await b.newContext();
  const p = await open(ctx, DIST + '?mode=demo');
  // Uhr einfrieren (Demo spielt in der Frühschicht); vorgespult wird gezielt
  await p.evaluate(() => SN.clock.set(SN.clock.now()));
  const anna = await idOf(p, 'Anna Müller');
  const mustafa = await idOf(p, 'Mustafa');

  // M4: Melden in 3 Taps → Routing an zuständige Schichtleitung
  ok(await login(p, anna), 'Anna meldet sich an');
  await p.evaluate(() => SN.ui.go('report', {}));
  await act(p, '[data-act=rep-cat][data-k=gap]');
  await act(p, '#rep-send');
  const rep = await p.evaluate((a) => SN.comm.sentBy(a, 'report')[0], anna);
  ok(rep && rep.cat === 'gap' && rep.dept === 'Drogerie', 'Meldung „Lücke“ mit 3 Taps gesendet (Abteilung vorbelegt)');
  const rec = await p.evaluate((id) => SN.comm.recipients(SN.comm.get(id)), rep.id);
  const recRoles = await p.evaluate((ids) => ids.map((i) => SN.model.emp(i).role), rec);
  ok(rec.length > 0 && recRoles.every((r) => r === 'sl'), 'Routing an Schichtleitung der Abteilung (' + recRoles.join(',') + ')');
  const wait0 = await p.evaluate((id) => SN.comm.waitingOn(id), rep.id);
  ok(/Wartet auf/.test(wait0), 'Melder sieht „' + wait0 + '“');

  // M1: Eskalation nach Frist (Lücke = 15 Min)
  await p.evaluate(async () => { SN.clock.advance(16 * 60000); SN.comm.escalateDue(); await SN.store.settle(); });
  const lvl = await p.evaluate((id) => SN.comm.get(id).esc.level, rep.id);
  ok(lvl === 1, 'Nach 16 Min ohne Reaktion eskaliert (Stufe ' + lvl + ')');
  await p.evaluate(async () => { SN.comm.escalateDue(); await SN.store.settle(); });
  ok(await p.evaluate((id) => SN.comm.get(id).esc.level, rep.id) === 1, 'Eskalation idempotent (kein Doppelschritt im selben Takt)');
  const lvl1 = await p.evaluate((id) => SN.comm.currentIds(SN.comm.get(id)), rep.id);
  // Zuständige Stufe übernimmt per Klick
  await login(p, lvl1[0]);
  await p.evaluate(() => SN.ui.go('inbox', {}));
  await act(p, '[data-item="' + rep.id + '"] [data-act=it-take]');
  ok(await p.evaluate((id) => SN.comm.get(id).state, rep.id) === 'taken', 'Eskalierte Meldung per Klick übernommen');
  await login(p, anna);
  const tl = await p.evaluate((id) => SN.comm.timeline(id).map((x) => x.kind), rep.id);
  ok(tl.includes('esc') && tl.includes('taken'), 'Melder sieht Zeitleiste mit Eskalation und Übernahme');

  // M2: Anweisung mit Pflicht-Quittung (UI) → Quittungsleiste
  await login(p, mustafa);
  await p.evaluate(() => SN.ui.go('inbox', {}));
  await act(p, '#fab');
  await p.click('input[name=to-type][value=dept]');
  await p.selectOption('#to-dept', 'Drogerie');
  await p.fill('#po-title', 'Rückruf: Charge L2311 aus Regal 14 nehmen');
  await act(p, '[data-act=send-go]');
  const post = await p.evaluate((m) => SN.comm.sentBy(m, 'post')[0], mustafa);
  ok(post && post.needAck && post.title.startsWith('Rückruf'), 'Anweisung mit Pflicht-Quittung gesendet');
  const s0 = await p.evaluate((id) => SN.comm.ackStats(SN.comm.get(id)), post.id);
  ok(s0.total > 0 && s0.done === 0, 'Quittungsleiste startet bei 0 von ' + s0.total);
  await login(p, anna);
  await p.evaluate(() => SN.ui.go('home', {}));
  ok(await p.isVisible('[data-item="' + post.id + '"] [data-act=it-ack]'), 'Anna sieht „Gelesen und verstanden“ oben auf Start');
  await act(p, '[data-item="' + post.id + '"] [data-act=it-ack]');
  const s1 = await p.evaluate((id) => SN.comm.ackStats(SN.comm.get(id)), post.id);
  ok(s1.done === 1, 'Quittung zählt: ' + s1.done + ' von ' + s1.total);
  await login(p, mustafa);
  const rem = await p.evaluate((id) => SN.comm.remind(id, SN.session.id), post.id);
  ok(rem.ok && rem.count === s1.total - 1, 'Nachfassen erreicht nur die Fehlenden (' + rem.count + ')');

  // M5: Schnellruf Kasse – schließt nach 2 Zusagen
  const call = await p.evaluate(() => SN.comm.call(SN.session.id, 'kasse', { note: 'Kasse 7' }));
  ok(call.ok && call.item.to.ids.length >= 2, 'Kassenruf an ' + (call.item ? call.item.to.ids.length : 0) + ' passende Personen im Dienst');
  const tgt = call.item.to.ids;
  await login(p, tgt[0]);
  const yes = '#banners [data-act=call-yes][data-id="' + call.item.id + '"]';
  ok(await p.isVisible(yes), 'Gerufene Person sieht Banner „Ich komme“');
  await act(p, yes);
  await login(p, tgt[1]);
  await act(p, yes);
  const cst = await p.evaluate((id) => { const it = SN.comm.get(id); return { s: it.state, a: Object.keys(it.answers || {}) }; }, call.item.id);
  ok(cst.s === 'closed', 'Ruf nach 2 Zusagen geschlossen (' + cst.s + ', Antworten: ' + cst.a.length + ')');

  // M7: SOS → Leitung antwortet → Auslöser sieht „Hilfe kommt“
  await login(p, anna);
  const sos = await p.evaluate(() => SN.comm.sos(SN.session.id, 'accident', 'Gang 7'));
  ok(sos.ok, 'SOS ausgelöst');
  const lead = await p.evaluate((id) => SN.comm.recipients(SN.comm.get(id)).find((i) => SN.model.emp(i).role !== 'admin'), sos.item.id);
  await login(p, lead);
  ok(await p.isVisible('#banners .sn-alert--sos [data-act=sos-respond]'), 'Leitung sieht SOS-Banner mit „Hilfe kommt“');
  await act(p, '#banners [data-act=sos-respond]');
  await login(p, anna);
  const banner = await p.textContent('#banners');
  ok(/Hilfe kommt/.test(banner), 'Auslöserin sieht „Hilfe kommt: …“');

  // M6: Chat mit Lesehaken
  await p.evaluate((m) => SN.chatOpen(SN.comm.threadId.dm(SN.session.id, m)), mustafa);
  await p.fill('#chat-in', 'Regal 14 ist leer geräumt.');
  await act(p, '[data-act=chat-send]');
  const tid = await p.evaluate((m) => SN.comm.threadId.dm(SN.session.id, m), mustafa);
  ok(await p.evaluate(([t, m]) => SN.comm.unread(t, m), [tid, mustafa]) === 1, 'Nachricht bei Mustafa ungelesen');
  await login(p, mustafa);
  ok(await p.isVisible('#banners [data-act=chat-open]'), 'Mustafa sieht Banner „Neue Nachricht“');
  await act(p, '#banners [data-act=chat-open]');
  const last = await p.evaluate((t) => SN.comm.receipt(t, SN.comm.messages(t).slice(-1)[0]), tid);
  ok(last === 'read', 'Absenderin sieht ✓✓ gelesen');

  // S2: Ausfall → Schichtleitung + Einspringer-Anfrage
  await login(p, anna);
  await p.evaluate(() => SN.ui.go('me', {}));
  await act(p, '[data-act=abs][data-t=sick]');
  await act(p, '[data-act=abs-go]');
  const abs = await p.evaluate((a) => SN.comm.sentBy(a, 'absence')[0], anna);
  ok(abs && abs.standinCall, 'Krankmeldung an Schichtleitung + „Wer kann einspringen?“ gestartet');

  // S4: Restware erfasst jede/r über „Melden“ → Auftrag „einräumen“
  await login(p, anna);
  await p.evaluate(() => SN.ui.go('report', {}));
  await act(p, '[data-act=rest-new]');
  await p.fill('#rs-name', 'Duschgel, 2 Kartons');
  await p.fill('#rs-place', 'Lager Gang C');
  await act(p, '[data-act=rest-go]');
  ok(await p.evaluate(() => SN.store.list('items').some((i) => i.kind === 'task' && /Restware einräumen: Duschgel/.test(i.title))), 'Restware von Mitarbeiterin erfasst → Auftrag „einräumen“');

  // S3: Lieferung → Tour mit Etikett-Scan je Einheit, Format- und Doppelprüfung
  const tour = await p.evaluate(async () => {
    const units = [{ type: 'kkp', depts: ['Drogerie', 'MoPro', 'Konserven', 'Getränkeabteilung'] }, { type: 'pal', depts: ['Getränkeabteilung'] }, { type: 'box', depts: ['Drogerie'] }];
    const r = await SN.ops.createDelivery(SN.session.id, 'Test-LKW', units);
    const t = SN.store.list('items').find((i) => i.truckId === r.truckId);
    await SN.store.patch('items', t.id, { owner: SN.session.id, to: { type: 'person', ids: [SN.session.id] }, state: 'taken' });
    return { id: t.id, truck: r.truckId, n: t.units.length, tours: r.tasks };
  });
  ok(tour.n === 3 && tour.tours === 1, 'Lieferung: 1 Tour mit 3 Einheiten (KKP mit 4 Abteilungen, Palette, Box)');
  await p.evaluate(() => SN.ui.go('tasks', {}));
  ok(await p.isVisible('[data-item="' + tour.id + '"] [data-act=scan-open]'), 'Tour zeigt „Etikett scannen (0/3)“ statt „Erledigt“');
  const bad = await p.evaluate((id) => SN.ops.scanUnit(id, SN.session.id, 'abc'), tour.id);
  ok(!bad.ok && /ungültig/.test(bad.reason), 'Falsches Format abgelehnt: ' + bad.reason);
  const sc1 = await p.evaluate((id) => SN.ops.scanUnit(id, SN.session.id, 'KL123456789'), tour.id);
  const dup = await p.evaluate((id) => SN.ops.scanUnit(id, SN.session.id, 'kl123456789'), tour.id);
  ok(sc1.ok && !dup.ok && /schon gescannt/.test(dup.reason), 'Doppeltes Etikett abgelehnt (auch klein geschrieben)');
  await p.evaluate((id) => SN.ops.scanUnit(id, SN.session.id, 'KL123456790'), tour.id);
  const sc3 = await p.evaluate((id) => SN.ops.scanUnit(id, SN.session.id, 'KL123456791'), tour.id);
  const tr = await p.evaluate((t) => SN.store.peek('trucks', t).state, tour.truck);
  ok(sc3.ok && sc3.tourDone && sc3.truckDone && tr === 'done', 'Letzter Scan: Tour erledigt, Lieferung fertig, Bericht ans System');

  // S5: Dienstplan-Scan – tolerante Zuordnung, nur Bestätigtes übernehmen
  await login(p, mustafa);
  const ro = await p.evaluate(() => SN.ops.rosterPreview([
    { name: 'MÜLLER, Anna', days: [{ d: 'Mo', off: false, s: '07:00', e: '15:00', p: 30 }] },
    { name: 'Xaver Unbekannt', days: [] },
  ]).map((r) => ({ state: r.state, id: r.id || null })));
  ok(ro[0].state === 'found' && ro[0].id === anna && ro[1].state === 'missing', 'Dienstplan: „MÜLLER, Anna“ erkannt, Unbekannter markiert');
  await p.evaluate(() => SN.rosterTest([{ name: 'Müller, Anna', days: [{ d: 'Mo', off: false, s: '07:00', e: '15:00', p: 30 }] }, { name: 'Xaver Unbekannt', days: [] }]));
  await act(p, '[data-act=roster-apply]');
  const plan = await p.evaluate((a) => SN.store.peek('plans', a), anna);
  ok(plan && plan.days[0].s === '07:00' && plan.source === 'dienstplan', 'Nur bestätigte Zeile übernommen (Annas Plan Mo 07:00–15:00)');

  // M9: Verteilung nie über das Limit
  const over = await p.evaluate(async () => {
    const me = SN.session.id;
    for (let i = 0; i < 40; i++) await SN.comm.task(me, { title: 'Test ' + i, dept: 'Drogerie', act: 'Warenverräumung' });
    await SN.dist.run(me);
    return SN.model.staff().filter((e) => SN.dist.loadOf(e.id) > SN.dist.limitOf(e) && SN.dist.limitOf(e) > 0).map((e) => e.name);
  });
  ok(over.length === 0, 'Nach 40 Aufträgen niemand über dem Limit');
  ok(p.errs.length === 0, 'Teil A ohne JS-Fehler' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await ctx.close();

  /* ---------------- Teil B: Filialbetrieb, zwei Geräte live ---------------- */
  const ctx2 = await b.newContext();
  const bus = await shareDb(ctx2);
  const A = await open(ctx2, DIST + '?mode=db', { shared: true, user: { id: 'u_admin', isOwner: true, canEdit: true } });
  ok(await A.isVisible('[data-act=setup]'), 'Leere db: Einrichtungsassistent erscheint');
  await A.fill('#su-n', 'Mustafa Test'); await A.fill('#su-p', '4711');
  await act(A, '[data-act=setup]');
  ok(await A.evaluate(() => !!SN.session.me()), 'Erstes Admin-Konto angelegt und angemeldet');
  const annaId = await A.evaluate(async () => {
    const id = 'e-anna'; await SN.store.put('staff', id, { id, name: 'Anna Test', role: 'emp', dept: 'Drogerie', sh: 'Früh', h: 8, lang: 'tr', acts: ['Warenverräumung'], pin: '1111' });
    return id;
  });
  const B = await open(ctx2, DIST + '?mode=db', { shared: true, user: { id: 'u_anna' } });
  await B.waitForFunction(() => SN.model.staff().length >= 2, null, { timeout: 5000 });
  ok(await B.evaluate(async (i) => (await SN.session.login(i, '1111')).ok, annaId), 'Zweites Gerät: Anna meldet sich an (eigene PIN)');
  await A.evaluate((i) => SN.comm.post(SN.session.id, { to: { type: 'person', ids: [i] }, title: 'Bitte Kasse 4 öffnen', needAck: true, u: true }), annaId);
  await B.waitForSelector('[data-act=it-ack]', { timeout: 5000 }).catch(() => {});
  ok(await B.isVisible('[data-act=it-ack]'), 'Anweisung erscheint LIVE auf Annas Gerät');
  await act(B, '[data-act=it-ack]');
  await A.waitForFunction(() => { const it = SN.comm.sentBy(SN.session.id, 'post')[0]; return it && SN.comm.ackStats(it).done === 1; }, null, { timeout: 5000 }).catch(() => {});
  ok(await A.evaluate(() => SN.comm.ackStats(SN.comm.sentBy(SN.session.id, 'post')[0]).done) === 1, 'Quittung erscheint LIVE beim Admin');
  ok(bus.docs.size > 0 && Array.from(bus.docs.keys()).some((k) => k.includes('items/')), 'Daten liegen in der gemeinsamen db (' + bus.docs.size + ' Dokumente, z. B. ' + Array.from(bus.docs.keys()).slice(0, 2).join(', ') + ')');
  ok(A.errs.length + B.errs.length === 0, 'Teil B ohne JS-Fehler' + (A.errs.concat(B.errs).length ? ': ' + A.errs.concat(B.errs).join(' | ') : ''));
  await b.close();
  console.log('\n' + passes + ' OK, ' + fails + ' FAIL');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
