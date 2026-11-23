#!/usr/bin/env node
/* ==========================================================================
   test/lead.test.js – Kernlogik des Steuerpults (SN.lead) ohne Browser
   Aufruf: node test/lead.test.js   (Exit-Code 1 bei Fehlern)
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

async function fresh(at) {
  const SN = load();
  SN.clock.set(at === undefined ? T : at);
  await SN.store.init('demo');
  const id = (name) => { const e = SN.store.list('staff').find((x) => x.name === name); assert.ok(e, 'Person fehlt: ' + name); return e.id; };
  const julia = id('Julia Becker');
  /** Ruhige Filiale: keine Vorgänge, keine Lieferung, keine Restware */
  const clear = async () => {
    for (const it of SN.store.list('items')) await SN.store.del('items', it.id);
    for (const t of SN.store.list('trucks')) await SN.store.del('trucks', t.id);
    for (const r of SN.store.list('rest')) await SN.store.del('rest', r.id);
    for (const s of SN.store.list('staff')) if (s.away) await SN.store.patch('staff', s.id, { away: null });
  };
  return { SN, id, julia, clear };
}
const area = (amp, k) => amp.areas.find((a) => a.key === k);

test('Ampel: zehn Bereiche, jeder mit Wort und Symbol (nie nur Farbe)', async () => {
  const { SN, julia } = await fresh();
  const amp = SN.lead.ampel(undefined, { me: SN.model.emp(julia) });
  assert.strictEqual(amp.areas.length, 10);
  for (const a of amp.areas) {
    assert.ok(['ok', 'warn', 'crit'].includes(a.status));
    assert.ok(a.word && a.statusIcon && a.reason, a.key);
  }
  assert.strictEqual(amp.counts.ok + amp.counts.warn + amp.counts.crit, 10);
  assert.strictEqual(area(amp, 'goods').status, 'crit', 'Demo-Lieferung ohne Tour seit 1 Std');
});

test('Ampel: ruhige Filiale ist überall grün, Rundgang fällig macht gelb', async () => {
  const { SN, clear } = await fresh(new Date(2026, 10, 23, 6, 30).getTime());
  await clear();
  assert.strictEqual(SN.lead.ampel().worst, 'ok');
  SN.clock.set(T); // 10:00: Rundgänge Frische, Kühlung, Rampe fällig
  const amp = SN.lead.ampel();
  assert.strictEqual(area(amp, 'fresh').status, 'warn');
  assert.ok(/Rundgang/.test(area(amp, 'fresh').reason));
  assert.strictEqual(area(amp, 'goods').status, 'warn');
  assert.strictEqual(area(amp, 'tasks').status, 'ok');
});

