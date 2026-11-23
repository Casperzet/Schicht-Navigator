#!/usr/bin/env node
/* ==========================================================================
   test/core.test.js – Kernlogik ohne Browser
   --------------------------------------------------------------------------
   Lädt die Kernmodule (Liste CORE aus build.js) in einen vm-Kontext und
   prüft comm, dist, model und store mit vorgespulter Uhr.
   Aufruf: node test/core.test.js   (Exit-Code 1 bei Fehlern)
   ========================================================================== */
'use strict';
process.env.TZ = 'Europe/Berlin';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { CORE } = require('../build.js');

const ROOT = path.join(__dirname, '..');
const MIN = 60000;
// Montag, 23.11.2026, 10:00 Uhr (Frühschicht)
const T = new Date(2026, 10, 23, 10, 0, 0).getTime();

/** Frischer Kontext mit allen Kernmodulen */
function load() {
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URLSearchParams, atob, Blob };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.SN;
}
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm-Objekte → normale Objekte

/* ---------- Mini-Testrahmen ------------------------------------------- */
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/** Frische Demo-Umgebung zur Zeit T */
async function fresh() {
  const SN = load();
  SN.clock.set(T);
  await SN.store.init('demo');
  const id = (name) => { const e = SN.store.list('staff').find((x) => x.name === name); assert.ok(e, 'Person fehlt: ' + name); return e.id; };
  return { SN, id, at: (min) => SN.clock.set(T + min * MIN) };
}

/* ======================================================================== */
test('Demo-Datensatz: 70 Mitarbeitende + 5 Admins + Reinigung, keine Dubletten', async () => {
  const { SN } = await fresh();
  const staff = SN.store.list('staff');
  assert.strictEqual(staff.length, 76);
  const core = staff.filter((e) => e.role !== 'admin' && e.role !== 'clean');
  assert.strictEqual(core.length, 70);
  assert.strictEqual(new Set(staff.map((e) => e.name)).size, staff.length, 'Namen doppelt');
  assert.strictEqual(new Set(staff.map((e) => e.id)).size, staff.length, 'IDs doppelt');
  assert.deepStrictEqual(plain(staff.filter((e) => e.role === 'admin').map((e) => e.name)), ['Mustafa', 'Niels', 'Chiki', 'Marino', 'Arek']);
  assert.deepStrictEqual(plain(staff.filter((e) => e.role === 'clean').map((e) => e.name)), ['Ivana Horvat']);
  for (const sh of ['Früh', 'Spät']) assert.strictEqual(staff.filter((e) => e.role === 'sl' && e.sh === sh).length, 3, 'SL je Schicht');
  assert.strictEqual(staff.filter((e) => e.role === 'tl').length, 5);
  assert.strictEqual(staff.filter((e) => e.role === 'fl').length, 1);
  assert.strictEqual(staff.filter((e) => e.role === 'sfl').length, 1);
  assert.deepStrictEqual(plain(staff.filter((e) => SN.model.canAiAssist(e)).map((e) => e.name)), ['Mustafa']);
  for (const d of SN.model.DEPTS) assert.ok(staff.some((e) => e.dept === d), 'Abteilung leer: ' + d);
  const kinds = new Set(SN.store.list('items').map((i) => i.kind));
  for (const k of Object.keys(SN.model.KINDS)) assert.ok(kinds.has(k), 'Demo ohne Vorgangsart ' + k);
  assert.ok(SN.store.list('chats').length >= 4 && SN.store.list('templates').length >= 3);
});

test('model.responsibleFor: konkrete Personen je Kategorie, Abteilung, Schicht', async () => {
  const { SN, id } = await fresh();
  const r = (c, d, s) => plain(SN.model.responsibleFor(c, d, s));
  assert.deepStrictEqual(r('gap', 'Drogerie', 'Früh'), [id('Kemal Aydın')]);
  assert.deepStrictEqual(r('gap', 'Drogerie', 'Spät'), [id('Elena Popescu')]);
  assert.deepStrictEqual(r('clean', 'MoPro', 'Früh'), [id('Ivana Horvat')]);
  assert.deepStrictEqual(r('defect', 'Kasse', 'Früh'), [id('Mustafa')], 'Admin vom Dienst');
  assert.deepStrictEqual(r('price', 'Obst und Gemüse', 'Früh'), [id('Katarina Novak')]);
  assert.deepStrictEqual(r('bottle', 'Drogerie', 'Früh'), [id('Natalia Wójcik')], 'Leergut fest');
  assert.deepStrictEqual(r('delivery', 'MoPro', 'Spät'), [id('Daniel Schröder')], 'Wareneinnahme fest');
  assert.deepStrictEqual(r('absence', 'Kasse', 'Spät'), [id('Daniel Schröder')]);
  assert.deepStrictEqual(r('other', 'MoPro', 'Früh'), [id('Julia Becker')]);
  assert.deepStrictEqual(r('safety', 'Lager', 'Früh'), [id('Natalia Wójcik')]);
  // Admin vom Dienst umschalten (K3)
  await SN.store.patch('settings', 'main', { adminOnDuty: id('Niels') });
  assert.deepStrictEqual(r('defect', 'Kasse', 'Früh'), [id('Niels')]);
});

