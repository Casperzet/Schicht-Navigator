/* ==========================================================================
   Start (Mitarbeitende, Schicht-/Teamleitung) + SOS + Hilfe rufen + Pause
   Reihenfolge nach Wichtigkeit: Quittierpflicht → Kurzbriefing → Aufträge →
   Schnellaktionen → eigene Meldungen.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;

  function pauseTile(me, now) {
    const ps = SN.dist.pauseStatus(me, now);
    if (ps.state === 'running' || ps.state === 'over') {
      return '<button type="button" class="sn-tile' + (ps.state === 'over' ? ' sn-tile--warn' : '') + '" data-act="pause-end">' + icon('coffee', 'sn-icon--lg sn-tile__icon')
        + '<span><span class="sn-tile__label">Pause beenden</span><span class="sn-tile__sub">' + (ps.state === 'over' ? 'überzogen um ' + ps.over + ' Min' : 'bis ' + U.fmt.time(ps.until)) + '</span></span></button>';
    }
    const left = Math.max(0, ps.need - ps.taken);
    return '<button type="button" class="sn-tile" data-act="pause-start">' + icon('coffee', 'sn-icon--lg sn-tile__icon')
      + '<span><span class="sn-tile__label">Pause starten</span><span class="sn-tile__sub">' + (ps.need ? (left ? left + ' Min stehen dir zu' : 'Pause genommen') : 'kein Anspruch heute') + '</span></span></button>';
  }

  function tiles(me, now) {
    return '<div class="sn-tiles">'
      + '<button type="button" class="sn-tile" data-go="report">' + icon('camera', 'sn-icon--lg sn-tile__icon') + '<span><span class="sn-tile__label">Problem melden</span><span class="sn-tile__sub">3 Taps, geht sofort an die richtige Person</span></span></button>'
      + '<button type="button" class="sn-tile" data-act="call-sheet">' + icon('users', 'sn-icon--lg sn-tile__icon') + '<span><span class="sn-tile__label">Hilfe rufen</span><span class="sn-tile__sub">Kasse, Info, Wareneingang</span></span></button>'
      + pauseTile(me, now)
      + '<button type="button" class="sn-tile sn-tile--sos" data-act="sos">' + icon('sos', 'sn-icon--lg sn-tile__icon') + '<span><span class="sn-tile__label">SOS</span><span class="sn-tile__sub">Notfall melden</span></span></button>'
      + '</div>';
  }

  function hero(me, now) {
    const mine = C.myTasks(me.id);
    const done = C.doneTasks(me.id).filter((t) => U.fmt.dayKey(t.doneAt || 0) === U.fmt.dayKey(now));
    const tot = mine.length + done.length;
    const pct = tot ? Math.round(done.length / tot * 100) : 0;
    const min = mine.reduce((s, t) => s + (t.min || 0), 0);
    const w = M.shiftWindow(me, now);
    return '<section class="sn-card sn-hero"><div class="sn-ring sn-ring--' + (pct >= 50 ? 'ok' : 'warn') + '" style="--p:' + pct + '" role="img" aria-label="' + done.length + ' von ' + tot + ' Aufträgen erledigt"><span><span class="sn-ring__value">' + done.length + '/' + tot + '</span><span class="sn-ring__label">erledigt</span></span></div>'
      + '<div><p class="sn-hero__title">' + (mine.length ? 'Noch ' + U.fmt.count(mine.length, 'Auftrag', 'Aufträge') : 'Alles erledigt') + '</p>'
      + '<p class="sn-muted">' + (min ? 'ca. ' + U.fmt.dur(min) + ' Arbeit · ' : '') + (w && now < w.e && now >= w.s ? 'Schichtende in ' + U.fmt.dur((w.e - now) / U.MIN) : w && now < w.s ? 'Schicht beginnt ' + U.fmt.time(w.s) : 'Nicht im Dienst') + '</p></div></section>';
  }

  function render({ me, now }) {
    let h = '';
    const ack = C.toAck(me.id);
    if (ack.length) h += P.sec('Bitte quittieren', ack.length) + P.list(ack, me, now);
    const br = C.briefingFor(me.id, now);
    if (br && !ack.find((x) => x.id === br.id)) h += P.sec('Kurzbriefing deiner Schicht') + P.itemCard(br, me, now, { compact: false });
    h += hero(me, now) + tiles(me, now);
    if (M.isLead(me)) {
      const inb = C.inbox(me.id);
      h += P.sec('Für dich', inb.length) + (inb.length ? P.list(inb.slice(0, 4), me, now) + (inb.length > 4 ? '<button type="button" class="sn-btn sn-btn--ghost sn-btn--block" data-go="inbox">Alle ' + inb.length + ' im Eingang</button>' : '') : P.empty('Nichts offen', 'Neue Meldungen erscheinen hier sofort.', true));
    }
    const mine = C.myTasks(me.id);
    if (M.isLead(me)) h += '<div class="sn-row" style="gap:8px;margin-top:12px">' + P.btn('Meine Aufträge', 'go-tasks', {}, 'secondary', 'tasks') + P.btn('Problem melden', 'go-report', {}, 'secondary', 'report') + '</div>';
    h += P.sec('Meine Aufträge', mine.length) + (mine.length ? P.list(mine.slice(0, 3), me, now) + (mine.length > 3 ? '<button type="button" class="sn-btn sn-btn--ghost sn-btn--block" data-go="tasks">Alle Aufträge</button>' : '') : P.empty('Keine Aufträge', 'Freie Aufträge findest du unter „Aufträge“.', true));
    const myRep = C.sentBy(me.id).filter((it) => (it.kind === 'report' || it.kind === 'absence' || it.kind === 'call') && !C.isFinal(it));
    if (myRep.length) h += P.sec('Meine offenen Meldungen', myRep.length) + P.list(myRep, me, now, '', { compact: true });
    const kudos = C.postsFor(me.id).filter((it) => it.kudos && now - it.createdAt < 3 * U.DAY);
    if (kudos.length) h += P.sec('Lob für dich') + kudos.map((k) => '<div class="sn-card sn-kudos">💛 <b>' + esc(M.first(k.from)) + ':</b> ' + esc(k.body || k.title) + '</div>').join('');
    return h;
  }

  ui.registerView('home', {
    label: 'Start', icon: 'home', groups: ['emp', 'lead'], order: 10, render,
    badge: (me) => { const n = C.toAck(me.id).length + (M.isLead(me) ? C.inbox(me.id).length : 0); return n ? { n, urgent: C.inbox(me.id).some((i) => i.u) } : 0; },
    fab: (me) => (M.isLead(me) ? { label: 'Senden', icon: 'send', act: 'send-sheet' } : { label: 'Melden', icon: 'camera', act: 'go-report' }),
  });
  ui.on('go-report', () => ui.go('report'));
  ui.on('go-tasks', () => ui.go('tasks'));

  /* ---------- Pause -------------------------------------------------------- */
  ui.on('pause-start', async () => { const r = await SN.dist.startPause(SN.session.id); ui.result(r, r.ok ? 'Gute Pause!' : ''); });
  ui.on('pause-end', async () => ui.result(await SN.dist.endPause(SN.session.id), 'Willkommen zurück'));

  /* ---------- Hilfe rufen (M5) --------------------------------------------- */
  ui.on('call-sheet', () => {
    const me = SN.session.me(), now = SN.clock.now();
    ui.sheet('Hilfe rufen', '<p class="sn-muted">Geht an passende Kolleg/innen im Dienst. Du siehst, wer kommt. Ohne Zusage eskaliert der Ruf nach ' + M.settings().deadlines.call + ' Min.</p>'
      + '<div class="sn-tiles">' + M.CALL_TYPES.filter((c) => c.key !== 'meeting' || M.isLead(me)).map((c) => {
        const n = C.callTargets(c.key, me.id, now).length;
        return '<button type="button" class="sn-tile" data-act="call-go" data-type="' + c.key + '"><span class="sn-tile__emoji" aria-hidden="true">' + c.icon + '</span><span><span class="sn-tile__label">' + esc(c.label) + '</span><span class="sn-tile__sub">' + U.fmt.count(n, 'Person', 'Personen') + ' erreichbar</span></span></button>';
      }).join('') + '</div><div class="sn-field"><label class="sn-label" for="call-note">Hinweis (optional)</label><input class="sn-input" id="call-note" placeholder="z. B. Kasse 7, lange Schlange"></div>');
  });
  ui.on('call-go', async (el) => {
    const r = await C.call(SN.session.id, el.dataset.type, { note: ui.sheetVal('call-note') || '' });
    if (ui.result(r, 'Ruf gesendet – du siehst, wer kommt')) ui.closeSheet();
  });

  /* ---------- SOS (M7): Fall wählen, 2 s halten ------------------------------ */
  let sosType = null;
  ui.on('sos', () => {
    sosType = null;
    const me = SN.session.me();
    const fa = C.firstAiders(SN.clock.now()).filter((x) => x.onDuty);
    const p = ui.sheet('SOS – Notfall', '<p><b>Bei Lebensgefahr immer zuerst anrufen:</b> <a href="tel:112">112</a> (Feuer, Rettung) · <a href="tel:110">110</a> (Polizei). Die App ersetzt den Anruf nicht.</p>'
      + '<fieldset class="sn-choices"><legend class="sn-label">Was ist passiert?</legend>' + M.SOS_TYPES.map((t) => '<label class="sn-choice"><input type="radio" name="sos-t" value="' + t.key + '" data-change="sos-type"><span>' + t.icon + ' ' + esc(t.label) + '</span></label>').join('') + '</fieldset>'
      + '<div class="sn-field"><label class="sn-label" for="sos-note">Wo? (optional)</label><input class="sn-input" id="sos-note" placeholder="z. B. Kasse 3, Gang 7" value="' + esc(me.dept || '') + '"></div>'
      + (fa.length ? '<p class="sn-muted sn-small">Ersthelfer/innen im Dienst: ' + esc(fa.map((x) => x.name + (x.inPause ? ' (Pause)' : '')).join(', ')) + '</p>' : ''),
      '<button type="button" class="sn-btn sn-btn--ack sn-btn--hold" id="sos-hold" disabled>' + icon('sos') + '<span>Halten: SOS senden</span></button><p class="sn-muted sn-small">2 Sekunden gedrückt halten – verhindert Fehlalarm in der Tasche.</p>');
    const b = p.querySelector('#sos-hold');
    let t0 = 0, raf = 0;
    const stop = () => { cancelAnimationFrame(raf); t0 = 0; b.style.setProperty('--hold', '0'); };
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 2000);
      b.style.setProperty('--hold', String(k));
      if (k >= 1) { stop(); send(); return; }
      raf = requestAnimationFrame(step);
    };
    b.addEventListener('pointerdown', (e) => { if (b.disabled) return; e.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(step); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => b.addEventListener(n, stop));
    b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.repeat && !t0) { t0 = performance.now(); raf = requestAnimationFrame(step); } });
    b.addEventListener('keyup', stop);
    async function send() {
      const r = await C.sos(SN.session.id, sosType, ui.sheetVal('sos-note') || '');
      if (ui.result(r, 'SOS gesendet – bitte auch 112 oder 110 anrufen')) { U.vibrate(200); ui.closeSheet(); }
    }
  });
  ui.onChange('sos-type', (el) => { sosType = el.value; const b = document.getElementById('sos-hold'); if (b) b.disabled = false; });
})(window.SN = window.SN || {});