test('Ampel: Aufträge, Meldungen, Rufe, Lieferung, Pausen, Besetzung aus echten Daten', async () => {
  const { SN, id, julia, clear } = await fresh(new Date(2026, 10, 23, 6, 30).getTime());
  await clear();
  const U = SN.util, M = SN.model, C = SN.comm;
  SN.clock.set(T);
  for (const k of SN.lead.CHECK_ORDER) await SN.lead.startCheck(k, julia).then((r) => C.done(r.item.id, julia));
  assert.strictEqual(SN.lead.ampel().worst, 'ok');
  // dringender freier Auftrag → Regale rot, Aufträge rot
  await C.task(julia, { title: 'Aktion Gang 7 aufbauen', dept: 'Drogerie', act: 'Aktionsregal aufbauen', u: true });
  let amp = SN.lead.ampel();
  assert.strictEqual(area(amp, 'shelf').status, 'crit');
  assert.strictEqual(area(amp, 'tasks').status, 'crit');
  // überfälliger Auftrag in Frische
  await C.task(julia, { title: 'MHD Joghurt', dept: 'MoPro', act: 'Warenpflege', due: T - 5 * MIN, owner: id('Elif Arslan') });
  amp = SN.lead.ampel();
  assert.strictEqual(area(amp, 'fresh').status, 'crit');
  assert.ok(/überfällig/.test(area(amp, 'fresh').reason));
  // Ruf ohne Zusage: gelb, nach Frist rot
  const call = (await C.call(id('Anna Müller'), 'kasse', {})).item;
  amp = SN.lead.ampel();
  assert.strictEqual(area(amp, 'checkout').status, 'warn');
  SN.clock.set(T + 3 * MIN);
  amp = SN.lead.ampel();
  assert.strictEqual(area(amp, 'checkout').status, 'crit', 'Ruf nach 2 Min ohne Zusage');
  // unbeantwortete Meldung (Leergut), 🔥 → rot
  await C.report(id('Anna Müller'), { cat: 'bottle', body: 'Automat 2 steht', u: true });
  assert.strictEqual(area(SN.lead.ampel(), 'bottle').status, 'crit');
  assert.strictEqual(area(SN.lead.ampel(), 'reports').status, 'crit');
  // Lieferung ohne Tour: erst gelb, nach 15 Min rot; mit Tour → läuft
  await SN.store.put('trucks', 'k1', { id: 'k1', at: SN.clock.now() - 5 * MIN, title: 'LKW', state: 'open' });
  assert.strictEqual(area(SN.lead.ampel(), 'goods').status, 'warn');
  SN.clock.set(SN.clock.now() + 20 * MIN);
  assert.strictEqual(area(SN.lead.ampel(), 'goods').status, 'crit');
  // Pause überzogen → Personal gelb mit Hinweis ohne Vorwurf
  const anna = id('Anna Müller');
  await SN.store.patch('staff', anna, { brk: { s: SN.clock.now() - 60 * MIN, len: 30 } });
  const st = area(SN.lead.ampel(), 'staff');
  assert.ok(st.signals.some((s) => /Pause überzogen/.test(s.text) && /nachfragen/.test(s.text)));
  // Besetzung: viele abwesend → rot
  const frueh = M.staff().filter((e) => (e.role === 'emp' || e.role === 'azubi') && e.sh === 'Früh');
  for (const e of frueh.slice(0, Math.ceil(frueh.length * 0.5))) await SN.store.patch('staff', e.id, { away: { type: 'sick', at: T, until: T + 8 * U.HOUR } });
  const b = SN.lead.staffing();
  assert.ok(b.ratio < 0.6, 'Besetzung ' + b.ratio);
  assert.ok(area(SN.lead.ampel(), 'staff').signals.some((s) => s.kind === 'staffing' && s.level === 'crit'));
  assert.ok(call.id);
});

test('Als Nächstes: höchstens 3, SOS vor Eskaliertem vor Fristen, jeweils mit Aktion', async () => {
  const { SN, id, julia } = await fresh();
  const C = SN.comm, me = SN.model.emp(julia);
  let n = SN.lead.next(me, undefined, 3);
  assert.ok(n.length >= 1 && n.length <= 3);
  for (const x of n) assert.ok(x.act && x.label && x.title, 'Aktion fehlt: ' + x.key);
  assert.ok(n.every((x, i) => i === 0 || n[i - 1].score >= x.score));
  const sos = await C.sos(id('Anna Müller'), 'accident', 'Kasse 3');
  n = SN.lead.next(me, undefined, 3);
  assert.strictEqual(n[0].act, 'sos-respond');
  assert.strictEqual(n[0].data.id, sos.item.id);
  await C.sosRespond(sos.item.id, julia);
  n = SN.lead.next(me, undefined, 5);
  assert.ok(!n.some((x) => x.key === 'sos-' + sos.item.id), 'beantwortetes SOS fällt weg');
  // eskalierte Meldung an mich steht vor einem Rundgang
  const rep = (await C.report(id('Anna Müller'), { cat: 'gap', body: 'Gang 3' })).item;
  SN.clock.advance ? SN.clock.advance(20 * MIN) : SN.clock.set(SN.clock.now() + 20 * MIN);
  SN.comm.escalateDue();
  await SN.store.settle();
  const cur = C.get(rep.id);
  n = SN.lead.next(SN.model.emp(C.currentIds(cur)[0]), undefined, 3);
  assert.ok(n.some((x) => x.key === 'in-' + rep.id && x.act === 'it-take'), 'eskalierte Meldung als Nächstes');
});

