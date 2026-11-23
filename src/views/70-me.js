/* ==========================================================================
   Ich: Profil, Pause, Mein Plan (mit KI-Scan + Prüfansicht), Ausfall melden,
   Schichtanfragen (nur als Anfrage, S2), Übergabe (Leitung), Stimmung (anonym)
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  let draftPlan = null;

  function defaultPlan(me) {
    const f = me.sh !== 'Spät';
    return M.DAYS.map((d, i) => ({ d, off: i >= 5, s: f ? '06:00' : '14:00', e: f ? '14:00' : '22:00', p: SN.dist.pauseFor(me.h || 8) }));
  }
  function week(days, now) {
    const ti = (new Date(now).getDay() + 6) % 7;
    return '<div class="sn-week">' + days.map((x, i) => {
      const s = U.fmt.hm(x.s) / 60, e = U.fmt.hm(x.e) / 60;
      return '<div class="' + (i === ti ? 'is-today' : '') + '"><b>' + esc(x.d) + '</b>' + (x.off ? '<span class="sn-muted sn-small">frei</span>' : '<span class="sn-track"><i style="left:' + ((s - 5) / 18 * 100) + '%;width:' + ((e - s) / 18 * 100) + '%">' + esc(x.s + '–' + x.e) + ' ' + icon('coffee') + (x.p == null ? '' : x.p) + '</i></span>') + '</div>';
    }).join('') + '</div>';
  }
  function planEditor(days) {
    return '<p class="sn-muted">Bitte prüfen und bei Bedarf korrigieren, dann übernehmen.</p>' + days.map((x, i) => '<fieldset class="sn-plan-row"><legend class="sn-label">' + esc(x.d) + '</legend>'
      + '<label class="sn-check"><input type="checkbox" id="pl-off-' + i + '"' + (x.off ? ' checked' : '') + '>frei</label>'
      + '<div class="sn-filter"><input class="sn-input" id="pl-s-' + i + '" type="time" value="' + esc(x.s) + '" aria-label="Beginn ' + esc(x.d) + '"><input class="sn-input" id="pl-e-' + i + '" type="time" value="' + esc(x.e) + '" aria-label="Ende ' + esc(x.d) + '"><input class="sn-input" id="pl-p-' + i + '" type="number" min="0" max="90" value="' + (x.p == null ? '' : x.p) + '" aria-label="Pause Minuten ' + esc(x.d) + '"></div></fieldset>').join('');
  }

  function render({ me, now }) {
    const lim = SN.dist.limitOf(me, now);
    const plan = SN.store.peek('plans', me.id);
    const days = (plan && plan.days) || defaultPlan(me);
    let h = '<section class="sn-card" style="padding:14px"><div class="sn-person-row"><span class="sn-avatar sn-avatar--lead">' + esc(P.initials(me.name)) + '</span><div><p><b>' + esc(me.name) + '</b></p><p class="sn-muted sn-small">' + esc(M.role(me).label + (me.dept ? ' · ' + M.deptOf(me, now) : '') + ' · ' + (me.sh || '')) + '</p></div></div>'
      + (me.role !== 'clean' && !M.isAdmin(me) ? '<p class="sn-small">Pause heute: ' + SN.dist.pauseOf(me, now) + ' Min · Limit: ' + U.fmt.dur(lim) + ' (20 % bleiben für Kunden)</p>' : '') + '</section>';

    // Ausfall melden (selbst)
    h += P.sec('Ich falle aus') + '<div class="sn-row" style="gap:8px">' + P.btn('Krank', 'abs', { t: 'sick' }, 'secondary') + P.btn('Verspäte mich', 'abs', { t: 'late' }, 'secondary') + '</div>'
      + '<p class="sn-muted sn-small">Geht sofort an deine Schichtleitung. Bei Krankheit fragt die App automatisch, wer einspringen kann.</p>';

    // Schichtanfragen
    const reqs = SN.store.list('items').filter((it) => it.kind === 'shiftreq' && (C.isRecipient(it, me.id) || it.from === me.id) && now - it.createdAt < 7 * U.DAY);
    h += P.sec('Schichtanfragen', reqs.filter((r) => !C.isFinal(r)).length || '') + (reqs.length ? P.list(U.sortBy(reqs, (r) => -r.createdAt), me, now) : '<p class="sn-muted sn-small">Änderungen an deinem Plan kommen nur als Anfrage – du entscheidest.</p>')
      + P.btn(M.isLead(me) ? 'Schicht anfragen' : 'Tausch vorschlagen', 'sr-new', {}, 'ghost', 'plus');

    // Plan
    h += P.sec('Mein Plan') + week(days, now) + P.btn('Wochenplan der Filiale', 'go-week', {}, 'ghost', 'tasks')
      + '<div class="sn-row" style="gap:8px;margin-top:8px"><label class="sn-btn sn-btn--secondary" for="plan-photo">' + icon('camera') + '<span>Plan-Foto lesen</span></label><input type="file" id="plan-photo" accept="image/*" capture="environment" hidden data-change="plan-photo">'
      + P.btn('Bearbeiten', 'plan-edit', {}, 'ghost') + '</div>';

    // Übergabe (Leitung)
    if (M.isLead(me)) {
      const s = C.handoverSummary(M.currentShift(now) || me.sh, now);
      h += P.sec('Schichtübergabe') + '<div class="sn-card" style="padding:12px"><p class="sn-small">' + 'Automatisch dabei: ' + esc(s.text) + '</p>'
        + '<div class="sn-field"><label class="sn-label" for="ho-notes">Hinweise für die nächste Schicht</label><textarea class="sn-textarea" id="ho-notes" rows="2" placeholder="z. B. Kühlregal 3 tropft, Techniker kommt 15 Uhr"></textarea></div>'
        + P.btn('Übergabe senden', 'ho-send', {}, 'primary', 'send') + '</div>';
    }

    // Stimmung am Schichtende (anonym)
    const w = M.shiftWindow(me, now);
    const key = 'mood.' + me.id + '.' + U.fmt.dayKey(now);
    if (w && now > w.e - 90 * U.MIN && !U.ls.get(key, false)) {
      h += P.sec('Wie war deine Schicht?') + '<div class="sn-mood">' + ['Sehr gut', 'Gut', 'Geht so', 'Schlecht'].map((m, i) => '<button type="button" data-act="mood" data-v="' + (i + 1) + '">' + icon('mood-' + (i + 1), 'sn-icon--xl') + '<span>' + m + '</span></button>').join('') + '</div><p class="sn-muted sn-small">Anonym. Die Filialleitung sieht nur die Summe der Schicht, ab 5 Antworten.</p>';
    }
    h += P.sec('Darstellung') + '<div class="sn-row" style="gap:8px">' + ['auto', 'light', 'dark'].map((t) => P.btn(t === 'auto' ? 'Automatisch' : t === 'light' ? 'Hell' : 'Dunkel', 'theme', { t }, U.ls.get('theme', 'auto') === t ? 'primary' : 'ghost')).join('') + '</div>';
    h += '<button type="button" class="sn-btn sn-btn--danger sn-btn--block" style="margin-top:20px" data-act="logout">Abmelden</button>';
    return h;
  }

  ui.registerView('me', { label: 'Ich', icon: 'user', groups: ['emp', 'lead', 'admin', 'clean'], order: 90, render, show: (me) => !M.isAdmin(me),
    badge: (me) => SN.store.list('items').filter((it) => it.kind === 'shiftreq' && !C.isFinal(it) && C.isRecipient(it, me.id) && it.state !== 'taken').length });

  ui.on('abs', (el) => {
    const late = el.dataset.t === 'late';
    ui.sheet(late ? 'Ich verspäte mich' : 'Ich bin krank', (late ? '<fieldset class="sn-choices"><legend class="sn-label">Wie lange ungefähr?</legend>' + ['15', '30', '60'].map((m, i) => '<label class="sn-choice"><input type="radio" name="abs-m" value="' + m + '"' + (i ? '' : ' checked') + '><span>' + m + ' Min</span></label>').join('') + '</fieldset>' : '<p>Gute Besserung! Deine Schichtleitung bekommt sofort Bescheid. Die Krankmeldung (AU) gibst du wie gewohnt ab.</p>')
      + '<div class="sn-field"><label class="sn-label" for="abs-note">Hinweis (optional)</label><input class="sn-input" id="abs-note"></div>', P.btn('Senden', 'abs-go', { t: el.dataset.t }, 'primary', 'send'));
  });
  ui.on('abs-go', async (el) => {
    const r = await C.reportAbsence(SN.session.id, { type: el.dataset.t, minutes: +(P.picked('abs-m') || 0) || null, note: ui.sheetVal('abs-note') || '' });
    if (ui.result(r, 'Gemeldet – die Schichtleitung sieht es sofort' + (r.standin ? ', Einspringer werden gefragt' : ''))) ui.closeSheet();
  });

  ui.on('sr-new', () => {
    const me = SN.session.me();
    const people = U.sortBy(M.staff().filter((e) => e.id !== me.id && e.role !== 'clean' && (!M.isLead(me) ? !M.isLead(e) || e.role === 'sl' : true)), (e) => e.name);
    ui.sheet(M.isLead(me) ? 'Schicht anfragen' : 'Tausch vorschlagen', '<div class="sn-field"><label class="sn-label" for="sr-to">An</label><select class="sn-select" id="sr-to">' + people.map((e) => '<option value="' + e.id + '">' + esc(e.name + ' · ' + (e.dept || '')) + '</option>').join('') + '</select></div>'
      + '<div class="sn-filter"><div class="sn-field"><label class="sn-label" for="sr-day">Tag</label><select class="sn-select" id="sr-day">' + M.DAYS.slice(0, 6).map((d) => '<option>' + d + '</option>').join('') + '</select></div>'
      + '<div class="sn-field"><label class="sn-label" for="sr-sh">Schicht</label><select class="sn-select" id="sr-sh"><option>Früh</option><option>Spät</option></select></div></div>'
      + '<div class="sn-field"><label class="sn-label" for="sr-note">Nachricht</label><input class="sn-input" id="sr-note"></div>'
      + (M.isLead(me) ? '' : '<p class="sn-muted sn-small">Ein Tausch braucht danach die Freigabe der Schichtleitung.</p>'),
    P.btn('Anfrage senden', 'sr-go', {}, 'primary', 'send'));
  });
  ui.on('sr-go', async () => {
    const me = SN.session.me();
    const r = await C.shiftRequest(me.id, ui.sheetVal('sr-to'), { day: ui.sheetVal('sr-day'), shift: ui.sheetVal('sr-sh'), note: ui.sheetVal('sr-note') || '', swap: !M.isLead(me) });
    if (ui.result(r, 'Anfrage gesendet – du siehst die Antwort hier')) ui.closeSheet();
  });
  ui.on('ho-send', async () => { const r = await C.sendHandover(SN.session.id, { notes: ui.sheetVal('ho-notes') || '' }); ui.result(r, 'Übergabe gesendet – die nächste Schicht muss quittieren'); });
  ui.on('mood', async (el) => {
    const me = SN.session.me();
    await C.vote(+el.dataset.v, me.sh);
    U.ls.set('mood.' + me.id + '.' + U.fmt.dayKey(SN.clock.now()), true);
    ui.toast('Danke! Anonym gespeichert.'); ui.render(true);
  });
  ui.on('theme', (el) => { U.ls.set('theme', el.dataset.t); applyTheme(); ui.render(true); });
  function applyTheme() { const t = U.ls.get('theme', 'auto'); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }
  applyTheme();

  /* ---------- Plan: Bearbeiten und KI-Scan ------------------------------------ */
  function openEditor(days, title) {
    draftPlan = U.clone(days);
    ui.sheet(title || 'Plan bearbeiten', planEditor(draftPlan), P.btn('Übernehmen', 'plan-save', {}, 'primary', 'check'));
  }
  ui.on('plan-edit', () => { const me = SN.session.me(); const p = SN.store.peek('plans', me.id); openEditor((p && p.days) || defaultPlan(me)); });
  ui.on('plan-save', async () => {
    const days = draftPlan.map((x, i) => ({ d: x.d, off: !!ui.sheetVal('pl-off-' + i), s: ui.sheetVal('pl-s-' + i) || x.s, e: ui.sheetVal('pl-e-' + i) || x.e, p: ui.sheetVal('pl-p-' + i) === '' ? null : +ui.sheetVal('pl-p-' + i) }));
    const bad = days.find((x) => !x.off && U.fmt.hm(x.e) <= U.fmt.hm(x.s));
    if (bad) return ui.toast(bad.d + ': Ende liegt vor Beginn.', 'warn');
    const me = SN.session.me();
    const r = await SN.store.put('plans', me.id, { id: me.id, week: U.fmt.dayKey(SN.clock.now()), days });
    if (r.ok) { ui.toast('Plan gespeichert'); ui.closeSheet(); } else ui.toast('Nicht gespeichert.', 'warn');
  });
  ui.onChange('plan-photo', async (el) => {
    const f = el.files && el.files[0]; if (!f) return;
    if (!SN.ai.available().images) return ui.toast('Plan lesen geht nur in der Claude-Ansicht. Bitte „Bearbeiten“ nutzen.', 'warn');
    ui.toast('Plan wird gelesen …', 'info');
    const img = await U.shrinkImage(f, 1400, 0.75);
    const me = SN.session.me();
    const o = await SN.ai.image('Das Foto zeigt einen gedruckten Wochen-Dienstplan. Finde die Zeile für "' + me.name + '" (sonst die erste Zeile). Antworte NUR mit JSON-Array mit genau 7 Objekten für Mo bis So: {"d":"Mo","off":true/false,"s":"HH:MM","e":"HH:MM","p":Pause in Minuten oder null}. off=true bei frei, Urlaub oder krank.', [img.blob]);
    if (!Array.isArray(o)) return ui.toast('Plan konnte nicht gelesen werden. Bitte gerader fotografieren.', 'warn');
    const days = M.DAYS.map((d) => { const x = o.find((y) => y && y.d === d) || { off: true }; return { d, off: !!x.off, s: x.s || '06:00', e: x.e || '14:00', p: x.p == null ? null : +x.p }; });
    openEditor(days, 'Erkannter Plan – bitte prüfen');
  });
})(window.SN = window.SN || {});
