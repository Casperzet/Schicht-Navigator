/* ==========================================================================
   test/ops.test.js – Ruhezeit (ArbZG) und Werbewechsel, aus der Kaufland-Recherche
   Aufruf: node test/ops.test.js
   ========================================================================== */
'use strict';
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const FILE = 'file://' + path.resolve(__dirname, '../dist/index.html') + '?mode=demo';
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ✓ ' + name); } catch (e) { fails++; console.log('  ✗ ' + name + '\n    ' + (e.message || e)); } };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(FILE);
  await p.waitForFunction(() => document.documentElement.dataset.snReady === '1');
  const ev = (fn, arg) => p.evaluate(fn, arg);

  await t('Ruhezeit: Spät (bis 22) → Früh (ab 6) am nächsten Tag = 8 Std, abgelehnt', async () => {
    const r = await ev(() => {
      const e = SN.model.staff().find((x) => x.role === 'emp');
      // feste Pläne: Di Spät, Mi frei, Do Früh geplant → Mi Früh übernehmen
      const day = (d, s, e2, off) => ({ d, off: !!off, s, e: e2, p: 30 });
      const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => d === 'Di' ? day(d, '14:00', '22:00') : day(d, '06:00', '14:00', true));
      return SN.store.put('plans', e.id, { id: e.id, days }).then(() => SN.ops.restCheck(e, 'Mi', 'Früh'));
    });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.gapH, 8); assert.match(r.reason, /11 Std/);
  });
  await t('Ruhezeit: Früh (bis 14) → Früh am nächsten Tag = 16 Std, erlaubt', async () => {
    const r = await ev(() => {
      const e = SN.model.staff().find((x) => x.role === 'emp');
      const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => d === 'Di' ? { d, off: false, s: '06:00', e: '14:00', p: 30 } : { d, off: true, s: '06:00', e: '14:00', p: 30 });
      return SN.store.put('plans', e.id, { id: e.id, days }).then(() => SN.ops.restCheck(e, 'Mi', 'Früh'));
    });
    assert.strictEqual(r.ok, true);
  });
  await t('Ruhezeit: auch gegen den Folgetag geprüft (Spät heute, Früh morgen)', async () => {
    const r = await ev(() => {
      const e = SN.model.staff().find((x) => x.role === 'emp');
      const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => d === 'Do' ? { d, off: false, s: '06:00', e: '14:00', p: 30 } : { d, off: true, s: '06:00', e: '14:00', p: 30 });
      return SN.store.put('plans', e.id, { id: e.id, days }).then(() => SN.ops.restCheck(e, 'Mi', 'Spät'));
    });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.gapH, 8);
  });
  await t('Schichtanfrage mit zu kurzer Ruhezeit wird gar nicht erst gesendet', async () => {
    const r = await ev(async () => {
      const e = SN.model.staff().find((x) => x.role === 'emp');
      const lead = SN.model.staff().find((x) => x.role === 'sl');
      const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => d === 'Di' ? { d, off: false, s: '14:00', e: '22:00', p: 30 } : { d, off: true, s: '06:00', e: '14:00', p: 30 });
      await SN.store.put('plans', e.id, { id: e.id, days });
      return SN.comm.shiftRequest(lead.id, e.id, { day: 'Mi', shift: 'Früh' });
    });
    assert.strictEqual(r.ok, false); assert.match(r.reason, /Ruhezeit/);
  });
  await t('Werbewechsel: je Abteilung ein Auftrag mit Checkliste und Foto-Nachweis, nur einmal pro Tag', async () => {
    const r = await ev(async () => {
      const me = SN.model.staff().find((x) => x.role === 'admin').id;
      const a = await SN.ops.createPromoChange(me, {});
      const again = await SN.ops.createPromoChange(me, {});
      const l = SN.store.list('items').filter((i) => i.promoDay);
      return { a, again, n: l.length, proof: l.every((i) => i.proofRequired), chk: l.every((i) => i.checklist && i.checklist.length === 3), prog: SN.ops.promoProgress() };
    });
    assert.strictEqual(r.a.ok, true); assert.strictEqual(r.n, 10); assert.ok(r.proof && r.chk);
    assert.strictEqual(r.again.ok, false); assert.match(r.again.reason, /schon angelegt/);
    assert.strictEqual(r.prog.total, 10); assert.strictEqual(r.prog.done, 0);
  });
  await b.close();
  console.log(fails ? '\n' + fails + ' Fehler' : '\nOps: alle Tests grün');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