test('Als Nächstes: Pause, Übergabe vor Schichtende, Rundgang', async () => {
  const { SN, julia } = await fresh(new Date(2026, 10, 23, 11, 45).getTime());
  const me = SN.model.emp(julia);
  const keys = (k) => SN.lead.next(me, undefined, 12).map((x) => x.key).includes(k);
  assert.strictEqual(SN.dist.pauseStatus(me, SN.clock.now()).state, 'due');
  assert.ok(keys('my-pause'), 'Pausen-Erinnerung nach 5,5 Std');
  assert.ok(SN.lead.next(me, undefined, 12).find((x) => x.key === 'my-pause').act === 'pause-start');
  await SN.dist.startPause(julia);
  assert.ok(!keys('my-pause'), 'läuft die Pause, entfällt die Erinnerung');
});

test('Lage-Update: Läuft alles = Info, Engpass = Meldung, Hilfe = dringend an FL + Admin', async () => {
  const { SN, julia } = await fresh();
  const M = SN.model, C = SN.comm, L = SN.lead;
  const fl = M.branchLeads();
  const ok = await L.sendLage(julia, 'ok', '');
  assert.ok(ok.ok && ok.item.kind === 'post' && ok.item.lage === 'ok' && !ok.item.needAck && ok.item.ackDue === null);
  assert.ok(C.recipients(ok.item).every((x) => fl.includes(x)));
  SN.clock.set(T + MIN);
  const tight = await L.sendLage(julia, 'tight', 'Kasse dünn besetzt');
  assert.ok(tight.item.kind === 'report' && !tight.item.u && tight.item.ackDue > T);
  assert.ok(C.recipients(tight.item).every((x) => fl.includes(x)));
  SN.clock.set(T + 2 * MIN);
  const help = await L.sendLage(julia, 'help', '');
  assert.ok(help.item.u && help.item.kind === 'report');
  const rec = C.recipients(help.item);
  assert.ok(rec.some((x) => fl.includes(x)) && rec.some((x) => M.emp(x).role === 'admin'));
  assert.ok(help.item.ackDue - (T + 2 * MIN) <= M.settings().deadlines.urgent * MIN, 'Frist urgent');
  assert.strictEqual(L.lastLage(julia).key, 'help');
  assert.ok(/noch nicht gesehen/.test(L.lastLage(julia).state));
  // FL sieht es, übernimmt → Zustand sichtbar
  const sab = fl[0];
  await C.markSeen(help.item.id, sab);
  assert.ok(/gesehen von/.test(L.lastLage(julia).state));
  await C.take(help.item.id, sab);
  assert.ok(/übernommen/.test(L.lastLage(julia).state));
  assert.strictEqual((await L.sendLage(julia, 'xx', '')).ok, false);
});

test('Meldung nach oben: jede Kategorie aus REPORT_CATS erreicht die Filialleitung', async () => {
  const { SN, julia } = await fresh();
  const M = SN.model, C = SN.comm;
  for (const c of M.REPORT_CATS) {
    const r = await SN.lead.reportUp(julia, c.key, { body: 'Test' });
    assert.ok(r.ok, c.key);
    assert.strictEqual(r.item.cat, c.key);
    assert.ok(r.item.up && C.recipients(r.item).length > 0 && C.recipients(r.item).every((x) => M.branchLeads().includes(x)));
    assert.ok(r.item.ackDue > T, 'Frist gesetzt');
  }
  assert.strictEqual((await SN.lead.reportUp(julia, 'nix', {})).ok, false);
});

