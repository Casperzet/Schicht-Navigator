/* ==========================================================================
   Lieferung – KKP · Paletten · Boxen → Personen → Touren mit Laufweg
   Schnell: Zähler + „Abteilungen je KKP“. Genau: je KKP Abteilungen antippen.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, O = SN.ops, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  const st = { kkp: 6, pal: 2, box: 4, avg: 4, exact: false, units: null, title: 'LKW Zentrallager' };
  const SHELF = M.DEPTS.filter((d) => !['Kasse', 'Info', 'Lager', 'Wareneinnahme', 'Leergut'].includes(d));

  function units() {
    if (st.exact && st.units) return st.units;
    return O.unitsFromCounts({ kkp: st.kkp, pal: st.pal, box: st.box, avg: st.avg }, SHELF);
  }
  const stepper = (k, label, sub, ic) => '<div class="sn-stepper"><span class="sn-stepper__icon" aria-hidden="true">' + icon(ic, 'sn-icon--lg') + '</span><span class="sn-stepper__text"><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></span>'
    + '<button type="button" class="sn-stepper__btn" data-act="gd-step" data-k="' + k + '" data-d="-1" aria-label="' + esc(label) + ' weniger">' + icon('minus') + '</button><output class="sn-stepper__val" aria-live="polite">' + st[k] + '</output>'
    + '<button type="button" class="sn-stepper__btn" data-act="gd-step" data-k="' + k + '" data-d="1" aria-label="' + esc(label) + ' mehr">' + icon('plus') + '</button></div>';

  function render({ me, now }) {
    const cfg = O.effortCfg();
    const us = units();
    const p = O.planDelivery(us, now);
    let h = '<section class="sn-card sn-goods"><h2 class="sn-section-title" style="margin-top:0"><span class="sn-inline">' + icon('truck') + 'Was ist angekommen?</span></h2>'
      + '<div class="sn-field"><label class="sn-label" for="gd-title">Lieferung</label><input class="sn-input" id="gd-title" value="' + esc(st.title) + '" data-change="gd-title"></div>'
      + stepper('kkp', 'KKP', cfg.kkp + ' Min + ' + cfg.kkpDept + ' je Abteilung', 'cart')
      + stepper('pal', 'Paletten', cfg.pal + ' Min je Palette', 'pallet')
      + stepper('box', 'Boxen', 'graue Kisten · ' + cfg.box + ' Min', 'box')
      + '<fieldset class="sn-choices sn-choices--row"><legend class="sn-label">Abteilungen je KKP (Ø)</legend>' + [1, 2, 3, 4, 5, 6].map((n) => '<label class="sn-choice"><input type="radio" name="gd-avg" value="' + n + '" data-change="gd-avg"' + (n === st.avg ? ' checked' : '') + '><span>' + n + '</span></label>').join('') + '</fieldset>'
      + '<label class="sn-switch">Jede KKP genau erfassen<input type="checkbox" role="switch" data-change="gd-exact"' + (st.exact ? ' checked' : '') + '></label></section>';

    if (st.exact) {
      h += '<h2 class="sn-section-title">KKP einzeln <small>Abteilungen antippen</small></h2>' + us.map((u, i) => u.type !== 'kkp' ? '' : '<div class="sn-card sn-kkp"><b class="sn-inline">' + icon('cart') + 'KKP ' + (i + 1) + '</b> <small class="sn-muted">' + (u.depts || []).length + ' Abteilungen · ' + O.unitMin(u, cfg) + ' Min</small><div class="sn-chips">'
        + SHELF.map((d) => '<button type="button" class="sn-chip ' + ((u.depts || []).includes(d) ? 'sn-chip--solid' : 'sn-chip--outline') + '" data-act="gd-dept" data-i="' + i + '" data-d="' + esc(d) + '">' + icon(M.DEPT_ICONS[d] || 'pin') + esc(d) + '</button>').join('') + '</div></div>').join('');
    }

    // Schema: Einheiten → Minuten → Personen
    const t = (k) => us.filter((u) => u.type === k);
    const tm = (k) => t(k).reduce((s, u) => s + O.unitMin(u, cfg), 0);
    h += '<section class="sn-card sn-schema" aria-label="Schema Aufwand und Personen">'
      + '<div class="sn-schema__row">' + ['kkp', 'pal', 'box'].map((k) => '<div class="sn-schema__cell"><span class="sn-schema__icon">' + icon(O.UNIT[k].icon, 'sn-icon--lg') + '</span><b>' + t(k).length + '</b><small>' + esc(O.UNIT[k].label + (k === 'box' ? 'en' : k === 'pal' ? 'n' : '')) + '</small><i>' + U.fmt.dur(tm(k)) + '</i></div>').join('') + '</div>'
      + '<div class="sn-schema__arrow" aria-hidden="true">' + icon('arrow-down') + '</div>'
      + '<div class="sn-schema__result"><div><b>' + U.fmt.dur(p.min) + '</b><small>Arbeit gesamt</small></div><div class="is-main"><b>' + p.people + '</b><small>' + (p.people === 1 ? 'Person' : 'Personen') + '</small></div><div><b>' + (p.duration ? 'ca. ' + U.fmt.dur(p.duration) : '–') + '</b><small>bis fertig</small></div></div>'
      + '<p class="sn-muted sn-small">' + (p.available < p.want ? 'Achtung: gebraucht ' + p.want + ', im Dienst und frei nur ' + p.available + ' – dauert länger. Hilfe über „Schnellruf“ holen.' : 'Ziel: in ca. ' + cfg.target + ' Min verräumt. Frei im Dienst: ' + p.available + '.') + '</p></section>';

    if (p.rounds.length) {
      h += '<h2 class="sn-section-title">Touren <small>Laufweg in Filial-Reihenfolge</small></h2>' + p.rounds.map((r, i) => '<div class="sn-card sn-route"><div class="sn-row sn-row--between"><b>Tour ' + (i + 1) + '</b><span class="sn-chip">' + U.fmt.dur(r.min) + '</span></div>'
        + '<p class="sn-small">' + r.units.map((u) => icon(O.UNIT[u.type].icon, 'sn-icon--sm') + ' ' + esc(O.UNIT[u.type].label)).join(' · ') + '</p>'
        + '<ol class="sn-route__path">' + r.depts.map((d) => '<li>' + icon(M.DEPT_ICONS[d] || 'pin', 'sn-icon--sm') + ' ' + esc(d) + '</li>').join('') + '</ol></div>').join('');
    }
    h += '<label class="sn-check"><input type="checkbox" id="gd-u"><span><span class="sn-inline">' + ui.urgent() + '</span> (Ware steht im Gang)</span></label>'
      + '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" data-act="gd-go">' + icon('users') + '<span>Anlegen und ' + p.people + ' Touren verteilen</span></button>';
    const tr = U.sortBy(SN.store.list('trucks').filter((x) => U.fmt.dayKey(x.at) === U.fmt.dayKey(now)), (x) => -x.at);
    if (tr.length) h += P.sec('Heute angekommen', tr.length) + tr.map((x) => '<div class="sn-card" style="padding:12px"><b class="sn-inline">' + icon('truck') + esc(x.title) + '</b><p class="sn-small">' + (x.kkp || 0) + ' KKP · ' + (x.pal || 0) + ' Paletten · ' + (x.box || 0) + ' Boxen · ' + U.fmt.dur(x.min || 0) + ' · ' + U.fmt.count(x.people || 0, 'Tour', 'Touren') + ' · ' + esc(U.fmt.time(x.at)) + '</p></div>').join('');
    return h;
  }

  ui.registerView('ware', { groups: ['lead', 'admin'], order: 70, render });
  ui.on('gd-step', (el) => { const k = el.dataset.k; st[k] = Math.max(0, Math.min(60, st[k] + +el.dataset.d)); st.units = null; if (st.exact) st.units = units0(); ui.render(true); });
  ui.onChange('gd-avg', (el) => { st.avg = +el.value; st.units = null; if (st.exact) st.units = units0(); ui.render(true); });
  ui.onChange('gd-title', (el) => { st.title = el.value; });
  ui.onChange('gd-exact', (el) => { st.exact = el.checked; st.units = el.checked ? units0() : null; ui.render(true); });
  function units0() { return O.unitsFromCounts({ kkp: st.kkp, pal: st.pal, box: st.box, avg: st.avg }, SHELF); }
  ui.on('gd-dept', (el) => {
    const u = st.units[+el.dataset.i]; const d = el.dataset.d;
    u.depts = (u.depts || []).includes(d) ? u.depts.filter((x) => x !== d) : (u.depts || []).concat(d).slice(0, 8);
    ui.render(true);
  });
  ui.on('gd-go', async (el) => {
    el.disabled = true;
    const r = await O.createDelivery(SN.session.id, st.title, units(), { u: !!ui.sheetVal('gd-u') });
    el.disabled = false;
    if (ui.result(r, r.ok ? r.tasks + ' Touren angelegt. ' + SN.dist.resultText(r.dist) : '')) { st.units = null; st.exact = false; }
  });
  SN.goodsOpen = () => ui.go('ware', {});
})(window.SN = window.SN || {});
