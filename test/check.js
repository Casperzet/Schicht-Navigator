/* ==========================================================================
   test/check.js – Build öffnen, jede Rolle anmelden, jede Ansicht und jeden
   Unter-Tab besuchen, hell und dunkel. Prüft: keine JS-/Konsolenfehler,
   keine horizontale Scrollbar bei 390 px, keine englischen Standardtexte.
   Aufruf: node test/check.js [--shots]
   ========================================================================== */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const FILE = 'file://' + path.resolve(__dirname, '../dist/index.html') + '?mode=demo';
const SHOTS = process.argv.includes('--shots');
const OUT = process.env.SHOT_DIR || path.resolve(__dirname, '../dist/shots');

// Je Rolle eine Person aus dem Demo-Datensatz
const ACCOUNTS = ['Anna Müller', 'Julia Becker', 'Katarina Novak', 'Mustafa', 'Niels', 'Sabine Krämer', 'Ivana Horvat'];

(async () => {
  if (SHOTS) require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  let views = 0;
  const problems = [];
  for (const scheme of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text()); });
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await p.goto(FILE);
    await p.waitForSelector('#lg-u', { timeout: 10000 });
    for (const name of ACCOUNTS) {
      const id = await p.evaluate((n) => (SN.model.staff().find((e) => e.name === n) || {}).id, name);
      if (!id) { problems.push('Konto fehlt: ' + name); continue; }
      await p.evaluate((i) => { SN.session.logout(); SN.session.login(i, '1234'); }, id);
      await p.waitForTimeout(80);
      const tabs = await p.$$eval('#nav [data-go]', (bs) => bs.map((x) => x.dataset.go));
      if (tabs.length > 5) problems.push(name + ': mehr als 5 Navigationsziele (' + tabs.join(', ') + ')');
      const extra = await p.evaluate(() => Object.values(SN.ui.views).filter((v) => v.groups.includes(SN.model.group(SN.session.me()))).map((v) => v.tab));
      for (const t of Array.from(new Set(tabs.concat(extra)))) {
        await p.evaluate((x) => SN.ui.go(x, {}), t);
        await p.waitForTimeout(40);
        views++;
        await checkPage(p, name + ' / ' + t, problems);
        if (SHOTS && scheme === 'light') await p.screenshot({ path: path.join(OUT, name.split(' ')[0] + '-' + t + '.png') });
        // Unter-Tabs (Segmente, Chips mit role=tab)
        const n = await p.$$eval('#view [role=tab]', (x) => x.length);
        for (let i = 0; i < Math.min(n, 8); i++) {
          await p.evaluate((k) => { const x = document.querySelectorAll('#view [role=tab]')[k]; if (x) x.click(); }, i);
          await p.waitForTimeout(40);
          views++;
          await checkPage(p, name + ' / ' + t + ' / Tab ' + (i + 1), problems);
        }
      }
      // Sheets öffnen und schließen
      for (const act of ['sos', 'call-sheet', 'send-sheet']) {
        const ok = await p.evaluate((a) => { const el = document.createElement('button'); el.dataset.act = a; el.hidden = true; document.body.appendChild(el); el.click(); el.remove(); return true; }, act);
        await p.waitForTimeout(60);
        if (ok) { views++; await checkPage(p, name + ' / Sheet ' + act, problems); await p.evaluate(() => SN.ui.closeSheet()); }
      }
      console.log('ok', scheme, name, tabs.join(','));
    }
    if (errs.length) problems.push(scheme + ': ' + Array.from(new Set(errs)).join(' | '));
    await p.close();
  }
  await b.close();
  if (problems.length) { console.error('FEHLER:\n- ' + problems.join('\n- ')); process.exit(1); }
  console.log('Alles grün:', views, 'Ansichten geprüft');
})();

async function checkPage(p, where, problems) {
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const txt = document.body.innerText;
    const english = (txt.match(/\b(Loading|Submit|Cancel|Error|undefined|NaN|null|\[object Object\])\b/g) || []);
    return { sw: de.scrollWidth, cw: de.clientWidth, english, broken: !!document.querySelector('#view .sn-alert[role=alert] .sn-alert__title') && /Ansicht hat einen Fehler/.test(txt) };
  });
  if (r.sw > r.cw + 1) problems.push(where + ': horizontale Scrollbar (' + r.sw + ' > ' + r.cw + ')');
  if (r.english.length) problems.push(where + ': verdächtige Texte ' + Array.from(new Set(r.english)).join(', '));
  if (r.broken) problems.push(where + ': Ansicht wirft Fehler');
}