test('model.escalationChain: Stufen in der richtigen Reihenfolge', async () => {
  const { SN, id } = await fresh();
  const anna = id('Anna Müller');
  const gap = (await SN.comm.report(anna, { cat: 'gap', body: 'Zahnpasta leer' })).item;
  const ch = plain(SN.model.escalationChain(gap));
  assert.deepStrictEqual(ch.map((s) => s.key), ['to', 'tl', 'admin', 'fl']);
  assert.deepStrictEqual(ch[0].ids, [id('Kemal Aydın')]);
  assert.deepStrictEqual(ch[1].ids, [id('Dirk Hoffmann')]);
  assert.deepStrictEqual(ch[2].ids, [id('Mustafa')]);
  assert.deepStrictEqual(ch[3].ids.sort(), [id('Sabine Krämer'), id('Thomas Weber')].sort());
  const defect = (await SN.comm.report(anna, { cat: 'defect', dept: 'Kasse', body: 'Kasse 3' })).item;
  assert.deepStrictEqual(plain(SN.model.escalationChain(defect)).map((s) => s.key), ['to', 'fl']);
  const clean = (await SN.comm.report(anna, { cat: 'clean', dept: 'MoPro' })).item;
  const cc = plain(SN.model.escalationChain(clean));
  assert.deepStrictEqual(cc.map((s) => s.key), ['to', 'sl', 'tl', 'admin', 'fl']);
  assert.deepStrictEqual(cc[1].ids, [id('Julia Becker')]);
});

test('Eskalation mit vorgespulter Uhr: Stufen, Idempotenz, Obergrenze', async () => {
  const { SN, id, at } = await fresh();
  const anna = id('Anna Müller');
  const it = (await SN.comm.report(anna, { cat: 'gap', body: 'Lücke Shampoo' })).item;
  assert.strictEqual(it.ackDue, T + 15 * MIN, 'Frist Lücke 15 Min');
  assert.ok(!SN.comm.escalateDue(T).includes(it.id));
  assert.match(SN.comm.waitingOn(it.id, T + 4 * MIN), /^Wartet auf Kemal Aydın seit 4 Min$/);

  at(15);
  assert.ok(SN.comm.escalateDue().includes(it.id), 'nach 15 Min eskaliert');
  let cur = SN.comm.get(it.id);
  assert.strictEqual(cur.esc.level, 1);
  assert.strictEqual(cur.esc.history.length, 2);
  assert.strictEqual(cur.esc.history[1].at, T + 15 * MIN, 'Zeitpunkt = Frist, nicht „jetzt“');
  assert.deepStrictEqual(plain(cur.esc.history[1].ids), [id('Dirk Hoffmann')]);
  assert.match(SN.comm.waitingOn(it.id), /Wartet auf Teamleitung \(Dirk\) seit 0 Min/);

  // idempotent: zweiter Lauf (z. B. anderes Gerät) ändert nichts
  assert.ok(!SN.comm.escalateDue().includes(it.id));
  assert.strictEqual(SN.comm.get(it.id).esc.history.length, 2);

  // App war zu: mehrere Stufen auf einmal nachholen
  at(46);
  SN.comm.escalateDue();
  cur = SN.comm.get(it.id);
  assert.strictEqual(cur.esc.level, 3);
  assert.deepStrictEqual(plain(cur.esc.history.map((h) => h.at)), [T, T + 15 * MIN, T + 30 * MIN, T + 45 * MIN]);
  assert.deepStrictEqual(plain(cur.esc.history.map((h) => h.key || 'to')), ['to', 'tl', 'admin', 'fl']);
  assert.match(SN.comm.waitingOn(it.id), /Filialleitung/);
  // nie über die letzte Stufe hinaus
  at(500);
  assert.ok(!SN.comm.escalateDue().includes(it.id));
  assert.strictEqual(SN.comm.get(it.id).esc.level, 3);
  // Ein- und Ausgang: die Filialleitung sieht den Vorgang jetzt im Eingang
  assert.ok(SN.comm.inbox(id('Sabine Krämer')).some((x) => x.id === it.id));
});

test('Eskalation: 🔥 nach 3 Min, übernommen stoppt, Weitergeben startet neu', async () => {
  const { SN, id, at } = await fresh();
  const anna = id('Anna Müller'), kemal = id('Kemal Aydın'), dirk = id('Dirk Hoffmann');
  const hot = (await SN.comm.report(anna, { cat: 'gap', u: true })).item;
  assert.strictEqual(hot.ackDue, T + 3 * MIN);
  const calm = (await SN.comm.report(anna, { cat: 'gap' })).item;
  at(1);
  await SN.comm.take(calm.id, kemal);
  assert.strictEqual((await SN.comm.take(calm.id, id('Julia Becker'))).ok, false, 'schon übernommen');
  at(3);
  const esc3 = plain(SN.comm.escalateDue());
  assert.ok(esc3.includes(hot.id) && !esc3.includes(calm.id));
  at(60);
  SN.comm.escalateDue();
  assert.strictEqual(SN.comm.get(calm.id).esc.level, 0, 'übernommen → keine Eskalation');
  assert.match(SN.comm.waitingOn(calm.id), /In Arbeit bei Kemal/);

  // Weitergeben an Teamleitung: Kette startet dort, nächste Stufe Admin
  const fw = (await SN.comm.report(anna, { cat: 'gap' })).item;
  await SN.comm.forward(fw.id, kemal, [dirk], 'Bitte du');
  let cur = SN.comm.get(fw.id);
  assert.strictEqual(cur.state, 'sent');
  assert.strictEqual(cur.esc.level, 0);
  assert.ok(cur.esc.history[cur.esc.history.length - 1].fwd);
  at(75);
  SN.comm.escalateDue();
  cur = SN.comm.get(fw.id);
  assert.strictEqual(cur.esc.level, 1);
  assert.deepStrictEqual(plain(cur.esc.history[cur.esc.history.length - 1].ids), [id('Mustafa')]);
  assert.ok(SN.comm.timeline(fw.id).some((x) => /Weitergegeben an Dirk/.test(x.text)));
});