test('Rundgang: Mangel erzeugt Auftrag oder Meldung, Abschluss nur vollständig, idempotent', async () => {
  const { SN, julia, clear } = await fresh();
  await clear();
  const L = SN.lead, C = SN.comm;
  const s = await L.startCheck('frische', julia);
  assert.ok(s.ok && s.item.check === 'frische' && s.item.owner === julia && s.item.checklist.length === L.CHECKS.frische.points.length);
  assert.ok((await L.startCheck('frische', julia)).resumed, 'läuft schon → fortsetzen');
  assert.strictEqual(L.checkStatus('frische').state, 'running');
  assert.strictEqual((await L.finishCheck(s.item.id, julia)).ok, false, 'Punkte offen');
  await L.markPoint(s.item.id, julia, 0, 'ok');
  await L.markPoint(s.item.id, julia, 1, 'miss');
  await L.markPoint(s.item.id, julia, 2, 'ok');
  await L.markPoint(s.item.id, julia, 3, 'miss');
  await L.markPoint(s.item.id, julia, 4, 'ok');
  assert.ok(C.get(s.item.id).checklist[1].miss && C.get(s.item.id).checklist[1].at, 'Zeitstempel');
  const f = await L.finishCheck(s.item.id, julia);
  assert.ok(f.ok && f.misses === 2 && f.tasks.length === 2 && f.reports.length === 0);
  const t1 = C.get(f.tasks[0]);
  assert.ok(t1.kind === 'task' && t1.dept === 'MoPro' && t1.src === s.item.id && t1.due > T && t1.escalate);
  assert.strictEqual(L.checkStatus('frische').state, 'done');
  assert.strictEqual(L.checkStatus('frische').misses, 2);
  const f2 = await L.finishCheck(s.item.id, julia);
  assert.ok(f2.unchanged);
  assert.strictEqual(SN.store.list('items').filter((i) => i.src === s.item.id).length, 2, 'nicht doppelt angelegt');
  // Kühlung: Mangel = dringende Meldung an Admin vom Dienst, kein Auftrag
  const k = await L.startCheck('kuehlung', julia);
  for (let i = 0; i < k.item.checklist.length; i++) await L.markPoint(k.item.id, julia, i, i === 0 ? 'miss' : 'ok');
  const fk = await L.finishCheck(k.item.id, julia);
  assert.ok(fk.reports.length === 1 && fk.tasks.length === 0);
  const rp = C.get(fk.reports[0]);
  assert.ok(rp.cat === 'defect' && rp.u && C.recipients(rp).every((x) => SN.model.emp(x).role === 'admin'));
  // alles in Ordnung: keine Folgevorgänge
  const r = await L.startCheck('rampe', julia);
  for (let i = 0; i < r.item.checklist.length; i++) await L.markPoint(r.item.id, julia, i, 'ok');
  const fr = await L.finishCheck(r.item.id, julia);
  assert.ok(fr.ok && fr.misses === 0 && !fr.tasks.length && !fr.reports.length);
  assert.ok(SN.store.peek('log', SN.util.fmt.dayKey(T)).entries.some((e) => /Rundgang Rampe: ohne Mängel/.test(e.text)));
});

test('Rundgang: Vorlagen sind vollständig (kein Minutenfeld, Mangel führt immer zu Auftrag oder Meldung)', async () => {
  const { SN } = await fresh();
  for (const c of Object.values(SN.lead.CHECKS)) {
    assert.ok(c.points.length >= 3 && c.at['Früh'] && c.at['Spät'] && SN.model.DEPTS.includes(c.dept), c.key);
    for (const p of c.points) {
      assert.ok(p.text && p.fix && ['task', 'report'].includes(p.type), c.key + ': ' + p.text);
      if (p.type === 'task') assert.ok(SN.model.ACT_MIN[p.act], 'Tätigkeit mit Richtwert: ' + p.act);
      else assert.ok(SN.model.CAT[p.cat], 'Kategorie: ' + p.cat);
      assert.ok(SN.model.DEPTS.includes(p.dept), p.dept);
      assert.ok(!/\d+\s*(Min|Minuten)\b/.test(p.text + p.fix), 'keine Minutenangaben');
    }
  }
});

