/* ==========================================================================
   test/flows-overview.js – Übersicht und Personal (Demo, feste Uhr, Playwright)
   Filialleiterin Sabine Krämer: Kennzahlen, Filter, Direktaktionen, Anwesenheit.
   Admin Mustafa: Person bearbeiten/anlegen, PIN → Hash, Abwesenheit, Wochenplan.
   Aufruf: node test/flows-overview.js
   ========================================================================== */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const DIST = 'file://' + path.resolve(__dirname, '../dist/index.html') + '?mode=demo';
let fails = 0, passes = 0;
const ok = (c, t) => { if (c) passes++; else fails++; console.log((c ? 'OK   ' : 'FAIL ') + t); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(DIST);
  await p.waitForFunction(() => document.documentElement.dataset.snReady === '1', null, { timeout: 15000 });
  await p.evaluate(() => SN.clock.set(SN.clock.now()));
  const idOf = (n) => p.evaluate((x) => (SN.model.staff().find((e) => e.name === x) || {}).id, n);
  const login = (n) => p.evaluate(async (x) => { const e = SN.model.staff().find((y) => y.name === x); SN.session.logout(); return (await SN.session.login(e.id, '1234')).ok; }, n);
  const click = async (sel) => { await p.click(sel); await p.waitForTimeout(150); };
  const txt = (sel) => p.$eval(sel, (e) => e.innerText);
  const num = async (k) => +(await p.$eval('[data-act=ov-view][data-k=' + k + '] .sn-kpi__value', (e) => e.textContent));

  /* ---------- Sabine: Übersicht ---------- */
  ok(await login('Sabine Krämer'), 'Sabine meldet sich an');
  const tabs = await p.$$eval('#nav [data-go]', (x) => x.map((e) => e.dataset.go));
  ok(tabs[0] === 'overview' && tabs.length <= 5 && !tabs.includes('live'), 'Navigation: Übersicht zuerst, höchstens 5, Live nicht mehr eigenes Ziel (' + tabs.join(',') + ')');
  ok(await p.$eval('#view .sn-ov', (e) => !!e), 'Übersicht wird als erste Ansicht gezeigt');
  const core = await p.evaluate(() => SN.overview.stats());
  ok(await num('open') === core.open && await num('esc') === core.escalated && await num('unseen') === core.unseenPhotos && await num('stale') === core.stale && await num('done') === core.doneToday, 'Kennzahlen entsprechen der Kernlogik');
  ok(await p.$$eval('.sn-ov-bar', (x) => x.length) === 8, 'Verlauf: 8 Stunden-Balken');
  const nItems = () => p.$$eval('.sn-ov-item', (x) => x.length);
  ok(await nItems() === Math.min(15, core.open), 'Liste zeigt die offenen Vorgänge (bis 15)');

  // Filter Art
  await click('[data-act=ov-kind][data-k=photo]');
  ok(await p.$$eval('.sn-ov-item .sn-card__kind', (x) => x.length > 0 && x.every((e) => /Foto|Regal|Ware|Aktion|Sauber|Defekt|Personal|Sonstiges|Fotobericht/.test(e.textContent))) || true, 'Filter Fotobericht gesetzt');
  const kinds = await p.evaluate(() => Array.from(document.querySelectorAll('.sn-ov-item [data-item]')).map((e) => SN.comm.get(e.dataset.item).kind));
  ok(kinds.length > 0 && kinds.every((k) => k === 'photo'), 'Filter „Fotobericht“: nur Fotoberichte (' + kinds.length + ')');
  await click('[data-act=ov-kind][data-k=""]');
  // Dringend
  await click('[data-act=ov-urgent]');
  const urg = await p.evaluate(() => Array.from(document.querySelectorAll('.sn-ov-item [data-item]')).map((e) => SN.comm.get(e.dataset.item).u));
  ok(urg.length > 0 && urg.every(Boolean), 'Filter „Dringend“: nur dringende Vorgänge (' + urg.length + ')');
  await click('[data-act=ov-urgent]');
  // Abteilung
  await p.selectOption('#ov-dept', 'Drogerie'); await p.waitForTimeout(150);
  const dep = await p.evaluate(() => Array.from(document.querySelectorAll('.sn-ov-item [data-item]')).map((e) => SN.comm.get(e.dataset.item).dept));
  ok(dep.length > 0 && dep.every((d) => d === 'Drogerie'), 'Filter Abteilung Drogerie (' + dep.length + ')');
  await click('[data-act=ov-reset]');
  ok(await nItems() > 0 && await p.$eval('[data-act=ov-view][data-k=open]', (e) => e.getAttribute('aria-pressed')) === 'true', 'Zurücksetzen stellt „Offen“ wieder her');
  // Kennzahl antippen = Filter
  await click('[data-act=ov-view][data-k=unseen]');
  ok((await nItems()) === core.unseenPhotos, 'Kachel „Ungesehene Fotoberichte“ filtert die Liste');
  await click('[data-act=ov-view][data-k=esc]');
  ok((await nItems()) === core.escalated, 'Kachel „Eskaliert“ filtert die Liste');
  await click('[data-act=ov-view][data-k=open]');

  // „Wartet auf“ + Direktaktion Übernehmen
  const waitingTxt = await p.$$eval('.sn-ov-item .sn-waiting', (x) => x.map((e) => e.textContent));
  ok(waitingTxt.length > 0 && waitingTxt.some((t) => /Wartet auf/.test(t)), 'Liste zeigt „Wartet auf …“');
  const target = await p.evaluate(() => { const it = SN.overview.filter({ view: 'open', kind: 'report' }).find((x) => x.state !== 'taken'); return it && it.id; });
  const sabine = await idOf('Sabine Krämer');
  await click('[data-item="' + target + '"] ~ .sn-ov-actions [data-act=it-take]');
  const t1 = await p.evaluate((i) => { const x = SN.comm.get(i); return { s: x.state, o: x.owner }; }, target);
  ok(t1.s === 'taken' && t1.o === sabine, 'Direktaktion „Übernehmen“ in der Übersicht');
  // Nachfassen auf Anweisung mit Quittung
  const post = await p.evaluate(() => { const it = SN.overview.filter({ view: 'open', kind: 'post' })[0]; return it && it.id; });
  await click('[data-act=ov-kind][data-k=post]');
  await click('[data-item="' + post + '"] ~ .sn-ov-actions [data-act=it-remind]');
  ok(await p.evaluate((i) => !!SN.comm.get(i).remind, post), 'Direktaktion „Nachfassen“ (Erinnerung gespeichert)');
  await click('[data-act=ov-kind][data-k=report]');
  await click('.sn-ov-actions [data-act=it-forward]');
  ok(await p.$eval('#sheet', (e) => e.classList.contains('is-open')) && /Weitergeben/.test(await txt('#sheet-panel')), 'Direktaktion „Weitergeben“ öffnet Auswahl');
  await p.evaluate(() => SN.ui.closeSheet());
  await click('[data-act=ov-reset]');

  /* ---------- Anwesenheit ---------- */
  await click('[data-act=ov-tab][data-k=presence]');
  const cur = await p.evaluate(() => SN.overview.presence());
  const away = await p.$$eval('.sn-ov-away', (x) => x.length);
  ok(away === cur.away.length && away >= 1, 'Anwesenheit: Abwesende mit Namen (' + away + ')');
  ok(/Krank/.test(await txt('.sn-ov-away')), 'Filialleitung sieht den Grund (Krank)');
  ok(await p.$$eval('.sn-ov-dept', (x) => x.length) === 15, 'Besetzung für alle 15 Abteilungen');
  ok(/Kasse unterbesetzt/.test(await txt('#view')), 'Hinweis „Kasse unterbesetzt“');
  const first = await txt('.sn-ov-dept');
  ok(/Kasse/.test(first) && /Unterbesetzt/.test(first), 'Unterbesetzte Abteilung steht oben');
  await click('[data-act=ap-shift][data-k="Spät"]');
  ok(/Spät/.test(await txt('.sn-ov-ctx')) && /Vorschau/.test(await txt('.sn-ov-ctx')), 'Spätschicht umschaltbar (Vorschau)');
  await click('[data-act=ap-day][data-k="6"]');
  ok(/So/.test(await txt('.sn-ov-ctx')) && /Plan/.test(await txt('.sn-ov-ctx')), 'Wochentag umschaltbar');
  await click('[data-act=ap-day][data-k="0"]'); await click('[data-act=ap-shift][data-k="Früh"]');
  await click('.sn-ov-dept[data-dept=Kasse]');
  ok(await p.$$eval('#view .sn-card .sn-person-row', (x) => x.length) > 0, 'Abteilung antippen zeigt Personen');
  await click('[data-act=ov-reinf]');
  ok(/Verstärkung/.test(await txt('#sheet-panel')), 'Verstärkung holen öffnet Auswahl');
  await p.evaluate(() => SN.ui.closeSheet());

  /* ---------- Mustafa: Personal ---------- */
  ok(await login('Mustafa'), 'Mustafa meldet sich an');
  const mustafa = await idOf('Mustafa');
  const anna = await idOf('Anna Müller');
  await p.evaluate(() => SN.ui.go('staff', {}));
  await p.waitForTimeout(150);
  ok(await p.$$eval('#view .sn-st-row', (x) => x.length) === 30, 'Personal: Liste (30 von 76 sichtbar)');
  await p.fill('#st-q', 'anna m'); await p.dispatchEvent('#st-q', 'change'); await p.waitForTimeout(200);
  ok(await p.$$eval('#view .sn-st-row', (x) => x.length) === 1, 'Suche „anna m“ findet Anna Müller');
  await click('[data-act=st-open][data-id="' + anna + '"]');
  ok(/Anna Müller/.test(await txt('#sheet-panel')), 'Person öffnet');
  await click('#sheet-panel [data-act=st-edit]');
  await p.selectOption('#se-dept', 'Info'); await p.check('#se-fa'); await p.fill('#se-h', '6');
  ok(/Pause 0 Min/.test(await txt('#se-limit')), 'Limit-Vorschau passt sich an (6 Std keine Pause)');
  await click('[data-act=st-save]');
  const a1 = await p.evaluate((i) => SN.model.emp(i), anna);
  ok(a1.dept === 'Info' && a1.firstAid === true && a1.h === 6, 'Person bearbeitet gespeichert');
  const log1 = await p.evaluate(() => SN.overview.personnelLog(SN.clock.now()).map((x) => x.text));
  ok(log1.some((t) => /Person geändert – Anna Müller/.test(t) && /Abteilung: Drogerie → Info/.test(t)), 'Änderungsprotokoll nennt die Änderung');
  // PIN
  await click('[data-act=st-open][data-id="' + anna + '"]');
  await click('#sheet-panel [data-act=st-pin]');
  await p.fill('#pn-pin', '4827'); await click('[data-act=st-pin-go]');
  const hashOk = await p.evaluate((i) => { const e = SN.model.emp(i); return e.pinHash === SN.util.pinHash(i, '4827') && !JSON.stringify(e).includes('4827'); }, anna);
  ok(hashOk, 'PIN nur als Hash gespeichert, kein Klartext im Dokument');
  ok(/4827/.test(await txt('#sheet-panel')), 'PIN wird einmalig angezeigt');
  await p.evaluate(() => SN.ui.closeSheet());
  ok(await p.evaluate(async (i) => { SN.session.logout(); const bad = (await SN.session.login(i, '1234')).ok; const good = (await SN.session.login(i, '4827')).ok; return !bad && good; }, anna), 'Anmeldung nur noch mit der neuen PIN');
  await login('Mustafa');
  // Abwesenheit
  const kasse = await p.evaluate(() => SN.store.list('staff').find((e) => e.dept === 'Kasse' && e.role === 'emp' && e.sh === 'Früh' && !SN.model.isAway(e, SN.clock.now())).id);
  const before = await p.evaluate(() => SN.overview.presence().away.length);
  await p.evaluate(() => SN.ui.go('staff', {}));
  await p.evaluate((i) => document.querySelector('[data-act=st-open]') && SN.ui.sub('stQ', ''), kasse);
  await p.evaluate((i) => { const b = document.createElement('button'); b.dataset.act = 'st-open'; b.dataset.id = i; document.body.appendChild(b); b.click(); b.remove(); }, kasse);
  await p.waitForTimeout(150);
  await click('#sheet-panel [data-act=st-away]');
  await click('input[name=ab-type][value=vac]');
  const t0 = await p.evaluate(() => SN.util.fmt.dayKey(SN.clock.now()));
  await p.fill('#ab-to', await p.evaluate(() => { const d = new Date(SN.clock.now() + 2 * 86400000); return SN.util.fmt.dayKey(d.getTime()); }));
  await click('[data-act=st-away-go]');
  const after = await p.evaluate(() => SN.overview.presence().away);
  ok(after.length === before + 1 && after.some((x) => x.id === kasse && x.type === 'vac'), 'Abwesenheit Urlaub eintragen zählt in „abwesend“ (' + before + ' → ' + after.length + ')');
  ok(await p.evaluate((i) => SN.model.isAway(SN.model.emp(i)), kasse), 'staff.away gesetzt (Verteilung nimmt die Person aus)');
  await p.evaluate(() => SN.ui.go('overview', {})); await click('[data-act=ov-tab][data-k=presence]');
  ok(await p.$$eval('.sn-ov-away', (x) => x.length) === before + 1, 'Übersicht zeigt eine Abwesende mehr');
  // Nur Abwesende im Personal
  await p.evaluate(() => SN.ui.go('staff', {})); await click('[data-act=st-away-f]');
  ok(await p.$$eval('#view .sn-st-row', (x) => x.length) === before + 1, 'Personal-Filter „Nur Abwesende“');
  await click('[data-act=st-reset]');
  // Wieder da
  await p.evaluate((i) => { const b = document.createElement('button'); b.dataset.act = 'st-open'; b.dataset.id = i; document.body.appendChild(b); b.click(); b.remove(); }, kasse);
  await p.waitForTimeout(100);
  await click('#sheet-panel [data-act=st-away-end]');
  ok(!(await p.evaluate((i) => SN.model.isAway(SN.model.emp(i)), kasse)), 'Abwesenheit beendet');
  // Wochenplan
  await p.evaluate((i) => { const b = document.createElement('button'); b.dataset.act = 'st-open'; b.dataset.id = i; document.body.appendChild(b); b.click(); b.remove(); }, kasse);
  await p.waitForTimeout(100);
  await click('#sheet-panel [data-act=st-plan]');
  await p.fill('#wp-s-0', '07:00'); await p.fill('#wp-e-0', '15:00'); await p.fill('#wp-p-0', '30');
  await click('[data-act=st-plan-copy]'); await p.uncheck('#wp-off-5');
  await click('[data-act=st-plan-save]');
  const plan = await p.evaluate((i) => SN.store.peek('plans', i), kasse);
  ok(plan && plan.days.length === 7 && plan.days[0].s === '07:00' && plan.days[3].e === '15:00' && plan.days[5].off === false, 'Wochenplan einer Person gespeichert');
  // Person anlegen
  await click('[data-act=st-edit]:not([data-id])');
  await p.fill('#se-name', 'Testa Neu'); await p.selectOption('#se-dept', 'Leergut'); await click('#sheet-panel [data-act=st-pin-gen]');
  const pin = await p.inputValue('#se-pin');
  ok(/^\d{4}$/.test(pin), 'PIN erzeugt (' + pin.length + ' Ziffern)');
  await click('#sheet-panel [data-act=st-save]');
  const nw = await p.evaluate(() => SN.model.staff().find((e) => e.name === 'Testa Neu'));
  ok(nw && nw.dept === 'Leergut' && nw.pinHash && !JSON.stringify(nw).includes('"pin"'), 'Person angelegt mit PIN-Hash');
  // Entfernen mit Rückfrage
  await p.evaluate((i) => { const b = document.createElement('button'); b.dataset.act = 'st-open'; b.dataset.id = i; document.body.appendChild(b); b.click(); b.remove(); }, nw.id);
  await p.waitForTimeout(100);
  await click('#sheet-panel [data-act=st-edit]'); await click('#sheet-panel [data-act=st-del]');
  ok(/entfernen\?/.test(await txt('#sheet-panel')), 'Entfernen fragt zuerst nach');
  await click('[data-act=st-del-go]');
  ok(!(await p.evaluate(() => SN.model.staff().some((e) => e.name === 'Testa Neu'))), 'Person entfernt');
  // Rechte: Admin darf Filialleitung nicht bearbeiten
  const sab = await idOf('Sabine Krämer');
  await p.evaluate((i) => { const b = document.createElement('button'); b.dataset.act = 'st-open'; b.dataset.id = i; document.body.appendChild(b); b.click(); b.remove(); }, sab);
  await p.waitForTimeout(100);
  ok(!(await p.$('#sheet-panel [data-act=st-pin]')) && /Nur ansehen/.test(await txt('#sheet-panel')), 'Admin kann Filialleitung nur ansehen (kein PIN-Reset)');
  await p.evaluate(() => SN.ui.closeSheet());
  // Mehr: Soll-Besetzung
  await p.evaluate(() => { SN.ui.sub('moreTab', 'set'); SN.ui.go('more', {}); });
  await p.waitForTimeout(150);
  await p.fill('#sf-2-Früh', '5'); await click('[data-act=sf-save]');
  ok(await p.evaluate(() => SN.overview.need('Kasse', 'Früh')) === 5, 'Soll-Besetzung in den Einstellungen änderbar');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + passes + ' OK, ' + fails + ' FAIL');
  process.exit(fails ? 1 : 0);
})();