test('Routing je Kategorie (M4) über comm.report', async () => {
  const { SN, id } = await fresh();
  const anna = id('Anna Müller');
  const exp = {
    gap: 'Kemal Aydın', price: 'Dirk Hoffmann', clean: 'Ivana Horvat', defect: 'Mustafa', bottle: 'Natalia Wójcik',
    absence: 'Kemal Aydın', delivery: 'Natalia Wójcik', safety: 'Kemal Aydın', other: 'Kemal Aydın',
  };
  for (const c of SN.model.REPORT_CATS) {
    const r = await SN.comm.report(anna, { cat: c.key, body: 'Test ' + c.label });
    assert.ok(r.ok, c.key);
    assert.deepStrictEqual(plain(r.item.to.ids), [id(exp[c.key])], 'Routing ' + c.key);
    assert.strictEqual(r.item.title, c.label);
    assert.strictEqual(r.item.dept, c.dept || 'Drogerie', 'Abteilung vorbelegt ' + c.key);
  }
  // Fristen je Kategorie
  const d = (cat, u) => SN.model.deadlineMin({ kind: 'report', cat, u });
  assert.deepStrictEqual([d('gap'), d('price'), d('clean'), d('defect'), d('safety'), d('absence'), d('other'), d('other', true)], [15, 15, 15, 5, 5, 5, 20, 3]);
  // Original bleibt, Übersetzung im Text
  const tr = (await SN.comm.report(anna, { cat: 'price', body: 'Preis falsch', orig: 'Fiyat yanlış', lang: 'tr' })).item;
  assert.strictEqual(tr.orig, 'Fiyat yanlış');
  assert.strictEqual(tr.lang, 'tr');
});

test('Quittungszähler, Nachfassen, Hinweis an die Schichtleitung der Offenen (M2)', async () => {
  const { SN, id, at } = await fresh();
  const kemal = id('Kemal Aydın');
  const names = ['Anna Müller', 'Lukas Schmidt', 'Mia Wagner', 'Jonas Fischer'];
  const p = (await SN.comm.post(kemal, { to: { type: 'dept', ids: ['Drogerie'] }, title: 'Neue Aktion', needAck: true })).item;
  assert.strictEqual(p.ackDue, T + 30 * MIN);
  assert.deepStrictEqual(plain(SN.comm.recipients(p)).sort(), names.map(id).sort(), 'Sender nicht in Empfängern');
  // gleichzeitige Quittungen zweier Geräte
  await Promise.all([SN.comm.ack(p.id, id('Anna Müller')), SN.comm.ack(p.id, id('Mia Wagner'))]);
  let s = SN.comm.ackStats(SN.comm.get(p.id));
  assert.strictEqual(s.done, 2); assert.strictEqual(s.total, 4);
  assert.deepStrictEqual(plain(s.open).sort(), [id('Lukas Schmidt'), id('Jonas Fischer')].sort());
  assert.strictEqual(SN.comm.waitingOn(p.id), 'Wartet auf 2 Quittungen (2 von 4)');
  assert.strictEqual((await SN.comm.ack(p.id, id('Anna Müller'))).unchanged, true, 'doppelt quittieren schreibt nicht');
  const rem = await SN.comm.remind(p.id, kemal);
  assert.strictEqual(rem.count, 2);
  assert.strictEqual(SN.comm.get(p.id).remind.n, 1);
  assert.ok(SN.comm.toAck(id('Lukas Schmidt')).some((x) => x.id === p.id));
  assert.ok(!SN.comm.toAck(id('Anna Müller')).some((x) => x.id === p.id));
  // Frist abgelaufen → Schichtleitung der Offenen (Lukas und Jonas sind Spätschicht)
  at(31);
  assert.ok(SN.comm.escalateDue().includes(p.id));
  const h = SN.comm.get(p.id).esc.history;
  assert.strictEqual(h[1].key, 'slOpen');
  assert.deepStrictEqual(plain(h[1].ids), [id('Elena Popescu')]);
  assert.ok(SN.comm.hotspots().some((x) => x.type === 'post' && x.item.id === p.id), 'Brennpunkt');
  // alle quittiert → erfüllt
  await SN.comm.ack(p.id, id('Lukas Schmidt')); await SN.comm.ack(p.id, id('Jonas Fischer'));
  assert.strictEqual(SN.comm.waitingOn(p.id), 'Alle haben quittiert');
  assert.ok(SN.comm.satisfied(SN.comm.get(p.id)));
  // 🔥 Anweisung: Standardfrist 10 Min
  const hp = (await SN.comm.post(kemal, { to: { type: 'person', ids: [id('Anna Müller')] }, title: 'Sofort', needAck: true, u: true })).item;
  assert.strictEqual(hp.ackDue, T + 31 * MIN + 10 * MIN);
});

