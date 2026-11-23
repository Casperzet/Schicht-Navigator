/* ==========================================================================
   Wochenplan – Arbeitstage, Lagerlast und Aufgaben je Person
   Oben: Mo–Sa mit Balken „Bedarf ↔ Kapazität“. Darunter der gewählte Tag als
   Zeitleiste (06–22 Uhr) je Person mit den verteilten Aufgaben.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, O = SN.ops, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  const H0 = 6, H1 = 22;
  const hrs = (m) => (m >= 120 ? Math.round(m / 60) + ' Std' : U.fmt.dur(m));
  const pos = (h) => ((h - H0) / (H1 - H0) * 100).toFixed(2) + '%';

  function render({ me, now, sub }) {
    const days = O.week(now);
    const todayKey = U.fmt.dayKey(now);
    const selKey = sub.wkDay || (days.find((d) => d.key === todayKey) || days[0]).key;
    const loads = days.map((d) => O.dayLoad(d));
    const L = loads.find((l) => l.day.key === selKey) || loads[0];
    const maxNeed = Math.max(1, ...loads.map((l) => l.need));
    let h = '<div class="sn-week-strip" role="tablist" aria-label="Wochentage">' + loads.map((l) => {
      const pct = l.need / maxNeed * 130; // relativ zum stärksten Tag der Woche
      const lvl = l.pct > 100 ? 'over' : l.pct > 80 || l.need === maxNeed ? 'warn' : 'ok';
      return '<button type="button" role="tab" aria-selected="' + (l.day.key === selKey) + '" class="sn-wday sn-wday--' + lvl + (l.day.key === todayKey ? ' is-today' : '') + '" data-act="wk-day" data-k="' + l.day.key + '">'
        + '<span class="sn-wday__d">' + esc(l.day.label) + '</span><span class="sn-wday__n">' + new Date(l.day.date).getDate() + '.</span>'
        + '<span class="sn-wday__bar" aria-hidden="true"><i style="height:' + Math.max(4, pct / 1.3) + '%"></i></span>'
        + '<span class="sn-wday__p">' + (l.need ? hrs(l.need) : '–') + '</span><span class="sn-wday__s">' + l.staff.length + ' 👤</span></button>';
    }).join('') + '</div>';

    const f = L.forecast || {};
    h += '<section class="sn-card sn-daycard"><div class="sn-row sn-row--between"><h2 class="sn-section-title" style="margin:0">' + esc(L.day.label + ', ' + U.fmt.date(L.day.date).split(', ')[1]) + '</h2>'
      + '<span class="sn-chip ' + (L.pct > 100 ? 'sn-chip--urgent' : L.pct > 80 ? 'sn-chip--warn' : 'sn-chip--ok') + '">' + (L.pct > 100 ? 'Überlastet' : L.pct > 80 ? 'Knapp' : 'Im Rahmen') + '</span></div>'
      + '<div class="sn-kpis"><div class="sn-kpi"><span class="sn-kpi__value">' + hrs(L.need) + '</span><span class="sn-kpi__label">Lager-Bedarf</span></div>'
      + '<div class="sn-kpi"><span class="sn-kpi__value">' + hrs(L.cap) + '</span><span class="sn-kpi__label">Kapazität (80 %)</span></div>'
      + '<div class="sn-kpi"><span class="sn-kpi__value">' + hrs(L.planned) + '</span><span class="sn-kpi__label">schon verteilt</span></div>'
      + '<div class="sn-kpi"><span class="sn-kpi__value">' + L.staff.length + '</span><span class="sn-kpi__label">eingeplant</span></div></div>'
      + '<p class="sn-small">Erwartet: ' + (f.kkp || 0) + ' KKP (Ø ' + (f.avg || 4) + ' Abt.) · ' + (f.pal || 0) + ' Paletten · ' + (f.box || 0) + ' Boxen</p>'
      + (M.isLead(me) ? '<div class="sn-row" style="gap:8px">' + P.btn('Lieferung erwarten', 'wk-fc', { k: L.day.key }, 'secondary', 'plus') + P.btn('Aufgaben verteilen', 'wk-dist', { k: L.day.key }, 'primary', 'users') + '</div>' : '')
      + '</section>';

    // Zeitleiste
    const tasks = SN.store.list('items').filter((it) => it.kind === 'task' && it.plannedFor === L.day.key);
    const staff = U.sortBy(L.staff, (e) => O.shiftOn(e, L.day.wd).s * 100 + e.name.charCodeAt(0));
    h += '<section class="sn-card sn-timeline-day"><div class="sn-tl-axis" aria-hidden="true">' + [6, 10, 14, 18, 22].map((x) => '<span style="left:' + pos(x) + '">' + String(x).padStart(2, '0') + '</span>').join('') + '</div>'
      + staff.map((e) => {
        const s = O.shiftOn(e, L.day.wd);
        const mine = tasks.filter((it) => it.owner === e.id);
        const used = mine.reduce((a, it) => a + (it.min || 0), 0), lim = SN.dist.limitOf(e);
        return '<div class="sn-tl-row' + (e.id === me.id ? ' is-me' : '') + '"><div class="sn-tl-name"><b>' + esc(e.name.split(' ')[0]) + ' ' + esc((e.name.split(' ')[1] || '').slice(0, 1)) + '.</b><small>' + esc(e.dept || '') + '</small></div>'
          + '<div class="sn-tl-track"><span class="sn-tl-shift sn-tl-shift--' + (e.sh === 'Spät' ? 'late' : 'early') + '" style="left:' + pos(s.s) + ';width:calc(' + pos(s.e) + ' - ' + pos(s.s) + ')"><i style="width:' + Math.min(100, lim ? used / lim * 100 : 0) + '%"></i></span></div>'
          + (mine.length ? '<div class="sn-tl-tasks">' + mine.map((it) => '<span class="sn-chip sn-chip--outline">' + esc(it.title.replace(/^Warenverräumung (\(KKP-Ware\) )?– /, '📦 ')) + ' · ' + it.min + '′</span>').join('') + '</div>' : '')
          + '</div>';
      }).join('') + (staff.length ? '' : P.empty('Niemand eingeplant')) + '<p class="sn-muted sn-small">Balken = Schicht · dunkle Füllung = verplante Zeit bis zum Limit (80 % der Arbeitszeit).</p></section>';
    return h;
  }

  ui.registerView('week', { groups: ['lead', 'admin', 'emp'], order: 75, render });
  ui.on('wk-day', (el) => ui.sub('wkDay', el.dataset.k));
  ui.on('wk-fc', (el) => {
    const f = O.forecast(el.dataset.k) || { kkp: 8, pal: 3, box: 6, avg: 4 };
    const n = (id, l, v) => '<div class="sn-field"><label class="sn-label" for="' + id + '">' + l + '</label><input class="sn-input" type="number" min="0" max="80" id="' + id + '" value="' + v + '" inputmode="numeric"></div>';
    ui.sheet('Erwartete Lieferung', '<div class="sn-filter">' + n('fc-kkp', '🛒 KKP', f.kkp || 0) + n('fc-pal', '🟫 Paletten', f.pal || 0) + n('fc-box', '📥 Boxen', f.box || 0) + '</div>' + n('fc-avg', 'Ø Abteilungen je KKP', f.avg || 4),
      P.btn('Speichern', 'wk-fc-save', { k: el.dataset.k }, 'primary', 'check'));
  });
  ui.on('wk-fc-save', async (el) => {
    const v = (id) => Math.max(0, parseInt(ui.sheetVal(id), 10) || 0);
    await O.setForecast(el.dataset.k, { kkp: v('fc-kkp'), pal: v('fc-pal'), box: v('fc-box'), avg: Math.min(6, Math.max(1, v('fc-avg') || 4)) });
    ui.toast('Prognose gespeichert'); ui.closeSheet();
  });
  ui.on('wk-dist', async (el) => {
    const day = O.week(SN.clock.now()).find((d) => d.key === el.dataset.k);
    const r = await O.distributeDay(SN.session.id, day);
    ui.result(r, r.ok ? r.made + ' Aufgaben verteilt' + (r.rest > 0 ? ' · ' + U.fmt.dur(r.rest) + ' passen nicht ins Limit' : '') : '');
  });
  SN.weekOpen = () => ui.go('week', {});
})(window.SN = window.SN || {});
