/* ==========================================================================
   Personal (Filialleitung, Admin): Liste mit Suche und Filter, Person anlegen,
   bearbeiten, entfernen; Rolle, Abteilung, Schicht, Vertragsstunden,
   Tätigkeiten, Sprache, Ersthelfer, Kassenberechtigung; PIN setzen (nur als
   Hash), Abwesenheit eintragen, Umsetzen, Wochenplan, Änderungsprotokoll.
   Keine Leistungsdaten, keine Rangliste. Gründe von Abwesenheiten nur hier.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, O = SN.overview, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  const LIMIT = 30;
  const me = () => SN.session.me();
  const opts = (list, sel) => list.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  const deptOpts = (sel) => opts(M.DEPTS.map((d) => [d, d]), sel);
  const iso = (ts) => U.fmt.dayKey(ts);
  const parseDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.test(s || '') ? s.split('-').map(Number) : null; return m ? new Date(m[0], m[1] - 1, m[2]).getTime() : null; };
  let dupOk = '';
  let planDraft = [];

  /* ---------- Liste ------------------------------------------------------------ */
  function awayChip(e, now) {
    const r = O.awayRecords(e, now).find((x) => x.from <= now && x.until > now);
    if (!r) return '';
    return '<span class="sn-chip sn-chip--warn">' + icon('user-x') + esc(O.AWAY_TYPES[r.type] + ' · ' + O.periodText(r)) + '</span>';
  }
  function row(e, now) {
    const away = O.awayRecords(e, now).some((x) => x.from <= now && x.until > now);
    return '<li><button type="button" class="sn-card sn-card--tap sn-st-row" data-act="st-open" data-id="' + e.id + '" data-n="' + esc(e.name.toLowerCase()) + '">'
      + '<div class="sn-person-row"><span class="sn-avatar' + (M.isLead(e) ? ' sn-avatar--lead' : '') + '">' + esc(P.initials(e.name)) + '</span><div><p><b>' + esc(e.name) + '</b></p>'
      + '<p class="sn-muted sn-small">' + esc(M.role(e).label + ' · ' + (M.deptOf(e, now) || '–') + ' · ' + (e.sh || '') + ' · ' + (e.h || 8) + ' Std') + '</p></div></div>'
      + (e.firstAid || e.kasse || away ? '<div class="sn-st-chips">' + (e.firstAid ? '<span class="sn-chip sn-chip--info">' + icon('heart') + 'Ersthelfer</span>' : '') + (e.kasse ? '<span class="sn-chip">' + icon('dept-kasse') + 'Kasse</span>' : '') + awayChip(e, now) + '</div>' : '')
      + '</button></li>';
  }
  function render({ me: m, now, sub }) {
    const q = (sub.stQ || '').toLowerCase(), dept = sub.stDept || '', role = sub.stRole || '', sh = sub.stSh || '', away = !!sub.stAway;
    const l = U.sortBy(M.staff().filter((e) => (!q || e.name.toLowerCase().includes(q)) && (!dept || e.dept === dept) && (!role || e.role === role) && (!sh || e.sh === sh)
      && (!away || O.awayRecords(e, now).some((x) => x.from <= now && x.until > now))), (e) => -M.level(e) * 1000 + e.name.charCodeAt(0));
    const limit = sub.stLimit || LIMIT;
    const filtered = q || dept || role || sh || away;
    let h = '<div class="sn-ov"><div class="sn-row sn-ov-links" style="margin-top:0">' + P.btn('Person hinzufügen', 'st-edit', {}, 'primary', 'user-plus')
      + '<label class="sn-btn sn-btn--secondary" for="roster-photo">' + icon('camera') + '<span>Dienstplan scannen</span></label><input type="file" id="roster-photo" accept="image/*" capture="environment" hidden data-change="roster-photo"></div>'
      + '<div class="sn-field"><label class="sn-label sn-sr-only" for="st-q">Suche</label><input class="sn-input" id="st-q" type="search" placeholder="Name suchen" data-change="st-q" value="' + esc(sub.stQ || '') + '"></div>'
      + '<div class="sn-filter"><div><label class="sn-label sn-sr-only" for="st-dept">Abteilung</label><select class="sn-select" id="st-dept" data-change="st-dept"><option value="">Alle Abteilungen</option>' + deptOpts(dept) + '</select></div>'
      + '<div><label class="sn-label sn-sr-only" for="st-role">Rolle</label><select class="sn-select" id="st-role" data-change="st-role"><option value="">Alle Rollen</option>' + opts(Object.entries(M.ROLES).map(([k, r]) => [k, r.label]), role) + '</select></div></div>'
      + '<div class="sn-segment" role="group" aria-label="Schicht">' + [['', 'Alle'], ['Früh', 'Früh'], ['Spät', 'Spät']].map(([k, t]) => '<button type="button" class="sn-segment__tab" aria-pressed="' + (sh === k) + '" data-act="st-sh" data-k="' + k + '">' + t + '</button>').join('') + '</div>'
      + '<div class="sn-chips"><button type="button" class="sn-chip ' + (away ? 'sn-chip--solid' : 'sn-chip--outline') + '" aria-pressed="' + away + '" data-act="st-away-f">' + icon('user-x') + 'Nur Abwesende</button>'
      + (filtered ? '<button type="button" class="sn-chip sn-chip--outline" data-act="st-reset">' + icon('x') + 'Zurücksetzen</button>' : '') + '</div>'
      + P.sec('Personal', l.length + ' von ' + M.staff().length)
      + (l.length ? '<ul class="sn-st-list">' + l.slice(0, limit).map((e) => row(e, now)).join('') + '</ul>' + (l.length > limit ? P.btn('Weitere ' + (l.length - limit) + ' anzeigen', 'st-more', {}, 'secondary') : '') : P.empty('Niemand gefunden', 'Suche oder Filter ändern.'));
    const log = O.personnelLog(now, 14).slice(0, 12);
    h += P.sec('Änderungsprotokoll Personal', log.length ? log.length : '') + (log.length ? '<ul class="sn-st-log">' + log.map((x) => '<li><time>' + esc(U.fmt.when(x.at)) + '</time>' + esc(M.name(x.by) + ': ' + x.text) + '</li>').join('') + '</ul>' : '<p class="sn-muted sn-small">Noch keine Änderungen in den letzten 14 Tagen.</p>');
    return h + '</div>';
  }
  ui.registerView('staff', { groups: ['admin'], order: 12, render });
  ui.onChange('st-q', (el) => ui.sub('stQ', el.value));
  ui.onChange('st-dept', (el) => ui.sub('stDept', el.value));
  ui.onChange('st-role', (el) => ui.sub('stRole', el.value));
  ui.on('st-sh', (el) => ui.sub('stSh', el.dataset.k));
  ui.on('st-away-f', () => ui.sub('stAway', !ui.sub('stAway')));
  ui.on('st-more', () => ui.sub('stLimit', (ui.sub('stLimit') || LIMIT) + 30));
  ui.on('st-reset', () => { for (const k of ['stQ', 'stDept', 'stRole', 'stSh', 'stAway']) ui.sub(k, ''); });

  /* ---------- Person: Übersicht --------------------------------------------------- */
  function denied(e) { ui.toast(M.first(e.id) + ' hat eine höhere Rolle – nur die Filialleitung kann das ändern.', 'warn'); }
  function open(id) {
    const e = M.emp(id); if (!e) return;
    const n = SN.clock.now(), m = me(), can = O.canManage(m, e);
    const recs = O.awayRecords(e, n).filter((r) => r.until > n);
    const plan = SN.store.peek('plans', e.id);
    ui.sheet(e.name,
      '<dl class="sn-st-facts"><dt>Rolle</dt><dd>' + esc(M.role(e).label) + '</dd><dt>Abteilung</dt><dd>' + esc(M.deptOf(e, n) || '–') + (e.loan && e.loan.until > n ? ' (umgesetzt)' : '') + '</dd>'
      + '<dt>Schicht</dt><dd>' + esc(e.sh || '–') + '</dd><dt>Vertrag</dt><dd>' + (e.h || 8) + ' Std pro Tag</dd>'
      + (e.role !== 'clean' && !M.isAdmin(e) ? '<dt>Limit heute</dt><dd>' + esc(U.fmt.dur(SN.dist.limitOf(e, n))) + ' · Pause ' + SN.dist.pauseOf(e, n) + ' Min</dd>' : '')
      + '<dt>Sprache</dt><dd>' + esc(SN.ai.LANGS[e.lang || 'de'] || 'Deutsch') + '</dd><dt>Tätigkeiten</dt><dd>' + esc((e.acts || []).join(', ') || '–') + '</dd>'
      + '<dt>Plan</dt><dd>' + (plan ? 'eigener Wochenplan' : 'nach Schicht') + '</dd></dl>'
      + '<div class="sn-st-chips">' + (e.firstAid ? '<span class="sn-chip sn-chip--info">' + icon('heart') + 'Ersthelfer</span>' : '') + (e.kasse ? '<span class="sn-chip">' + icon('dept-kasse') + 'Kassenberechtigt</span>' : '') + (e.pinHash || e.hasPin ? '<span class="sn-chip sn-chip--ok">' + icon('lock') + 'PIN gesetzt</span>' : '<span class="sn-chip sn-chip--warn">' + icon('lock') + 'Keine PIN</span>') + '</div>'
      + P.sec('Abwesenheit', recs.length || '')
      + (recs.length ? '<ul class="sn-list">' + recs.map((r) => '<li class="sn-list__item"><div class="sn-list__body"><p class="sn-list__title">' + esc(O.AWAY_TYPES[r.type] + ' · ' + O.periodText(r)) + '</p><p class="sn-list__sub">' + (r.from <= n ? 'läuft jetzt' : 'vorgemerkt') + '</p></div>'
        + (can ? (r.from <= n ? P.btn('Wieder da', 'st-away-end', { id: e.id }, 'secondary', 'check') : r.id !== 'cur' ? P.btn('Löschen', 'st-away-del', { id: e.id, rec: r.id }, 'ghost', 'trash') : '') : '') + '</li>').join('') + '</ul>' : '<p class="sn-muted sn-small">Keine Abwesenheit eingetragen.</p>')
      + (can ? '<div class="sn-st-grid">' + P.btn('Bearbeiten', 'st-edit', { id: e.id }, 'primary', 'edit') + P.btn('Abwesenheit', 'st-away', { id: e.id }, 'secondary', 'user-x')
        + P.btn('Umsetzen', 'p-move', { id: e.id }, 'secondary', 'forward') + P.btn('Wochenplan', 'st-plan', { id: e.id }, 'secondary', 'calendar')
        + P.btn(e.pinHash || e.hasPin ? 'PIN zurücksetzen' : 'PIN setzen', 'st-pin', { id: e.id }, 'secondary', 'lock') + (e.id !== m.id ? P.btn('Chat', 'p-chat', { id: e.id }, 'ghost', 'chat') : '') + '</div>'
        : '<p class="sn-muted">Nur ansehen: ' + esc(M.first(e.id)) + ' hat eine höhere Rolle als du.</p>' + (e.id !== m.id ? P.btn('Chat', 'p-chat', { id: e.id }, 'ghost', 'chat') : '')));
  }
  ui.on('st-open', (el) => open(el.dataset.id));

  /* ---------- Bearbeiten / Anlegen ------------------------------------------------- */
  const roleFields = (role) => {
    const t = document.getElementById('se-grp-wrap'), s = document.getElementById('se-scope-wrap'), d = document.getElementById('se-dept-wrap');
    if (t) t.hidden = role !== 'tl'; if (s) s.hidden = role !== 'sl'; if (d) d.hidden = role === 'clean';
  };
  const limitText = (h) => { const hh = +h || 0; return hh >= 2 && hh <= 10 ? 'Pause ' + SN.dist.pauseFor(hh) + ' Min · Limit pro Tag ' + U.fmt.dur(Math.round((hh * 60 - SN.dist.pauseFor(hh)) * SN.dist.SHARE)) + ' (20 % bleiben für Kunden)' : 'Bitte 2 bis 10 Std eingeben.'; };
  ui.onChange('se-role', (el) => roleFields(el.value));
  document.addEventListener('input', (ev) => { if (ev.target && ev.target.id === 'se-h') { const t = document.getElementById('se-limit'); if (t) t.textContent = limitText(ev.target.value); } });

  ui.on('st-edit', (el) => {
    const m = me();
    const e = el.dataset.id ? M.emp(el.dataset.id) : { name: '', role: 'emp', dept: 'Trocken sortiment', sh: 'Früh', h: 8, acts: [], lang: 'de' };
    if (e.id && !O.canManage(m, e)) return denied(e);
    dupOk = '';
    const roles = O.assignableRoles(m).concat(e.role && !O.assignableRoles(m).includes(e.role) ? [e.role] : []);
    ui.sheet(e.id ? e.name + ' bearbeiten' : 'Person hinzufügen',
      '<fieldset class="sn-choices"><legend class="sn-label">Person</legend><div class="sn-field"><label class="sn-label" for="se-name">Name</label><input class="sn-input" id="se-name" autocomplete="off" value="' + esc(e.name) + '"></div>'
      + '<div class="sn-field"><label class="sn-label" for="se-role">Rolle</label><select class="sn-select" id="se-role" data-change="se-role">' + opts(roles.map((k) => [k, M.ROLES[k].label]), e.role) + '</select></div></fieldset>'
      + '<fieldset class="sn-choices"><legend class="sn-label">Einsatz</legend><div class="sn-field" id="se-dept-wrap"' + (e.role === 'clean' ? ' hidden' : '') + '><label class="sn-label" for="se-dept">Abteilung</label><select class="sn-select" id="se-dept">' + deptOpts(e.dept) + '</select></div>'
      + '<div class="sn-field" id="se-grp-wrap"' + (e.role === 'tl' ? '' : ' hidden') + '><label class="sn-label" for="se-grp">Zuständige Abteilungsgruppe (Teamleitung)</label><select class="sn-select" id="se-grp">' + opts(Object.entries(M.DEPT_GROUPS).map(([k, g]) => [k, g.label]), e.group) + '</select></div>'
      + '<div id="se-scope-wrap"' + (e.role === 'sl' ? '' : ' hidden') + '><p class="sn-label">Zuständige Abteilungen (Schichtleitung)</p><div class="sn-choices">' + M.DEPTS.map((d) => '<label class="sn-choice"><input type="checkbox" name="se-scope" value="' + esc(d) + '"' + ((e.scope || []).includes(d) ? ' checked' : '') + '><span>' + esc(d) + '</span></label>').join('') + '</div></div>'
      + '<div class="sn-filter"><div class="sn-field"><label class="sn-label" for="se-sh">Schicht</label><select class="sn-select" id="se-sh">' + opts(M.SHIFT_NAMES.map((s) => [s, s]), e.sh) + '</select></div>'
      + '<div class="sn-field"><label class="sn-label" for="se-h">Vertragsstunden pro Tag</label><input class="sn-input" type="number" min="2" max="10" step="0.5" id="se-h" inputmode="decimal" value="' + (e.h || 8) + '"></div></div>'
      + '<p class="sn-field__help" id="se-limit">' + esc(limitText(e.h || 8)) + '</p></fieldset>'
      + '<fieldset class="sn-choices"><legend class="sn-label">Fähigkeiten</legend><p class="sn-label">Tätigkeiten (wichtig für die Verteilung)</p>' + M.ACTS.map((a) => '<label class="sn-choice"><input type="checkbox" name="se-acts" value="' + esc(a.key) + '"' + ((e.acts || []).includes(a.key) ? ' checked' : '') + '><span>' + esc(a.label) + '</span></label>').join('')
      + '<label class="sn-check"><input type="checkbox" id="se-fa"' + (e.firstAid ? ' checked' : '') + '>Ersthelfer/in</label><label class="sn-check"><input type="checkbox" id="se-kasse"' + (e.kasse ? ' checked' : '') + '>Kassenberechtigt</label>'
      + '<div class="sn-field"><label class="sn-label" for="se-lang">Sprache für Übersetzungen</label><select class="sn-select" id="se-lang">' + opts(Object.entries(SN.ai.LANGS), e.lang || 'de') + '</select></div></fieldset>'
      + (e.id ? '<p class="sn-muted sn-small">PIN und Abwesenheit stehen im Menü der Person.</p>' : '<div class="sn-field"><label class="sn-label" for="se-pin">PIN (4–6 Ziffern, nur als Hash gespeichert)</label><div class="sn-row"><input class="sn-input" id="se-pin" inputmode="numeric" maxlength="6" autocomplete="off"><button type="button" class="sn-btn sn-btn--secondary" data-act="st-pin-gen" data-target="se-pin">Erzeugen</button></div></div>'),
      P.btn('Speichern', 'st-save', { id: e.id || '' }, 'primary', 'check') + (e.id && e.id !== m.id ? P.btn('Entfernen', 'st-del', { id: e.id }, 'ghost', 'trash') : ''));
  });
  ui.on('st-pin-gen', (el) => { const i = document.getElementById(el.dataset.target); if (i) { i.value = O.newPin(); i.type = 'text'; } });

  ui.on('st-save', async (el) => {
    const m = me();
    const id = el.dataset.id || U.id('e');
    const old = el.dataset.id ? M.emp(id) : null;
    if (old && !O.canManage(m, old)) return denied(old);
    const role = ui.sheetVal('se-role');
    const d = { name: String(ui.sheetVal('se-name') || '').trim(), role, dept: role === 'clean' ? null : ui.sheetVal('se-dept'), sh: ui.sheetVal('se-sh'), h: parseFloat(ui.sheetVal('se-h')), pin: String(ui.sheetVal('se-pin') || '').trim() };
    if (!O.assignableRoles(m).includes(role) && !(old && old.role === role)) return ui.toast('Diese Rolle darfst du nicht vergeben.', 'warn');
    if (old && old.id === m.id && M.level(M.ROLES[role] ? { role } : m) < M.level(m)) return ui.toast('Die eigene Rolle bitte nicht herabstufen.', 'warn');
    if (old && O.loseLastAdmin(id, role)) return ui.toast('Es muss mindestens ein Admin oder eine Filialleitung bleiben.', 'warn');
    const v = O.validate(d, id);
    if (!old && !d.pin) v.errors.push('Bitte eine PIN vergeben (Knopf „Erzeugen“).');
    if (v.errors.length) return ui.toast(v.errors[0], 'warn');
    if (v.warnings.length && dupOk !== d.name.toLowerCase()) { dupOk = d.name.toLowerCase(); return ui.toast(v.warnings[0] + ' Zum Speichern nochmal tippen.', 'warn'); }
    const base = old ? U.clone(old) : { id };
    const before = U.clone(base);
    Object.assign(base, { name: d.name, role, dept: d.dept, sh: d.sh, h: d.h, lang: ui.sheetVal('se-lang'), firstAid: !!ui.sheetVal('se-fa'), kasse: !!ui.sheetVal('se-kasse') });
    base.acts = Array.from(document.querySelectorAll('input[name="se-acts"]:checked')).map((x) => x.value);
    if (role === 'tl') base.group = ui.sheetVal('se-grp'); else delete base.group;
    const sc = Array.from(document.querySelectorAll('input[name="se-scope"]:checked')).map((x) => x.value);
    if (role === 'sl' && sc.length) base.scope = sc; else if (role !== 'sl') delete base.scope;
    delete base.pin; delete base.hasPin;
    if (d.pin) base.pinHash = U.pinHash(id, d.pin); // PIN nie im Klartext speichern
    const diff = old ? O.diffStaff(before, base) : [];
    if (old && !diff.length) { ui.toast('Nichts geändert.'); return ui.closeSheet(); }
    const r = await SN.store.put('staff', id, base);
    if (!r.ok) return ui.toast('Nicht gespeichert.', 'warn');
    await C.log(m.id, 'Personal: ' + (old ? 'Person geändert – ' + d.name + ' (' + diff.join(', ') + ')' : 'Person angelegt – ' + d.name + ' (' + M.ROLES[role].label + (d.dept ? ', ' + d.dept : '') + ', ' + d.sh + ')'));
    ui.toast(old ? 'Gespeichert' : d.name + ' ist angelegt'); ui.closeSheet();
  });

  ui.on('st-del', (el) => {
    const e = M.emp(el.dataset.id); if (!e) return;
    if (!O.canManage(me(), e)) return denied(e);
    if (O.loseLastAdmin(e.id, null)) return ui.toast('Es muss mindestens ein Admin oder eine Filialleitung bleiben.', 'warn');
    const n = O.openFor(e.id);
    ui.sheet(e.name + ' entfernen?', '<p>Das Konto wird gelöscht, die Person kann sich nicht mehr anmelden. Alte Meldungen bleiben erhalten.</p>'
      + (n ? '<div class="sn-alert sn-alert--warn sn-alert--card"><p class="sn-alert__title">' + esc(U.fmt.count(n, 'offener Vorgang hängt', 'offene Vorgänge hängen')) + ' an ' + esc(M.first(e.id)) + '.</p><p class="sn-alert__text">Bitte vorher neu verteilen oder weitergeben.</p></div>' : ''),
      P.btn('Ja, entfernen', 'st-del-go', { id: e.id }, 'primary', 'trash') + P.btn('Abbrechen', 'st-open', { id: e.id }, 'ghost'));
  });
  ui.on('st-del-go', async (el) => {
    const e = M.emp(el.dataset.id); if (!e) return;
    await SN.store.del('staff', e.id);
    if (SN.store.peek('plans', e.id)) await SN.store.del('plans', e.id);
    await C.log(me().id, 'Personal: Person entfernt – ' + e.name);
    ui.toast('Entfernt'); ui.closeSheet();
  });

  /* ---------- PIN ------------------------------------------------------------------- */
  ui.on('st-pin', (el) => {
    const e = M.emp(el.dataset.id); if (!e) return;
    if (!O.canManage(me(), e)) return denied(e);
    ui.sheet('PIN für ' + e.name, '<p>Die PIN wird nur als Hash gespeichert und danach nirgends mehr angezeigt. Bitte der Person persönlich mitteilen.</p>'
      + '<div class="sn-field"><label class="sn-label" for="pn-pin">Neue PIN (4–6 Ziffern)</label><div class="sn-row"><input class="sn-input" id="pn-pin" inputmode="numeric" maxlength="6" autocomplete="off"><button type="button" class="sn-btn sn-btn--secondary" data-act="st-pin-gen" data-target="pn-pin">Erzeugen</button></div></div>',
      P.btn('PIN speichern', 'st-pin-go', { id: e.id }, 'primary', 'lock'));
  });
  ui.on('st-pin-go', async (el) => {
    const e = M.emp(el.dataset.id); if (!e) return;
    const pin = String(ui.sheetVal('pn-pin') || '').trim();
    if (!/^\d{4,6}$/.test(pin)) return ui.toast('PIN: 4 bis 6 Ziffern.', 'warn');
    const r = await SN.store.patch('staff', e.id, Object.assign({ pinHash: U.pinHash(e.id, pin) }, e.pin ? { pin: null } : {}));
    if (r && r.ok === false) return ui.toast('Nicht gespeichert.', 'warn');
    await C.log(me().id, 'Personal: PIN gesetzt – ' + e.name);
    ui.sheet('PIN gesetzt', '<p>Neue PIN für <b>' + esc(e.name) + '</b>:</p><p class="sn-st-pin" id="pn-show">' + esc(pin) + '</p><p class="sn-muted sn-small">Nur jetzt sichtbar. Gespeichert ist nur der Hash.</p>', P.btn('Fertig', 'sheet-close', {}, 'primary', 'check'));
  });

  /* ---------- Abwesenheit ----------------------------------------------------------- */
  const hhmm = (ts) => U.fmt.time(ts);
  const absFields = (t) => {
    const l = document.getElementById('ab-late'), r = document.getElementById('ab-range'), n = document.getElementById('ab-notify');
    if (l) l.hidden = t !== 'late'; if (r) r.hidden = t === 'late';
    if (n) n.hidden = !(t === 'sick' || t === 'late');
  };
  ui.onChange('ab-type', () => absFields(P.picked('ab-type')));
  ui.on('st-away', (el) => {
    const e = M.emp(el.dataset.id); if (!e) return;
    if (!O.canManage(me(), e)) return denied(e);
    const n = SN.clock.now(), t0 = iso(n), soon = Math.ceil((n + 30 * U.MIN) / (5 * U.MIN)) * 5 * U.MIN;
    ui.sheet('Abwesenheit: ' + e.name,
      '<fieldset class="sn-choices"><legend class="sn-label">Art</legend>' + Object.entries(O.AWAY_TYPES).map(([k, l], i) => '<label class="sn-choice"><input type="radio" name="ab-type" data-change="ab-type" value="' + k + '"' + (i ? '' : ' checked') + '><span>' + esc(l) + '</span></label>').join('') + '</fieldset>'
      + '<div id="ab-range" class="sn-filter"><div class="sn-field"><label class="sn-label" for="ab-from">Von</label><input class="sn-input" type="date" id="ab-from" value="' + t0 + '" min="' + t0 + '"></div><div class="sn-field"><label class="sn-label" for="ab-to">Bis (einschließlich)</label><input class="sn-input" type="date" id="ab-to" value="' + t0 + '" min="' + t0 + '"></div></div>'
      + '<div id="ab-late" class="sn-field" hidden><label class="sn-label" for="ab-at">Kommt ungefähr um</label><input class="sn-input" type="time" id="ab-at" value="' + hhmm(soon) + '"></div>'
      + '<label class="sn-check" id="ab-notify"><input type="checkbox" id="ab-inform" checked>Schichtleitung informieren und Einspringer fragen</label>'
      + '<p class="sn-muted sn-small">Bitte keine Diagnose eintragen. Der Grund ist nur für Filialleitung und Admin sichtbar; alle anderen sehen „abwesend“.</p>',
      P.btn('Eintragen', 'st-away-go', { id: e.id }, 'primary', 'check'));
  });
  ui.on('st-away-go', async (el) => {
    const e = M.emp(el.dataset.id), n = SN.clock.now(), type = P.picked('ab-type');
    if (!e || !type) return ui.toast('Bitte die Art wählen.', 'warn');
    let from, until;
    if (type === 'late') {
      const [h, m] = String(ui.sheetVal('ab-at') || '').split(':').map(Number);
      if (isNaN(h)) return ui.toast('Bitte eine Uhrzeit angeben.', 'warn');
      from = n; until = U.startOfDay(n) + (h * 60 + (m || 0)) * U.MIN;
    } else {
      from = parseDay(ui.sheetVal('ab-from')); const to = parseDay(ui.sheetVal('ab-to'));
      if (!from || !to) return ui.toast('Bitte Von und Bis angeben.', 'warn');
      if (to < from) return ui.toast('„Bis“ liegt vor „Von“.', 'warn');
      until = new Date(to + 36 * U.HOUR); until.setHours(0, 0, 0, 0); until = until.getTime();
      if (from < U.startOfDay(n)) from = U.startOfDay(n);
    }
    const startsNow = from <= n;
    let note = '';
    if ((type === 'sick' || type === 'late') && startsNow && ui.sheetVal('ab-inform')) {
      const rr = await C.reportAbsence(me().id, { forId: e.id, type, minutes: type === 'late' ? Math.max(5, Math.round((until - n) / U.MIN)) : null });
      if (rr.ok) note = rr.standin ? ', Einspringer werden gefragt' : ', Schichtleitung informiert';
    }
    const r = await O.setAway(me().id, e.id, { type, from, until }, n);
    if (ui.result(r, e.name.split(' ')[0] + ': ' + O.AWAY_TYPES[type] + ' eingetragen' + note)) ui.closeSheet();
  });
  ui.on('st-away-end', async (el) => { const r = await O.endAway(me().id, el.dataset.id); if (ui.result(r, M.first(el.dataset.id) + ' ist wieder da')) ui.closeSheet(); });
  ui.on('st-away-del', async (el) => { const r = await O.cancelAway(me().id, el.dataset.id, el.dataset.rec); if (ui.result(r, 'Eintrag gelöscht')) open(el.dataset.id); });

  /* ---------- Wochenplan ------------------------------------------------------------- */
  const defPlan = (e) => M.DAYS.map((d, i) => ({ d, off: i >= 5, s: e.sh === 'Spät' ? '14:00' : '06:00', e: e.sh === 'Spät' ? '22:00' : '14:00', p: SN.dist.pauseFor(e.h || 8) }));
  ui.on('st-plan', (el) => {
    const e = M.emp(el.dataset.id); if (!e) return;
    if (!O.canManage(me(), e)) return denied(e);
    const pl = SN.store.peek('plans', e.id);
    planDraft = U.clone((pl && pl.days) || defPlan(e));
    ui.sheet('Wochenplan: ' + e.name, '<p class="sn-muted">Beginn, Ende und Pause je Tag. Ohne Plan gilt die Schicht (Mo–Sa).</p>'
      + planDraft.map((x, i) => '<div class="sn-st-plan"><b>' + esc(x.d) + '</b><label class="sn-check"><input type="checkbox" id="wp-off-' + i + '"' + (x.off ? ' checked' : '') + '>frei</label>'
        + '<div class="sn-filter"><input class="sn-input" id="wp-s-' + i + '" type="time" value="' + esc(x.s) + '" aria-label="Beginn ' + esc(x.d) + '"><input class="sn-input" id="wp-e-' + i + '" type="time" value="' + esc(x.e) + '" aria-label="Ende ' + esc(x.d) + '"><input class="sn-input" id="wp-p-' + i + '" type="number" min="0" max="90" value="' + (x.p == null ? '' : x.p) + '" aria-label="Pause Minuten ' + esc(x.d) + '" placeholder="Pause"></div></div>').join('')
      + '<button type="button" class="sn-btn sn-btn--ghost" data-act="st-plan-copy">Montag auf Dienstag bis Freitag übernehmen</button>',
    P.btn('Plan speichern', 'st-plan-save', { id: e.id }, 'primary', 'check') + (pl ? P.btn('Plan entfernen', 'st-plan-del', { id: e.id }, 'ghost', 'trash') : ''));
  });
  ui.on('st-plan-copy', () => {
    for (let i = 1; i <= 4; i++) for (const k of ['s', 'e', 'p']) { const a = document.getElementById('wp-' + k + '-0'), b = document.getElementById('wp-' + k + '-' + i); if (a && b) b.value = a.value; }
    for (let i = 1; i <= 4; i++) document.getElementById('wp-off-' + i).checked = document.getElementById('wp-off-0').checked;
  });
  ui.on('st-plan-save', async (el) => {
    const e = M.emp(el.dataset.id); if (!e) return;
    const days = planDraft.map((x, i) => ({ d: x.d, off: !!ui.sheetVal('wp-off-' + i), s: ui.sheetVal('wp-s-' + i) || x.s, e: ui.sheetVal('wp-e-' + i) || x.e, p: ui.sheetVal('wp-p-' + i) === '' ? null : +ui.sheetVal('wp-p-' + i) }));
    const bad = days.find((x) => !x.off && U.fmt.hm(x.e) <= U.fmt.hm(x.s));
    if (bad) return ui.toast(bad.d + ': Ende liegt vor Beginn.', 'warn');
    const r = await SN.store.put('plans', e.id, { id: e.id, week: U.fmt.dayKey(SN.clock.now()), days });
    if (!r.ok) return ui.toast('Nicht gespeichert.', 'warn');
    await C.log(me().id, 'Personal: Wochenplan geändert – ' + e.name);
    ui.toast('Plan gespeichert'); ui.closeSheet();
  });
  ui.on('st-plan-del', async (el) => { const e = M.emp(el.dataset.id); await SN.store.del('plans', el.dataset.id); await C.log(me().id, 'Personal: Wochenplan entfernt – ' + (e ? e.name : '')); ui.toast('Plan entfernt, es gilt wieder die Schicht'); ui.closeSheet(); });
})(window.SN = window.SN || {});