test('Schnellruf (M5): Pause ausgenommen, schließt nach Zusagen, eskaliert ohne Zusage', async () => {
  const { SN, id, at } = await fresh();
  const anna = id('Anna Müller'), natalia = id('Natalia Wójcik');
  await SN.dist.startPause(id('Lena Meyer'));
  const targets = plain(SN.comm.callTargets('kasse', natalia));
  assert.ok(targets.length >= 3, 'genug Kassenkräfte');
  assert.ok(!targets.includes(id('Lena Meyer')), 'in Pause → kein Ruf');
  assert.ok(!targets.includes(id('Felix Hartmann')), 'Spätschicht → kein Ruf');
  for (const t of targets) assert.ok(SN.model.level(SN.model.emp(t)) <= 2);
  const c = (await SN.comm.call(natalia, 'kasse', { note: 'Schlange' })).item;
  assert.strictEqual(c.need, 2);
  let r = await SN.comm.answerCall(c.id, targets[0], true);
  assert.strictEqual(r.closed, false);
  assert.strictEqual(SN.comm.waitingOn(c.id), 'Wartet auf Zusagen (1 von 2)');
  r = await SN.comm.answerCall(c.id, targets[1], false);
  assert.strictEqual(r.closed, false);
  r = await SN.comm.answerCall(c.id, targets[2], true);
  assert.strictEqual(r.closed, true);
  assert.strictEqual(SN.comm.get(c.id).state, 'closed');
  assert.deepStrictEqual(plain(SN.comm.callStatus(SN.comm.get(c.id)).yes).sort(), [targets[0], targets[2]].sort(), 'Rufer sieht Namen');
  assert.strictEqual((await SN.comm.answerCall(c.id, targets[3] || targets[1], true)).ok, false, 'nach Schluss');

  // keine Zusage nach 2 Min → Schichtleitung der Kasse, dann Admin
  const c2 = (await SN.comm.call(anna, 'kasse')).item;
  at(2);
  assert.ok(SN.comm.escalateDue().includes(c2.id));
  let cur = SN.comm.get(c2.id);
  assert.strictEqual(cur.esc.history[1].key, 'sl');
  assert.deepStrictEqual(plain(cur.esc.history[1].ids), [natalia]);
  at(4);
  SN.comm.escalateDue();
  assert.strictEqual(SN.comm.get(c2.id).esc.history[2].key, 'admin');

  // Zusagen von zwei Geräten gleichzeitig (direkt geschrieben) → Takt schließt den Ruf
  const c3 = (await SN.comm.call(natalia, 'info')).item;
  assert.strictEqual(c3.need, 1);
  await SN.store.patch('items', c3.id, { answers: { [targets[0]]: { a: 'yes', at: T } } });
  assert.ok(SN.comm.escalateDue().includes(c3.id));
  assert.strictEqual(SN.comm.get(c3.id).state, 'closed');
  // „Alle zur Besprechung“ eskaliert nie
  const m = (await SN.comm.call(natalia, 'meeting')).item;
  at(30);
  assert.ok(!SN.comm.escalateDue().includes(m.id));
  // Nachfassen bei Rufen erinnert alle ohne Antwort
  const c4 = (await SN.comm.call(natalia, 'kasse')).item;
  assert.ok((await SN.comm.remind(c4.id, natalia)).count >= 1);
});

test('SOS (M7): an Leitung im Dienst, Antwort „Hilfe kommt“ stoppt Eskalation', async () => {
  const { SN, id, at } = await fresh();
  const anna = id('Anna Müller'), julia = id('Julia Becker');
  const s = (await SN.comm.sos(anna, 'fire', 'Rauch im Lager')).item;
  const rec = plain(SN.comm.recipients(s));
  assert.ok(rec.includes(julia) && rec.includes(id('Mustafa')) && rec.includes(id('Sabine Krämer')));
  assert.ok(!rec.includes(id('Markus Lehmann')), 'Spätschicht nicht');
  assert.ok(!rec.includes(id('Lukas Schmidt')), 'nur Leitung');
  assert.strictEqual(s.tel, '112');
  assert.ok(SN.comm.activeSos().some((x) => x.id === s.id));
  await SN.comm.sosRespond(s.id, julia);
  const cur = SN.comm.get(s.id);
  assert.strictEqual(cur.owner, julia);
  assert.strictEqual(SN.comm.waitingOn(s.id), 'Hilfe kommt: Julia');
  at(10);
  assert.ok(!SN.comm.escalateDue().includes(s.id));
  assert.ok(SN.comm.firstAiders().some((f) => f.id === julia && f.onDuty));
});

test('Schichtübergabe (M8): Zusammenfassung, Empfang quittieren, sonst Admin', async () => {
  const { SN, id, at } = await fresh();
  const kemal = id('Kemal Aydın');
  const sum = SN.comm.handoverSummary('Früh');
  assert.ok(sum.tasks.length > 0 && sum.rest.length === 1);
  assert.match(sum.text, /offene Aufträge/);
  const h = (await SN.comm.sendHandover(kemal, { notes: 'Kühlregal prüfen' })).item;
  assert.deepStrictEqual(plain(SN.comm.recipients(h)).sort(), ['Markus Lehmann', 'Elena Popescu', 'Daniel Schröder'].map(id).sort());
  assert.ok(SN.comm.toAck(id('Markus Lehmann')).some((x) => x.id === h.id));
  await SN.comm.ack(h.id, id('Elena Popescu'));
  assert.strictEqual(SN.comm.get(h.id).state, 'done');
  assert.ok(!SN.comm.toAck(id('Markus Lehmann')).some((x) => x.id === h.id));
  const h2 = (await SN.comm.sendHandover(kemal, {})).item;
  // Frist zählt erst ab Beginn der Empfangsschicht (Spät 14:00), nicht ab Versand
  at(15);
  SN.comm.escalateDue();
  assert.strictEqual(SN.comm.get(h2.id).esc.level, 0);
  SN.clock.set(SN.model.shiftStartFrom('Spät', SN.clock.now()) + 16 * 60000);
  SN.comm.escalateDue();
  const e = SN.comm.get(h2.id).esc.history;
  assert.strictEqual(e[1].key, 'admin');
});

