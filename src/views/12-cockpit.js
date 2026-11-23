/* ==========================================================================
   Steuerpult (Schichtleitung, Teamleitung) – ersetzt „Start“ für die Gruppe lead
   Reihenfolge: Als Nächstes → Nach oben melden → Ampel der Prozessbereiche →
   Rundgänge → Mein Team. Rechnen übernimmt SN.lead; hier nur Darstellung und Aktionen.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, L = SN.lead, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  const me = () => SN.session.me();
  const now = () => SN.clock.now();
  const R = ui.result;

  // Kurznamen und Symbole für die Schnellleiste „An Filialleitung melden“
  const UP = {
    gap: ['Lücke', 'package'], price: ['Preis', 'tag'], clean: ['Reinigung', 'broom'], defect: ['Defekt', 'wrench'], bottle: ['Leergut', 'recycle'],
    absence: ['Ausfall', 'user-x'], delivery: ['Lieferung', 'truck'], safety: ['Sicherheit', 'alert'], other: ['Sonstiges', 'chat'],
  };
  // Bereichsaktionen im Detail-Sheet (zusätzlich zu den Signalen)
  const AREA_ACTS = {
    goods: [['Lieferung planen', 'cp-go', { tab: 'ware' }, 'truck']],
    checkout: [['Hilfe rufen', 'call-sheet', {}, 'bell']],
    tasks: [['Neu verteilen', 'live-dist', {}, 'users']],
    staff: [['Team ansehen', 'cp-go', { tab: 'team' }, 'users']],
    reports: [['Eingang öffnen', 'cp-go', { tab: 'inbox' }, 'inbox']],
    clean: [['Reinigung melden', 'cp-up', { k: 'clean' }, 'broom']],
    shelf: [['Lücke melden', 'cp-up', { k: 'gap' }, 'package']],
  };

  const pill = (text, level, ic) => '<span class="sn-pill sn-cp-pill sn-cp-pill--' + level + '">' + (ic ? icon(ic) : '') + '<span>' + esc(text) + '</span></span>';
  const statusPill = (st) => pill(L.WORD[st], st, L.STATUS_ICON[st]);
  const quietOn = () => { const m = me(); return !!(m && M.isLead(m) && L.quiet.isOn(m.id, now())); };
  ui.quiet = quietOn; // Hook für shell.js: unterdrückt nicht-kritische Banner und Hinweise

  /* ---------- Bausteine --------------------------------------------------- */
  function head(m, t, amp) {
    const w = M.shiftWindow(m, t);
    const q = quietOn(), qs = L.quiet.get(m.id, t);
    const c = amp.counts;
    let h = '<section class="sn-card sn-glass sn-cp-glass sn-cp-head"><div class="sn-cp-head__row"><div><p class="sn-cp-head__title">' + esc((M.currentShift(t) || m.sh) + 'schicht') + (w ? ' · ' + U.fmt.time(w.s) + '–' + U.fmt.time(w.e) : '') + '</p>'
      + '<p class="sn-muted sn-small">Lage der Filiale um ' + U.fmt.time(t) + '</p></div>'
      + '<button type="button" class="sn-cp-switch" role="switch" aria-checked="' + q + '" data-act="cp-quiet">' + icon(q ? 'moon' : 'bell') + '<span>Ruhiger Modus<small>' + (q ? 'an' : 'aus') + '</small></span></button></div>'
      + '<div class="sn-cp-head__stats" role="list" aria-label="Zusammenfassung der Bereiche">'
      + '<span role="listitem">' + pill(c.crit + ' Handeln nötig', 'crit', L.STATUS_ICON.crit) + '</span><span role="listitem">' + pill(c.warn + ' Beobachten', 'warn', L.STATUS_ICON.warn) + '</span><span role="listitem">' + pill(c.ok + ' In Ordnung', 'ok', L.STATUS_ICON.ok) + '</span></div>';
    if (q && qs) {
      const col = L.quiet.collected(m, t);
      h += '<p class="sn-cp-quiet">' + icon('moon') + '<span>Ruhig bis ' + U.fmt.time(qs.until) + '. Nur Notfall, Eskalation an dich und Rufe melden sich. Still gesammelt: '
        + esc(U.fmt.count(col.chat, 'Chat-Nachricht', 'Chat-Nachrichten') + ', ' + U.fmt.count(col.items, 'neuer Vorgang', 'neue Vorgänge')) + '.</span></p>';
    }
    return h + '</section>';
  }

  function nextList(m, t, amp) {
    const list = L.next(m, t, 3, amp);
    let h = P.sec('Als Nächstes', list.length ? list.length + ' von der Liste' : '');
    if (!list.length) return h + P.empty('Gerade nichts Dringendes', 'Neue Aufgaben erscheinen hier sofort.', true);
    return h + '<ol class="sn-cp-next">' + list.map((n, i) => '<li class="sn-card sn-glass sn-cp-glass sn-cp-step sn-cp-step--' + n.level + '"><span class="sn-iconbadge sn-cp-iconbadge" aria-hidden="true">' + icon(n.icon || 'flag') + '</span>'
      + '<div class="sn-cp-step__text"><p class="sn-cp-step__title"><span class="sn-cp-step__no">' + (i + 1) + '.</span> ' + esc(n.title) + '</p><p class="sn-muted sn-small">' + esc(n.sub || '') + '</p></div>'
      + P.btn(n.label, n.act, n.data || {}, i === 0 ? 'primary' : 'secondary') + '</li>').join('') + '</ol>';
  }

  function upBlock(m, t) {
    const last = L.lastLage(m.id, t);
    const to = M.labelFor(L.upTargets(m.id, t));
    return P.sec('An Filialleitung melden', to)
      + '<section class="sn-card sn-glass sn-cp-glass sn-cp-up"><p class="sn-label">Lage jetzt <small class="sn-muted">(ein Tap)</small></p>'
      + '<div class="sn-cp-lage" role="group" aria-label="Lage-Update">' + Object.values(L.LAGE).map((l) => '<button type="button" class="sn-cp-lagebtn sn-cp-lagebtn--' + l.key + '" data-act="cp-lage" data-k="' + l.key + '">' + icon(l.icon) + '<span>' + esc(l.label) + '</span></button>').join('') + '</div>'
      + (last ? '<p class="sn-small sn-cp-last">' + icon('clock') + '<span>Zuletzt: <b>' + esc(last.text) + '</b> um ' + U.fmt.time(last.item.createdAt) + ' · ' + esc(last.state) + '</span></p>' : '<p class="sn-muted sn-small">In dieser Schicht noch kein Lage-Update gesendet.</p>')
      + '<p class="sn-label">Meldung <small class="sn-muted">(Kategorie, dann senden)</small></p>'
      + '<div class="sn-cp-strip" role="group" aria-label="Kategorie wählen">'
      + '<button type="button" class="sn-cp-chip sn-cp-chip--photo" data-act="cp-go" data-tab="photo">' + icon('camera') + '<span>Foto-Bericht</span></button>'
      + M.REPORT_CATS.map((c) => '<button type="button" class="sn-cp-chip" data-act="cp-up" data-k="' + c.key + '">' + icon((UP[c.key] || UP.other)[1]) + '<span>' + esc((UP[c.key] || UP.other)[0]) + '</span></button>').join('')
      + '</div></section>';
  }

  function tile(a) {
    return '<button type="button" class="sn-card sn-glass sn-cp-glass sn-cp-tile sn-cp-tile--' + a.status + '" data-act="cp-area" data-k="' + a.key + '" aria-label="' + esc(a.label + ': ' + a.word + '. ' + a.reason) + '">'
      + '<span class="sn-cp-tile__top"><span class="sn-iconbadge sn-cp-iconbadge" aria-hidden="true">' + icon(a.icon) + '</span>' + statusPill(a.status) + '</span>'
      + '<span class="sn-cp-tile__name">' + esc(a.label) + '</span><span class="sn-cp-tile__reason">' + esc(a.reason) + '</span></button>';
  }
  const ampelBlock = (amp) => P.sec('Prozesse der Schicht', amp.areas.length) + '<div class="sn-cp-grid">' + U.sortBy(amp.areas.map((a, i) => [a, i]), ([a, i]) => -L.LV[a.status] * 100 + i).map(([a]) => tile(a)).join('') + '</div>';

  /* ---------- Rundgänge ---------------------------------------------------- */
  function checkRow(key, t, openId) {
    const s = L.checkStatus(key, t), def = L.CHECKS[key];
    const state = s.state === 'done' ? pill('Erledigt ' + U.fmt.time(s.doneAt) + (s.misses ? ' · ' + U.fmt.count(s.misses, 'Mangel', 'Mängel') : ' · ohne Mängel'), s.misses ? 'warn' : 'ok', s.misses ? 'alert' : 'check-circle')
      : s.state === 'running' ? pill('Läuft', 'warn', 'play') : s.state === 'due' ? pill('Fällig seit ' + U.fmt.time(s.dueAt), 'crit', 'flame')
        : s.state === 'open' ? pill('Bis ' + U.fmt.time(s.dueAt), 'ok', 'clock') : pill('Außerhalb der Schicht', 'ok', 'clock');
    const expanded = s.run && !s.run.doneAt;
    let h = '<article class="sn-card sn-glass sn-cp-glass sn-cp-check" data-check="' + key + '"><div class="sn-cp-check__row"><span class="sn-iconbadge sn-cp-iconbadge" aria-hidden="true">' + icon(def.icon) + '</span>'
      + '<div class="sn-cp-check__text"><p class="sn-cp-check__title">' + esc(def.label) + '</p>' + state + '</div>'
      + (expanded ? '' : P.btn(s.state === 'done' ? 'Nochmal' : 'Starten', 'cp-check-start', { k: key }, s.state === 'due' ? 'primary' : 'secondary', 'play')) + '</div>';
    if (expanded) {
      const open = s.run.checklist.filter((p) => !p.done && !p.miss).length;
      h += '<ul class="sn-cp-points">' + s.run.checklist.map((p, i) => {
        const pt = def.points[p.k];
        const st = p.miss ? 'miss' : p.done ? 'ok' : 'open';
        return '<li class="sn-cp-pt sn-cp-pt--' + st + '"><p class="sn-cp-pt__text">' + esc(p.text) + (p.at ? ' <small class="sn-muted">' + U.fmt.time(p.at) + '</small>' : '') + '</p>'
          + '<div class="sn-cp-pt__btns" role="group" aria-label="' + esc(p.text) + '">'
          + '<button type="button" class="sn-cp-opt sn-cp-opt--ok" aria-pressed="' + (st === 'ok') + '" data-act="cp-pt" data-id="' + s.run.id + '" data-i="' + i + '" data-s="ok">' + icon('check') + '<span>In Ordnung</span></button>'
          + '<button type="button" class="sn-cp-opt sn-cp-opt--miss" aria-pressed="' + (st === 'miss') + '" data-act="cp-pt" data-id="' + s.run.id + '" data-i="' + i + '" data-s="miss">' + icon('alert') + '<span>Mangel</span></button></div>'
          + (st === 'miss' && pt ? '<p class="sn-small sn-cp-pt__fix">' + icon(pt.type === 'report' ? 'report' : 'tasks') + '<span>Wird als ' + (pt.type === 'report' ? 'Meldung' : 'Auftrag') + ' angelegt: ' + esc(pt.fix) + '</span></p>' : '') + '</li>';
      }).join('') + '</ul>'
        + '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" data-act="cp-check-finish" data-id="' + s.run.id + '"' + (open ? ' aria-disabled="true"' : '') + '>' + icon('check') + '<span>' + (open ? 'Noch ' + U.fmt.count(open, 'Punkt', 'Punkte') + ' offen' : 'Rundgang abschließen') + '</span></button>';
    }
    return h + '</article>';
  }
  const checksBlock = (t) => P.sec('Rundgänge', M.currentShift(t) || '') + L.CHECK_ORDER.map((k) => checkRow(k, t)).join('')
    + '<p class="sn-muted sn-small">Jeder Mangel wird beim Abschließen automatisch zum Auftrag oder zur Meldung an die richtige Stelle.</p>';

  /* ---------- Mein Team ------------------------------------------------------ */
  function teamBlock(m, t, sub) {
    const tm = L.teamList(m, t);
    const all = !!sub.cpTeamAll, rows = all ? tm.rows : tm.rows.slice(0, 6);
    const WORDS = { free: 'Frei', work: 'Arbeitet', pause: 'Pause', away: 'Abwesend', off: 'Nicht im Dienst' };
    const ICONS = { free: 'check-circle', work: 'play', pause: 'coffee', away: 'user-x', off: 'clock' };
    let h = P.sec('Mein Team', tm.rows.length) + '<div class="sn-cp-head__stats" role="list">'
      + '<span role="listitem">' + pill(tm.counts.free + ' frei', 'ok', 'check-circle') + '</span><span role="listitem">' + pill(tm.counts.work + ' arbeiten', 'warn', 'play') + '</span><span role="listitem">' + pill(tm.counts.pause + ' Pause', 'ok', 'coffee') + '</span></div>';
    if (!tm.rows.length) return h + P.empty('Niemand im Dienst', 'In deinem Bereich ist gerade niemand eingeplant.');
    h += rows.map((r) => '<article class="sn-card sn-glass sn-cp-glass sn-cp-person" data-emp="' + r.emp.id + '"><span class="sn-avatar">' + esc(P.initials(r.emp.name)) + '</span>'
      + '<div class="sn-cp-person__text"><p><b>' + esc(r.emp.name) + '</b></p><p class="sn-small sn-muted">' + icon(ICONS[r.key] || 'clock') + '<b>' + WORDS[r.key] + '</b> · ' + esc(M.deptOf(r.emp, t) || '') + '</p>'
      + (r.key === 'work' ? '<p class="sn-small sn-muted sn-cp-ellip">' + esc(r.text) + '</p>' : '') + '</div>'
      + '<div class="sn-cp-person__btns">' + P.btn('Auftrag', 'p-task', { id: r.emp.id }, 'secondary', 'plus') + P.btn('Ruf', 'cp-call', { id: r.emp.id }, 'secondary', 'bell') + '</div></article>').join('');
    if (tm.rows.length > 6) h += P.btn(all ? 'Weniger anzeigen' : 'Alle ' + tm.rows.length + ' anzeigen', 'cp-team-all', {}, 'ghost', 'users');
    return h + P.btn('Neu verteilen', 'live-dist', {}, 'ghost', 'users');
  }

  /* ---------- Ansicht -------------------------------------------------------- */
  function render({ me: m, now: t, sub }) {
    const amp = L.ampel(t, { me: m });
    return head(m, t, amp) + nextList(m, t, amp) + upBlock(m, t) + ampelBlock(amp) + checksBlock(t) + teamBlock(m, t, sub);
  }

  ui.registerView('cockpit', {
    label: 'Steuerpult', icon: 'chart', groups: ['lead'], order: 10, render,
    badge: (m) => { const n = L.ampel(SN.clock.now(), { me: m }).counts.crit; return n ? { n, urgent: true } : 0; },
    fab: () => ({ label: 'Senden', icon: 'send', act: 'send-sheet' }),
  });

  /* ---------- Aktionen --------------------------------------------------------- */
  ui.on('cp-go', (el) => ui.go(el.dataset.tab, {}));
  ui.on('cp-team-all', () => ui.sub('cpTeamAll', !ui.sub('cpTeamAll')));
  ui.on('cp-quiet', () => {
    const m = me(), on = !quietOn();
    L.quiet.set(m.id, on, now());
    ui.render(true);
    ui.toast(on ? 'Ruhiger Modus an: nur Notfall, Eskalation an dich und Rufe' : 'Ruhiger Modus aus');
  });

  ui.on('cp-area', (el) => {
    const amp = L.ampel(now(), { me: me() });
    const a = amp.areas.find((x) => x.key === el.dataset.k);
    if (!a) return;
    const def = L.AREA[a.key];
    const acts = (AREA_ACTS[a.key] || []).map((x) => P.btn(x[0], x[1], x[2], 'secondary', x[3]))
      .concat((def.checks || []).map((k) => P.btn('Rundgang ' + L.CHECKS[k].label, 'cp-check-start', { k }, 'secondary', 'clipboard')));
    ui.sheet(a.label, '<p>' + statusPill(a.status) + '</p>'
      + (a.signals.length ? '<ul class="sn-cp-signals">' + a.signals.map((s) => '<li class="sn-cp-signal">' + pill(L.WORD[s.level], s.level, L.STATUS_ICON[s.level]) + '<p>' + esc(s.text) + '</p>'
        + (s.act ? P.btn(s.label || 'Ansehen', s.act, s.data || {}, 'primary') : '') + '</li>').join('') + '</ul>' : P.empty('Alles ruhig', 'Hier ist gerade nichts offen.', true)),
    acts.length ? '<div class="sn-cp-foot">' + acts.join('') + '</div>' : '');
  });

  /* Lage-Update: ein Tap; „Hilfe nötig“ mit kurzer Bestätigung (wie SOS gegen Fehlalarm) */
  ui.on('cp-lage', async (el) => {
    if (el.dataset.k === 'help') {
      return ui.sheet('Hilfe nötig', '<p>Geht dringend an die Filialleitung und den Admin vom Dienst. Du siehst, wer reagiert.</p><div class="sn-field"><label class="sn-label" for="cp-lage-note">Was fehlt? (optional)</label><input class="sn-input" id="cp-lage-note" placeholder="z. B. 3 Leute an der Kasse fehlen"></div>',
        P.btn('Jetzt senden', 'cp-lage-go', { k: 'help' }, 'primary', 'sos'));
    }
    R(await L.sendLage(me().id, el.dataset.k, ''), 'Lage gesendet: ' + L.LAGE[el.dataset.k].label);
  });
  ui.on('cp-lage-go', async (el) => {
    const r = await L.sendLage(me().id, el.dataset.k, String(ui.sheetVal('cp-lage-note') || '').trim());
    if (R(r, 'Hilfe angefordert – du siehst, wer reagiert')) ui.closeSheet();
  });

  /* Meldung nach oben: Kategorie → (Text) → Senden */
  ui.on('cp-up', (el) => {
    const c = M.CAT[el.dataset.k];
    if (!c) return;
    ui.sheet('An Filialleitung: ' + (UP[c.key] || UP.other)[0], '<p class="sn-muted">Geht direkt an ' + esc(M.labelFor(L.upTargets(me().id, now()))) + '. Du siehst, wann es gesehen wird.</p>'
      + '<div class="sn-field"><label class="sn-label" for="cp-up-text">Kurz dazu (optional)</label><input class="sn-input" id="cp-up-text" placeholder="z. B. Gang 7, Aktion steht nicht"></div>'
      + '<label class="sn-check"><input type="checkbox" id="cp-up-u">' + icon('flame') + ' Dringend</label>',
    P.btn('An Filialleitung senden', 'cp-up-go', { k: c.key }, 'primary', 'send'));
  });
  ui.on('cp-up-go', async (el) => {
    const r = await L.reportUp(me().id, el.dataset.k, { body: String(ui.sheetVal('cp-up-text') || '').trim(), u: !!ui.sheetVal('cp-up-u') });
    if (R(r, 'Gesendet – du siehst, wann es gesehen wird')) ui.closeSheet();
  });

  /* Rundgänge */
  ui.on('cp-check-start', async (el) => { const r = await L.startCheck(el.dataset.k, me().id); if (R(r)) { ui.go('cockpit', {}); } });
  ui.on('cp-pt', async (el) => {
    const it = C.get(el.dataset.id), i = +el.dataset.i;
    const cur = it && it.checklist[i];
    const s = cur && ((el.dataset.s === 'ok' && cur.done) || (el.dataset.s === 'miss' && cur.miss)) ? 'open' : el.dataset.s;
    R(await L.markPoint(el.dataset.id, me().id, i, s));
  });
  ui.on('cp-check-finish', async (el) => {
    if (el.getAttribute('aria-disabled') === 'true') return ui.toast('Bitte erst alle Punkte beantworten.', 'warn');
    const r = await L.finishCheck(el.dataset.id, me().id);
    if (!R(r)) return;
    ui.toast(r.misses ? U.fmt.count(r.misses, 'Mangel', 'Mängel') + ': ' + U.fmt.count(r.tasks.length, 'Auftrag', 'Aufträge') + ' und ' + U.fmt.count(r.reports.length, 'Meldung', 'Meldungen') + ' angelegt' : 'Rundgang ohne Mängel abgeschlossen');
  });

  /* Team */
  ui.on('cp-call', async (el) => R(await L.callPerson(me().id, el.dataset.id, ''), 'Ruf an ' + M.first(el.dataset.id) + ' gesendet – du siehst die Antwort'));

  /* Schichtübergabe */
  ui.on('cp-handover', () => {
    const m = me(), t = now(), h = L.handoverState(m, t);
    ui.sheet('Schichtübergabe', '<p>Automatisch dabei: ' + esc(C.handoverSummary(h.shift || m.sh, t).text) + '</p><div class="sn-field"><label class="sn-label" for="cp-ho-notes">Hinweise für die nächste Schicht</label><textarea class="sn-textarea" id="cp-ho-notes" rows="3" placeholder="z. B. Kühlregal 3 tropft, Techniker kommt 15 Uhr"></textarea></div>',
      P.btn('Übergabe senden', 'cp-ho-go', {}, 'primary', 'send'));
  });
  ui.on('cp-ho-go', async () => {
    const r = await C.sendHandover(me().id, { notes: String(ui.sheetVal('cp-ho-notes') || '').trim() });
    if (R(r, 'Übergabe gesendet – die nächste Schicht muss quittieren')) ui.closeSheet();
  });
})(window.SN = window.SN || {});
