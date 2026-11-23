/* ==========================================================================
   SN.lead – Kernlogik des Steuerpults der Schichtleitung (rein, ohne UI)
   --------------------------------------------------------------------------
   - ampel(now, {me})      Status je Prozessbereich (ok | warn | crit) aus echten Daten
   - next(me, now, n)      die wichtigsten nächsten Handgriffe mit Direkt-Aktion
   - sendLage / reportUp   Meldung nach oben (Filialleitung) über SN.comm.send
   - CHECKS, startCheck, markPoint, finishCheck   Rundgänge; Mängel → Aufträge/Meldungen
   - teamList, callPerson  „Mein Team“ mit Ein-Tap-Ruf
   - quiet                 Ruhiger Modus (Zustand je Person, läuft am Schichtende ab)
   Regeln: Zeit nur über SN.clock.now(); keine Rangliste von Personen;
   Status immer mit Wort + Symbol (nie nur Farbe).
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, D = SN.dist;
  const MIN = U.MIN;
  const now0 = (n) => (n === undefined ? SN.clock.now() : n);
  const fail = (reason) => Promise.resolve({ ok: false, reason });

  /* ---------- Status ----------------------------------------------------- */
  const LV = { ok: 0, warn: 1, crit: 2 };
  const WORD = { ok: 'In Ordnung', warn: 'Beobachten', crit: 'Handeln nötig' };
  const STATUS_ICON = { ok: 'check-circle', warn: 'alert', crit: 'flame' };
  const worst = (levels) => levels.reduce((w, l) => (LV[l] > LV[w] ? l : w), 'ok');

  /** Schwellen (an einer Stelle änderbar) */
  const LIMITS = {
    soonMin: 15,       // Auftrag „bald fällig“
    truckCritMin: 15,  // Lieferung ohne Tour: ab hier rot
    staffWarn: 0.8,    // Besetzung unter 80 % des Solls: gelb
    staffCrit: 0.6,    // unter 60 %: rot
    handoverMin: 30,   // Übergabe-Erinnerung vor Schichtende
    upWaitMin: 10,     // Meldung nach oben ohne Reaktion: gelb
  };

  /* ---------- Prozessbereiche -------------------------------------------- */
  const AREAS = [
    { key: 'goods', label: 'Wareneingang', icon: 'truck', depts: ['Wareneinnahme', 'Lager'], checks: ['rampe'] },
    { key: 'fresh', label: 'Frische und MHD', icon: 'apple', depts: ['MoPro', 'Obst und Gemüse', 'Fertige Gerichte', 'Moon Food Abteilung'], checks: ['frische', 'kuehlung'] },
    { key: 'shelf', label: 'Regale und Lücken', icon: 'package', depts: ['Trocken sortiment', 'Getränkeabteilung', 'Alkoholische Getränke', 'Drogerie', 'Konserven'], cats: ['gap'] },
    { key: 'checkout', label: 'Kasse und Info', icon: 'cart', depts: ['Kasse', 'Info'], checks: ['kasse'] },
    { key: 'bottle', label: 'Leergut', icon: 'recycle', depts: ['Leergut'], cats: ['bottle'], checks: ['leergut'] },
    { key: 'clean', label: 'Reinigung', icon: 'broom', cats: ['clean'] },
    { key: 'bakery', label: 'Backshop und Theken', icon: 'bread', depts: ['Backshop und Frischetheke'] },
    { key: 'tasks', label: 'Aufträge', icon: 'tasks' },
    { key: 'reports', label: 'Meldungen', icon: 'report' },
    { key: 'staff', label: 'Personal und Pausen', icon: 'users' },
  ];
  const AREA = Object.fromEntries(AREAS.map((a) => [a.key, a]));

  /* ---------- Rundgänge (Prüflisten) -------------------------------------- */
  // Punkt: {text, fix, type: task|report, act?, cat?, dept?, u?}. Mangel → automatisch Auftrag oder Meldung.
  const CHECKS = {
    frische: {
      key: 'frische', label: 'Frische und MHD', icon: 'apple', dept: 'MoPro', at: { 'Früh': '09:00', 'Spät': '17:00' },
      points: [
        { text: 'Molkerei: MHD geprüft', fix: 'MHD prüfen und Abgelaufenes aussortieren: Molkerei', type: 'task', act: 'Warenpflege', dept: 'MoPro' },
        { text: 'Käse und Wurst (SB, Theke): MHD geprüft', fix: 'MHD prüfen und Abgelaufenes aussortieren: Käse und Wurst', type: 'task', act: 'Warenpflege', dept: 'MoPro' },
        { text: 'Obst und Gemüse: frisch, Verdorbenes raus', fix: 'Obst und Gemüse verlesen, Verdorbenes aussortieren', type: 'task', act: 'Warenpflege', dept: 'Obst und Gemüse' },
        { text: 'Backshop: Ware vom Vortag gekennzeichnet', fix: 'Backshop: Ware vom Vortag kennzeichnen und aussortieren', type: 'task', act: 'Warenpflege', dept: 'Backshop und Frischetheke' },
        { text: 'Abgelaufene Ware entnommen', fix: 'Abgelaufene Ware entnehmen und als Bruch erfassen', type: 'task', act: 'Warenpflege', dept: 'MoPro', u: true },
      ],
    },
    kuehlung: {
      key: 'kuehlung', label: 'Kühlung', icon: 'thermometer', dept: 'MoPro', at: { 'Früh': '08:00', 'Spät': '16:00' },
      points: [
        { text: 'Kühlregale Molkerei: Anzeige im Sollbereich', fix: 'Kühlregal Molkerei: Temperatur außerhalb des Sollbereichs', type: 'report', cat: 'defect', dept: 'MoPro', u: true },
        { text: 'Fleisch- und Wursttheke: Anzeige im Sollbereich', fix: 'Fleisch- und Wursttheke: Temperatur außerhalb des Sollbereichs', type: 'report', cat: 'defect', dept: 'Backshop und Frischetheke', u: true },
        { text: 'Tiefkühlung: Anzeige im Sollbereich', fix: 'Tiefkühlung: Temperatur außerhalb des Sollbereichs', type: 'report', cat: 'defect', dept: 'Fertige Gerichte', u: true },
        { text: 'Kühlraum Lager: Tür dicht, Anzeige ok', fix: 'Kühlraum Lager: Tür oder Temperatur prüfen', type: 'report', cat: 'defect', dept: 'Lager' },
      ],
    },
    kasse: {
      key: 'kasse', label: 'Kassenzone', icon: 'cart', dept: 'Kasse', at: { 'Früh': '12:00', 'Spät': '19:00' },
      points: [
        { text: 'Bänder und Kassenplätze sauber', fix: 'Kassenzone: Bänder und Kassenplätze reinigen', type: 'task', act: 'Sonstiges', dept: 'Kasse' },
        { text: 'Papierkörbe geleert', fix: 'Kassenzone: Papierkörbe leeren', type: 'task', act: 'Sonstiges', dept: 'Kasse' },
        { text: 'Boden frei und trocken', fix: 'Kassenzone: Boden reinigen', type: 'report', cat: 'clean', dept: 'Kasse' },
        { text: 'Info-Theke ordentlich, Tüten und Rollen aufgefüllt', fix: 'Info-Theke auffüllen und ordnen', type: 'task', act: 'Sonstiges', dept: 'Info' },
      ],
    },
    leergut: {
      key: 'leergut', label: 'Leergutraum', icon: 'recycle', dept: 'Leergut', at: { 'Früh': '11:00', 'Spät': '18:00' },
      points: [
        { text: 'Leergutautomaten laufen', fix: 'Leergutautomat prüfen', type: 'report', cat: 'bottle', dept: 'Leergut' },
        { text: 'Leergutraum nicht überfüllt', fix: 'Leergutraum leeren und sortieren', type: 'task', act: 'Leergut', dept: 'Leergut' },
        { text: 'Wege frei, nichts verstellt', fix: 'Leergutraum: Wege freiräumen', type: 'report', cat: 'safety', dept: 'Leergut' },
      ],
    },
    rampe: {
      key: 'rampe', label: 'Rampe', icon: 'truck', dept: 'Wareneinnahme', at: { 'Früh': '08:00', 'Spät': '16:00' },
      points: [
        { text: 'Rampe und Fluchtweg frei', fix: 'Rampe: Fluchtweg freiräumen', type: 'report', cat: 'safety', dept: 'Wareneinnahme', u: true },
        { text: 'Leere Paletten und KKP geordnet', fix: 'Leere Paletten und KKP ordnen', type: 'task', act: 'Wareneinnahme', dept: 'Wareneinnahme' },
        { text: 'Rampenbereich sauber', fix: 'Rampenbereich reinigen', type: 'report', cat: 'clean', dept: 'Wareneinnahme' },
      ],
    },
  };
  const CHECK_ORDER = ['frische', 'kuehlung', 'kasse', 'leergut', 'rampe'];

  /* ---------- Hilfen ------------------------------------------------------ */
  const allItems = () => SN.store.list('items');
  const notFuture = (it, now) => !it.plannedFor || it.plannedFor <= U.fmt.dayKey(now);
  const openTasks = (now) => allItems().filter((it) => it.kind === 'task' && !C.isFinal(it) && it.state !== 'done' && !it.check && notFuture(it, now));
  const unanswered = (it) => (it.kind === 'report' || it.kind === 'absence') && !C.isFinal(it) && it.state !== 'taken' && !it.lage;
  const hot = (it, now) => !!(it.u || (it.esc && it.esc.level > 0) || (it.ackDue && now >= it.ackDue));
  const names = (ids, max) => { const n = ids.map(M.first); return n.length > (max || 3) ? n.slice(0, max || 3).join(', ') + ' und ' + (n.length - (max || 3)) + ' weitere' : n.join(', '); };
  const inArea = (a, it) => !!((a.depts && a.depts.includes(it.dept)) || (a.cats && it.cat && a.cats.includes(it.cat)));
  const sig = (level, text, extra) => Object.assign({ level, text }, extra);
  const plural = (n, one, many) => U.fmt.count(n, one, many);

  function repSig(list, now) {
    if (!list.length) return null;
    const crit = list.filter((it) => hot(it, now));
    const first = crit[0] || list[0];
    return sig(crit.length ? 'crit' : 'warn',
      plural(list.length, 'Meldung', 'Meldungen') + ' ohne Antwort' + (crit.length ? ', ' + crit.length + ' dringend oder eskaliert' : ''),
      { kind: 'reports', act: 'it-open', label: 'Ansehen', data: { id: first.id }, ids: list.map((i) => i.id) });
  }
  function callSigs(list, now) {
    const out = [];
    for (const it of list) {
      const st = C.callStatus(it);
      const late = (it.esc && it.esc.level > 0) || (it.ackDue && now >= it.ackDue);
      out.push(sig(late ? 'crit' : 'warn', it.title + ': ' + st.yes.length + ' von ' + st.need + ' Zusagen' + (it.dept ? ' (' + it.dept + ')' : ''),
        { kind: 'call', act: 'it-remind', label: 'Nachfassen', data: { id: it.id }, ids: [it.id] }));
    }
    return out;
  }
  const openCalls = () => allItems().filter((it) => it.kind === 'call' && !C.isFinal(it) && it.need > 0 && !C.callStatus(it).enough);

  /** Meldungen, Aufträge und Rufe, die fachlich zu einem Bereich gehören */
  function domainSignals(a, now) {
    const out = [];
    const tasks = openTasks(now).filter((it) => inArea(a, it));
    const late = tasks.filter((it) => it.due && it.due < now);
    if (late.length) out.push(sig('crit', plural(late.length, 'Auftrag', 'Aufträge') + ' überfällig', { kind: 'task', act: 'it-open', label: 'Ansehen', data: { id: late[0].id }, ids: late.map((i) => i.id) }));
    const soon = tasks.filter((it) => it.due && it.due >= now && it.due - now <= LIMITS.soonMin * MIN);
    if (soon.length) out.push(sig('warn', plural(soon.length, 'Auftrag', 'Aufträge') + ' in den nächsten ' + LIMITS.soonMin + ' Min fällig', { kind: 'task', act: 'it-open', label: 'Ansehen', data: { id: soon[0].id }, ids: soon.map((i) => i.id) }));
    const free = tasks.filter((it) => !it.owner && it.u);
    if (free.length) out.push(sig('crit', plural(free.length, 'dringender Auftrag', 'dringende Aufträge') + ' ohne Person', { kind: 'task', act: 'it-assign', label: 'Zuteilen', data: { id: free[0].id }, ids: free.map((i) => i.id) }));
    const r = repSig(allItems().filter((it) => unanswered(it) && inArea(a, it)), now);
    if (r) out.push(r);
    out.push(...callSigs(openCalls().filter((it) => inArea(a, it) || (a.key === 'checkout' && (it.type === 'kasse' || it.type === 'info')) || (a.key === 'goods' && it.type === 'goods')), now));
    return out;
  }

  /* ---------- Rundgang-Zustand -------------------------------------------- */
  function dueAt(def, now) { return U.startOfDay(now) + U.fmt.hm(def.at[M.currentShift(now)] || '23:59') * MIN; }
  /** → {key, label, state: idle|open|due|running|done, dueAt, run, misses, doneAt} */
  function checkStatus(key, now) {
    now = now0(now);
    const def = CHECKS[key], shift = M.currentShift(now), day = U.fmt.dayKey(now);
    const runs = U.sortBy(allItems().filter((it) => it.check === key && it.chkDay === day && it.chkShift === shift), (it) => -it.createdAt);
    const run = runs[0] || null;
    const base = { key, label: def.label, icon: def.icon, run, dueAt: shift ? dueAt(def, now) : null };
    if (!shift) return Object.assign(base, { state: 'idle' });
    if (run && run.doneAt && run.state === 'done') return Object.assign(base, { state: 'done', doneAt: run.doneAt, misses: ((run.checkResult || {}).misses) || 0 });
    if (run) return Object.assign(base, { state: 'running' });
    return Object.assign(base, { state: now >= base.dueAt ? 'due' : 'open' });
  }
  const dueChecks = (now) => CHECK_ORDER.map((k) => checkStatus(k, now)).filter((c) => c.state === 'due' || c.state === 'running' && now >= c.dueAt);

  /* ---------- Ampel -------------------------------------------------------- */
  function areaSignals(a, now, me) {
    const out = domainSignals(a, now);
    const items = allItems();
    if (a.key === 'goods') {
      const day = U.fmt.dayKey(now);
      for (const t of SN.store.list('trucks')) {
        if (t.state === 'done' || U.fmt.dayKey(t.at) !== day) continue;
        const tours = items.filter((it) => it.truckId === t.id);
        const age = Math.round((now - t.at) / MIN);
        if (!tours.length) out.push(sig(age >= LIMITS.truckCritMin ? 'crit' : 'warn', 'Lieferung ' + (t.title || '') + ' ohne Tour seit ' + U.fmt.dur(age), { kind: 'truck', act: 'cp-go', label: 'Tour planen', data: { tab: 'ware' }, ids: [t.id] }));
        else if (tours.some((x) => x.state !== 'done')) out.push(sig('warn', 'Lieferung läuft: ' + tours.filter((x) => x.state !== 'done').length + ' von ' + tours.length + ' Touren offen', { kind: 'truck', act: 'cp-go', label: 'Ansehen', data: { tab: 'ware' }, ids: [t.id] }));
      }
    }
    if (a.key === 'shelf') {
      const rest = SN.store.list('rest').filter((r) => !r.done);
      if (rest.length) out.push(sig('warn', plural(rest.length, 'Posten Restware', 'Posten Restware') + ' offen', { kind: 'rest', ids: rest.map((r) => r.id) }));
    }
    for (const k of a.checks || []) {
      const c = checkStatus(k, now);
      if (c.state === 'due') out.push(sig('warn', 'Rundgang ' + c.label + ' fällig seit ' + U.fmt.time(c.dueAt), { kind: 'check', act: 'cp-check-start', label: 'Starten', data: { k } }));
      else if (c.state === 'running' && now >= c.dueAt) out.push(sig('warn', 'Rundgang ' + c.label + ' angefangen, nicht abgeschlossen', { kind: 'check', act: 'cp-check-start', label: 'Weiter', data: { k } }));
    }
    if (a.key === 'tasks') {
      const tasks = openTasks(now);
      const late = tasks.filter((it) => it.due && it.due < now);
      if (late.length) out.push(sig('crit', plural(late.length, 'Auftrag', 'Aufträge') + ' überfällig', { kind: 'task', act: 'it-open', label: 'Ansehen', data: { id: U.sortBy(late, (x) => x.due)[0].id }, ids: late.map((i) => i.id) }));
      const soon = tasks.filter((it) => it.due && it.due >= now && it.due - now <= LIMITS.soonMin * MIN);
      if (soon.length) out.push(sig('warn', plural(soon.length, 'Auftrag', 'Aufträge') + ' bald fällig', { kind: 'task', ids: soon.map((i) => i.id) }));
      const free = tasks.filter((it) => !it.owner);
      const hotFree = free.filter((it) => it.u);
      if (hotFree.length) out.push(sig('crit', plural(hotFree.length, 'dringender Auftrag', 'dringende Aufträge') + ' ohne Person', { kind: 'task', act: 'live-dist', label: 'Verteilen', data: {}, ids: hotFree.map((i) => i.id) }));
      else if (free.length) out.push(sig('warn', plural(free.length, 'freier Auftrag', 'freie Aufträge') + ' ohne Person', { kind: 'task', act: 'live-dist', label: 'Verteilen', data: {}, ids: free.map((i) => i.id) }));
      const proofs = items.filter((it) => it.kind === 'task' && it.state === 'done' && it.proof && it.approved == null);
      if (proofs.length) out.push(sig('warn', plural(proofs.length, 'Nachweis wartet', 'Nachweise warten') + ' auf Freigabe', { kind: 'proof', act: 'it-open', label: 'Prüfen', data: { id: proofs[0].id }, ids: proofs.map((i) => i.id) }));
    }
    if (a.key === 'reports') {
      const r = repSig(items.filter(unanswered), now);
      if (r) out.push(r);
      for (const it of C.activeSos()) out.push(sig('crit', it.title + ' · ' + C.waitingOn(it, now), { kind: 'sos', act: 'it-open', label: 'Ansehen', data: { id: it.id }, ids: [it.id] }));
      if (me) {
        const up = items.filter((it) => it.up && it.from === me.id && !C.isFinal(it) && !Object.keys(it.seen || {}).some((id) => id !== me.id) && now - it.createdAt > LIMITS.upWaitMin * MIN);
        if (up.length) out.push(sig('warn', 'Deine Meldung an die Filialleitung wartet seit ' + U.fmt.dur((now - up[0].createdAt) / MIN), { kind: 'up', act: 'it-open', label: 'Ansehen', data: { id: up[0].id }, ids: up.map((i) => i.id) }));
        const ph = items.filter((it) => it.kind === 'photo' && it.from === me.id && !C.isFinal(it) && !Object.keys(it.seen || {}).some((id) => id !== me.id) && now - it.createdAt > LIMITS.upWaitMin * MIN);
        if (ph.length) out.push(sig('warn', plural(ph.length, 'Fotobericht', 'Fotoberichte') + ' noch ungesehen', { kind: 'photo', act: 'cp-go', label: 'Ansehen', data: { tab: 'photo' }, ids: ph.map((i) => i.id) }));
      }
    }
    if (a.key === 'staff') {
      const abs = items.filter((it) => it.kind === 'absence' && !C.isFinal(it));
      if (abs.length) out.push(sig(abs.some((it) => hot(it, now)) ? 'crit' : 'warn', plural(abs.length, 'Ausfall', 'Ausfälle') + ' offen: ' + abs.map((it) => it.title).slice(0, 2).join(', '), { kind: 'absence', act: 'it-open', label: 'Ansehen', data: { id: abs[0].id }, ids: abs.map((i) => i.id) }));
      const pa = D.pauseAlerts(now);
      if (pa.over.length) out.push(sig('warn', 'Pause überzogen: ' + names(pa.over.map((x) => x.id)) + ' – kurz nachfragen', { kind: 'pause', act: 'p-chat', label: 'Nachfragen', data: { id: pa.over[0].id }, ids: pa.over.map((x) => x.id) }));
      if (pa.due.length) out.push(sig('warn', plural(pa.due.length, 'Person sollte', 'Personen sollten') + ' jetzt Pause machen: ' + names(pa.due), { kind: 'pause', ids: pa.due }));
      const bes = staffing(now);
      if (bes.expected && bes.ratio < LIMITS.staffWarn) out.push(sig(bes.ratio < LIMITS.staffCrit ? 'crit' : 'warn', 'Besetzung ' + bes.present + ' von ' + bes.expected + ' laut Plan', { kind: 'staffing' }));
      for (const d of D.overloaded(now)) out.push(sig('warn', d.dept + ' überlastet: ' + U.fmt.dur(d.open) + ' offen, ' + plural(d.people, 'Person', 'Personen') + ' da', { kind: 'overload', act: 'live-dist', label: 'Verteilen', data: { dept: d.dept }, ids: [] }));
    }
    return U.sortBy(out, (s) => -LV[s.level]);
  }

  /** Besetzung der laufenden Schicht gegen Soll (Mitarbeitende und Azubis laut Schicht) */
  function staffing(now) {
    now = now0(now);
    const shift = M.currentShift(now);
    const plan = M.staff().filter((e) => (e.role === 'emp' || e.role === 'azubi') && e.sh === shift && M.shiftWindow(e, now));
    const present = plan.filter((e) => M.onDuty(e, now));
    return { shift, expected: plan.length, present: present.length, away: plan.filter((e) => M.isAway(e, now)).length, ratio: plan.length ? present.length / plan.length : 1 };
  }

  /** Ampel aller Bereiche → {areas[], counts{ok,warn,crit}, worst} */
  function ampel(now, opts) {
    now = now0(now); opts = opts || {};
    const areas = AREAS.map((a) => {
      const signals = areaSignals(a, now, opts.me);
      const status = worst(signals.map((s) => s.level));
      return { key: a.key, label: a.label, icon: a.icon, status, word: WORD[status], statusIcon: STATUS_ICON[status], reason: signals[0] ? signals[0].text : 'Alles ruhig', signals };
    });
    const counts = { ok: 0, warn: 0, crit: 0 };
    areas.forEach((a) => { counts[a.status]++; });
    return { areas, counts, worst: counts.crit ? 'crit' : counts.warn ? 'warn' : 'ok' };
  }

  /* ---------- Als Nächstes -------------------------------------------------- */
  /** Die wichtigsten Handgriffe: [{key, score, level, icon, title, sub, act, label, data}] */
  function next(me, now, max, amp) {
    now = now0(now); max = max || 3;
    me = M.emp(me.id) || me; // frischer Stand (Pause, Plan)
    amp = amp || ampel(now, { me });
    const out = [];
    const add = (o) => out.push(Object.assign({ level: 'warn', data: {} }, o));
    // 1. SOS
    for (const it of C.activeSos()) {
      if (it.from === me.id || (it.answers || {})[me.id]) continue;
      add({ key: 'sos-' + it.id, score: 1000, level: 'crit', icon: 'sos', title: it.title, sub: M.name(it.from) + ' · ' + U.fmt.ago(it.createdAt), act: 'sos-respond', label: 'Hilfe kommt', data: { id: it.id } });
    }
    // 2. Eingang: Eskaliertes und Dringendes zuerst
    for (const it of C.inbox(me.id)) {
      if (it.kind === 'sos' || it.kind === 'photo') continue;
      const escd = it.esc && it.esc.level > 0 && C.currentIds(it).includes(me.id);
      const base = escd ? 900 + it.esc.level : it.u ? 800 : 450;
      const age = Math.min(30, Math.round((now - it.createdAt) / MIN)) / 10;
      const a = it.kind === 'call' ? { act: 'call-yes', label: 'Ich komme' } : it.kind === 'handover' ? { act: 'it-ack', label: 'Erhalten' }
        : it.kind === 'shiftreq' ? { act: 'it-open', label: 'Ansehen' } : { act: 'it-take', label: 'Übernehmen' };
      add(Object.assign({ key: 'in-' + it.id, score: base + age, level: escd || it.u ? 'crit' : 'warn', icon: escd ? 'escalate' : it.u ? 'flame' : 'inbox',
        title: (escd ? 'Eskaliert: ' : it.u ? 'Dringend: ' : '') + it.title, sub: C.waitingOn(it, now) || M.name(it.from), data: { id: it.id } }, a));
    }
    // 3. Eigene Rufe ohne Zusage
    for (const it of openCalls()) {
      if (it.from !== me.id) continue;
      const st = C.callStatus(it);
      add({ key: 'call-' + it.id, score: 700, level: 'warn', icon: 'bell', title: it.title + ': noch keine Zusage', sub: st.yes.length + ' von ' + st.need + ' Zusagen · ' + U.fmt.ago(it.createdAt), act: 'it-remind', label: 'Nachfassen', data: { id: it.id } });
    }
    // 4. Fristen: überfälligster Auftrag
    const late = U.sortBy(openTasks(now).filter((it) => it.due && it.due < now + LIMITS.soonMin * MIN), (it) => it.due);
    if (late.length) {
      const t = late[0], over = t.due < now;
      add({ key: 'task-' + t.id, score: (over ? 600 : 520) + (t.u ? 50 : 0), level: over ? 'crit' : 'warn', icon: 'clock', title: (over ? 'Überfällig: ' : 'Bald fällig: ') + t.title,
        sub: (t.owner ? M.name(t.owner) : 'ohne Person') + ' · ' + U.fmt.left(t.due).text + (late.length > 1 ? ' · +' + (late.length - 1) : ''),
        act: t.owner ? 'p-chat' : 'it-assign', label: t.owner ? 'Nachfragen' : 'Zuteilen', data: { id: t.owner || t.id } });
    }
    // 5. Pausen
    const ps = D.pauseStatus(me, now);
    if (ps.state === 'due') add({ key: 'my-pause', score: 650, icon: 'coffee', title: 'Deine Pause ist fällig', sub: 'Seit 5,5 Std im Dienst', act: 'pause-start', label: 'Pause starten' });
    if (ps.state === 'over') add({ key: 'my-pause-over', score: 650, icon: 'coffee', title: 'Deine Pause ist abgelaufen', sub: 'Überzogen um ' + ps.over + ' Min', act: 'pause-end', label: 'Beenden' });
    const pa = D.pauseAlerts(now);
    const over = pa.over.filter((x) => x.id !== me.id);
    if (over.length) add({ key: 'pause-over', score: 560, icon: 'coffee', title: 'Pause überzogen: ' + names(over.map((x) => x.id)), sub: 'Kurz nachfragen, vielleicht ist etwas passiert', act: 'p-chat', label: 'Nachfragen', data: { id: over[0].id } });
    const due = pa.due.filter((id) => id !== me.id);
    if (due.length) add({ key: 'pause-due', score: 420, icon: 'coffee', title: plural(due.length, 'Person', 'Personen') + ' ist reif für die Pause', sub: names(due), act: 'cp-area', label: 'Ansehen', data: { k: 'staff' } });
    // 6. Lieferung ohne Tour
    const truck = amp.areas.find((a) => a.key === 'goods').signals.find((s) => s.kind === 'truck' && s.act);
    if (truck && /ohne Tour/.test(truck.text)) add({ key: 'truck', score: truck.level === 'crit' ? 580 : 380, level: truck.level, icon: 'truck', title: truck.text, sub: 'Ohne Tour wird nichts verräumt', act: truck.act, label: truck.label, data: truck.data });
    // 7. Rundgänge
    for (const c of dueChecks(now)) add({ key: 'chk-' + c.key, score: 500, icon: c.icon, title: 'Rundgang ' + c.label, sub: (c.state === 'running' ? 'angefangen' : 'fällig seit ' + U.fmt.time(c.dueAt)), act: 'cp-check-start', label: c.state === 'running' ? 'Weiter' : 'Starten', data: { k: c.key } });
    // 8. Schichtübergabe
    const ho = handoverState(me, now);
    if (ho.due) add({ key: 'handover', score: ho.minLeft <= LIMITS.handoverMin ? 550 : 300, icon: 'forward', title: 'Schichtübergabe vorbereiten', sub: 'Schichtende in ' + U.fmt.dur(ho.minLeft) + ' · ' + C.handoverSummary(ho.shift, now).text, act: 'cp-handover', label: 'Übergabe' });
    // 9. Freie Aufträge
    const free = openTasks(now).filter((it) => !it.owner);
    if (free.length) add({ key: 'free', score: 400, icon: 'users', title: plural(free.length, 'freier Auftrag', 'freie Aufträge'), sub: 'Verteilung berücksichtigt Limit und Pausen', act: 'live-dist', label: 'Verteilen' });
    // Doppelte Schlüssel entfernen, sortieren
    const seen = new Set();
    return U.sortBy(out, (o) => -o.score).filter((o) => (seen.has(o.key) ? false : seen.add(o.key))).slice(0, max);
  }

  /** Übergabe fällig? → {due, minLeft, shift} */
  function handoverState(me, now) {
    const w = M.shiftWindow(me, now);
    if (!w || now < w.s || now >= w.e) return { due: false };
    const minLeft = Math.round((w.e - now) / MIN);
    const sent = allItems().some((it) => it.kind === 'handover' && it.from === me.id && it.createdAt >= w.s);
    return { due: !sent && minLeft <= 60, minLeft, shift: M.currentShift(now) || me.sh, sent };
  }

  /* ---------- Meldung nach oben -------------------------------------------- */
  /** Empfänger „Filialleitung“: im Dienst, sonst alle; plus optional Admin vom Dienst */
  function upTargets(by, now, withAdmin) {
    now = now0(now);
    let ids = SN.ops.photoTargets('fl', now);
    if (withAdmin) ids = ids.concat(M.adminOnDuty(now));
    ids = U.uniq(ids).filter((id) => id !== by);
    return ids.length ? ids : M.adminOnDuty(now).filter((id) => id !== by);
  }
  const LAGE = {
    ok: { key: 'ok', label: 'Läuft alles', icon: 'check-circle', text: 'Läuft alles' },
    tight: { key: 'tight', label: 'Engpass', icon: 'alert', text: 'Engpass' },
    help: { key: 'help', label: 'Hilfe nötig', icon: 'sos', text: 'Hilfe nötig' },
  };
  /**
   * Lage-Update an die Filialleitung. ok → Info (kein Handlungsbedarf, keine Eskalation),
   * Engpass → Meldung, Hilfe → dringende Meldung an Filialleitung und Admin vom Dienst.
   */
  function sendLage(by, key, note, now) {
    now = now0(now);
    const l = LAGE[key];
    if (!l) return fail('Unbekannte Lage.');
    const me = M.emp(by);
    const ids = upTargets(by, now, key === 'help');
    if (!ids.length) return fail('Niemand von der Leitung erreichbar.');
    const common = { title: 'Lage: ' + l.text, body: note || '', lage: key, up: true, dept: me ? M.deptOf(me, now) : null, to: { type: 'person', ids } };
    if (key === 'ok') return C.send(Object.assign({ kind: 'post', needAck: false }, common), by, now);
    return C.send(Object.assign({ kind: 'report', cat: 'other', u: key === 'help' }, common), by, now);
  }
  /** Letztes Lage-Update dieser Schicht → {item, key, text, state} oder null */
  function lastLage(by, now) {
    now = now0(now);
    const w = M.shiftWindow(M.emp(by), now);
    const from = w ? w.s : U.startOfDay(now);
    const it = allItems().filter((x) => x.lage && x.from === by && x.createdAt >= from).reduce((b, x) => (!b || x.createdAt >= b.createdAt ? x : b), null);
    if (!it) return null;
    const seen = Object.keys(it.seen || {}).filter((id) => id !== by);
    const state = it.state === 'taken' ? 'übernommen von ' + M.first(it.owner) : seen.length ? 'gesehen von ' + names(seen, 2) : 'gesendet, noch nicht gesehen';
    return { item: it, key: it.lage, text: LAGE[it.lage].label, state };
  }
  /** Meldung an die Filialleitung (Kategorien aus REPORT_CATS). opts {body, u, dept} */
  function reportUp(by, catKey, opts, now) {
    now = now0(now); opts = opts || {};
    const c = M.CAT[catKey];
    if (!c) return fail('Unbekannte Kategorie.');
    const me = M.emp(by);
    const ids = upTargets(by, now, !!opts.u);
    if (!ids.length) return fail('Niemand von der Leitung erreichbar.');
    return C.send({
      kind: 'report', cat: c.key, title: c.label, body: opts.body || '', u: !!opts.u, up: true,
      dept: c.dept || opts.dept || (me && M.deptOf(me, now)) || 'Info', to: { type: 'person', ids },
    }, by, now);
  }

  /* ---------- Rundgänge: starten, abhaken, abschließen ----------------------- */
  /** Rundgang starten oder den laufenden dieser Schicht fortsetzen (ein Auftrag, Besitzerin = Schichtleitung) */
  async function startCheck(key, by, now) {
    now = now0(now);
    const def = CHECKS[key];
    if (!def) return { ok: false, reason: 'Rundgang unbekannt.' };
    const cur = checkStatus(key, now);
    if (cur.run && !cur.run.doneAt) return { ok: true, item: cur.run, resumed: true };
    const shift = M.currentShift(now) || (M.emp(by) || {}).sh || 'Früh';
    return C.send({
      kind: 'task', check: key, chkDay: U.fmt.dayKey(now), chkShift: shift, title: 'Rundgang: ' + def.label, dept: def.dept, act: 'Sonstiges', min: 0,
      owner: by, to: { type: 'person', ids: [by] }, state: 'taken', takenAt: now, startedAt: now, escalate: false,
      checklist: def.points.map((p, i) => ({ text: p.text, done: false, miss: false, k: i })),
    }, by, now);
  }
  /** Punkt setzen: state ok | miss | open */
  function markPoint(ref, by, idx, state, now) {
    const it = C.get(ref); now = now0(now);
    if (!it || !it.check || !it.checklist || !it.checklist[idx]) return fail('Punkt nicht gefunden.');
    if (it.doneAt) return fail('Der Rundgang ist schon abgeschlossen.');
    const list = it.checklist.map((c, i) => (i === idx ? Object.assign({}, c, { done: state === 'ok', miss: state === 'miss', by, at: now }) : c));
    return SN.store.patch('items', it.id, { checklist: list }).then(() => ({ ok: true, item: C.get(it.id) }));
  }
  /** Rundgang abschließen: jeder Mangel erzeugt einen Auftrag oder eine Meldung → {misses, tasks[], reports[]} */
  async function finishCheck(ref, by, now) {
    const it = C.get(ref); now = now0(now);
    if (!it || !it.check) return { ok: false, reason: 'Rundgang nicht gefunden.' };
    if (it.doneAt) return { ok: true, item: it, unchanged: true, misses: 0, tasks: [], reports: [] };
    const open = it.checklist.filter((p) => !p.done && !p.miss).length;
    if (open) return { ok: false, reason: 'Noch ' + plural(open, 'Punkt', 'Punkte') + ' offen.' };
    const def = CHECKS[it.check];
    const res = { tasks: [], reports: [] };
    for (const p of it.checklist) {
      if (!p.miss) continue;
      const pt = def.points[p.k];
      if (!pt) continue;
      if (pt.type === 'report') {
        const r = await C.report(by, { cat: pt.cat, dept: pt.dept || def.dept, body: pt.fix + ' (Rundgang ' + def.label + ')', u: !!pt.u, src: it.id }, now);
        if (r.ok) res.reports.push(r.item.id);
      } else {
        const r = await C.task(by, { title: pt.fix, dept: pt.dept || def.dept, act: pt.act || 'Sonstiges', u: !!pt.u, due: now + 60 * MIN, escalate: true, src: it.id });
        if (r.ok) res.tasks.push(r.item.id);
      }
    }
    const misses = it.checklist.filter((p) => p.miss).length;
    await C.done(it.id, by, {}, now);
    await SN.store.patch('items', it.id, { checkResult: { misses, tasks: res.tasks, reports: res.reports } });
    if (res.tasks.length) await D.run(by, now);
    await C.log(by, 'Rundgang ' + def.label + ': ' + (misses ? plural(misses, 'Mangel', 'Mängel') + ' (' + res.tasks.length + ' Aufträge, ' + res.reports.length + ' Meldungen)' : 'ohne Mängel'), now);
    return { ok: true, item: C.get(it.id), misses, tasks: res.tasks, reports: res.reports };
  }

  /* ---------- Mein Team ------------------------------------------------------ */
  /** Zuständigkeitsbereich: Schichtleitung = scope, Teamleitung = Abteilungsgruppe */
  function scopeOf(me) {
    if (M.isAdmin(me)) return null;
    if (me.role === 'tl' && me.group && M.DEPT_GROUPS[me.group]) return M.DEPT_GROUPS[me.group].depts;
    return me.scope && me.scope.length ? me.scope : [me.dept];
  }
  /** Personen der Schicht im Bereich: {counts{free,work,pause}, rows[{emp, key, text}]}; kein Ranking, frei zuerst */
  function teamList(me, now) {
    now = now0(now);
    const scope = scopeOf(me);
    const on = M.staff().filter((e) => e.id !== me.id && e.role !== 'clean' && !M.isLead(e) && (M.onDuty(e, now) || e.brk) && (!scope || scope.includes(M.deptOf(e, now))));
    const order = { free: 0, work: 1, pause: 2, away: 3, off: 4 };
    const rows = U.sortBy(on.map((e) => { const s = D.status(e, now); return { emp: e, key: s.key, text: s.text }; }), (r) => order[r.key] * 1000 + (M.deptOf(r.emp, now) || '').charCodeAt(0));
    const counts = { free: 0, work: 0, pause: 0 };
    rows.forEach((r) => { if (counts[r.key] !== undefined) counts[r.key]++; });
    return { counts, rows, scope };
  }
  /** Ein-Tap-Ruf an eine Person: „Kurz zu <Name> kommen“, Eskalation über die Rufkette */
  function callPerson(by, toId, note, now) {
    now = now0(now);
    const e = M.emp(toId);
    if (!e) return fail('Person nicht gefunden.');
    if (M.inPause(e)) return fail(M.first(toId) + ' ist in Pause.');
    if (!M.onDuty(e, now)) return fail(M.first(toId) + ' ist nicht im Dienst.');
    return C.send({ kind: 'call', type: 'meeting', title: 'Kurz zu ' + M.first(by) + ' kommen', body: note || '', u: false, need: 1, answers: {}, personal: true, dept: M.deptOf(e, now), to: { type: 'person', ids: [toId] } }, by, now);
  }

  /* ---------- Ruhiger Modus -------------------------------------------------- */
  const qMem = {};
  const quiet = {
    /** Zustand {since, until} oder null (abgelaufen = aus) */
    get(empId, now) {
      now = now0(now);
      let s = qMem[empId];
      if (s === undefined) { s = U.ls.get('quiet.' + empId, null); qMem[empId] = s; }
      return s && s.until > now ? s : null;
    },
    isOn(empId, now) { return !!quiet.get(empId, now); },
    /** An bis Schichtende (sonst 4 Std), aus = null */
    set(empId, on, now) {
      now = now0(now);
      let s = null;
      if (on) { const w = M.shiftWindow(M.emp(empId), now); s = { since: now, until: w && w.e > now ? w.e : now + 4 * U.HOUR }; }
      qMem[empId] = s;
      U.ls.set('quiet.' + empId, s);
      return s;
    },
    /** Still Gesammeltes seit Beginn: {chat, items} */
    collected(me, now) {
      now = now0(now);
      const s = quiet.get(me.id, now);
      if (!s) return { chat: 0, items: 0 };
      const items = C.inbox(me.id).filter((it) => it.createdAt >= s.since && it.kind !== 'sos' && !(it.esc && it.esc.level > 0 && C.currentIds(it).includes(me.id))).length;
      return { chat: C.totalUnread(me.id), items };
    },
  };

  SN.lead = {
    LV, WORD, STATUS_ICON, LIMITS, AREAS, AREA, CHECKS, CHECK_ORDER, LAGE,
    ampel, next, staffing, handoverState, checkStatus, dueChecks,
    upTargets, sendLage, lastLage, reportUp,
    startCheck, markPoint, finishCheck,
    scopeOf, teamList, callPerson, quiet,
  };
})(window.SN = window.SN || {});
