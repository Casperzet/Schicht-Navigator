/* ==========================================================================
   SN.overview – Kernlogik für Übersicht und Personal der Filialleitung
   --------------------------------------------------------------------------
   Rein (ohne DOM) und testbar:
   - Sammel-Sicht aller Vorgänge: Kennzahlen, Filter, Stundenverlauf
   - Anwesenheit je Tag und Schicht: im Dienst, abwesend, Besetzung gegen Bedarf
   - Personal: Abwesenheiten, Rechte, Prüfungen, Änderungsprotokoll
   Betriebsrat: keine Ranglisten, keine Leistungsvergleiche; Abwesenheitsgründe
   erscheinen nur in Ansichten der Gruppe „admin“ (Filialleitung, Admin).
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm;
  const MIN = U.MIN, HOUR = U.HOUR, DAY = U.DAY;
  const now0 = (n) => (n === undefined ? SN.clock.now() : n);

  /* ---------- Konstanten -------------------------------------------------- */
  /** Arten in der Sammel-Sicht (Schlüssel = Vorgangsart, Text für die Filterchips) */
  const KINDS = [
    ['report', 'Meldung'], ['absence', 'Ausfall'], ['photo', 'Fotobericht'], ['call', 'Ruf'],
    ['sos', 'SOS'], ['handover', 'Übergabe'], ['post', 'Anweisung'],
  ];
  const KIND_KEYS = KINDS.map((k) => k[0]);
  const VIEWS = [['open', 'Offen'], ['esc', 'Eskaliert'], ['unseen', 'Ungesehene Fotos'], ['stale', 'Unbeantwortet'], ['done', 'Heute erledigt'], ['all', 'Alle']];
  const STALE_CHOICES = [5, 10, 15, 30];
  /** Abwesenheitsarten (Urlaub gibt es nur hier; Gründe nie ohne Berechtigung zeigen) */
  const AWAY_TYPES = { sick: 'Krank', vac: 'Urlaub', late: 'Verspätet', other: 'Sonstiges' };
  /** Soll-Besetzung je Abteilung (pro Schicht); alles andere: 1. Änderbar in settings.main.staffing */
  const DEFAULT_NEED = { 'Kasse': 4, 'Wareneinnahme': 2, 'Obst und Gemüse': 2, 'Backshop und Frischetheke': 2 };

  /* ---------- Zustand der Vorgänge ----------------------------------------- */
  const inScope = (it) => KIND_KEYS.includes(it.kind);
  const photoUnseen = (it) => it.kind === 'photo' && !C.isFinal(it) && !Object.keys(it.seen || {}).some((id) => id !== it.from);
  const sinceOf = (it) => (it.kind === 'handover' ? M.ackStart(it, it.createdAt) : it.createdAt);

  /** Braucht der Vorgang noch eine Reaktion? */
  function isOpen(it) {
    if (!inScope(it) || C.isFinal(it)) return false;
    switch (it.kind) {
      case 'report': case 'absence': case 'sos': case 'handover': return true;
      case 'call': return !C.satisfied(it);
      case 'post': return !!it.needAck && C.ackStats(it).open.length > 0;
      case 'photo': return photoUnseen(it);
      default: return false;
    }
  }
  /** Offen und noch niemand hat reagiert (übernommen/quittiert/zugesagt/gesehen) */
  function isWaiting(it) {
    if (!isOpen(it)) return false;
    if (it.kind === 'report' || it.kind === 'absence') return it.state === 'sent' || it.state === 'seen';
    if (it.kind === 'sos') return !Object.keys(it.answers || {}).length;
    if (it.kind === 'handover') return !Object.keys(it.acks || {}).length;
    return true;
  }
  const isEscalated = (it) => isOpen(it) && !!(it.esc && it.esc.level > 0);
  const isStale = (it, now, staleMin) => isWaiting(it) && now - sinceOf(it) > staleMin * MIN;
  function doneAt(it) { return it.doneAt || it.closedAt || it.answeredAt || 0; }
  const isDoneToday = (it, now) => inScope(it) && ['done', 'closed', 'accepted'].includes(it.state) && !!doneAt(it) && U.fmt.dayKey(doneAt(it)) === U.fmt.dayKey(now);

  const all = () => SN.store.list('items').filter(inScope);

  /** Kennzahlen → {open, escalated, unseenPhotos, stale, staleMin, doneToday} */
  function stats(now, opts) {
    now = now0(now);
    const staleMin = (opts && opts.staleMin) || 10;
    const l = all();
    return {
      open: l.filter(isOpen).length,
      escalated: l.filter(isEscalated).length,
      unseenPhotos: l.filter(photoUnseen).length,
      stale: l.filter((it) => isStale(it, now, staleMin)).length,
      staleMin,
      doneToday: l.filter((it) => isDoneToday(it, now)).length,
    };
  }

  /**
   * Filter: f = {view: open|esc|unseen|stale|done|all, kind, dept, shift, urgent, staleMin}
   * Sortierung: dringend, eskaliert, am längsten wartend zuerst (Erledigte: neueste zuerst).
   * Keine Sortierung nach Person.
   */
  function filter(f, now) {
    f = f || {}; now = now0(now);
    const view = f.view || 'open';
    let l = all();
    if (view === 'open') l = l.filter(isOpen);
    else if (view === 'esc') l = l.filter(isEscalated);
    else if (view === 'unseen') l = l.filter(photoUnseen);
    else if (view === 'stale') l = l.filter((it) => isStale(it, now, f.staleMin || 10));
    else if (view === 'done') l = l.filter((it) => isDoneToday(it, now));
    if (f.kind) l = l.filter((it) => it.kind === f.kind);
    if (f.dept) l = l.filter((it) => it.dept === f.dept);
    if (f.shift) l = l.filter((it) => it.shift === f.shift);
    if (f.urgent) l = l.filter((it) => it.u);
    if (view === 'done') return U.sortBy(l, (it) => -doneAt(it));
    return U.sortBy(l, (it) => [(it.u ? 0 : 1), -((it.esc && it.esc.level) || 0), sinceOf(it)].reduce((s, v, i) => s + v * [1e15, 1e13, 1][i], 0));
  }

  /** Stundenverlauf: neue Vorgänge je Stunde (die letzten n Stunden, älteste zuerst) → [{from, hour, total, open, done}] */
  function hourly(now, n) {
    now = now0(now); n = n || 8;
    const d = new Date(now); d.setMinutes(0, 0, 0);
    const end = d.getTime() + HOUR;
    const l = all();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const from = end - (i + 1) * HOUR;
      const inH = l.filter((it) => it.createdAt >= from && it.createdAt < from + HOUR);
      const open = inH.filter(isOpen).length;
      out.push({ from, hour: new Date(from).getHours(), total: inH.length, open, done: inH.length - open });
    }
    return out;
  }

  /* ---------- Abwesenheiten ------------------------------------------------ */
  /** Datensätze einer Person: absences + (ältere) laufende away ohne eigenen Eintrag */
  function awayRecords(e, now) {
    now = now0(now);
    const l = (e.absences || []).slice();
    const a = e.away;
    if (a && a.until > now && !l.some((r) => r.until === a.until)) l.push({ id: 'cur', type: a.type, from: a.from || a.at, until: a.until, auto: true });
    return U.sortBy(l, (r) => r.from);
  }
  /** Abwesenheit, die den Zeitraum [s, e) berührt (bei „verspätet“ nur, wenn noch nicht eingetroffen) */
  function awayIn(e, s, en, now) {
    now = now0(now);
    return awayRecords(e, now).find((r) => r.from < en && r.until > s && (r.type !== 'late' || r.until > now)) || null;
  }
  const periodText = (r) => {
    if (r.type === 'late') return 'bis ' + U.fmt.time(r.until);
    const a = U.fmt.date(r.from).slice(4), b = U.fmt.date(r.until - 1).slice(4);
    return a === b ? a : a + '–' + b;
  };

  /**
   * Abwesenheit eintragen. a = {type, from, until} (Zeitstempel). Läuft sie schon (from ≤ jetzt),
   * wird staff.away gesetzt (dist/Limits wirken sofort), sonst nur vorgemerkt (syncAway aktiviert).
   */
  async function setAway(by, empId, a, now) {
    now = now0(now);
    const e = M.emp(empId);
    if (!e) return { ok: false, reason: 'Person nicht gefunden.' };
    if (!AWAY_TYPES[a.type]) return { ok: false, reason: 'Bitte die Art der Abwesenheit wählen.' };
    if (!a.until || !a.from || a.until <= a.from) return { ok: false, reason: 'Das Ende muss nach dem Beginn liegen.' };
    if (a.until <= now) return { ok: false, reason: 'Der Zeitraum liegt in der Vergangenheit.' };
    const rec = { id: U.id('ab'), type: a.type, from: a.from, until: a.until, by, at: now };
    const keep = (e.absences || []).filter((r) => r.until > now - 30 * DAY).slice(-19);
    const p = { absences: keep.concat([rec]) };
    if (a.from <= now) p.away = { type: a.type, at: now, from: a.from, until: a.until };
    const r = await SN.store.patch('staff', empId, p);
    if (r && r.ok === false) return { ok: false, reason: 'Nicht gespeichert.' };
    await C.log(by, 'Personal: Abwesenheit – ' + e.name + ', ' + AWAY_TYPES[a.type] + ' ' + periodText(rec), now);
    return { ok: true, rec };
  }
  /** Laufende Abwesenheit beenden („wieder da“) */
  async function endAway(by, empId, now) {
    now = now0(now);
    const e = M.emp(empId);
    if (!e) return { ok: false, reason: 'Person nicht gefunden.' };
    const list = (e.absences || []).map((r) => (r.from <= now && r.until > now ? Object.assign({}, r, { until: now }) : r));
    await SN.store.patch('staff', empId, { absences: list, away: null });
    await C.log(by, 'Personal: Abwesenheit beendet – ' + e.name, now);
    return { ok: true };
  }
  /** Vorgemerkte Abwesenheit löschen */
  async function cancelAway(by, empId, recId, now) {
    now = now0(now);
    const e = M.emp(empId);
    if (!e) return { ok: false, reason: 'Person nicht gefunden.' };
    const rec = (e.absences || []).find((r) => r.id === recId);
    if (!rec) return { ok: false, reason: 'Eintrag nicht gefunden.' };
    const p = { absences: (e.absences || []).filter((r) => r.id !== recId) };
    if (e.away && e.away.until === rec.until) p.away = null;
    await SN.store.patch('staff', empId, p);
    await C.log(by, 'Personal: Abwesenheit gelöscht – ' + e.name + ', ' + AWAY_TYPES[rec.type] + ' ' + periodText(rec), now);
    return { ok: true };
  }
  /** Vorgemerkte Abwesenheiten, die jetzt beginnen, in staff.away übernehmen → IDs */
  async function syncAway(now) {
    now = now0(now);
    const ids = [];
    for (const e of M.staff()) {
      const r = (e.absences || []).find((x) => x.from <= now && x.until > now);
      if (r && (!e.away || e.away.until !== r.until || e.away.type !== r.type)) {
        await SN.store.patch('staff', e.id, { away: { type: r.type, at: now, from: r.from, until: r.until } });
        ids.push(e.id);
      }
    }
    return ids;
  }

  /* ---------- Anwesenheit -------------------------------------------------- */
  const todayIdx = (now) => (new Date(now0(now)).getDay() + 6) % 7;
  /** Beginn des Tages mit Index 0..6 (Mo..So) der laufenden Woche */
  function dayStart(idx, now) {
    now = now0(now);
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (idx - todayIdx(now)));
    return d.getTime();
  }
  /** Soll-Besetzung einer Abteilung in einer Schicht */
  function need(dept, shift) {
    const s = (M.settings().staffing || {})[dept];
    if (s && s[shift] !== undefined && s[shift] !== null) return +s[shift];
    return DEFAULT_NEED[dept] || 1;
  }
  /** Arbeitet e am Tag idx in der Schicht shift? → {s, e} (Zeitstempel) oder null. Plan hat Vorrang, ohne Plan: Mo–Sa nach Schicht. */
  function planned(e, idx, shift, now) {
    const d0 = dayStart(idx, now);
    const plan = SN.store.peek('plans', e.id);
    if (plan && Array.isArray(plan.days)) {
      const p = plan.days.find((x) => x.d === M.DAYS[idx]);
      if (!p || p.off) return null;
      const s = d0 + U.fmt.hm(p.s) * MIN, en = d0 + U.fmt.hm(p.e) * MIN;
      return (s + en) / 2 < d0 + 14 * HOUR === (shift === 'Früh') ? { s, e: en } : null;
    }
    if (idx > 5 || (e.sh || 'Früh') !== shift) return null;
    const sh = M.SHIFTS[shift];
    return { s: d0 + sh.s * HOUR, e: d0 + sh.e * HOUR };
  }

  /**
   * Anwesenheit für Tag idx (0 = Mo) und Schicht → {
   *   idx, shift, isToday, live, planned, present, away[{id,type,period,dept}],
   *   counts{free,work,pause,notYet}, byDept[{dept,have,need,short,over,ids}], leads, cleaning,
   *   short[{dept,have,need}], pauseDue[id], pauseOver[{id,over}] }
   * live = heute und die gewählte Schicht läuft: dann echter Status (frei/arbeitet/Pause).
   */
  function presence(idx, shift, now) {
    now = now0(now);
    idx = idx === undefined || idx === null ? todayIdx(now) : idx;
    shift = shift || M.currentShift(now) || 'Früh';
    const isToday = idx === todayIdx(now);
    const live = isToday && M.currentShift(now) === shift;
    const d0 = dayStart(idx, now);
    const ref = isToday ? now : d0 + (M.SHIFTS[shift].s + 1) * HOUR;
    const out = { idx, shift, isToday, live, planned: 0, present: 0, away: [], counts: { free: 0, work: 0, pause: 0, notYet: 0 }, byDept: [], leads: 0, cleaning: 0, short: [], pauseDue: [], pauseOver: [] };
    const dept = {};
    for (const e of M.staff()) {
      const w = planned(e, idx, shift, now);
      if (!w) continue;
      out.planned++;
      const a = awayIn(e, w.s, w.e, now);
      const dn = M.deptOf(e, ref);
      if (a) { out.away.push({ id: e.id, type: a.type, period: periodText(a), dept: dn, until: a.until }); continue; }
      out.present++;
      if (e.role === 'clean') { out.cleaning++; }
      else if (M.level(e) >= 2) out.leads++;
      else if (dn) { (dept[dn] = dept[dn] || []).push(e.id); }
      if (live) {
        const st = SN.dist.status(e, now).key;
        if (st === 'free') out.counts.free++; else if (st === 'work') out.counts.work++; else if (st === 'pause') out.counts.pause++; else out.counts.notYet++;
      }
    }
    const closed = idx === 6; // Sonntag: Markt geschlossen
    for (const d of M.DEPTS) {
      const ids = dept[d] || [];
      const n = closed ? 0 : need(d, shift);
      out.byDept.push({ dept: d, have: ids.length, need: n, short: Math.max(0, n - ids.length), over: Math.max(0, ids.length - n), ids });
    }
    out.byDept = U.sortBy(out.byDept, (r) => (r.short ? -r.short * 100 : 0) + M.DEPTS.indexOf(r.dept) / 100);
    out.short = out.byDept.filter((r) => r.short).map((r) => ({ dept: r.dept, have: r.have, need: r.need }));
    out.away = U.sortBy(out.away, (r) => (r.dept || '') + M.name(r.id));
    if (live) {
      const pa = SN.dist.pauseAlerts(now, shift);
      out.pauseDue = pa.due; out.pauseOver = pa.over;
    }
    return out;
  }

  /** Personen, die für Verstärkung in Frage kommen: frei im Dienst, aus Abteilungen mit Überhang (zuerst), nie Leitung */
  function reinforcements(dept, now) {
    now = now0(now);
    const p = presence(undefined, undefined, now);
    const surplus = new Set(p.byDept.filter((r) => r.over > 0).map((r) => r.dept));
    const cands = SN.dist.candidates(now).filter((e) => M.deptOf(e, now) !== dept && SN.dist.status(e, now).key === 'free');
    return U.sortBy(cands, (e) => (surplus.has(M.deptOf(e, now)) ? 0 : 1000) + (M.deptOf(e, now) || '').charCodeAt(0)).map((e) => e.id);
  }

  /* ---------- Personal: Rechte, Prüfung, Protokoll -------------------------- */
  /** Darf me diese Person bearbeiten (PIN, Rolle …)? Nur gleich- oder höherrangig – sonst könnte ein Admin sich als Filialleitung anmelden. */
  function canManage(me, target) {
    if (!me || !M.isAdmin(me)) return false;
    return !target || target.id === me.id || M.level(me) >= M.level(target);
  }
  /** Rollen, die me vergeben darf (nicht höher als die eigene) */
  const assignableRoles = (me) => Object.keys(M.ROLES).filter((k) => M.ROLES[k].level <= M.level(me));
  /** Würde die Änderung die letzte Person mit Stufe ≥ 4 entfernen? */
  function loseLastAdmin(id, newRole) {
    const rest = M.staff().filter((e) => e.id !== id && M.level(e) >= 4);
    return !rest.length && !(newRole && M.ROLES[newRole] && M.ROLES[newRole].level >= 4);
  }
  /** Prüfung eines Formulars → {errors[], warnings[]} */
  function validate(d, id) {
    const errors = [], warnings = [];
    const name = String(d.name || '').trim();
    if (name.length < 2) errors.push('Bitte einen Namen eingeben.');
    if (!M.ROLES[d.role]) errors.push('Bitte eine Rolle wählen.');
    if (d.role !== 'clean' && !M.DEPTS.includes(d.dept)) errors.push('Bitte eine Abteilung wählen.');
    if (!M.SHIFT_NAMES.includes(d.sh)) errors.push('Bitte eine Schicht wählen.');
    if (!(d.h >= 2 && d.h <= 10)) errors.push('Vertragsstunden pro Tag: 2 bis 10.');
    if (d.pin && !/^\d{4,6}$/.test(d.pin)) errors.push('PIN: 4 bis 6 Ziffern.');
    if (name && M.staff().some((e) => e.id !== id && e.name.toLowerCase() === name.toLowerCase())) warnings.push('Es gibt schon eine Person mit diesem Namen.');
    return { errors, warnings };
  }
  /** Zufällige PIN (4 Ziffern, ohne 0000/1234 und Zahlenfolgen), nur zur einmaligen Anzeige */
  function newPin() {
    for (let i = 0; i < 20; i++) {
      let n;
      try { const a = new Uint32Array(1); (window.crypto || {}).getRandomValues(a); n = a[0] % 10000; } catch (e) { n = Math.floor(Math.random() * 10000); }
      const p = String(n).padStart(4, '0');
      if (!/^(\d)\1{3}$/.test(p) && p !== '1234' && p !== '4321') return p;
    }
    return '7291';
  }
  /** Klartext-Änderungen für das Protokoll: ['Abteilung: Kasse → Info', …] */
  function diffStaff(a, b) {
    const L = { name: 'Name', role: 'Rolle', dept: 'Abteilung', sh: 'Schicht', h: 'Stunden', lang: 'Sprache', firstAid: 'Ersthelfer', kasse: 'Kasse', group: 'Gruppe' };
    const show = (k, v) => (k === 'role' ? (M.ROLES[v] || {}).label || v : k === 'firstAid' || k === 'kasse' ? (v ? 'ja' : 'nein') : (v === undefined || v === null || v === '' ? '–' : v));
    const out = [];
    for (const k of Object.keys(L)) {
      const x = a[k], y = b[k];
      if ((x || '') !== (y || '') && !(typeof x === 'boolean' || typeof y === 'boolean' ? !!x === !!y : false)) out.push(L[k] + ': ' + show(k, x) + ' → ' + show(k, y));
    }
    const sa = (a.acts || []).slice().sort().join(), sb = (b.acts || []).slice().sort().join();
    if (sa !== sb) out.push('Tätigkeiten geändert');
    if ((a.scope || []).slice().sort().join() !== (b.scope || []).slice().sort().join()) out.push('Zuständigkeit geändert');
    return out;
  }
  /** Personal-Einträge des Änderungsprotokolls der letzten Tage, neueste zuerst → [{at, by, text}] */
  function personnelLog(now, days) {
    now = now0(now);
    const out = [];
    for (let i = 0; i < (days || 14); i++) {
      const l = SN.store.peek('log', U.fmt.dayKey(now - i * DAY));
      if (l && l.entries) for (const x of l.entries) if (/^Personal:/.test(x.text)) out.push({ at: x.at, by: x.by, text: x.text.replace(/^Personal:\s*/, '') });
    }
    return U.sortBy(out, (x) => -x.at);
  }
  /** Offene Vorgänge, die an der Person hängen (für die Rückfrage beim Entfernen) */
  const openFor = (id) => SN.store.list('items').filter((it) => !C.isFinal(it) && (it.owner === id || (it.kind === 'task' && C.recipients(it).includes(id)))).length;

  SN.overview = {
    KINDS, VIEWS, STALE_CHOICES, AWAY_TYPES, DEFAULT_NEED,
    isOpen, isWaiting, isEscalated, isStale, isDoneToday, photoUnseen, stats, filter, hourly,
    awayRecords, awayIn, periodText, setAway, endAway, cancelAway, syncAway,
    todayIdx, dayStart, need, planned, presence, reinforcements,
    canManage, assignableRoles, loseLastAdmin, validate, newPin, diffStaff, personnelLog, openFor,
  };
})(window.SN = window.SN || {});
