/* ==========================================================================
   SN.ops – Fotobericht, Lieferung (KKP · Paletten · Boxen), Wochenplan
   --------------------------------------------------------------------------
   Fotobericht: Schichtleitung → Filialleitung, laufend über die Schicht.
     Status gesendet → gesehen → beantwortet; ungesehen eskaliert (Frist „photo“).
   Lieferung: Einheiten mit Abteilungs-Mix. Eine KKP enthält oft Ware für
     4–6 Abteilungen → Laufweg. Aufwand je Einheit (Minuten, änderbar):
       Palette 8 · Box 2 · KKP 4 + 3 je Abteilung.
     Personen = Aufwand ÷ Zielzeit (Standard 60 Min), höchstens wer da ist.
     Touren: Einheiten gleichmäßig verteilt (größte zuerst), Abteilungen in
     Laufweg-Reihenfolge der Filiale.
   Wochenplan: erwartete Lieferungen je Tag → Bedarf in Stunden gegen die
     Kapazität der eingeplanten Personen; „Verteilen“ legt Aufträge für den
     Tag an (plannedFor), anteilig nach freier Kapazität, nie über das Limit.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, MIN = U.MIN;
  const now0 = (n) => (n === undefined ? SN.clock.now() : n);

  /* ---------- Fotobericht ------------------------------------------------ */
  const PHOTO_CATS = [
    { key: 'order', label: 'Regal / Ordnung', icon: '🧺' },
    { key: 'goods', label: 'Ware / Lieferung', icon: '📦' },
    { key: 'promo', label: 'Aktion / Werbung', icon: '🏷️' },
    { key: 'clean', label: 'Sauberkeit', icon: '🧽' },
    { key: 'defect', label: 'Defekt', icon: '🔧' },
    { key: 'staff', label: 'Personal', icon: '👥' },
    { key: 'other', label: 'Sonstiges', icon: '📷' },
  ];
  const PHOTO_CAT = Object.fromEntries(PHOTO_CATS.map((c) => [c.key, c]));
  /** Empfänger: Filialleitung im Dienst, sonst alle; optional Admin vom Dienst */
  function photoTargets(to, now) {
    now = now0(now);
    if (to === 'admin') return [M.adminOnDuty(now)].filter(Boolean);
    const fl = M.staff().filter((e) => e.role === 'fl' || e.role === 'sfl');
    const on = fl.filter((e) => M.onDuty(e, now)).map((e) => e.id);
    return on.length ? on : fl.map((e) => e.id);
  }
  /** opts {cat, dept, body, orig, photos[], u, to: 'fl'|'admin'} */
  function photoReport(by, opts, now) {
    now = now0(now);
    const c = PHOTO_CAT[opts.cat] || PHOTO_CAT.other;
    const ids = photoTargets(opts.to, now).filter((id) => id !== by);
    if (!opts.photos || !opts.photos.length) return Promise.resolve({ ok: false, reason: 'Bitte mindestens ein Foto aufnehmen.' });
    return SN.comm.send({ kind: 'photo', cat: c.key, title: c.icon + ' ' + c.label, body: opts.body || '', orig: opts.orig, photos: opts.photos.slice(0, 4), dept: opts.dept, u: !!opts.u, to: { type: 'person', ids: ids.length ? ids : [M.adminOnDuty(now)] } }, by, now);
  }
  /** Schnellantworten der Filialleitung */
  const PHOTO_REPLIES = ['👍 Passt so', 'Bitte nachbessern', 'Danke, gut gemacht', 'Ruf mich kurz an'];

  /* ---------- Lieferung --------------------------------------------------- */
  const UNIT = {
    kkp: { label: 'KKP', long: 'KKP (Kaufland Klapp Pallets)', icon: '🛒' },
    pal: { label: 'Palette', long: 'Paletten', icon: '🟫' },
    box: { label: 'Box', long: 'Boxen (graue Kisten)', icon: '📥' },
  };
  function effortCfg() {
    const g = (M.settings().goods) || {};
    return { kkp: g.kkp || 4, kkpDept: g.kkpDept || 3, pal: g.pal || 8, box: g.box || 2, target: g.target || 60 };
  }
  const order = (d) => { const i = M.DEPTS.indexOf(d); return i < 0 ? 99 : i; };
  /** Minuten für eine Einheit {type, depts[]} */
  function unitMin(u, cfg) {
    cfg = cfg || effortCfg();
    if (u.type === 'pal') return cfg.pal;
    if (u.type === 'box') return cfg.box;
    return cfg.kkp + cfg.kkpDept * Math.max(1, (u.depts || []).length);
  }
  /**
   * Lieferung planen (ohne Schreiben). units: [{type, depts[]}]
   * → {min, people, available, rounds[{units, depts[], min}], perType{kkp,pal,box}, duration}
   */
  function planDelivery(units, now, opts) {
    now = now0(now); opts = opts || {};
    const cfg = effortCfg();
    const list = units.map((u, i) => Object.assign({ i, min: unitMin(u, cfg) }, u));
    const min = list.reduce((s, u) => s + u.min, 0);
    const available = opts.available !== undefined ? opts.available : SN.dist.candidates(now).length;
    const want = min ? Math.max(1, Math.ceil(min / cfg.target)) : 0;
    const people = available ? Math.min(want, available, list.length) : Math.min(want, list.length);
    const rounds = Array.from({ length: people }, () => ({ units: [], min: 0 }));
    for (const u of list.slice().sort((a, b) => b.min - a.min)) {
      const r = rounds.reduce((best, x) => (x.min < best.min ? x : best), rounds[0]);
      r.units.push(u); r.min += u.min;
    }
    for (const r of rounds) r.depts = U.uniq(r.units.flatMap((u) => u.depts || [])).sort((a, b) => order(a) - order(b));
    const perType = { kkp: 0, pal: 0, box: 0 };
    for (const u of list) perType[u.type] = (perType[u.type] || 0) + 1;
    return { min, want, people, available, rounds, perType, duration: rounds.length ? Math.max(...rounds.map((r) => r.min)) : 0, cfg };
  }
  /** Einheiten aus Zählern: kkp Anzahl mit Ø Abteilungen, Paletten, Boxen (Abteilungen gleichmäßig verteilt) */
  function unitsFromCounts(c, depts) {
    const out = [];
    const pool = depts && depts.length ? depts : M.DEPTS.filter((d) => !['Kasse', 'Info', 'Lager', 'Wareneinnahme', 'Leergut'].includes(d));
    let k = 0;
    const take = (n) => { const r = []; for (let i = 0; i < n; i++) r.push(pool[(k++) % pool.length]); return U.uniq(r); };
    for (let i = 0; i < (c.kkp || 0); i++) out.push({ type: 'kkp', depts: take(Math.max(1, Math.min(6, c.avg || 4))) });
    for (let i = 0; i < (c.pal || 0); i++) out.push({ type: 'pal', depts: take(1) });
    for (let i = 0; i < (c.box || 0); i++) out.push({ type: 'box', depts: take(1) });
    return out;
  }
  const unitLabel = (u) => UNIT[u.type].icon + ' ' + UNIT[u.type].label + (u.no ? ' ' + u.no : '');
  /** Lieferung anlegen: LKW-Dokument + ein Auftrag je Tour mit Laufweg-Checkliste, dann verteilen */
  async function createDelivery(by, title, units, opts, now) {
    now = now0(now); opts = opts || {};
    units = units.map((u, i) => Object.assign({}, u, { no: i + 1 }));
    const p = planDelivery(units, now);
    if (!p.min) return { ok: false, reason: 'Bitte mindestens eine Einheit eintragen.' };
    const id = U.id('lkw');
    await SN.store.put('trucks', id, { id, title: title || 'Lieferung', at: now, state: 'open', units, min: p.min, people: p.people, pal: p.perType.pal, kkp: p.perType.kkp, box: p.perType.box, by });
    const due = now + (p.duration + 15) * MIN;
    let made = 0;
    for (let r = 0; r < p.rounds.length; r++) {
      const round = p.rounds[r];
      const what = ['kkp', 'pal', 'box'].map((t) => { const n = round.units.filter((u) => u.type === t).length; return n ? n + ' ' + (t === 'pal' ? (n === 1 ? 'Palette' : 'Paletten') : t === 'kkp' ? 'KKP' : (n === 1 ? 'Box' : 'Boxen')) : ''; }).filter(Boolean).join(', ');
      // Checkliste = Laufweg: je Abteilung, welche Einheiten dorthin gehören
      const checklist = round.depts.map((d) => ({ text: (M.DEPT_ICONS[d] || '') + ' ' + d + ' – ' + round.units.filter((u) => (u.depts || []).includes(d)).map(unitLabel).join(', '), done: false }));
      const res = await SN.comm.task(by, {
        title: (title || 'Lieferung') + ': Tour ' + (r + 1) + ' · ' + what, dept: 'Wareneinnahme', act: 'Warenverräumung', min: round.min,
        due, u: !!opts.u, escalate: true, checklist, truckId: id, route: round.depts,
      });
      if (res.ok) made++;
    }
    const d = await SN.dist.run(by, now);
    await SN.comm.log(by, 'Lieferung „' + (title || 'Lieferung') + '“: ' + units.length + ' Einheiten, ' + p.people + ' Touren', now);
    return { ok: true, plan: p, tasks: made, dist: d, truckId: id };
  }

  /* ---------- Wochenplan --------------------------------------------------- */
  const hash = (s) => String(s).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  /** Arbeitet e am Tag (0 = Mo)? Plan hat Vorrang, sonst Mo–Sa mit einem rollierenden freien Tag. */
  function worksOn(e, wd) {
    const plan = SN.store.peek('plans', e.id);
    if (plan && plan.days && plan.days[wd]) return !plan.days[wd].off;
    if (wd === 6) return false;
    return (hash(e.id) % 6) !== wd;
  }
  /** Tagesschicht von e am Wochentag → {s, e} in Stunden */
  function shiftOn(e, wd) {
    const plan = SN.store.peek('plans', e.id);
    const d = plan && plan.days && plan.days[wd];
    if (d && !d.off) return { s: U.fmt.hm(d.s) / 60, e: U.fmt.hm(d.e) / 60 };
    const sh = M.SHIFTS[e.sh] || M.SHIFTS['Früh'];
    return { s: sh.s, e: Math.min(sh.e, sh.s + (e.h || 8) + (SN.dist.pauseFor(e.h || 8) / 60)) };
  }
  const worker = (e) => e.role === 'emp' || e.role === 'azubi';
  /** Woche ab Montag der Woche von ts → [{key, wd, label, date}] */
  function week(ts) {
    ts = now0(ts);
    const d0 = U.startOfDay(ts) - ((new Date(ts).getDay() + 6) % 7) * U.DAY;
    return M.DAYS.slice(0, 6).map((l, wd) => ({ key: U.fmt.dayKey(d0 + wd * U.DAY + 12 * U.HOUR), wd, label: l, date: d0 + wd * U.DAY }));
  }
  /** Prognose je Tag (Dokument goods/fc-<Tag>) → {kkp, pal, box, avg} */
  function forecast(dayKey) { return SN.store.peek('goods', 'fc-' + dayKey) || null; }
  function setForecast(dayKey, f) { return SN.store.put('goods', 'fc-' + dayKey, Object.assign({ d: dayKey }, f)); }
  /** Tag: Bedarf (Min) aus Prognose + echten Lieferungen, Kapazität (Min) der Eingeplanten */
  function dayLoad(day) {
    const f = forecast(day.key);
    const cfg = effortCfg();
    const fcMin = f ? (f.kkp || 0) * (cfg.kkp + cfg.kkpDept * (f.avg || 4)) + (f.pal || 0) * cfg.pal + (f.box || 0) * cfg.box : 0;
    const realMin = SN.store.list('trucks').filter((t) => U.fmt.dayKey(t.at) === day.key).reduce((s, t) => s + (t.min || 0), 0);
    const staff = M.staff().filter((e) => worker(e) && worksOn(e, day.wd));
    const cap = staff.reduce((s, e) => s + SN.dist.limitOf(e), 0);
    const planned = SN.store.list('items').filter((it) => it.kind === 'task' && it.plannedFor === day.key).reduce((s, it) => s + (it.min || 0), 0);
    const need = Math.max(fcMin, realMin);
    return { day, need, cap, staff, planned, pct: cap ? Math.round(need / cap * 100) : (need ? 999 : 0), forecast: f };
  }
  /** Aufträge für einen Tag anlegen und anteilig verteilen (nie über das Limit) */
  async function distributeDay(by, day, now) {
    now = now0(now);
    const L = dayLoad(day);
    const open = Math.max(0, L.need - L.planned);
    if (!open) return { ok: false, reason: 'Für diesen Tag ist schon alles verteilt.' };
    const f = L.forecast || {};
    const depts = M.DEPTS.filter((d) => !['Kasse', 'Info', 'Lager', 'Wareneinnahme', 'Leergut'].includes(d));
    const load = {};
    for (const e of L.staff) load[e.id] = SN.store.list('items').filter((it) => it.kind === 'task' && it.owner === e.id && it.plannedFor === day.key).reduce((s, it) => s + (it.min || 0), 0);
    let rest = open, made = 0, n = 0;
    const chunk = 45;
    while (rest > 0) {
      const min = Math.min(chunk, rest);
      // Person mit der meisten freien Kapazität, passende Abteilung bevorzugt
      const cand = L.staff.filter((e) => load[e.id] + min <= SN.dist.limitOf(e));
      if (!cand.length) break;
      const e = cand.reduce((b, x) => (SN.dist.limitOf(x) - load[x.id] > SN.dist.limitOf(b) - load[b.id] ? x : b), cand[0]);
      const dept = depts.includes(e.dept) ? e.dept : depts[n % depts.length];
      const sh = shiftOn(e, day.wd);
      const res = await SN.comm.send({
        kind: 'task', title: 'Warenverräumung ' + (f.kkp ? '(KKP-Ware) ' : '') + '– ' + dept, dept, act: 'Warenverräumung', min,
        owner: e.id, to: { type: 'person', ids: [e.id] }, plannedFor: day.key, due: day.date + sh.e * U.HOUR, escalate: false, planned: true,
      }, by, now);
      if (!res.ok) break;
      load[e.id] += min; rest -= min; made++; n++;
    }
    await SN.comm.log(by, 'Wochenplan ' + day.label + ' ' + day.key + ': ' + made + ' Aufträge verteilt', now);
    return { ok: true, made, rest };
  }

  SN.ops = {
    PHOTO_CATS, PHOTO_CAT, PHOTO_REPLIES, photoTargets, photoReport,
    UNIT, effortCfg, unitMin, planDelivery, unitsFromCounts, createDelivery, unitLabel,
    worksOn, shiftOn, week, forecast, setForecast, dayLoad, distributeDay,
  };
})(window.SN = window.SN || {});
