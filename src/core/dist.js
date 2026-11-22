/* ==========================================================================
   SN.dist – Verteilung, Limits, Pausen (M9)
   --------------------------------------------------------------------------
   Limit pro Person = (Arbeitsstunden × 60 − Pause) × 0,8  (20 % bleiben für Kunden)
   Nie darüber – weder automatisch noch per Selbstübernahme.
   Reihenfolge: dringend → Frist. Stufen: 1) gleiche Abteilung + passende Tätigkeit,
   2) gleiche Abteilung, 3) passende Tätigkeit, 4) beliebig. Geringste Auslastung
   gewinnt; außerhalb der eigenen Abteilung = „Hilfe“. In Pause bekommt niemand etwas.
   Pausenregel: bis 6 Std keine, bis 8 Std 30 Min, darüber 45 Min; Erinnerung nach 5,5 Std.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model;
  const MIN = U.MIN, HOUR = U.HOUR;
  const now0 = (n) => (n === undefined ? SN.clock.now() : n);
  const SHARE = 0.8;

  /** Pausenanspruch in Minuten für Arbeitsstunden h */
  const pauseFor = (h) => (h <= 6 ? 0 : h <= 8 ? 30 : 45);

  /** Arbeitsstunden heute (Plan oder Vertragsstunden pro Tag) */
  function hoursOf(e, now) {
    const w = M.shiftWindow(e, now0(now));
    if (w && e && SN.store.peek('plans', e.id)) return (w.e - w.s) / HOUR;
    return (e && e.h) || 8;
  }
  /** Pause heute in Minuten (Plan-Angabe hat Vorrang) */
  function pauseOf(e, now) {
    const w = M.shiftWindow(e, now0(now));
    if (w && w.p !== null && w.p !== undefined && SN.store.peek('plans', e.id)) return w.p;
    return pauseFor(hoursOf(e, now));
  }
  /** Limit in Minuten */
  function limitOf(e, now) {
    if (!e) return 0;
    return Math.round((hoursOf(e, now) * 60 - pauseOf(e, now)) * SHARE);
  }

  const openTask = (it) => it.kind === 'task' && it.state !== 'done' && !M.FINAL_STATES.includes(it.state);
  /** Auslastung in Minuten (offene Aufträge der Person) */
  function loadOf(empId, items) {
    return (items || SN.store.list('items')).reduce((s, it) => s + (openTask(it) && it.owner === empId ? (it.min || 0) : 0), 0);
  }
  const freeOf = (e, now) => Math.max(0, limitOf(e, now) - loadOf(e.id));

  /** Darf e den Auftrag übernehmen? → {ok, reason?} */
  function canTake(e, task, now) {
    now = now0(now);
    if (!e) return { ok: false, reason: 'Person nicht gefunden.' };
    const fn = e.name.split(' ')[0];
    if (M.inPause(e)) return { ok: false, reason: fn + ' ist in Pause. In der Pause gibt es keine Aufträge.' };
    if (M.isAway(e, now)) return { ok: false, reason: fn + ' ist heute abwesend.' };
    const lim = limitOf(e, now);
    const ld = loadOf(e.id);
    const min = (task && task.min) || M.ACT_MIN[task && task.act] || 20;
    if (ld + min > lim) {
      return { ok: false, reason: 'Limit von ' + fn + ' erreicht: noch ' + Math.max(0, lim - ld) + ' Min frei, der Auftrag braucht ca. ' + min + ' Min.' };
    }
    return { ok: true };
  }

  /** Wer bekommt verteilte Aufträge: Mitarbeitende/Azubis im Dienst, nicht in Pause, nicht abwesend */
  function candidates(now) {
    now = now0(now);
    return M.staff().filter((e) => (e.role === 'emp' || e.role === 'azubi') && M.onDuty(e, now) && !M.inPause(e) && !M.isAway(e, now));
  }

  /**
   * Verteilung berechnen (ohne zu schreiben).
   * → {assign: [{id, owner, help}], rest: [taskId]}
   */
  function plan(now, opts) {
    now = now0(now); opts = opts || {};
    const all = SN.store.list('items');
    const tasks = SN.comm.urgentFirst(all.filter((it) => openTask(it) && !it.owner && (!opts.dept || it.dept === opts.dept)));
    const people = opts.people || candidates(now);
    const load = {}, lim = {};
    for (const e of people) { load[e.id] = loadOf(e.id, all); lim[e.id] = limitOf(e, now); }
    const assign = [], rest = [];
    for (const t of tasks) {
      const min = t.min || M.ACT_MIN[t.act] || 20;
      const pool = people.filter((e) => !(t.returned && t.returned[e.id]) && load[e.id] + min <= lim[e.id]);
      const inDept = (e) => M.deptOf(e, now) === t.dept;
      const fits = (e) => !t.act || (e.acts || []).includes(t.act);
      const tiers = [pool.filter((e) => inDept(e) && fits(e)), pool.filter(inDept), pool.filter(fits), pool];
      let pick = null;
      for (const tier of tiers) {
        for (const e of tier) {
          const r = load[e.id] / (lim[e.id] || 1), rp = pick ? load[pick.id] / (lim[pick.id] || 1) : Infinity;
          if (r < rp || (r === rp && load[e.id] < load[pick.id])) pick = e;
        }
        if (pick) break;
      }
      if (pick) { load[pick.id] += min; assign.push({ id: t.id, owner: pick.id, help: !inDept(pick) }); }
      else rest.push(t.id);
    }
    return { assign, rest };
  }

  /** Verteilen und speichern → {assigned, rest, assign[]} */
  async function run(by, now, opts) {
    now = now0(now);
    const p = plan(now, opts);
    await Promise.all(p.assign.map((a) => SN.store.patch('items', a.id, {
      owner: a.owner, help: a.help, to: { type: 'person', ids: [a.owner] }, assignedAt: now, assignedBy: by || null,
    })));
    return { assigned: p.assign.length, rest: p.rest.length, assign: p.assign };
  }
  /** Kurztext zum Ergebnis */
  const resultText = (r) => 'Verteilt: ' + r.assigned + (r.rest ? ', passt nicht ins Limit: ' + r.rest : '');

  /* ---------- Pausen ------------------------------------------------------ */
  const takenToday = (e, now) => (e.pu && e.pu.day === U.fmt.dayKey(now) ? e.pu.min || 0 : 0);

  /**
   * Pausenstatus → {state, need, taken, left, over, until, remindAt}
   * state: none (kein Anspruch) | open | due (Erinnerung fällig) | running | over (überzogen) | done
   */
  function pauseStatus(e, now) {
    now = now0(now);
    const w = M.shiftWindow(e, now);
    const need = pauseOf(e, now);
    const taken = takenToday(e, now);
    const remindAt = w ? w.s + 5.5 * HOUR : null;
    const base = { need, taken, left: 0, over: 0, until: null, remindAt };
    if (e.brk) {
      const until = e.brk.s + e.brk.len * MIN;
      const left = Math.ceil((until - now) / MIN);
      return Object.assign(base, { state: left >= 0 ? 'running' : 'over', left: Math.max(0, left), over: Math.max(0, -left), until });
    }
    if (need > 0 && taken >= need) return Object.assign(base, { state: 'done' });
    if (need > 0 && w && now >= remindAt && now < w.e) return Object.assign(base, { state: 'due' });
    return Object.assign(base, { state: need > 0 ? 'open' : 'none' });
  }
  /** Pause starten (Länge = Restanspruch, mindestens 15 Min) */
  function startPause(empId, now) {
    now = now0(now);
    const e = M.emp(empId);
    if (!e) return Promise.resolve({ ok: false, reason: 'Person nicht gefunden.' });
    if (e.brk) return Promise.resolve({ ok: false, reason: 'Die Pause läuft schon.' });
    const len = Math.max(15, pauseOf(e, now) - takenToday(e, now));
    return SN.store.patch('staff', empId, { brk: { s: now, len } }).then(() => ({ ok: true, len }));
  }
  /** Pause beenden; verbrauchte Minuten werden für heute addiert */
  function endPause(empId, now) {
    now = now0(now);
    const e = M.emp(empId);
    if (!e || !e.brk) return Promise.resolve({ ok: false, reason: 'Keine Pause aktiv.' });
    const used = Math.round((now - e.brk.s) / MIN);
    return SN.store.patch('staff', empId, { brk: null, pu: { day: U.fmt.dayKey(now), min: takenToday(e, now) + used } })
      .then(() => ({ ok: true, used }));
  }
  /**
   * Pausenhinweise (ohne Ranking): due = Erinnerung fällig, over = Pause überzogen
   * → {due: [empId], over: [{id, over}]}; optional nur eine Schicht.
   */
  function pauseAlerts(now, shift) {
    now = now0(now);
    const due = [], over = [];
    for (const e of M.staff()) {
      if (shift && e.sh !== shift) continue;
      if (!M.onDuty(e, now) && !e.brk) continue;
      const s = pauseStatus(e, now);
      if (s.state === 'due') due.push(e.id);
      if (s.state === 'over') over.push({ id: e.id, over: s.over });
    }
    return { due, over };
  }

  /* ---------- Live-Status, Abteilungen, Umsetzen ------------------------- */
  /** Status für Live-Listen → {key: free|work|pause|away|off, text} */
  function status(e, now) {
    now = now0(now);
    if (M.isAway(e, now)) return { key: 'away', text: 'Abwesend' };
    if (e.brk) {
      const s = pauseStatus(e, now);
      return { key: 'pause', text: s.state === 'over' ? '☕ Pause überzogen um ' + s.over + ' Min' : '☕ Pause bis ' + U.fmt.time(s.until) };
    }
    if (!M.onDuty(e, now)) return { key: 'off', text: 'Nicht im Dienst' };
    const mine = SN.comm.myTasks(e.id);
    const cur = mine.find((t) => t.state === 'taken') || mine[0];
    if (!cur) return { key: 'free', text: 'Frei, bereit für einen Auftrag' };
    return { key: 'work', text: (cur.u ? '🔥 ' : '') + cur.title + (mine.length > 1 ? ' (+' + (mine.length - 1) + ')' : '') };
  }

  /** Auslastung einer Abteilung → {dept, open, cap, people} (Minuten) */
  function deptLoad(dept, now) {
    now = now0(now);
    const open = SN.store.list('items').filter((it) => openTask(it) && it.dept === dept && !it.owner).reduce((s, it) => s + (it.min || 0), 0);
    const ppl = candidates(now).filter((e) => M.deptOf(e, now) === dept);
    return { dept, open, people: ppl.length, cap: ppl.reduce((s, e) => s + freeOf(e, now), 0) };
  }
  /** Überlastete Abteilungen: freie Aufträge passen nicht mehr in die freien Limits der Leute dort */
  function overloaded(now) {
    return M.DEPTS.map((d) => deptLoad(d, now)).filter((x) => x.open > 0 && x.open > x.cap);
  }

  /** Umsetzen: minutes = 120 / 240 / null (dauerhaft) */
  function loan(empId, toDept, minutes, now) {
    now = now0(now);
    if (!M.emp(empId) || !M.DEPTS.includes(toDept)) return Promise.resolve({ ok: false, reason: 'Person oder Abteilung fehlt.' });
    const p = minutes ? { loan: { to: toDept, until: now + minutes * MIN, at: now } } : { dept: toDept, loan: null };
    return SN.store.patch('staff', empId, p).then(() => ({ ok: true }));
  }

  /** Wareneingang (S3): Aufwand in Min und Leute für ca. 60 Min Entladen */
  function truckEffort(q) {
    q = q || {};
    const min = (q.pal || 0) * M.EFFORT.pal + (q.kkp || 0) * M.EFFORT.kkp + (q.disp || 0) * M.EFFORT.disp;
    return { min, people: min ? Math.max(1, Math.ceil(min / 60)) : 0 };
  }

  SN.dist = {
    SHARE, pauseFor, hoursOf, pauseOf, limitOf, loadOf, freeOf, canTake, candidates, plan, run, resultText,
    pauseStatus, startPause, endPause, pauseAlerts, status, deptLoad, overloaded, loan, truckEffort,
  };
})(window.SN = window.SN || {});