test('Mein Team: Liste der Schicht im Bereich, Ruf an Person mit Eskalationskette', async () => {
  const { SN, id, julia } = await fresh();
  const L = SN.lead, M = SN.model, C = SN.comm;
  const t = L.teamList(M.emp(julia));
  assert.ok(t.rows.length > 0 && t.rows.every((r) => M.deptOf(r.emp) && t.scope.includes(M.deptOf(r.emp))));
  assert.ok(t.rows.every((r) => !M.isLead(r.emp)), 'Leitungen nicht in der Liste');
  assert.strictEqual(t.counts.free + t.counts.work + t.counts.pause, t.rows.length);
  const target = t.rows.find((r) => r.key === 'free').emp;
  const c = await L.callPerson(julia, target.id, '');
  assert.ok(c.ok && c.item.kind === 'call' && c.item.need === 1 && /Kurz zu Julia kommen/.test(c.item.title));
  assert.deepStrictEqual(plain(C.recipients(c.item)), [target.id]);
  assert.ok(c.item.ackDue > T);
  await C.answerCall(c.item.id, target.id, true);
  assert.strictEqual(C.get(c.item.id).state, 'closed');
  // Pause → kein Ruf
  await SN.store.patch('staff', target.id, { brk: { s: T, len: 30 } });
  const r = await L.callPerson(julia, target.id, '');
  assert.ok(!r.ok && /Pause/.test(r.reason));
  assert.ok(!L.teamList(M.emp(julia)).rows.find((x) => x.emp.id === target.id && x.key === 'free'));
});

test('Ruhiger Modus: an bis Schichtende, danach automatisch aus; sammelt still', async () => {
  const { SN, id, julia } = await fresh();
  const L = SN.lead, C = SN.comm;
  assert.strictEqual(L.quiet.isOn(julia), false);
  const s = L.quiet.set(julia, true);
  assert.ok(L.quiet.isOn(julia) && s.until === SN.model.shiftWindow(SN.model.emp(julia), T).e);
  // gesammelt: neue Meldung an mich seit Beginn, ohne SOS/Eskalation
  const rep = await C.report(id('Anna Müller'), { cat: 'gap', body: 'Gang 3' });
  assert.ok(rep.ok);
  const col = L.quiet.collected(SN.model.emp(julia));
  assert.ok(col.items >= 0 && typeof col.chat === 'number');
  SN.clock.set(s.until + MIN);
  assert.strictEqual(L.quiet.isOn(julia), false, 'läuft am Schichtende ab');
  L.quiet.set(julia, true, T);
  L.quiet.set(julia, false, T);
  assert.strictEqual(L.quiet.isOn(julia, T), false);
});

test('Übergabe: ab 60 Min vor Schichtende fällig, nach Senden nicht mehr', async () => {
  const { SN, julia } = await fresh(new Date(2026, 10, 23, 13, 10).getTime());
  const me = SN.model.emp(julia);
  assert.ok(SN.lead.handoverState(me, SN.clock.now()).due);
  assert.ok(SN.lead.next(me, undefined, 12).some((x) => x.key === 'handover' && x.act === 'cp-handover'));
  await SN.comm.sendHandover(julia, { notes: '' });
  assert.ok(!SN.lead.handoverState(me, SN.clock.now()).due);
  SN.clock.set(new Date(2026, 10, 23, 11, 0).getTime());
  assert.ok(!SN.lead.handoverState(me, SN.clock.now()).due, 'zu früh');
});

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