test('Schichtanfrage (S2): annehmen, ablehnen, Tausch mit Freigabe, Protokoll', async () => {
  const { SN, id } = await fresh();
  const kemal = id('Kemal Aydın'), anna = id('Anna Müller'), mia = id('Mia Wagner');
  const q = (await SN.comm.shiftRequest(kemal, anna, { day: 'Sa', shift: 'Spät' })).item;
  assert.strictEqual(q.title, 'Kannst du Sa Spät übernehmen?');
  assert.match(SN.comm.waitingOn(q.id), /Wartet auf Antwort von Anna Müller/);
  assert.strictEqual((await SN.comm.answerShiftReq(q.id, mia, true)).ok, false, 'nur Empfänger');
  assert.ok((await SN.comm.answerShiftReq(q.id, anna, true)).ok);
  assert.strictEqual(SN.comm.get(q.id).state, 'accepted');
  assert.strictEqual((await SN.comm.answerShiftReq(q.id, anna, false)).ok, false, 'schon beantwortet');
  const q2 = (await SN.comm.shiftRequest(kemal, mia, { day: 'Mo', shift: 'Früh' })).item;
  await SN.comm.answerShiftReq(q2.id, mia, false, 'Geht leider nicht');
  assert.strictEqual(SN.comm.get(q2.id).state, 'declined');
  const sw = (await SN.comm.shiftRequest(anna, mia, { day: 'Fr', shift: 'Früh', swap: true })).item;
  await SN.comm.answerShiftReq(sw.id, mia, true);
  assert.strictEqual(SN.comm.get(sw.id).state, 'taken');
  assert.strictEqual(SN.comm.waitingOn(sw.id), 'Wartet auf Freigabe der Leitung');
  assert.strictEqual((await SN.comm.approveSwap(sw.id, anna, true)).ok, false, 'nur Leitung');
  await SN.comm.approveSwap(sw.id, kemal, true);
  assert.strictEqual(SN.comm.get(sw.id).state, 'accepted');
  const log = SN.store.peek('log', SN.util.fmt.dayKey(T));
  assert.ok(log.entries.filter((e) => /Schicht/.test(e.text)).length >= 3, 'Änderungsprotokoll');
});

test('Ausfall (S2): sofort an Schichtleitung, „Wer kann einspringen?“, abwesend', async () => {
  const { SN, id } = await fresh();
  const lena = id('Lena Meyer');
  const r = await SN.comm.reportAbsence(lena, { type: 'sick', note: 'Fieber' });
  assert.ok(r.ok);
  assert.deepStrictEqual(plain(r.item.to.ids), [id('Natalia Wójcik')]);
  assert.strictEqual(r.item.kind, 'absence');
  assert.strictEqual(SN.model.deadlineMin(r.item), 5);
  assert.ok(SN.model.isAway(SN.model.emp(lena)));
  assert.strictEqual(SN.model.onDuty(SN.model.emp(lena)), false);
  assert.ok(r.standin, 'Einspringer-Anfrage');
  const cand = plain(SN.comm.recipients(r.standin));
  assert.ok(cand.length > 0 && !cand.includes(lena));
  assert.ok(cand.every((c) => SN.model.emp(c).dept === 'Kasse'));
  assert.strictEqual(SN.comm.get(r.item.id).standinCall, r.standin.id);
  const ans = await SN.comm.answerCall(r.standin.id, cand[0], true);
  assert.strictEqual(ans.closed, true);
  const late = await SN.comm.reportAbsence(id('Nina Braun'), { type: 'late', minutes: 20 });
  assert.strictEqual(late.standin, null);
  assert.match(late.item.title, /Verspätet: Nina Braun \(ca\. 20 Min\)/);
  assert.ok(!SN.model.isAway(SN.model.emp(id('Nina Braun'))));
});

test('Meldung: Auftrag daraus, erledigt mit Antwort, Zeitleiste für den Melder', async () => {
  const { SN, id, at } = await fresh();
  const anna = id('Anna Müller'), kemal = id('Kemal Aydın');
  const rp = (await SN.comm.report(anna, { cat: 'gap', body: 'Duschgel leer' })).item;
  await SN.comm.markSeen(rp.id, kemal);
  assert.strictEqual(SN.comm.get(rp.id).state, 'seen');
  at(2);
  const t = await SN.comm.toTask(rp.id, kemal, { owner: null });
  assert.ok(t.ok);
  assert.strictEqual(t.item.kind, 'task');
  assert.strictEqual(t.item.src, rp.id);
  assert.strictEqual(t.item.act, 'Lücken füllen');
  assert.strictEqual(SN.comm.get(rp.id).state, 'taken');
  at(5);
  await SN.comm.done(rp.id, kemal, { text: 'Ist aufgefüllt, danke!' });
  const tl = plain(SN.comm.timeline(rp.id)).map((x) => x.text);
  assert.ok(tl[0].startsWith('Gesendet an Kemal'));
  assert.ok(tl.some((x) => x === 'Gesehen von Kemal Aydın'));
  assert.ok(tl.some((x) => /Ist aufgefüllt/.test(x)));
  assert.ok(tl[tl.length - 1].startsWith('Erledigt'));
  assert.ok(SN.comm.sentBy(anna, 'report').some((x) => x.id === rp.id));
});

