/* ==========================================================================
   Mehr (Admin/Filialleitung): Wareneingang, Restware/Bruch, Vorlagen, Team,
   Einstellungen (Admin vom Dienst, Fristen), Stimmung, Protokoll
   + KI-Sprachassistent (nur Konten mit aiAssist, im Demo Mustafa)
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  const deptOpts = (sel) => M.DEPTS.map((d) => '<option value="' + esc(d) + '"' + (d === sel ? ' selected' : '') + '>' + esc(d) + '</option>').join('');
  const num = (id) => Math.max(0, parseInt(ui.sheetVal(id), 10) || 0);

  /* ---------- Wareneingang (S3) -------------------------------------------------- */
  function goods(me, now) {
    const tr = U.sortBy(SN.store.list('trucks'), (t) => -t.at).slice(0, 6);
    return '<section class="sn-card" style="padding:14px"><h3 class="sn-section-title" style="margin-top:0">🚚 LKW anlegen</h3>'
      + '<p class="sn-muted sn-small">Aufwand: Palette 8, KKP 4, Display 6 Min. Es werden so viele Leute eingeplant, dass in ca. 60 Min entladen ist.</p>'
      + '<div class="sn-field"><label class="sn-label" for="tr-title">Lieferung</label><input class="sn-input" id="tr-title" value="LKW Zentrallager"></div>'
      + '<div class="sn-filter"><div class="sn-field"><label class="sn-label" for="tr-pal">Paletten</label><input class="sn-input" type="number" min="0" id="tr-pal" value="10" inputmode="numeric"></div>'
      + '<div class="sn-field"><label class="sn-label" for="tr-kkp">KKP</label><input class="sn-input" type="number" min="0" id="tr-kkp" value="0" inputmode="numeric"></div>'
      + '<div class="sn-field"><label class="sn-label" for="tr-disp">Displays</label><input class="sn-input" type="number" min="0" id="tr-disp" value="0" inputmode="numeric"></div></div>'
      + '<label class="sn-check"><input type="checkbox" id="tr-u">🔥 Dringend</label>'
      + P.btn('Anlegen und Team einplanen', 'tr-add', {}, 'primary', 'users') + '</section>'
      + P.sec('Heute', tr.length) + (tr.map((t) => { const ef = SN.dist.truckEffort(t); return '<div class="sn-card" style="padding:12px"><b>🚚 ' + esc(t.title) + '</b><p class="sn-small">' + t.pal + ' Paletten · ' + t.kkp + ' KKP · ' + t.disp + ' Displays · ca. ' + U.fmt.dur(ef.min) + ' · ' + U.fmt.count(ef.people, 'Person', 'Personen') + ' · ' + esc(U.fmt.ago(t.at)) + '</p></div>'; }).join('') || P.empty('Noch keine Lieferung'));
  }
  ui.on('tr-add', async () => {
    const me = SN.session.me(), now = SN.clock.now();
    const q = { pal: num('tr-pal'), kkp: num('tr-kkp'), disp: num('tr-disp') };
    const ef = SN.dist.truckEffort(q);
    if (!ef.min) return ui.toast('Bitte Mengen eintragen.', 'warn');
    const id = U.id('lkw'), title = String(ui.sheetVal('tr-title') || 'LKW').trim();
    await SN.store.put('trucks', id, Object.assign({ id, title, at: now, state: 'open' }, q));
    const per = Math.ceil(ef.min / ef.people);
    for (let i = 1; i <= ef.people; i++) {
      await C.task(me.id, { title: title + ': entladen und einlagern (' + i + ' von ' + ef.people + ')', dept: 'Wareneinnahme', act: 'Wareneinnahme', min: per, u: !!ui.sheetVal('tr-u'), due: now + 75 * U.MIN, escalate: true });
    }
    const r = await SN.dist.run(me.id);
    await C.log(me.id, 'LKW angelegt: ' + title + ' (' + ef.people + ' Personen)');
    ui.toast(ef.people + ' Personen eingeplant. ' + SN.dist.resultText(r));
  });

  /* ---------- Restware und Bruch (S4) ----------------------------------------- */
  function stock() {
    const rest = SN.store.list('rest').filter((r) => !r.done), br = U.sortBy(SN.store.list('breakage'), (b) => -b.at).slice(0, 8);
    return P.btn('Restware erfassen', 'rest-new', {}, 'secondary', 'plus') + ' ' + P.btn('Bruch erfassen', 'br-new', {}, 'secondary', 'plus')
      + P.sec('Restware im Lager', rest.length) + (rest.map((r) => '<div class="sn-card" style="padding:12px"><b>' + esc(r.name) + '</b><p class="sn-small">' + esc(r.dept + ' · ' + (r.place || 'ohne Platz') + ' · ' + r.date) + '</p>' + P.btn('Ist eingeräumt', 'rest-done', { id: r.id }, 'secondary', 'check') + '</div>').join('') || P.empty('Alles eingeräumt', '', true))
      + P.sec('Bruch (Abschreibung)', br.length) + (br.map((b) => '<div class="sn-card" style="padding:12px"><b>' + esc(b.name) + '</b> <span class="sn-chip">' + esc(b.reason) + '</span><p class="sn-small">' + esc(b.dept + ' · ' + b.qty + ' Stück · ' + M.name(b.by) + ' · ' + U.fmt.ago(b.at)) + '</p></div>').join('') || P.empty('Kein Bruch erfasst'));
  }
  ui.on('rest-new', () => ui.sheet('Restware erfassen', '<p class="sn-muted">Ware, die nicht ins Regal passte. Daraus wird automatisch ein Auftrag „einräumen“.</p>'
    + '<div class="sn-field"><label class="sn-label" for="rs-name">Was?</label><input class="sn-input" id="rs-name" placeholder="z. B. Mineralwasser 6er, 3 Kisten"></div>'
    + '<div class="sn-field"><label class="sn-label" for="rs-dept">Abteilung</label><select class="sn-select" id="rs-dept">' + deptOpts((SN.session.me() || {}).dept) + '</select></div>'
    + '<div class="sn-field"><label class="sn-label" for="rs-place">Lagerplatz</label><input class="sn-input" id="rs-place" placeholder="z. B. Lager Gang B"></div>', P.btn('Eintragen', 'rest-go', {}, 'primary', 'check')));
  ui.on('rest-go', async () => {
    const me = SN.session.me(), now = SN.clock.now(), id = U.id('rest');
    const name = String(ui.sheetVal('rs-name') || '').trim(); if (!name) return ui.toast('Bitte eintragen, was es ist.', 'warn');
    const dept = ui.sheetVal('rs-dept');
    await SN.store.put('rest', id, { id, name, dept, place: ui.sheetVal('rs-place') || '', date: U.fmt.dayKey(now), by: me.id, at: now, done: false });
    const r = await C.task(me.id, { title: 'Restware einräumen: ' + name, dept, act: 'Warenverräumung', due: now + 4 * U.HOUR, restId: id });
    if (r.ok) await SN.dist.run(me.id);
    ui.toast('Eingetragen und als Auftrag verteilt'); ui.closeSheet();
  });
  ui.on('rest-done', async (el) => { await SN.store.patch('rest', el.dataset.id, { done: true }); ui.toast('Danke, eingeräumt'); });
  ui.on('br-new', () => ui.sheet('Bruch erfassen', '<div class="sn-field"><label class="sn-label" for="br-name">Was?</label><input class="sn-input" id="br-name"></div>'
    + '<div class="sn-field"><label class="sn-label" for="br-reason">Grund</label><select class="sn-select" id="br-reason">' + M.BREAK_REASONS.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select></div>'
    + '<div class="sn-filter"><div class="sn-field"><label class="sn-label" for="br-qty">Stück</label><input class="sn-input" type="number" min="1" id="br-qty" value="1"></div><div class="sn-field"><label class="sn-label" for="br-dept">Abteilung</label><select class="sn-select" id="br-dept">' + deptOpts((SN.session.me() || {}).dept) + '</select></div></div>',
  P.btn('Als Abschreibung erfassen', 'br-go', {}, 'primary', 'check')));
  ui.on('br-go', async () => {
    const me = SN.session.me(), id = U.id('br');
    const name = String(ui.sheetVal('br-name') || '').trim(); if (!name) return ui.toast('Bitte eintragen, was es ist.', 'warn');
    await SN.store.put('breakage', id, { id, name, reason: ui.sheetVal('br-reason'), qty: num('br-qty') || 1, dept: ui.sheetVal('br-dept'), by: me.id, at: SN.clock.now() });
    ui.toast('Als Abschreibung erfasst'); ui.closeSheet();
  });

  /* ---------- Vorlagen ---------------------------------------------------------- */
  function templates() {
    const l = U.sortBy(SN.store.list('templates'), (t) => t.at || '');
    return '<p class="sn-muted">Wiederkehrende Aufträge und Rundgänge. Der Admin vom Dienst legt sie automatisch zur Uhrzeit an; Checklisten eskalieren, wenn nicht abgehakt.</p>'
      + P.btn('Neue Vorlage', 'tpl-new', {}, 'secondary', 'plus')
      + l.map((t) => '<div class="sn-card" style="padding:12px"><b>' + esc(t.at || '') + ' · ' + esc(t.title) + '</b> ' + (t.u ? '🔥' : '') + '<p class="sn-small">' + esc(t.dept + ' · ' + t.act + (t.checklist ? ' · Checkliste (' + t.checklist.length + ')' : '') + ' · ' + (t.days && t.days.length === 6 ? 'Mo–Sa' : 'täglich') + (t.lastRun === U.fmt.dayKey(SN.clock.now()) ? ' · heute angelegt' : '')) + '</p><div class="sn-card__actions">' + P.btn('Jetzt anlegen', 'tpl-run', { id: t.id }, 'secondary') + P.btn('Löschen', 'tpl-del', { id: t.id }, 'ghost') + '</div></div>').join('');
  }
  ui.on('tpl-new', () => ui.sheet('Neue Vorlage', '<div class="sn-field"><label class="sn-label" for="tp-title">Titel</label><input class="sn-input" id="tp-title"></div>'
    + '<div class="sn-filter"><div class="sn-field"><label class="sn-label" for="tp-at">Uhrzeit</label><input class="sn-input" type="time" id="tp-at" value="07:00"></div><div class="sn-field"><label class="sn-label" for="tp-dept">Abteilung</label><select class="sn-select" id="tp-dept">' + deptOpts('Obst und Gemüse') + '</select></div></div>'
    + '<div class="sn-field"><label class="sn-label" for="tp-act">Tätigkeit</label><select class="sn-select" id="tp-act">' + M.ACTS.map((a) => '<option>' + esc(a.key) + '</option>').join('') + '</select></div>'
    + '<div class="sn-field"><label class="sn-label" for="tp-check">Checkliste (optional, ein Punkt pro Zeile)</label><textarea class="sn-textarea" id="tp-check" rows="3"></textarea></div>'
    + '<label class="sn-check"><input type="checkbox" id="tp-u">🔥 Dringend</label><label class="sn-check"><input type="checkbox" id="tp-sat" checked>Auch samstags</label>',
  P.btn('Speichern', 'tpl-save', {}, 'primary', 'check')));
  ui.on('tpl-save', async () => {
    const title = String(ui.sheetVal('tp-title') || '').trim(); if (!title) return ui.toast('Bitte einen Titel eingeben.', 'warn');
    const id = U.id('tpl');
    const cl = String(ui.sheetVal('tp-check') || '').split('\n').map((x) => x.trim()).filter(Boolean);
    await SN.store.put('templates', id, { id, title, at: ui.sheetVal('tp-at'), dept: ui.sheetVal('tp-dept'), act: ui.sheetVal('tp-act'), min: M.ACT_MIN[ui.sheetVal('tp-act')], u: !!ui.sheetVal('tp-u'), escalate: cl.length > 0, checklist: cl.length ? cl : undefined, days: ui.sheetVal('tp-sat') ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4] });
    ui.toast('Vorlage gespeichert'); ui.closeSheet();
  });
  ui.on('tpl-run', async (el) => { const t = SN.store.peek('templates', el.dataset.id); const r = await C.runTemplate(t, SN.session.id); if (ui.result(r, 'Angelegt')) SN.dist.run(SN.session.id); });
  ui.on('tpl-del', async (el) => { await SN.store.del('templates', el.dataset.id); ui.toast('Vorlage gelöscht'); });

  /* ---------- Team -------------------------------------------------------------- */
  function team(sub) {
    const q = (sub.teamQ || '').toLowerCase();
    const l = U.sortBy(M.staff().filter((e) => !q || e.name.toLowerCase().includes(q)), (e) => -M.level(e) * 100 + e.name.charCodeAt(0));
    return P.btn('Person hinzufügen', 'st-edit', {}, 'secondary', 'plus')
      + '<div class="sn-field"><label class="sn-label sn-sr-only" for="team-q">Suche</label><input class="sn-input" id="team-q" placeholder="Name suchen" data-change="team-q" value="' + esc(sub.teamQ || '') + '"></div>'
      + P.sec('Team', l.length) + '<ul class="sn-list">' + l.map((e) => '<li class="sn-list__item"><button type="button" class="sn-card sn-card--tap" style="width:100%;text-align:left;padding:10px" data-act="st-edit" data-id="' + e.id + '"><span class="sn-list__title">' + esc(e.name) + (e.firstAid ? ' ⛑' : '') + '</span><span class="sn-list__sub">' + esc(M.role(e).label + ' · ' + (e.dept || '–') + ' · ' + (e.sh || '') + ' · ' + (e.h || 8) + ' Std') + '</span></button></li>').join('') + '</ul>';
  }
  ui.onChange('team-q', (el) => ui.sub('teamQ', el.value));
  ui.on('st-edit', (el) => {
    const e = el.dataset.id ? M.emp(el.dataset.id) : { name: '', role: 'emp', dept: 'Trocken sortiment', sh: 'Früh', h: 8, acts: [], lang: 'de' };
    ui.sheet(e.id ? e.name : 'Person hinzufügen', '<div class="sn-field"><label class="sn-label" for="se-name">Name</label><input class="sn-input" id="se-name" value="' + esc(e.name) + '"></div>'
      + '<div class="sn-filter"><div class="sn-field"><label class="sn-label" for="se-role">Rolle</label><select class="sn-select" id="se-role">' + Object.entries(M.ROLES).map(([k, r]) => '<option value="' + k + '"' + (k === e.role ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('') + '</select></div>'
      + '<div class="sn-field"><label class="sn-label" for="se-dept">Abteilung</label><select class="sn-select" id="se-dept">' + deptOpts(e.dept) + '</select></div></div>'
      + '<div class="sn-filter"><div class="sn-field"><label class="sn-label" for="se-sh">Schicht</label><select class="sn-select" id="se-sh"><option' + (e.sh === 'Früh' ? ' selected' : '') + '>Früh</option><option' + (e.sh === 'Spät' ? ' selected' : '') + '>Spät</option></select></div>'
      + '<div class="sn-field"><label class="sn-label" for="se-h">Std/Tag</label><input class="sn-input" type="number" min="2" max="10" id="se-h" value="' + (e.h || 8) + '"></div></div>'
      + '<div class="sn-field"><label class="sn-label" for="se-lang">Sprache für Übersetzungen</label><select class="sn-select" id="se-lang">' + Object.entries(SN.ai.LANGS).map(([k, l]) => '<option value="' + k + '"' + (k === (e.lang || 'de') ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>'
      + '<fieldset class="sn-choices"><legend class="sn-label">Tätigkeiten (wichtig für die Verteilung)</legend>' + M.ACTS.map((a) => '<label class="sn-choice"><input type="checkbox" name="se-acts" value="' + esc(a.key) + '"' + ((e.acts || []).includes(a.key) ? ' checked' : '') + '><span>' + esc(a.label) + '</span></label>').join('') + '</fieldset>'
      + '<label class="sn-check"><input type="checkbox" id="se-fa"' + (e.firstAid ? ' checked' : '') + '>Ersthelfer/in</label><label class="sn-check"><input type="checkbox" id="se-kasse"' + (e.kasse ? ' checked' : '') + '>Kassenberechtigt</label>'
      + '<div class="sn-field"><label class="sn-label" for="se-pin">PIN ' + (e.id ? '(leer lassen = unverändert)' : '(4–6 Ziffern)') + '</label><input class="sn-input" id="se-pin" inputmode="numeric" maxlength="6"></div>',
    P.btn('Speichern', 'st-save', { id: e.id || '' }, 'primary', 'check') + (e.id && e.id !== SN.session.id ? P.btn('Entfernen', 'st-del', { id: e.id }, 'ghost') : ''));
  });
  ui.on('st-save', async (el) => {
    const name = String(ui.sheetVal('se-name') || '').trim(); if (name.length < 2) return ui.toast('Bitte einen Namen eingeben.', 'warn');
    const pin = String(ui.sheetVal('se-pin') || '').trim();
    if (pin && !/^\d{4,6}$/.test(pin)) return ui.toast('PIN: 4 bis 6 Ziffern.', 'warn');
    const id = el.dataset.id || U.id('e');
    const acts = Array.from(document.querySelectorAll('input[name="se-acts"]:checked')).map((x) => x.value);
    const base = el.dataset.id ? U.clone(M.emp(id)) : { id };
    Object.assign(base, { name, role: ui.sheetVal('se-role'), dept: ui.sheetVal('se-dept'), sh: ui.sheetVal('se-sh'), h: +ui.sheetVal('se-h') || 8, lang: ui.sheetVal('se-lang'), acts, firstAid: !!ui.sheetVal('se-fa'), kasse: !!ui.sheetVal('se-kasse') });
    if (pin) base.pin = pin;
    const r = await SN.store.put('staff', id, base);
    if (!r.ok) return ui.toast('Nicht gespeichert.', 'warn');
    await C.log(SN.session.id, (el.dataset.id ? 'Person geändert: ' : 'Person angelegt: ') + name);
    ui.toast('Gespeichert'); ui.closeSheet();
  });
  ui.on('st-del', async (el) => { const n = M.name(el.dataset.id); await SN.store.del('staff', el.dataset.id); await C.log(SN.session.id, 'Person entfernt: ' + n); ui.toast('Entfernt'); ui.closeSheet(); });

  /* ---------- Einstellungen ------------------------------------------------------- */
  function settings(me, now) {
    const s = M.settings(), cur = M.adminOnDuty(now);
    return '<section class="sn-card" style="padding:14px"><h3 class="sn-section-title" style="margin-top:0">🛡 Admin vom Dienst</h3><p class="sn-small">Bekommt Defekte und eskalierte Meldungen. Jetzt: <b>' + esc(M.name(cur)) + '</b></p>'
      + '<div class="sn-chips">' + M.admins().map((id) => '<button type="button" class="sn-chip' + (id === cur ? ' sn-chip--solid' : ' sn-chip--outline') + '" data-act="duty" data-id="' + id + '">' + esc(M.name(id)) + '</button>').join('') + '</div></section>'
      + '<section class="sn-card" style="padding:14px"><h3 class="sn-section-title" style="margin-top:0">⏰ Eskalationsfristen (Minuten ohne Reaktion)</h3>'
      + Object.entries(M.DEADLINE_LABELS).map(([k, l]) => '<div class="sn-field"><label class="sn-label" for="dl-' + k + '">' + esc(l) + '</label><input class="sn-input" type="number" min="1" max="240" id="dl-' + k + '" value="' + s.deadlines[k] + '"></div>').join('')
      + P.btn('Fristen speichern', 'dl-save', {}, 'primary', 'check') + '</section>'
      + '<p class="sn-muted sn-small">Kette: zuständige Schichtleitung → Teamleitung → Admin vom Dienst → Filialleitung. Benachrichtigungen nur während der eigenen Schicht.</p>';
  }
  ui.on('duty', async (el) => { await SN.store.patch('settings', 'main', { adminOnDuty: el.dataset.id }); await C.log(SN.session.id, 'Admin vom Dienst: ' + M.name(el.dataset.id)); ui.toast(M.first(el.dataset.id) + ' ist jetzt Admin vom Dienst'); });
  ui.on('dl-save', async () => {
    const d = {}; for (const k of Object.keys(M.DEADLINE_LABELS)) d[k] = Math.max(1, num('dl-' + k) || M.DEFAULT_DEADLINES[k]);
    await SN.store.patch('settings', 'main', { deadlines: d }); await C.log(SN.session.id, 'Eskalationsfristen geändert'); ui.toast('Fristen gespeichert');
  });

  /* ---------- Stimmung, Protokoll ----------------------------------------------- */
  function mood(now) {
    let h = '<p class="sn-muted">Anonym, nur als Summe je Schicht und erst ab 5 Antworten. Keine Auswertung einzelner Personen.</p>';
    for (let i = 0; i < 7; i++) {
      const d = U.fmt.dayKey(now - i * U.DAY);
      for (const sh of M.SHIFT_NAMES) {
        const a = C.moodAggregate(d, sh);
        h += '<div class="sn-card" style="padding:10px"><b>' + esc(U.fmt.date(now - i * U.DAY) + ' · ' + sh) + '</b>' + (a ? '<div class="sn-bars">' + ['😀', '🙂', '😐', '🙁'].map((m, k) => '<div><span>' + m + '</span><i style="width:' + Math.round((a.c[k + 1] || 0) / a.n * 100) + '%"></i><span>' + (a.c[k + 1] || 0) + '</span></div>').join('') + '</div>' : '<p class="sn-muted sn-small">Weniger als 5 Antworten – nicht angezeigt.</p>') + '</div>';
      }
    }
    return h;
  }
  function logView(now) {
    const l = SN.store.peek('log', U.fmt.dayKey(now));
    const e = l ? l.entries.slice().reverse() : [];
    return '<p class="sn-muted">Änderungen an Team, Plänen, Zuteilungen und Einstellungen – nachvollziehbar statt „über Nacht geändert“.</p>' + (e.length ? '<ol class="sn-timeline">' + e.map((x) => '<li><time>' + U.fmt.time(x.at) + '</time> ' + esc(M.name(x.by) + ': ' + x.text) + '</li>').join('') + '</ol>' : P.empty('Heute noch keine Änderungen'));
  }

  function render({ me, now, sub }) {
    const tabs = [['goods', '🚚 Eingang'], ['stock', '📦 Restware'], ['tpl', '🔁 Vorlagen'], ['team', '👥 Team'], ['set', '⚙️ Einstellungen'], ['mood', '🙂 Stimmung'], ['log', '🧾 Protokoll']];
    const t = sub.moreTab || 'goods';
    const head = '<div class="sn-chips" role="tablist">' + tabs.map(([k, l]) => '<button type="button" role="tab" class="sn-chip' + (k === t ? ' sn-chip--solid' : ' sn-chip--outline') + '" aria-selected="' + (k === t) + '" data-act="more-tab" data-k="' + k + '">' + l + '</button>').join('') + '</div>';
    const body = t === 'goods' ? goods(me, now) : t === 'stock' ? stock() : t === 'tpl' ? templates() : t === 'team' ? team(sub) : t === 'set' ? settings(me, now) : t === 'mood' ? mood(now) : logView(now);
    return head + body + '<button type="button" class="sn-btn sn-btn--ghost sn-btn--block" data-go="me">' + icon('user') + '<span>Ich: Profil, Plan, Abmelden</span></button>';
  }
  ui.registerView('more', { label: 'Mehr', icon: 'menu', groups: ['admin'], order: 50, render });
  ui.on('more-tab', (el) => ui.sub('moreTab', el.dataset.k));

  /* ---------- KI-Sprachassistent (K1) ---------------------------------------------- */
  let found = [];
  function aiRender({ me }) {
    const can = SN.ai.available();
    return '<p class="sn-muted">Sprich oder tippe, was wer machen soll. Die KI legt daraus Aufträge an – du bestätigst vor dem Senden. Beispiel: „Anna soll in der Drogerie die Lücken füllen, dringend. Kemal baut das Aktionsregal Getränke auf.“</p>'
      + (can.text ? '' : '<div class="sn-alert sn-alert--info sn-alert--card"><p class="sn-alert__title">KI nur in der Claude-Ansicht verfügbar.</p></div>')
      + '<div class="sn-field"><label class="sn-label" for="ai-text">Diktat</label><textarea class="sn-textarea" id="ai-text" rows="4"></textarea></div>'
      + '<div class="sn-row" style="gap:8px">' + (can.dictation ? P.btn('Sprechen', 'mic', { target: 'ai-text' }, 'secondary', 'mic') : '') + P.btn('Aufträge erkennen', 'ai-go', {}, 'primary') + '</div>'
      + (found.length ? P.sec('Erkannt – bitte prüfen', found.length) + found.map((f, i) => '<div class="sn-card' + (f.u ? ' sn-card--urgent' : '') + '" style="padding:12px"><b>' + (f.u ? '🔥 ' : '') + esc(f.t) + '</b><p class="sn-small">' + esc(f.dept + ' · ' + f.act) + '</p>'
        + '<div class="sn-field"><label class="sn-label" for="ai-who-' + i + '">Für ' + (f.who && !f.wid ? '<span class="sn-chip sn-chip--urgent">„' + esc(f.who) + '“ nicht gefunden</span>' : '') + '</label><select class="sn-select" id="ai-who-' + i + '"><option value="">Automatisch verteilen</option>' + U.sortBy(SN.dist.candidates(SN.clock.now()), (e) => e.name).map((e) => '<option value="' + e.id + '"' + (e.id === f.wid ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('') + '</select></div></div>').join('')
        + P.btn('Alle senden und verteilen', 'ai-send', {}, 'primary', 'send') : '');
  }
  ui.registerView('ai', { label: 'KI', icon: 'mic', groups: ['admin'], order: 60, render: aiRender, show: (me) => M.canAiAssist(me) });
  ui.on('ai-go', async (el) => {
    const tx = String(ui.sheetVal('ai-text') || '').trim(); if (!tx) return ui.toast('Bitte zuerst sprechen oder tippen.', 'warn');
    el.disabled = true;
    const out = await SN.ai.json('Ein Admin einer Supermarkt-Filiale diktiert Aufträge (beliebige Sprache): ' + JSON.stringify(tx) + '. Antworte NUR mit JSON-Array von Objekten {"t":"Auftrag auf Deutsch","dept":"einer von: ' + M.DEPTS.join(', ') + '","act":"einer von: ' + M.ACTS.map((a) => a.key).join(', ') + '","u":true wenn dringend,"who":"Name der Person oder leer"}.', { tier: 'default' });
    el.disabled = false;
    if (!Array.isArray(out)) return ui.toast('Nicht erkannt. KI nur in Claude verfügbar.', 'warn');
    const cands = SN.dist.candidates(SN.clock.now());
    found = out.filter((x) => x && x.t).map((x) => {
      const w = String(x.who || '').toLowerCase().trim();
      const hit = w ? cands.filter((e) => e.name.toLowerCase() === w || e.name.toLowerCase().split(' ')[0] === w.split(' ')[0]) : [];
      return { t: String(x.t).slice(0, 140), dept: M.DEPTS.includes(x.dept) ? x.dept : 'Info', act: M.ACT_MIN[x.act] ? x.act : 'Sonstiges', u: !!x.u, who: x.who || '', wid: hit.length === 1 ? hit[0].id : '' };
    });
    ui.render(true);
  });
  ui.on('ai-send', async () => {
    const me = SN.session.me(), now = SN.clock.now();
    let n = 0;
    for (let i = 0; i < found.length; i++) {
      const f = found[i], wid = ui.sheetVal('ai-who-' + i) || null;
      const r = await C.task(me.id, { title: f.t, dept: f.dept, act: f.act, u: f.u, owner: wid || undefined, due: now + 4 * U.HOUR, escalate: true });
      if (r.ok) n++; else ui.toast(f.t + ': ' + r.reason, 'warn');
    }
    const d = await SN.dist.run(me.id);
    found = []; ui.toast(n + ' Aufträge gesendet. ' + SN.dist.resultText(d)); ui.render(true);
  });
})(window.SN = window.SN || {});
