/* ==========================================================================
   test/flows-lead.js – Steuerpult der Schichtleitung (Demo-Modus, feste Uhr)
   Schichtleiterin Julia Becker: Navigation, Ampel, Als Nächstes, Meldung nach
   oben, Rundgang, Team, Ruhiger Modus. Aufruf: node test/flows-lead.js
   ========================================================================== */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const DIST = 'file://' + path.resolve(__dirname, '../dist/index.html') + '?mode=demo';
let fails = 0;
const ok = (c, t) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + t); };
const act = (p, sel) => p.click(sel).then(() => p.waitForTimeout(150));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(DIST);
  await p.waitForFunction(() => document.documentElement.dataset.snReady === '1', null, { timeout: 15000 });
  await p.evaluate(() => SN.clock.set(SN.clock.now()));
  const id = (n) => p.evaluate((x) => SN.model.staff().find((e) => e.name === x).id, n);
  const julia = await id('Julia Becker'), anna = await id('Anna Müller');
  await p.evaluate(async (i) => { SN.session.logout(); await SN.session.login(i, '1234'); }, julia);
  await p.waitForTimeout(200);

  /* Navigation */
  const tabs = await p.$$eval('#nav [data-go]', (x) => x.map((e) => e.dataset.go));
  ok(JSON.stringify(tabs) === JSON.stringify(['cockpit', 'photo', 'inbox', 'chat', 'me']), 'Navigation: Steuerpult, Foto, Eingang, Chat, Ich (' + tabs.join(',') + ')');
  ok(await p.$eval('#nav [data-go=cockpit]', (e) => e.getAttribute('aria-current') === 'page'), 'Steuerpult ist die erste Fläche nach der Anmeldung');
  ok(await p.evaluate(() => !!SN.ui.views.team && SN.ui.views.team.show && SN.ui.views.team.show() === false), 'Team bleibt als verdeckte Ansicht erhalten');

  /* Ampel */
  const tiles = await p.$$eval('.sn-cp-tile', (x) => x.map((e) => ({ t: e.innerText, label: e.getAttribute('aria-label') })));
  ok(tiles.length === 10, '10 Prozessbereiche als Ampel');
  ok(tiles.every((t) => /In Ordnung|Beobachten|Handeln nötig/.test(t.t)), 'Jede Kachel nennt den Status als Wort (nicht nur Farbe)');
  const pillsHaveIcon = await p.$$eval('.sn-cp-tile .sn-cp-pill', (x) => x.every((e) => e.querySelector('svg')));
  ok(pillsHaveIcon, 'Jede Statusanzeige hat zusätzlich ein Symbol');

  /* Als Nächstes */
  const steps = await p.$$eval('.sn-cp-step', (x) => x.map((e) => ({ btn: !!e.querySelector('[data-act]'), h: e.getBoundingClientRect().height })));
  ok(steps.length >= 1 && steps.length <= 3 && steps.every((s) => s.btn), 'Als Nächstes: höchstens 3 Einträge, jeder mit Direkt-Aktion (' + steps.length + ')');
  const small = await p.$$eval('#view .sn-cp-step .sn-btn, #view .sn-cp-lagebtn, #view .sn-cp-chip, #view .sn-cp-tile, #view .sn-cp-person .sn-btn', (x) => x.filter((e) => e.getBoundingClientRect().height < 47.5).length);
  ok(small === 0, 'Alle Bedienelemente mindestens 48 px hoch');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'Keine horizontale Scrollbar bei 390 px');

  /* SOS erscheint ganz oben bei „Als Nächstes“, Direkt-Aktion funktioniert */
  const sos = await p.evaluate(async (a) => (await SN.comm.sos(a, 'accident', 'Kasse 3')).item.id, anna);
  await p.waitForTimeout(250);
  const first = await p.$eval('.sn-cp-step', (e) => ({ t: e.innerText, act: e.querySelector('[data-act]').dataset.act }));
  ok(first.act === 'sos-respond' && /SOS/.test(first.t), 'SOS steht bei „Als Nächstes“ an erster Stelle');
  await act(p, '.sn-cp-step [data-act=sos-respond]');
  ok(await p.evaluate(([i, j]) => !!(SN.comm.get(i).answers || {})[j], [sos, julia]), '1 Tap: „Hilfe kommt“ ist gesendet, Anna sieht es');
  await p.evaluate((i) => SN.comm.done(i, SN.session.id), sos);

  /* Lage-Update */
  await act(p, '[data-act=cp-lage][data-k=ok]');
  const l1 = await p.evaluate((j) => SN.lead.lastLage(j), julia);
  ok(l1 && l1.key === 'ok' && /noch nicht gesehen/.test(l1.state), 'Lage „Läuft alles“ mit 1 Tap gesendet, Zustand „noch nicht gesehen“');
  ok(/Zuletzt: Läuft alles/.test(await p.innerText('.sn-cp-last')), 'Steuerpult zeigt das letzte Lage-Update mit Zustand');
  await act(p, '[data-act=cp-lage][data-k=tight]');
  ok(await p.evaluate((j) => SN.lead.lastLage(j).item.kind === 'report', julia), 'Engpass geht als Meldung an die Filialleitung');
  await act(p, '[data-act=cp-lage][data-k=help]');
  ok(await p.isVisible('#sheet.is-open [data-act=cp-lage-go]'), '„Hilfe nötig“ fragt kurz nach (Fehlalarm vermeiden)');
  await p.fill('#cp-lage-note', 'Kasse dünn besetzt');
  await act(p, '[data-act=cp-lage-go]');
  const help = await p.evaluate((j) => SN.lead.lastLage(j).item, julia);
  ok(help.u && help.body === 'Kasse dünn besetzt' && help.up, 'Hilfe nötig: dringend, mit Text');
  const helpRec = await p.evaluate((i) => SN.comm.recipients(SN.comm.get(i)).map((x) => SN.model.emp(x).role), help.id);
  ok(helpRec.includes('fl') || helpRec.includes('sfl'), 'Empfänger: Filialleitung (' + helpRec.join(',') + ')');

  /* Meldung nach oben in 2 Taps */
  const before = await p.evaluate(() => SN.store.list('items').length);
  await act(p, '[data-act=cp-up][data-k=gap]');
  await act(p, '[data-act=cp-up-go]');
  const up = await p.evaluate((n) => SN.store.list('items').slice(n)[0] || SN.store.list('items').filter((i) => i.up && i.cat === 'gap')[0], before);
  ok(up && up.up && up.cat === 'gap' && up.kind === 'report', 'Meldung „Lücke“ in 2 Taps an die Filialleitung');
  ok(await p.evaluate(() => !document.querySelector('#sheet.is-open')), 'Sheet schließt nach dem Senden');
  ok(await p.isVisible('[data-act=cp-go][data-tab=photo]'), 'Foto-Bericht ist Teil der Schnellleiste');
  await act(p, '[data-act=cp-go][data-tab=photo]');
  ok(await p.evaluate(() => SN.ui.tab === 'photo'), 'Foto-Bericht öffnet die Fotoansicht');
  await act(p, '#nav [data-go=cockpit]');

  /* Ampel-Kachel → Details mit Direkt-Aktion */
  await act(p, '.sn-cp-tile[data-k=goods]');
  ok(await p.isVisible('#sheet.is-open [data-act=cp-go][data-tab=ware]'), 'Kachel Wareneingang: Detail mit „Tour planen“');
  await act(p, '#sheet [data-act=cp-go][data-tab=ware]');
  ok(await p.evaluate(() => SN.ui.tab === 'ware'), '2 Taps bis zur Lieferplanung');
  await p.evaluate(() => SN.ui.go('cockpit', {}));
  await p.waitForTimeout(150);

  /* Rundgang mit Mangel */
  await act(p, '.sn-cp-check[data-check=kasse] [data-act=cp-check-start]');
  const n = await p.$$eval('.sn-cp-check[data-check=kasse] .sn-cp-pt', (x) => x.length);
  ok(n === 4, 'Rundgang Kassenzone: 4 Punkte abzuhaken');
  const fin = '.sn-cp-check[data-check=kasse] [data-act=cp-check-finish]';
  ok(await p.getAttribute(fin, 'aria-disabled') === 'true' && /Noch 4 Punkte offen/.test(await p.innerText(fin)), 'Abschließen erst nach allen Punkten');
  for (const i of [0, 1, 3]) await act(p, '.sn-cp-check[data-check=kasse] [data-act=cp-pt][data-i="' + i + '"][data-s=ok]');
  await act(p, '.sn-cp-check[data-check=kasse] [data-act=cp-pt][data-i="2"][data-s=miss]');
  ok(/Wird als Meldung angelegt/.test(await p.innerText('.sn-cp-check[data-check=kasse] .sn-cp-pt--miss')), 'Mangel zeigt, was daraus wird');
  ok(await p.getAttribute('.sn-cp-check[data-check=kasse] [data-act=cp-pt][data-i="2"][data-s=miss]', 'aria-pressed') === 'true', 'Auswahl ist als Zustand gesetzt (nicht nur Farbe)');
  await act(p, fin);
  const chk = await p.evaluate(() => { const s = SN.lead.checkStatus('kasse'); return { state: s.state, misses: s.misses, res: SN.comm.get(s.run.id).checkResult }; });
  ok(chk.state === 'done' && chk.misses === 1 && chk.res.reports.length === 1, 'Rundgang abgeschlossen: 1 Mangel → 1 Meldung (Reinigung)');
  ok(/Erledigt \d\d:\d\d · 1 Mangel/.test(await p.innerText('.sn-cp-check[data-check=kasse]')), 'Zeitstempel und Ergebnis sichtbar');

  /* Mein Team: 1-Tap-Ruf */
  const rows = await p.$$eval('.sn-cp-person', (x) => x.length);
  ok(rows > 0 && rows <= 6, 'Mein Team kompakt (' + rows + ' Zeilen)');
  const target = await p.$eval('.sn-cp-person [data-act=cp-call]', (e) => e.dataset.id);
  await act(p, '.sn-cp-person [data-act=cp-call]');
  const call = await p.evaluate((t) => SN.store.list('items').filter((i) => i.kind === 'call' && i.personal && i.to.ids[0] === t)[0], target);
  ok(call && call.from === julia && call.need === 1, 'Ein Tap „Ruf“ erzeugt einen persönlichen Ruf');
  await act(p, '.sn-cp-person [data-act=p-task]');
  ok(await p.isVisible('#sheet.is-open #pt-title'), '„Auftrag“ öffnet den Auftragsdialog');
  await p.evaluate(() => SN.ui.closeSheet());

  /* Ruhiger Modus */
  const dm = await p.evaluate((a) => SN.comm.threadId.dm(a, SN.session.id), anna);
  await p.evaluate(([d, a]) => SN.comm.chatSend(d, a, { text: 'Hast du kurz Zeit?' }), [dm, anna]);
  await p.waitForTimeout(250);
  ok(await p.isVisible('#banners .sn-alert--info'), 'Normal: neue Chatnachricht zeigt ein Banner');
  await act(p, '[data-act=cp-quiet]');
  ok(await p.getAttribute('[data-act=cp-quiet]', 'aria-checked') === 'true', 'Ruhiger Modus an (Schalter mit Zustand)');
  ok(!(await p.isVisible('#banners .sn-alert--info')), 'Ruhig: Chat-Banner unterdrückt');
  ok(/Ruhig bis 14:00/.test(await p.innerText('.sn-cp-quiet')) && /Chat-Nachricht/.test(await p.innerText('.sn-cp-quiet')), 'Steuerpult sammelt still und zeigt „Ruhig bis 14:00“');
  await p.evaluate((a) => SN.comm.sos(a, 'theft', 'Eingang'), anna);
  await p.waitForTimeout(250);
  ok(await p.isVisible('#banners .sn-alert--sos'), 'Ruhig: SOS wird trotzdem angezeigt');
  const callId = await p.evaluate(async (a) => (await SN.comm.call(a, 'info', { ids: [SN.session.id] })).item.id, anna);
  await p.waitForTimeout(250);
  ok(await p.isVisible('#banners [data-act=call-yes]'), 'Ruhig: Ruf wird trotzdem angezeigt');
  await p.evaluate((c) => SN.comm.answerCall(c, SN.session.id, true), callId);
  const rep2 = await p.evaluate(async (a) => { const r = (await SN.comm.report(a, { cat: 'gap', body: 'x' })).item; return r.id; }, anna);
  await p.evaluate(async (r) => { SN.clock.advance(20 * 60000); SN.comm.escalateDue(); await SN.store.settle(); return r; }, rep2);
  await p.waitForTimeout(250);
  const escTo = await p.evaluate((r) => SN.comm.currentIds(SN.comm.get(r)), rep2);
  await p.evaluate(async (e) => { SN.session.logout(); await SN.session.login(e, '1234'); }, escTo[0]);
  await p.waitForTimeout(150);
  const mine = await p.evaluate(() => SN.model.isLead(SN.session.me()));
  ok(mine, 'Eskalationsstufe gehört einer Leitung');
  await p.evaluate(async (i) => { SN.session.logout(); await SN.session.login(i, '1234'); }, julia);
  await p.waitForTimeout(150);
  ok(await p.evaluate(() => SN.ui.quiet()), 'Ruhiger Modus gilt weiter für Julia (gleiches Gerät)');
  await act(p, '[data-act=cp-quiet]');
  ok(await p.getAttribute('[data-act=cp-quiet]', 'aria-checked') === 'false' && await p.isVisible('#banners .sn-alert'), 'Ruhiger Modus aus: Banner kommen wieder');
  ok(await p.evaluate(() => SN.lead.quiet.isOn(SN.session.id) === false), 'Zustand zurückgesetzt');

  /* Mitarbeitende sehen weiterhin Start, kein Steuerpult */
  await p.evaluate(async (i) => { SN.session.logout(); await SN.session.login(i, '1234'); }, anna);
  await p.waitForTimeout(150);
  const aTabs = await p.$$eval('#nav [data-go]', (x) => x.map((e) => e.dataset.go));
  ok(aTabs[0] === 'home' && !aTabs.includes('cockpit') && !(await p.evaluate(() => SN.ui.quiet())), 'Mitarbeitende: Start bleibt, kein Steuerpult, kein Ruhiger Modus');

  ok(errs.length === 0, 'Keine JS-Fehler' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log(fails ? '\n' + fails + ' Prüfung(en) fehlgeschlagen' : '\nAlles grün');
  process.exit(fails ? 1 : 0);
})();