test('Aufträge (M3): Limit bei Selbstübernahme, Zurückgeben, Foto-Nachweis', async () => {
  const { SN, id } = await fresh();
  const anna = id('Anna Müller'), kemal = id('Kemal Aydın');
  const a = SN.model.emp(anna);
  assert.strictEqual(SN.dist.limitOf(a), 360, '(8 × 60 − 30) × 0,8');
  assert.strictEqual(SN.dist.loadOf(anna), 70, 'Demo: 45 + 25 Min offen');
  const mk = async () => (await SN.comm.task(kemal, { title: 'Großauftrag', dept: 'Drogerie', act: 'Warenverräumung', min: 100, due: T + 120 * MIN })).item;
  const t1 = await mk(), t2 = await mk(), t3 = await mk();
  assert.ok((await SN.comm.take(t1.id, anna)).ok);
  assert.ok((await SN.comm.take(t2.id, anna)).ok);
  const r3 = await SN.comm.take(t3.id, anna);
  assert.strictEqual(r3.ok, false);
  assert.match(r3.reason, /Limit von Anna erreicht: noch 90 Min frei/);
  assert.strictEqual(SN.dist.loadOf(anna), 270);
  // Direktzuweisung über das Limit wird ebenfalls abgelehnt
  assert.strictEqual((await SN.comm.task(kemal, { title: 'Zu viel', dept: 'Drogerie', min: 100, owner: anna })).ok, false);
  // zurückgeben → frei, nicht wieder an dieselbe Person
  assert.strictEqual((await SN.comm.giveBack(t2.id, anna, '')).ok, false, 'Grund nötig');
  await SN.comm.giveBack(t2.id, anna, 'Hubwagen fehlt');
  const back = SN.comm.get(t2.id);
  assert.strictEqual(back.owner, null);
  const p = SN.dist.plan(T);
  assert.ok(!p.assign.some((x) => x.id === t2.id && x.owner === anna));
  // Foto-Nachweis
  const pf = (await SN.comm.task(kemal, { title: 'Aktion mit Foto', dept: 'Drogerie', min: 10, owner: anna, proofRequired: true })).item;
  await SN.comm.start(pf.id, anna);
  assert.strictEqual(SN.comm.get(pf.id).state, 'taken');
  assert.strictEqual((await SN.comm.done(pf.id, anna, {})).ok, false);
  await SN.comm.done(pf.id, anna, { photo: 'md-1' });
  assert.strictEqual(SN.comm.get(pf.id).approved, null);
  await SN.comm.approve(pf.id, kemal, true);
  assert.strictEqual(SN.comm.get(pf.id).approved, true);
  // Checklisten-Auftrag aus Vorlage eskaliert, wenn nicht abgehakt
  const tpl = SN.store.peek('templates', 'demo-t2');
  const rt = await SN.comm.runTemplate(tpl, kemal, T);
  assert.ok(rt.ok);
  assert.strictEqual(SN.store.peek('templates', 'demo-t2').lastRun, SN.util.fmt.dayKey(T));
  assert.ok(!SN.comm.dueTemplates(T).some((x) => x.id === 'demo-t2'));
  SN.clock.set(new Date(2026, 10, 23, 12, 16).getTime());
  assert.ok(SN.comm.escalateDue().includes(rt.item.id), 'Rundgang 12:00 nicht abgehakt');
  await SN.comm.checkItem(rt.item.id, kemal, 0, true);
  assert.strictEqual(SN.comm.get(rt.item.id).checklist[0].done, true);
});

test('Verteilung (M9): Stufen, Hilfe-Kennzeichen, Pause, Limits nie überschritten', async () => {
  const { SN, id } = await fresh();
  const kemal = id('Kemal Aydın'), anna = id('Anna Müller'), mia = id('Mia Wagner');
  // Stufe 1 schlägt geringere Auslastung: nur Anna hat „Etikettierung“
  assert.ok(!SN.model.emp(mia).acts.includes('Etikettierung'));
  const t = (await SN.comm.task(kemal, { title: 'Etiketten', dept: 'Drogerie', act: 'Etikettierung', u: true, due: T + 5 * MIN })).item;
  let p = SN.dist.plan(T);
  assert.strictEqual(p.assign.find((x) => x.id === t.id).owner, anna);
  assert.strictEqual(p.assign.find((x) => x.id === t.id).help, false);
  // In Pause bekommt niemand etwas
  await SN.dist.startPause(anna);
  p = SN.dist.plan(T);
  assert.ok(!p.assign.some((x) => x.owner === anna));
  assert.strictEqual(SN.dist.canTake(SN.model.emp(anna), t).ok, false);
  await SN.dist.endPause(anna, T + 10 * MIN);
  // Viele Aufträge: niemand über dem Limit
  const acts = SN.model.ACTS.map((a) => a.key);
  for (let i = 0; i < 300; i++) {
    await SN.comm.task(kemal, { title: 'Last ' + i, dept: SN.model.DEPTS[i % 15], act: acts[i % acts.length], min: 20 + (i * 7) % 41, u: i % 9 === 0, due: T + (i % 50) * MIN });
  }
  await SN.dist.startPause(mia);
  const r = await SN.dist.run(kemal, T);
  assert.ok(r.assigned > 30, 'verteilt: ' + r.assigned);
  assert.ok(r.rest > 0, 'Rest passt nicht ins Limit');
  for (const e of SN.model.staff()) assert.ok(SN.dist.loadOf(e.id) <= SN.dist.limitOf(e), 'Limit überschritten: ' + e.name);
  assert.ok(!r.assign.some((a) => a.owner === mia), 'Mia in Pause');
  for (const a of r.assign) {
    const it = SN.comm.get(a.id), e = SN.model.emp(a.owner);
    assert.strictEqual(it.owner, a.owner);
    assert.strictEqual(it.help, SN.model.deptOf(e) !== it.dept, 'Hilfe = fremde Abteilung');
    assert.ok(SN.model.onDuty(e) && (e.role === 'emp' || e.role === 'azubi'));
  }
  assert.match(SN.dist.resultText(r), /^Verteilt: \d+, passt nicht ins Limit: \d+$/);
  assert.ok(SN.dist.overloaded(T).length > 0, 'überlastete Abteilungen erkannt');
});

