/* ==========================================================================
   Übersicht (Filialleitung, Admin) – erste Registerkarte
   Teil 1 „Meldungen“: Kennzahlen, Verlauf der letzten Stunden, Filter, Sammel-Liste
          aller Vorgänge mit Zustand, „Wartet auf …“ und Direktaktionen.
   Teil 2 „Anwesenheit“: wer ist im Dienst, wer fehlt (nur hier mit Grund),
          Besetzung je Abteilung gegen Soll, Pausen-Hinweise, Früh/Spät, Wochentag.
   Keine Ranglisten, keine Leistungsvergleiche von Personen.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, O = SN.overview, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  const LIMIT = 15;
  const DEPT_ICON = {
    'Trocken sortiment': 'dept-trocken', 'Getränkeabteilung': 'dept-getraenke', 'Kasse': 'dept-kasse', 'Info': 'dept-info', 'MoPro': 'dept-mopro',
    'Moon Food Abteilung': 'dept-moon', 'Alkoholische Getränke': 'dept-alkohol', 'Drogerie': 'dept-drogerie', 'Fertige Gerichte': 'dept-fertig',
    'Konserven': 'dept-konserven', 'Obst und Gemüse': 'dept-obst', 'Backshop und Frischetheke': 'dept-backshop', 'Lager': 'dept-lager',
    'Wareneinnahme': 'dept-wareneingang', 'Leergut': 'dept-leergut',
  };
  const tab = (sub) => sub.ovTab || 'items';

  /* ---------- Teil 1: Meldungen ------------------------------------------- */
  function kpi(k, value, label, opts) {
    opts = opts || {};
    const on = opts.on;
    return '<button type="button" class="sn-kpi sn-ov-kpi' + (opts.alert && value ? ' sn-kpi--alert' : '') + (opts.wide ? ' sn-ov-kpi--wide' : '') + '" data-act="ov-view" data-k="' + k + '" aria-pressed="' + (!!on) + '">'
      + '<span class="sn-ov-kpi__top">' + icon(opts.icon || 'inbox') + '<span class="sn-kpi__value">' + value + '</span></span>'
      + '<span class="sn-kpi__label">' + esc(label) + '</span>' + (opts.hint ? '<span class="sn-ov-kpi__hint">' + esc(opts.hint) + '</span>' : '') + '</button>';
  }

  function chart(now) {
    const h = O.hourly(now, 8);
    const max = Math.max(1, ...h.map((x) => x.total));
    const total = h.reduce((s, x) => s + x.total, 0);
    return '<section class="sn-card sn-ov-chart" aria-labelledby="ov-ch"><div class="sn-row sn-row--between"><h3 class="sn-ov-h" id="ov-ch">Neue Vorgänge je Stunde</h3><span class="sn-muted sn-small">' + esc(U.fmt.count(total, 'Vorgang', 'Vorgänge')) + ' in 8 Std</span></div>'
      + '<div class="sn-ov-bars" role="img" aria-label="' + esc(h.map((x) => x.hour + ' Uhr: ' + x.total).join(', ')) + '">'
      + h.map((x, i) => '<div class="sn-ov-bar' + (i === h.length - 1 ? ' is-now' : '') + '"><span class="sn-ov-bar__n">' + (x.total || '') + '</span><span class="sn-ov-bar__col">'
        + (x.open ? '<i class="sn-ov-bar__open" style="height:' + Math.round(x.open / max * 100) + '%"></i>' : '') + (x.done ? '<i class="sn-ov-bar__done" style="height:' + Math.round(x.done / max * 100) + '%"></i>' : '')
        + '</span><span class="sn-ov-bar__h">' + x.hour + '</span></div>').join('') + '</div>'
      + '<p class="sn-ov-legend"><span class="sn-ov-key sn-ov-key--open"></span>offen <span class="sn-ov-key sn-ov-key--done"></span>erledigt oder gesehen <span class="sn-muted">· Uhrzeit unten</span></p></section>';
  }

  function itemActions(it, me) {
    if (C.isFinal(it)) return P.btn('Ansehen', 'it-open', { id: it.id }, 'ghost', 'eye');
    const a = [];
    const waiting = O.isWaiting(it);
    switch (it.kind) {
      case 'report': case 'absence':
        if (it.state !== 'taken') a.push(P.btn('Übernehmen', 'it-take', { id: it.id }, 'primary', 'check'));
        else if (it.owner === me.id) a.push(P.btn('Erledigt', 'it-done', { id: it.id }, 'primary', 'check'));
        a.push(P.btn('Weitergeben', 'it-forward', { id: it.id }, 'secondary', 'forward'));
        a.push(P.btn('Antworten', 'it-open', { id: it.id }, 'secondary', 'chat'));
        if (waiting) a.push(P.btn('Nachfassen', 'it-remind', { id: it.id }, 'ghost', 'bell'));
        break;
      case 'photo':
        a.push(P.btn('Foto ansehen', 'ph-open', { id: it.id }, 'primary', 'image'));
        a.push(P.btn('Antworten', 'it-open', { id: it.id }, 'secondary', 'chat'));
        a.push(P.btn('Nachfassen', 'it-remind', { id: it.id }, 'ghost', 'bell'));
        break;
      case 'sos':
        if (it.from !== me.id && !(it.answers || {})[me.id]) a.push(P.btn('Hilfe kommt, ich gehe hin', 'sos-respond', { id: it.id }, 'primary', 'run'));
        a.push(P.btn('Ansehen', 'it-open', { id: it.id }, 'secondary', 'eye'));
        break;
      case 'call':
        a.push(P.btn('Nachfassen', 'it-remind', { id: it.id }, 'primary', 'bell'));
        a.push(P.btn('Ansehen', 'it-open', { id: it.id }, 'secondary', 'eye'));
        a.push(P.btn('Schließen', 'it-close', { id: it.id }, 'ghost'));
        break;
      default: // Anweisung, Übergabe
        a.push(P.btn('Nachfassen', 'it-remind', { id: it.id }, 'primary', 'bell'));
        a.push(P.btn(it.kind === 'post' ? 'Wer fehlt?' : 'Ansehen', 'it-open', { id: it.id }, 'secondary', 'eye'));
    }
    return a.join('');
  }

  function itemsTab({ me, now, sub }) {
    const staleMin = sub.ovStale || 10;
    const view = sub.ovView || 'open';
    const f = { view, kind: sub.ovKind || '', dept: sub.ovDept || '', shift: sub.ovShift || '', urgent: !!sub.ovUrgent, staleMin };
    const s = O.stats(now, { staleMin });
    const list = O.filter(f, now);
    const limit = sub.ovLimit || LIMIT;
    const filtered = view !== 'open' || f.kind || f.dept || f.shift || f.urgent;
    let h = '<div class="sn-kpis sn-ov-kpis">'
      + kpi('open', s.open, 'Offen', { on: view === 'open', icon: 'inbox' })
      + kpi('esc', s.escalated, 'Eskaliert', { on: view === 'esc', icon: 'escalate', alert: true })
      + kpi('unseen', s.unseenPhotos, 'Ungesehene Fotoberichte', { on: view === 'unseen', icon: 'camera', alert: true })
      + kpi('stale', s.stale, 'Unbeantwortet', { on: view === 'stale', icon: 'clock', hint: 'seit mehr als ' + staleMin + ' Min', alert: true })
      + kpi('done', s.doneToday, 'Heute erledigt', { on: view === 'done', icon: 'check-circle', wide: true }) + '</div>';
    h += chart(now);
    // Filter
    h += P.sec('Filter')
      + '<div class="sn-chips sn-chips--scroll" role="group" aria-label="Art">' + [['', 'Alle Arten']].concat(O.KINDS).map(([k, l]) => '<button type="button" class="sn-chip ' + ((f.kind || '') === k ? 'sn-chip--solid' : 'sn-chip--outline') + '" aria-pressed="' + ((f.kind || '') === k) + '" data-act="ov-kind" data-k="' + k + '">' + esc(l) + '</button>').join('') + '</div>'
      + '<div class="sn-filter"><div><label class="sn-label sn-sr-only" for="ov-dept">Abteilung</label><select class="sn-select" id="ov-dept" data-change="ov-dept"><option value="">Alle Abteilungen</option>' + M.DEPTS.map((d) => '<option value="' + esc(d) + '"' + (d === f.dept ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select></div>'
      + '<button type="button" class="sn-chip ' + (f.urgent ? 'sn-chip--solid' : 'sn-chip--outline') + ' sn-ov-urgent" aria-pressed="' + f.urgent + '" data-act="ov-urgent">' + icon('flame') + 'Dringend</button></div>'
      + '<div class="sn-segment" role="group" aria-label="Schicht">' + [['', 'Alle'], ['Früh', 'Früh'], ['Spät', 'Spät']].map(([k, l]) => '<button type="button" class="sn-segment__tab" aria-pressed="' + ((f.shift || '') === k) + '" data-act="ov-shift" data-k="' + k + '">' + esc(l) + '</button>').join('') + '</div>'
      + '<div class="sn-row sn-ov-stale"><span class="sn-small">Unbeantwortet ab</span>' + O.STALE_CHOICES.map((m) => '<button type="button" class="sn-chip ' + (m === staleMin ? 'sn-chip--solid' : 'sn-chip--outline') + '" aria-pressed="' + (m === staleMin) + '" data-act="ov-stale" data-k="' + m + '">' + m + ' Min</button>').join('') + '</div>';
    const vl = (O.VIEWS.find((x) => x[0] === view) || [])[1];
    h += '<div class="sn-row sn-row--between sn-ov-listhead"><h2 class="sn-section-title" style="margin:0">' + esc(vl) + ' <small>' + list.length + '</small></h2>' + (filtered ? '<button type="button" class="sn-btn sn-btn--ghost" data-act="ov-reset">' + icon('x') + '<span>Filter zurücksetzen</span></button>' : '') + '</div>';
    if (!list.length) h += P.empty(view === 'open' || view === 'esc' || view === 'stale' || view === 'unseen' ? 'Alles im Griff' : 'Nichts gefunden', filtered ? 'Mit diesen Filtern gibt es keine Vorgänge.' : 'Keine offenen Vorgänge in der Filiale.', view !== 'done' && view !== 'all');
    else {
      h += list.slice(0, limit).map((it) => '<div class="sn-ov-item">' + P.itemCard(it, me, now, { compact: true, noActions: true }) + '<div class="sn-card__actions sn-ov-actions">' + itemActions(it, me) + '</div></div>').join('');
      if (list.length > limit) h += P.btn('Weitere ' + (list.length - limit) + ' anzeigen', 'ov-more', {}, 'secondary');
    }
    return h;
  }

  /* ---------- Teil 2: Anwesenheit ------------------------------------------ */
  const TYPE_ICON = { sick: 'thermometer', vac: 'sun', late: 'clock', other: 'user-x' };
  function awayRow(a, p) {
    const e = M.emp(a.id);
    return '<li class="sn-list__item sn-ov-away"><span class="sn-avatar sn-avatar--sm">' + esc(P.initials(M.name(a.id))) + '</span><div class="sn-list__body"><p class="sn-list__title">' + esc(M.name(a.id)) + '</p>'
      + '<p class="sn-list__sub">' + esc((a.dept || '–') + ' · ' + (e ? M.role(e).label : '')) + '</p>'
      + '<span class="sn-chip sn-chip--warn">' + icon(TYPE_ICON[a.type] || 'user-x') + esc(O.AWAY_TYPES[a.type] + ' · ' + a.period) + '</span></div>'
      + '<button type="button" class="sn-btn sn-btn--ghost" data-act="st-open" data-id="' + a.id + '" aria-label="Details zu ' + esc(M.name(a.id)) + '">' + icon('edit') + '<span>Details</span></button></li>';
  }
  function deptRow(r, sel) {
    const pct = r.need ? Math.min(100, Math.round(r.have / r.need * 100)) : 100;
    const txt = r.short ? 'Unterbesetzt: ' + r.short + ' fehlt' : 'Passt';
    return '<li><button type="button" class="sn-ov-dept' + (r.short ? ' is-short' : '') + (sel === r.dept ? ' is-sel' : '') + '" data-act="ap-dept" data-dept="' + esc(r.dept) + '" aria-pressed="' + (sel === r.dept) + '">'
      + '<span class="sn-ov-dept__name">' + icon(DEPT_ICON[r.dept] || 'tag') + '<span>' + esc(r.dept) + '</span></span>'
      + '<span class="sn-ov-dept__n"><b>' + r.have + '</b> von ' + r.need + '</span>'
      + '<span class="sn-ov-dept__bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>'
      + '<span class="sn-ov-dept__txt">' + (r.short ? icon('alert') : icon('check')) + esc(txt) + '</span></button></li>';
  }
  function presenceTab({ me, now, sub }) {
    const shift = sub.apShift || M.currentShift(now) || 'Früh';
    const idx = sub.apDay === undefined ? O.todayIdx(now) : sub.apDay;
    const p = O.presence(idx, shift, now);
    const dayName = M.DAYS[idx] + (p.isToday ? ' (heute)' : ' ' + U.fmt.date(O.dayStart(idx, now)).slice(4));
    let h = '<div class="sn-segment" role="group" aria-label="Schicht">' + M.SHIFT_NAMES.map((s) => '<button type="button" class="sn-segment__tab" aria-pressed="' + (s === shift) + '" data-act="ap-shift" data-k="' + s + '">' + esc(M.SHIFTS[s].label) + '</button>').join('') + '</div>'
      + '<div class="sn-chips sn-chips--scroll" role="group" aria-label="Wochentag">' + M.DAYS.map((d, i) => '<button type="button" class="sn-chip ' + (i === idx ? 'sn-chip--solid' : 'sn-chip--outline') + '" aria-pressed="' + (i === idx) + '" data-act="ap-day" data-k="' + i + '">' + d + (i === O.todayIdx(now) ? ' · heute' : '') + '</button>').join('') + '</div>';
    h += '<p class="sn-muted sn-small sn-ov-ctx">' + esc(dayName + ' · ' + M.SHIFTS[shift].label) + (p.live ? ' · läuft jetzt' : p.isToday ? ' · Vorschau' : ' · Plan') + '</p>';
    const k = (v, l, o) => '<div class="sn-kpi' + (o && o.alert && v ? ' sn-kpi--alert' : '') + '"><span class="sn-kpi__value">' + v + '</span><span class="sn-kpi__label">' + esc(l) + '</span></div>';
    h += '<div class="sn-kpis sn-ov-kpis3">' + k(p.present, p.live ? 'Im Dienst' : 'Eingeplant') + (p.live ? k(p.counts.free, 'Frei') + k(p.counts.work, 'Arbeiten') + k(p.counts.pause, 'Pause') : k(p.leads, 'Leitung') + k(p.cleaning, 'Reinigung'))
      + k(p.away.length, 'Abwesend', { alert: true }) + (p.live ? k(p.leads, 'Leitung') : '') + '</div>';
    // Hinweise
    const hints = [];
    for (const s of p.short) hints.push('<div class="sn-alert sn-alert--warn sn-alert--card"><span class="sn-alert__icon">' + icon('alert') + '</span><p class="sn-alert__title">' + esc(s.dept) + ' unterbesetzt: ' + s.have + ' von ' + s.need + '</p>'
      + (p.live ? '<div class="sn-alert__actions">' + P.btn('Verstärkung holen', 'ov-reinf', { dept: s.dept }, 'primary', 'users') + '</div>' : '<p class="sn-alert__text">Bitte rechtzeitig Plan oder Einspringer klären.</p>') + '</div>');
    if (p.pauseDue.length) hints.push('<div class="sn-alert sn-alert--info sn-alert--card"><span class="sn-alert__icon">' + icon('coffee') + '</span><p class="sn-alert__title">Pause fällig: ' + (p.pauseDue.length > 5 ? esc(U.fmt.count(p.pauseDue.length, 'Person', 'Personen')) : esc(p.pauseDue.map(M.first).join(', '))) + '</p><p class="sn-alert__text">Seit 5,5 Std im Dienst ohne Pause. Bitte kurz erinnern.</p></div>');
    if (p.pauseOver.length) hints.push('<div class="sn-alert sn-alert--warn sn-alert--card"><span class="sn-alert__icon">' + icon('coffee') + '</span><p class="sn-alert__title">Pause überzogen: ' + esc(p.pauseOver.map((x) => M.first(x.id)).join(', ')) + '</p><p class="sn-alert__text">Kurz nachfragen – ohne Vorwurf, vielleicht ist etwas passiert.</p></div>');
    if (hints.length) h += P.sec('Hinweise', hints.length) + hints.join('');
    // Abwesend
    h += P.sec('Abwesend', p.away.length) + (p.away.length ? '<ul class="sn-list">' + p.away.map((a) => awayRow(a, p)).join('') + '</ul><p class="sn-muted sn-small">Gründe sehen nur Filialleitung und Admin.</p>' : P.empty('Niemand abwesend', 'Alle Eingeplanten sind da.', true));
    // Besetzung
    const sel = sub.apDept || '';
    h += P.sec('Besetzung gegen Soll') + '<ul class="sn-ov-depts">' + p.byDept.map((r) => deptRow(r, sel)).join('') + '</ul>';
    if (sel) {
      const r = p.byDept.find((x) => x.dept === sel);
      const ids = r ? r.ids : [];
      h += '<div class="sn-row sn-row--between sn-ov-listhead"><h2 class="sn-section-title" style="margin:0">' + esc(sel) + ' <small>' + ids.length + '</small></h2><button type="button" class="sn-btn sn-btn--ghost" data-act="ap-dept" data-dept="">' + icon('x') + '<span>Auswahl aufheben</span></button></div>'
        + (ids.length ? ids.map((id) => (p.live && P.livePerson ? P.livePerson(M.emp(id), now) : '<div class="sn-card sn-ov-plain"><div class="sn-person-row"><span class="sn-avatar">' + esc(P.initials(M.name(id))) + '</span><div><p><b>' + esc(M.name(id)) + '</b></p><p class="sn-muted sn-small">' + esc(M.role(M.emp(id)).label + ' · eingeplant') + '</p></div></div></div>')).join('') : P.empty('Niemand eingeplant', 'In dieser Abteilung ist für die Schicht niemand im Dienst.'));
    }
    h += '<div class="sn-row sn-ov-links">' + P.btn('Personal bearbeiten', 'go-staff', {}, 'secondary', 'users') + P.btn('Soll-Besetzung ändern', 'go-staffing', {}, 'ghost', 'settings') + '</div>';
    return h;
  }

  function render(ctx) {
    const t = tab(ctx.sub);
    const s = O.stats(ctx.now);
    const head = '<div class="sn-segment sn-segment--sticky" role="tablist">'
      + '<button type="button" role="tab" class="sn-segment__tab" aria-selected="' + (t === 'items') + '" data-act="ov-tab" data-k="items">' + icon('inbox') + 'Meldungen' + (s.open ? ' <span class="sn-badge">' + s.open + '</span>' : '') + '</button>'
      + '<button type="button" role="tab" class="sn-segment__tab" aria-selected="' + (t === 'presence') + '" data-act="ov-tab" data-k="presence">' + icon('users') + 'Anwesenheit</button></div>';
    return '<div class="sn-ov">' + head + (t === 'items' ? itemsTab(ctx) : presenceTab(ctx)) + '</div>';
  }

  ui.registerView('overview', {
    label: 'Übersicht', icon: 'home', groups: ['admin'], order: 10, render,
    fab: () => ({ label: 'Senden', icon: 'send', act: 'send-sheet' }),
    badge: (me) => { const n = O.stats().escalated; return n ? { n, urgent: true } : 0; },
  });

  /* ---------- Aktionen ------------------------------------------------------- */
  ui.on('ov-tab', (el) => ui.sub('ovTab', el.dataset.k));
  ui.on('ov-view', (el) => { ui.sub('ovTab', 'items'); ui.sub('ovLimit', LIMIT); ui.sub('ovView', el.dataset.k); });
  ui.on('ov-kind', (el) => { ui.sub('ovLimit', LIMIT); ui.sub('ovKind', el.dataset.k); });
  ui.onChange('ov-dept', (el) => { ui.sub('ovLimit', LIMIT); ui.sub('ovDept', el.value); });
  ui.on('ov-shift', (el) => ui.sub('ovShift', el.dataset.k));
  ui.on('ov-urgent', () => ui.sub('ovUrgent', !ui.sub('ovUrgent')));
  ui.on('ov-stale', (el) => { ui.sub('ovView', 'stale'); ui.sub('ovStale', +el.dataset.k); });
  ui.on('ov-more', () => ui.sub('ovLimit', (ui.sub('ovLimit') || LIMIT) + 15));
  ui.on('ov-reset', () => { for (const k of ['ovView', 'ovKind', 'ovDept', 'ovShift', 'ovUrgent', 'ovLimit']) ui.sub(k, k === 'ovView' ? 'open' : ''); });
  ui.on('ap-shift', (el) => { ui.sub('apDept', ''); ui.sub('apShift', el.dataset.k); });
  ui.on('ap-day', (el) => { ui.sub('apDept', ''); ui.sub('apDay', +el.dataset.k); });
  ui.on('ap-dept', (el) => ui.sub('apDept', ui.sub('apDept') === el.dataset.dept ? '' : el.dataset.dept));
  ui.on('go-staff', () => ui.go('staff', {}));
  ui.on('go-staffing', () => { ui.sub('moreTab', 'set'); ui.go('more', {}); });

  ui.on('ov-reinf', (el) => {
    const dept = el.dataset.dept, n = SN.clock.now();
    const ids = O.reinforcements(dept, n).slice(0, 12);
    ui.sheet('Verstärkung für ' + dept,
      '<p class="sn-muted">Frei im Dienst, zuerst aus Abteilungen mit Überhang. Leitungen und Personen in Pause sind nicht dabei.</p>'
      + (ids.length ? P.personPicker('rf', ids, SN.session.me(), n) + '<fieldset class="sn-choices"><legend class="sn-label">Wie lange?</legend><label class="sn-choice"><input type="radio" name="rf-d" value="120" checked><span>2 Std</span></label><label class="sn-choice"><input type="radio" name="rf-d" value="240"><span>4 Std</span></label></fieldset>' : P.empty('Niemand frei', 'Im Moment ist niemand frei. Schnellruf oder Einspringer-Frage nutzen.')),
      ids.length ? P.btn('Umsetzen', 'ov-reinf-go', { dept }, 'primary', 'forward') : '');
  });
  ui.on('ov-reinf-go', async (el) => {
    const id = P.picked('rf'); if (!id) return ui.toast('Bitte eine Person wählen.', 'warn');
    const min = +P.picked('rf-d') || 120;
    const r = await SN.dist.loan(id, el.dataset.dept, min);
    if (ui.result(r, M.first(id) + ' hilft jetzt in ' + el.dataset.dept)) { ui.closeSheet(); await C.log(SN.session.id, 'Personal: Umgesetzt – ' + M.name(id) + ' nach ' + el.dataset.dept + ' (' + U.fmt.dur(min) + ')'); }
  });

  // Vorgemerkte Abwesenheiten (z. B. Urlaub ab morgen) rechtzeitig in staff.away übernehmen
  const sync = () => { const me = SN.session.me(); if (me && M.isAdmin(me) && SN.store.mode) O.syncAway().catch(() => {}); };
  setInterval(sync, 30000);
  setTimeout(sync, 3000);
})(window.SN = window.SN || {});
