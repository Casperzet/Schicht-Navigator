/* ==========================================================================
   Live (Admin/Filialleitung) und Team (Schicht-/Teamleitung) – S1
   Oben „Brennpunkte“ mit Direkt-Aktion, darunter die Personen der Schicht mit
   Status. Je Person: Auftrag, Chat, Umsetzen. Keine Ranglisten.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;

  function scopeOf(me) {
    if (M.isAdmin(me)) return null;
    if (me.role === 'tl' && me.group && M.DEPT_GROUPS[me.group]) return M.DEPT_GROUPS[me.group].depts;
    return me.scope && me.scope.length ? me.scope : [me.dept];
  }

  function hotspots(me, now, scope) {
    let hs = C.hotspots(now);
    if (scope) hs = hs.filter((h) => !h.item ? scope.includes(h.dept) : (h.item.kind === 'sos' || !h.item.dept || scope.includes(h.item.dept)));
    if (!hs.length) return '';
    return P.sec('Brennpunkte', hs.length) + hs.slice(0, 8).map((h) => {
      const it = h.item;
      let act = '';
      if (h.type === 'report' && it) act = P.btn('Übernehmen', 'it-take', { id: it.id }, 'primary') + P.btn('Ansehen', 'it-open', { id: it.id }, 'ghost');
      else if (h.type === 'post' && it) act = P.btn('Nachfassen', 'it-remind', { id: it.id }, 'secondary', 'bell');
      else if (h.type === 'task' && it) act = P.btn('Verteilen', 'live-dist', {}, 'primary') + P.btn('Zuteilen', 'it-assign', { id: it.id }, 'ghost');
      else if (h.type === 'call' && it) act = P.btn('Ansehen', 'it-open', { id: it.id }, 'secondary');
      else if (h.type === 'sos' && it) act = P.btn('Ansehen', 'it-open', { id: it.id }, 'primary');
      else if (h.type === 'dept') act = P.btn('Verteilen', 'live-dist', { dept: h.dept }, 'secondary');
      return '<div class="sn-card' + (h.level >= 2 ? ' sn-card--escalated' : h.type === 'sos' ? ' sn-card--urgent' : '') + '" style="padding:12px"><p style="margin:0 0 8px;font-weight:600">' + esc(h.text) + '</p><div class="sn-card__actions">' + act + '</div></div>';
    }).join('');
  }

  function person(e, now) {
    const s = SN.dist.status(e, now);
    const st = s.key === 'pause' ? 'pause' : s.key === 'away' || s.key === 'off' ? 'off' : '';
    const lim = SN.dist.limitOf(e, now), load = SN.dist.loadOf(e.id);
    return '<div class="sn-card" style="padding:10px" data-n="' + esc((e.name + ' ' + (M.deptOf(e, now) || '')).toLowerCase()) + '"><div class="sn-person-row">'
      + '<span class="sn-avatar' + (M.isLead(e) ? ' sn-avatar--lead' : '') + '">' + esc(P.initials(e.name)) + '<span class="sn-avatar__status' + (st ? ' sn-avatar__status--' + st : '') + '" aria-hidden="true"></span></span>'
      + '<div><p><b>' + esc(e.name) + '</b> <span class="sn-muted sn-small">' + esc(M.role(e).label) + ' · ' + esc(M.deptOf(e, now) || '') + (e.loan && e.loan.until > now ? ' ↔' : '') + '</span></p>'
      + '<p class="sn-muted sn-small">' + esc(s.text) + (lim ? ' · ' + Math.round(load / lim * 100) + ' % verplant' : '') + '</p></div></div>'
      + '<div class="sn-card__actions">' + P.btn('Auftrag', 'p-task', { id: e.id }, 'secondary', 'plus') + P.btn('Chat', 'p-chat', { id: e.id }, 'ghost', 'chat') + P.btn('Umsetzen', 'p-move', { id: e.id }, 'ghost', 'forward') + '</div></div>';
  }

  function render({ me, now, sub }) {
    const scope = scopeOf(me);
    const on = M.staff().filter((e) => e.role !== 'clean' && !M.isAdmin(e) && M.onDuty(e, now) && (!scope || scope.includes(M.deptOf(e, now))));
    const sts = on.map((e) => SN.dist.status(e, now).key);
    const free = sts.filter((k) => k === 'free').length, pause = sts.filter((k) => k === 'pause').length;
    const openRep = SN.store.list('items').filter((it) => (it.kind === 'report' || it.kind === 'absence') && !C.isFinal(it) && (!scope || scope.includes(it.dept))).length;
    const pa = SN.dist.pauseAlerts(now);
    let h = '<div class="sn-kpis"><div class="sn-kpi"><span class="sn-kpi__value">' + on.length + '</span><span class="sn-kpi__label">im Dienst</span></div>'
      + '<div class="sn-kpi"><span class="sn-kpi__value">' + free + '</span><span class="sn-kpi__label">frei</span></div>'
      + '<div class="sn-kpi"><span class="sn-kpi__value">' + pause + '</span><span class="sn-kpi__label">Pause</span></div>'
      + '<div class="sn-kpi' + (openRep ? ' sn-kpi--alert' : '') + '"><span class="sn-kpi__value">' + openRep + '</span><span class="sn-kpi__label">Meldungen</span></div></div>';
    if (scope) h += '<p class="sn-muted sn-small">Dein Bereich: ' + esc(scope.join(', ')) + '</p>';
    h += hotspots(me, now, scope);
    const over = (pa.over || []).filter((x) => !scope || scope.includes(M.deptOf(M.emp(x.id || x), now)));
    if (over.length) h += '<div class="sn-alert sn-alert--warn sn-alert--card"><p class="sn-alert__title">☕ Pause überzogen: ' + esc(over.map((x) => M.first(x.id || x)).join(', ')) + '</p><p class="sn-alert__text">Kurz nachfragen – ohne Vorwurf, vielleicht ist etwas passiert.</p></div>';
    h += '<div class="sn-row" style="gap:8px;margin:12px 0">' + P.btn('Schnellruf', 'call-sheet', {}, 'secondary', 'bell') + P.btn('Neu verteilen', 'live-dist', {}, 'secondary', 'users') + '</div>';
    const dept = sub.liveDept || '';
    const q = (sub.liveQ || '').toLowerCase();
    const opts = scope || M.DEPTS;
    h += '<div class="sn-filter"><div><label class="sn-label sn-sr-only" for="live-q">Suche</label><input class="sn-input" id="live-q" placeholder="Name suchen" data-change="live-q" value="' + esc(sub.liveQ || '') + '"></div>'
      + '<div><label class="sn-label sn-sr-only" for="live-dept">Abteilung</label><select class="sn-select" id="live-dept" data-change="live-dept"><option value="">Alle Abteilungen</option>' + opts.map((d) => '<option value="' + esc(d) + '"' + (d === dept ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select></div></div>';
    const order = { free: 0, work: 1, pause: 2, away: 3, off: 4 };
    const list = U.sortBy(on.filter((e) => (!dept || M.deptOf(e, now) === dept) && (!q || e.name.toLowerCase().includes(q))), (e) => order[SN.dist.status(e, now).key] * 1000 + (M.deptOf(e, now) || '').charCodeAt(0));
    h += P.sec('Personen', list.length) + (list.length ? list.map((e) => person(e, now)).join('') : P.empty('Niemand gefunden', 'Filter ändern oder Schicht prüfen.'));
    return h;
  }

  const fab = () => ({ label: 'Senden', icon: 'send', act: 'send-sheet' });
  ui.registerView('live', { label: 'Live', icon: 'users', groups: ['admin'], order: 10, render, fab,
    badge: (me) => C.hotspots(SN.clock.now()).filter((h) => h.level >= 2).length });
  ui.registerView('team', { label: 'Team', icon: 'users', groups: ['lead'], order: 22, render, fab, show: () => false });

  ui.onChange('live-q', (el) => ui.sub('liveQ', el.value));
  ui.onChange('live-dept', (el) => ui.sub('liveDept', el.value));
  ui.on('live-dist', async (el) => { const r = await SN.dist.run(SN.session.id, undefined, el.dataset.dept ? { dept: el.dataset.dept } : undefined); ui.toast(SN.dist.resultText(r)); });
  ui.on('p-chat', (el) => SN.chatOpen(C.threadId.dm(SN.session.id, el.dataset.id)));

  ui.on('p-task', (el) => {
    const e = M.emp(el.dataset.id), now = SN.clock.now();
    ui.sheet('Auftrag für ' + e.name, '<p class="sn-muted sn-small">Frei: ' + U.fmt.dur(SN.dist.freeOf(e, now)) + ' bis zum Limit · ' + esc(SN.dist.status(e, now).text) + '</p>'
      + '<div class="sn-field"><label class="sn-label" for="pt-title">Was ist zu tun?</label><textarea class="sn-textarea" id="pt-title" rows="2"></textarea></div>'
      + '<div class="sn-field"><label class="sn-label" for="pt-act">Tätigkeit</label><select class="sn-select" id="pt-act">' + M.ACTS.map((a) => '<option' + ((e.acts || [])[0] === a.key ? ' selected' : '') + ' value="' + esc(a.key) + '">' + esc(a.label + ((e.acts || []).includes(a.key) ? ' ✓' : '')) + '</option>').join('') + '</select></div>'
      + '<label class="sn-check"><input type="checkbox" id="pt-u">🔥 Dringend</label>',
    P.btn('Senden', 'p-task-go', { id: e.id }, 'primary', 'send'));
  });
  ui.on('p-task-go', async (el) => {
    const me = SN.session.me(), e = M.emp(el.dataset.id), now = SN.clock.now();
    const title = String(ui.sheetVal('pt-title') || '').trim();
    if (!title) return ui.toast('Bitte beschreiben, was zu tun ist.', 'warn');
    const w = M.shiftWindow(e, now);
    const r = await C.task(me.id, { title, dept: M.deptOf(e, now), act: ui.sheetVal('pt-act'), owner: e.id, u: !!ui.sheetVal('pt-u'), due: w && w.e > now ? w.e : now + 2 * U.HOUR, escalate: true });
    if (ui.result(r, 'Auftrag an ' + M.first(e.id) + ' gesendet')) ui.closeSheet();
  });
  ui.on('p-move', (el) => {
    const e = M.emp(el.dataset.id);
    ui.sheet(e.name + ' umsetzen', '<p>Jetzt: <b>' + esc(M.deptOf(e, SN.clock.now())) + '</b></p><div class="sn-field"><label class="sn-label" for="mv-to">Nach Abteilung</label><select class="sn-select" id="mv-to">' + M.DEPTS.map((d) => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('') + '</select></div>'
      + '<fieldset class="sn-choices"><legend class="sn-label">Wie lange?</legend><label class="sn-choice"><input type="radio" name="mv-d" value="120" checked><span>2 Std</span></label><label class="sn-choice"><input type="radio" name="mv-d" value="240"><span>4 Std</span></label><label class="sn-choice"><input type="radio" name="mv-d" value="0"><span>Dauerhaft</span></label></fieldset>',
    P.btn('Umsetzen', 'p-move-go', { id: e.id }, 'primary', 'forward'));
  });
  ui.on('p-move-go', async (el) => {
    const r = await SN.dist.loan(el.dataset.id, ui.sheetVal('mv-to'), +P.picked('mv-d'));
    if (ui.result(r, M.first(el.dataset.id) + ' ist jetzt in ' + ui.sheetVal('mv-to'))) { ui.closeSheet(); await C.log(SN.session.id, M.name(el.dataset.id) + ' umgesetzt nach ' + ui.sheetVal('mv-to')); }
  });
})(window.SN = window.SN || {});