test('Pausenregel (M9): Anspruch, Limit, Erinnerung nach 5,5 Std, überzogen', async () => {
  const { SN, id } = await fresh();
  const D = SN.dist;
  assert.deepStrictEqual([D.pauseFor(4), D.pauseFor(6), D.pauseFor(6.5), D.pauseFor(8), D.pauseFor(8.5), D.pauseFor(10)], [0, 0, 30, 30, 45, 45]);
  const fake = (h) => ({ id: 'x', name: 'Test Person', h, sh: 'Früh' });
  assert.deepStrictEqual([5, 6, 8, 9].map((h) => D.limitOf(fake(h))), [240, 288, 360, 396]);
  const anna = id('Anna Müller');
  const st = (min) => D.pauseStatus(SN.model.emp(anna), T + min * MIN);
  assert.strictEqual(st(0).state, 'open');
  assert.strictEqual(st(0).remindAt, new Date(2026, 10, 23, 11, 30).getTime());
  assert.strictEqual(st(91).state, 'due', '5,5 Std nach 06:00');
  assert.ok(D.pauseAlerts(T + 91 * MIN, 'Früh').due.includes(anna));
  await D.startPause(anna, T + 91 * MIN);
  assert.strictEqual(st(100).state, 'running');
  assert.strictEqual(st(100).left, 21);
  assert.match(D.status(SN.model.emp(anna), T + 100 * MIN).text, /Pause bis 12:01/);
  assert.strictEqual(st(125).state, 'over');
  assert.strictEqual(st(125).over, 4);
  assert.deepStrictEqual(plain(D.pauseAlerts(T + 125 * MIN).over), [{ id: anna, over: 4 }]);
  await D.endPause(anna, T + 125 * MIN);
  assert.strictEqual(st(126).state, 'done');
  assert.strictEqual(SN.model.emp(anna).pu.min, 34);
  // 6-Std-Kraft hat keinen Anspruch
  const six = SN.model.staff().find((e) => e.h === 6 && !SN.store.peek('plans', e.id));
  assert.strictEqual(D.pauseStatus(six, T).state, 'none');
  // Wareneingang: Aufwand
  assert.deepStrictEqual(plain(D.truckEffort({ pal: 12, kkp: 6, disp: 4 })), { min: 144, people: 3 });
  // Umsetzen 2 Std
  await D.loan(id('Lukas Schmidt'), 'Kasse', 120, T);
  assert.strictEqual(SN.model.deptOf(SN.model.emp(id('Lukas Schmidt')), T + 60 * MIN), 'Kasse');
  assert.strictEqual(SN.model.deptOf(SN.model.emp(id('Lukas Schmidt')), T + 121 * MIN), 'Drogerie');
});

test('Chat (M6): Thread-IDs, gelesen-Markierung, Lesehaken, max. 200 Nachrichten', async () => {
  const { SN, id, at } = await fresh();
  const C = SN.comm;
  const anna = id('Anna Müller'), mus = id('Mustafa'), kemal = id('Kemal Aydın');
  assert.strictEqual(C.threadId.dm(anna, mus), C.threadId.dm(mus, anna));
  assert.strictEqual(C.threadId.dept('Obst und Gemüse'), 'dept~obst-und-gemuese');
  assert.strictEqual(C.threadInfo('dept~obst-und-gemuese').dept, 'Obst und Gemüse');
  const tid = C.threadId.dm(anna, mus);
  for (let i = 0; i < 205; i++) { at(i / 10); await C.chatSend(tid, anna, { text: 'Nachricht ' + i }); }
  const msgs = C.messages(tid);
  assert.ok(msgs.length <= C.CHAT_MAX, 'höchstens 200: ' + msgs.length);
  assert.strictEqual(msgs[msgs.length - 1].text, 'Nachricht 204');
  assert.ok(C.unread(tid, mus) > 0);
  assert.strictEqual(C.receipt(tid, msgs[msgs.length - 1]), 'sent');
  at(30);
  await C.chatRead(tid, mus);
  assert.strictEqual(C.unread(tid, mus), 0);
  assert.strictEqual(C.receipt(tid, msgs[msgs.length - 1]), 'read', '✓✓ gelesen');
  assert.strictEqual((await C.chatRead(tid, mus)).unchanged, true);
  // Kanäle und Rechte
  assert.strictEqual((await C.chatSend('lead', anna, { text: 'Hallo' })).ok, false, 'Leitung nur ab Schichtleitung');
  assert.ok((await C.chatSend('lead', kemal, { text: 'Hallo Leitung' })).ok);
  assert.strictEqual((await C.chatSend(C.threadId.dept('Kasse'), anna, { text: 'x' })).ok, false, 'fremde Abteilung');
  // gleichzeitig senden → beide Nachrichten bleiben
  const dt = C.threadId.dept('Drogerie');
  const before = C.messages(dt).length;
  await Promise.all([C.chatSend(dt, anna, { text: 'A' }), C.chatSend(dt, id('Mia Wagner'), { text: 'B' })]);
  assert.strictEqual(C.messages(dt).length, before + 2);
  const th = plain(C.threadsFor(anna)).map((t) => t.id);
  assert.ok(th.includes(dt) && th.includes(tid) && !th.includes('lead'));
  assert.ok(plain(C.threadsFor(kemal)).some((t) => t.id === 'lead'));
});

