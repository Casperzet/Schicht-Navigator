#!/usr/bin/env node
/* ==========================================================================
   test/overview.test.js – Kernlogik SN.overview (ohne Browser)
   Kennzahlen, Filter, Stundenverlauf, Anwesenheit, Abwesenheiten, Rechte.
   Aufruf: node test/overview.test.js
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
const T = new Date(2026, 10, 23, 10, 0, 0).getTime(); // Montag 10:00, Frühschicht

function load() {
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URLSearchParams, atob, Blob };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.SN;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
async function fresh() {
  const SN = load();
  SN.clock.set(T);
  await SN.store.init('demo');
  const id = (name) => { const e = SN.store.list('staff').find((x) => x.name === name); assert.ok(e, 'Person fehlt: ' + name); return e.id; };
  return { SN, O: SN.overview, id, at: (min) => SN.clock.set(T + min * MIN) };
}

test('Kennzahlen: konsistent mit der Liste, Fotoberichte und „unbeantwortet“', async () => {
  const { SN, O } = await fresh();
  const s = O.stats();
  assert.strictEqual(s.open, O.filter({ view: 'open' }).length);
  assert.strictEqual(s.escalated, O.filter({ view: 'esc' }).length);
  assert.strictEqual(s.unseenPhotos, O.filter({ view: 'unseen' }).length);
  assert.strictEqual(s.doneToday, O.filter({ view: 'done' }).length);
  assert.ok(s.open > 0 && s.unseenPhotos >= 2, 'Demo hat offene Vorgänge und ungesehene Fotos');
  assert.ok(O.filter({ view: 'unseen' }).every((it) => it.kind === 'photo'));
  // später ist mehr unbeantwortet
  const stale0 = O.stats(T, { staleMin: 10 }).stale;
  const stale1 = O.stats(T + 40 * MIN, { staleMin: 10 }).stale;
  assert.ok(stale1 >= stale0 && stale1 > 0);
  assert.ok(O.stats(T, { staleMin: 30 }).stale <= O.stats(T, { staleMin: 5 }).stale, 'größere Schwelle → weniger');
  // übernommene Meldung ist offen, aber nicht „wartend“
  const taken = SN.store.list('items').find((it) => it.kind === 'report' && it.state === 'taken');
  assert.ok(O.isOpen(taken) && !O.isWaiting(taken));
});

test('Filter: Art, Abteilung, Schicht, Dringend; Sortierung dringend zuerst', async () => {
  const { SN, O } = await fresh();
  const l = O.filter({ view: 'all' });
  assert.ok(l.length > O.filter({ view: 'open' }).length);
  const kinds = new Set(l.map((it) => it.kind));
  for (const k of kinds) assert.ok(O.KINDS.some((x) => x[0] === k), 'nur bekannte Arten: ' + k);
  assert.ok(!kinds.has('task') && !kinds.has('shiftreq'), 'Aufträge sind nicht Teil der Sammel-Sicht');
  const rep = O.filter({ view: 'all', kind: 'report' });
  assert.ok(rep.length && rep.every((it) => it.kind === 'report'));
  const dr = O.filter({ view: 'all', dept: 'Drogerie' });
  assert.ok(dr.length && dr.every((it) => it.dept === 'Drogerie'));
  const urg = O.filter({ view: 'open', urgent: true });
  assert.ok(urg.length && urg.every((it) => it.u));
  const open = O.filter({ view: 'open' });
  const firstNonUrgent = open.findIndex((it) => !it.u);
  assert.ok(firstNonUrgent === -1 || open.slice(0, firstNonUrgent).every((it) => it.u) && open.slice(firstNonUrgent).every((it) => !it.u), 'dringend zuerst');
  assert.ok(O.filter({ view: 'open', shift: 'Spät' }).every((it) => it.shift === 'Spät'));
});

test('Eskalation zählt: nach Frist erscheint die Meldung unter „Eskaliert“', async () => {
  const { SN, O, id, at } = await fresh();
  const n0 = O.stats().escalated;
  const r = await SN.comm.report(id('Anna Müller'), { cat: 'gap', body: 'leer' });
  at(20);
  SN.comm.escalateDue(); await SN.store.settle();
  assert.ok(O.stats().escalated > n0);
  assert.ok(O.filter({ view: 'esc' }).some((it) => it.id === r.item.id));
  assert.ok(/Wartet auf/.test(SN.comm.waitingOn(r.item.id)));
});

test('Stundenverlauf: 8 Stunden, Summe = Vorgänge im Zeitraum', async () => {
  const { SN, O } = await fresh();
  const h = O.hourly(T, 8);
  assert.strictEqual(h.length, 8);
  assert.ok(h.every((x, i) => i === 0 || x.from > h[i - 1].from));
  assert.ok(h.every((x) => x.open + x.done === x.total));
  const from = h[0].from, to = h[7].from + 3600000;
  const n = SN.store.list('items').filter((it) => O.KINDS.some((k) => k[0] === it.kind) && it.createdAt >= from && it.createdAt < to).length;
  assert.strictEqual(h.reduce((s, x) => s + x.total, 0), n);
  assert.ok(h.some((x) => x.total > 0), 'Verlauf hat Vorgänge');
});

test('Anwesenheit: Früh heute, abwesend mit Namen, Besetzung je Abteilung', async () => {
  const { SN, O } = await fresh();
  const p = O.presence(0, 'Früh');
  assert.ok(p.live && p.isToday);
  assert.strictEqual(p.present + p.away.length, p.planned);
  assert.ok(p.away.length >= 1, 'Demo: eine Krankmeldung');
  assert.ok(p.away.every((a) => SN.model.emp(a.id) && a.type), 'Abwesende mit Person und Art');
  assert.strictEqual(p.counts.free + p.counts.work + p.counts.pause + p.counts.notYet, p.present);
  assert.strictEqual(p.byDept.length, SN.model.DEPTS.length);
  const kasse = p.byDept.find((r) => r.dept === 'Kasse');
  assert.strictEqual(kasse.need, 4);
  assert.ok(kasse.short >= 1, 'Kasse unterbesetzt (eine Person krank)');
  assert.ok(p.short.some((s) => s.dept === 'Kasse'));
  assert.strictEqual(p.byDept[0].short > 0, true, 'Unterbesetzte zuerst');
  const spaet = O.presence(0, 'Spät');
  assert.ok(!spaet.live && spaet.planned > 20);
  assert.strictEqual(O.presence(6, 'Früh').planned, 0, 'Sonntag: niemand ohne Plan');
  assert.ok(O.presence(6, 'Früh').byDept.every((r) => r.need === 0), 'Sonntag: kein Bedarf');
});

test('Abwesenheit eintragen: Urlaub, Verspätung, vormerken, beenden, löschen', async () => {
  const { SN, O, id, at } = await fresh();
  const mustafa = id('Mustafa');
  const kemal = id('Lukas Schmidt');
  const day0 = O.dayStart(0, T);
  const before = O.presence(0, 'Früh');
  const e0 = SN.model.emp(kemal);
  const inShift = e0.sh;
  // Krank heute (läuft sofort) → zählt als abwesend, dist/isAway wirken
  const r = await O.setAway(mustafa, kemal, { type: 'sick', from: day0, until: day0 + 86400000 });
  assert.ok(r.ok);
  assert.ok(SN.model.isAway(SN.model.emp(kemal), T), 'staff.away gesetzt');
  const after = O.presence(0, inShift);
  assert.ok(after.away.some((a) => a.id === kemal && a.type === 'sick'));
  if (inShift === 'Früh') assert.strictEqual(after.present, before.present - 1);
  // Urlaub ab morgen: heute nicht abwesend, morgen schon, vorgemerkt
  const bob = id('Mia Wagner');
  const mia = SN.model.emp(bob);
  const r2 = await O.setAway(mustafa, bob, { type: 'vac', from: day0 + 86400000, until: day0 + 3 * 86400000 });
  assert.ok(r2.ok && !SN.model.isAway(SN.model.emp(bob), T + 0), 'Urlaub ab morgen: heute noch nicht abwesend');
  assert.ok(!O.presence(0, mia.sh).away.some((a) => a.id === bob));
  assert.ok(O.presence(1, mia.sh).away.some((a) => a.id === bob && a.type === 'vac'), 'Dienstag abwesend (Urlaub)');
  at(24 * 60 + 5); // Dienstag
  assert.deepStrictEqual(plain(await O.syncAway()), [bob], 'syncAway aktiviert den Urlaub');
  assert.ok(SN.model.isAway(SN.model.emp(bob)));
  // Verspätung: bis 11:00
  const late = id('Tim Wolf');
  SN.clock.set(T);
  const r3 = await O.setAway(mustafa, late, { type: 'late', from: T, until: T + 60 * MIN });
  assert.ok(r3.ok && SN.model.isAway(SN.model.emp(late), T));
  assert.ok(!SN.model.isAway(SN.model.emp(late), T + 61 * MIN), 'nach der Ankunftszeit wieder da');
  // beenden
  const e = await O.endAway(mustafa, kemal);
  assert.ok(e.ok && !SN.model.isAway(SN.model.emp(kemal), T + 1));
  // vormerkte löschen
  const rec = (SN.model.emp(bob).absences || [])[0];
  assert.ok((await O.cancelAway(mustafa, bob, rec.id)).ok);
  assert.ok(!SN.model.isAway(SN.model.emp(bob), T + 25 * 3600000));
  // Prüfungen
  assert.strictEqual((await O.setAway(mustafa, kemal, { type: 'vac', from: T, until: T - MIN })).ok, false);
  assert.strictEqual((await O.setAway(mustafa, kemal, { type: 'xx', from: T, until: T + MIN })).ok, false);
  // Protokoll
  const log = O.personnelLog(T);
  assert.ok(log.some((x) => /Abwesenheit – Lukas Schmidt, Krank/.test(x.text)) && log.every((x) => !/^Personal:/.test(x.text)));
});

test('Abwesende sind nicht im Dienst: keine Verteilung an sie', async () => {
  const { SN, O, id } = await fresh();
  const c = SN.dist.candidates(T).find((e) => e.role === 'emp');
  await O.setAway(id('Mustafa'), c.id, { type: 'sick', from: O.dayStart(0, T), until: O.dayStart(0, T) + 86400000 });
  assert.ok(!SN.dist.candidates(T).some((e) => e.id === c.id));
});

test('Rechte: nur gleich- oder höherrangig, Rollen nicht über eigener Stufe, letzte Leitung geschützt', async () => {
  const { SN, O, id } = await fresh();
  const E = (n) => SN.model.emp(id(n));
  assert.ok(O.canManage(E('Mustafa'), E('Anna Müller')));
  assert.ok(O.canManage(E('Mustafa'), E('Niels')));
  assert.ok(!O.canManage(E('Mustafa'), E('Sabine Krämer')), 'Admin darf Filialleitung nicht verwalten');
  assert.ok(O.canManage(E('Sabine Krämer'), E('Mustafa')));
  assert.ok(!O.canManage(E('Anna Müller'), E('Anna Müller')), 'Mitarbeitende gar nicht');
  assert.ok(!O.assignableRoles(E('Mustafa')).includes('fl') && O.assignableRoles(E('Sabine Krämer')).includes('fl'));
  assert.strictEqual(O.loseLastAdmin(id('Mustafa'), 'emp'), false, 'es gibt weitere');
});

test('Prüfung, PIN, Diff, Zugehörigkeit', async () => {
  const { SN, O, id } = await fresh();
  const base = { name: 'Neu Person', role: 'emp', dept: 'Kasse', sh: 'Früh', h: 6 };
  assert.deepStrictEqual(plain(O.validate(base)), { errors: [], warnings: [] });
  assert.ok(O.validate(Object.assign({}, base, { name: 'A' })).errors.length);
  assert.ok(O.validate(Object.assign({}, base, { h: 12 })).errors.length);
  assert.ok(O.validate(Object.assign({}, base, { pin: '12' })).errors.length);
  assert.ok(O.validate(Object.assign({}, base, { name: 'anna müller' })).warnings.length, 'Dublette warnt');
  for (let i = 0; i < 30; i++) assert.ok(/^\d{4}$/.test(O.newPin()) && O.newPin() !== '1234');
  const a = SN.model.emp(id('Anna Müller'));
  const d = O.diffStaff(a, Object.assign({}, a, { dept: 'Info', firstAid: true, acts: ['Leergut'] }));
  assert.ok(d.includes('Abteilung: Drogerie → Info') && d.includes('Ersthelfer: nein → ja') && d.includes('Tätigkeiten geändert'));
  assert.deepStrictEqual(plain(O.diffStaff(a, a)), []);
});

test('Soll-Besetzung aus den Einstellungen, Verstärkung nur frei und nie Leitung', async () => {
  const { SN, O } = await fresh();
  await SN.store.patch('settings', 'main', { staffing: { Drogerie: { Früh: 5 } } });
  assert.strictEqual(O.need('Drogerie', 'Früh'), 5);
  assert.strictEqual(O.need('Drogerie', 'Spät'), 1);
  assert.ok(O.presence(0, 'Früh').short.some((s) => s.dept === 'Drogerie'));
  const r = O.reinforcements('Kasse', T);
  assert.ok(r.every((i) => SN.model.level(SN.model.emp(i)) === 1 && SN.dist.status(SN.model.emp(i), T).key === 'free'));
});

/* ---------- Ausführen -------------------------------------------------- */
(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('  ✓ ' + t.name); } catch (e) {
      failed++;
      console.log('  ✗ ' + t.name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e));
    }
  }
  console.log('\n' + (tests.length - failed) + ' von ' + tests.length + ' Tests grün');
  process.exit(failed ? 1 : 0);
})();