test('Store (Demo): Abos asynchron, tiefer Merge, Arrays ersetzen, eingefroren', async () => {
  const { SN } = await fresh();
  const seen = [];
  SN.store.sub('trucks', (docs) => seen.push(docs.length));
  await SN.store.settle();
  const n0 = seen.length;
  const p = SN.store.put('trucks', 'lkw-x', { a: { b: 1, c: 2 }, list: [1, 2] });
  assert.strictEqual(seen.length, n0, 'nicht synchron');
  assert.ok(SN.store.peek('trucks', 'lkw-x'), 'Cache sofort aktuell');
  await p; await SN.store.settle();
  assert.ok(seen.length > n0, 'asynchron benachrichtigt');
  await SN.store.patch('trucks', 'lkw-x', { a: { c: 3 }, list: [9] });
  assert.deepStrictEqual(plain(SN.store.peek('trucks', 'lkw-x')), { id: 'lkw-x', a: { b: 1, c: 3 }, list: [9] });
  assert.ok(Object.isFrozen(SN.store.peek('trucks', 'lkw-x').a));
  await SN.store.patch('trucks', 'neu', { x: 1 });
  assert.strictEqual(SN.store.peek('trucks', 'neu').x, 1, 'patch legt fehlendes Dokument an');
  await SN.store.del('trucks', 'neu');
  assert.strictEqual(SN.store.peek('trucks', 'neu'), null);
  assert.throws(() => SN.store.put('items', 'a/b', {}), /Ungültige Dokument-ID/);
  assert.throws(() => SN.store.put('gibtsnicht', 'a', {}), /Unbekannte Collection/);
  // Anmeldung
  assert.strictEqual(SN.session.login('e001', '0000').ok, false);
  assert.strictEqual(SN.session.login('e001', '1234').ok, true);
  assert.strictEqual(SN.session.me().name, 'Anna Müller');
});

test('Takt auf Demo-Daten: erster Lauf eskaliert, zweiter ändert nichts', async () => {
  const { SN } = await fresh();
  const first = SN.comm.escalateDue();
  assert.ok(first.length >= 2, 'Demo enthält fällige Vorgänge: ' + first.length);
  assert.deepStrictEqual(plain(SN.comm.escalateDue()), []);
  const hs = SN.comm.hotspots();
  assert.ok(hs.some((h) => h.type === 'task'), '🔥 unbesetzt');
  assert.ok(hs.some((h) => h.type === 'report'));
  assert.ok(SN.comm.briefingFor('e001'), 'Kurzbriefing für Anna');
  // Stimmung: anonym, ab 5 Antworten
  for (let i = 0; i < 4; i++) await SN.comm.vote(2, 'Früh');
  assert.strictEqual(SN.comm.moodAggregate(SN.util.fmt.dayKey(T), 'Früh'), null);
  await SN.comm.vote(4, 'Früh');
  assert.strictEqual(SN.comm.moodAggregate(SN.util.fmt.dayKey(T), 'Früh').n, 5);
  assert.ok(Object.keys(SN.store.peek('mood', SN.util.fmt.dayKey(T) + '_frueh')).every((k) => ['id', 'd', 'sh', 'c'].includes(k)), 'kein Personenbezug');
});

test('KI-Hülle ohne Claude: sauberes Null-Verhalten', async () => {
  const { SN } = await fresh();
  const av = await SN.ai.init();
  assert.deepStrictEqual(plain(av), { text: false, images: false, dictation: false });
  assert.strictEqual(await SN.ai.text('Hallo'), null);
  assert.strictEqual(await SN.ai.translate('Merhaba'), null);
  assert.strictEqual(SN.ai.lastError.code, 'unavailable');
  assert.strictEqual(await SN.ai.dictation.start({}), false);
  assert.strictEqual(SN.ai.dictation.available(), false);
});

/* ---------- Ausführen -------------------------------------------------- */
(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('  ✓ ' + t.name); } catch (e) {
      failed++;
      console.log('  ✗ ' + t.name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e));
    }
  }
  console.log('\n' + (tests.length - failed) + ' von ' + tests.length + ' Tests grün');
  process.exit(failed ? 1 : 0);
})();
