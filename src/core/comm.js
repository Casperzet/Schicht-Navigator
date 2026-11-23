/* ==========================================================================
   SN.comm – Kommunikationsmotor (M1) + Chat
   --------------------------------------------------------------------------
   Ein Modell für alle Vorgänge („Items“, Collection items):
     {id, kind, from, to:{type, ids[], shift?}, title, body, lang, orig?, u,
      createdAt, ackDue, state, acks:{empId:ts}, seen:{empId:ts}, owner,
      esc:{level, at, history:[{level, at, ids, key?, fwd?, by?}]}, thread:[]}
   kind: post | task | report | call | sos | handover | shiftreq | absence
   state: sent → seen → taken → done (außerdem closed/accepted/declined/cancelled)

   Regeln:
   - Jede Aktion schreibt über SN.store (patch mit tiefem Merge → gleichzeitige
     Quittungen verschiedener Personen kollidieren nicht).
   - Aktionen liefern Promise<{ok, item?, reason?}>; reason ist deutscher Text.
   - escalateDue(now) ist idempotent: Stufe und Zeitpunkte werden aus der
     Frist berechnet (nicht aus „jetzt“), mehrere Geräte schreiben dasselbe.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model;
  const MIN = U.MIN;
  const now0 = (n) => (n === undefined ? SN.clock.now() : n);

  /* ---------- Lesen ------------------------------------------------------ */
  const items = () => SN.store.list('items');
  const get = (idOrItem) => (typeof idOrItem === 'string' ? SN.store.peek('items', idOrItem) : idOrItem
    ? SN.store.peek('items', idOrItem.id) || idOrItem : null);
  const isFinal = (it) => M.FINAL_STATES.includes(it.state);
  const ok = (extra) => Object.assign({ ok: true }, extra);
  const fail = (reason) => Promise.resolve({ ok: false, reason });
  const PREFIX = { post: 'po', task: 'ta', report: 're', call: 'ca', sos: 'so', handover: 'ho', shiftreq: 'sr', absence: 'ab', photo: 'ph' };

  /** Empfänger eines Vorgangs (ohne Absender); Auftrag: Besitzer oder Abteilung */
  function recipients(it) {
    if (!it) return [];
    if (it.kind === 'task' && it.owner) return [it.owner];
    const ids = M.resolveTo(it.to);
    return it.to && it.to.type === 'person' && it.kind === 'task' ? ids : ids.filter((id) => id !== it.from);
  }
  const isRecipient = (it, empId) => recipients(it).includes(empId);

  /** Alle Beteiligten: Absender, Empfänger, Besitzer, Eskalationsstufen, Antwortende */
  function involved(it) {
    const h = (it.esc && it.esc.history) || [];
    return U.uniq([it.from, it.owner].concat(recipients(it), ...h.map((x) => x.ids || []), Object.keys(it.answers || {})));
  }
  /** Personen der aktuellen Eskalationsstufe (wen es gerade betrifft) */
  function currentIds(it) {
    const h = (it.esc && it.esc.history) || [];
    const last = h[h.length - 1];
    return last && last.ids ? last.ids : recipients(it);
  }

  /** Quittungszähler einer Anweisung: {done, total, open[], acked[]} */
  function ackStats(it) {
    const rec = recipients(it);
    const acks = it.acks || {};
    const acked = rec.filter((id) => acks[id]);
    return { done: acked.length, total: rec.length, acked, open: rec.filter((id) => !acks[id]) };
  }

  /** Zusagen eines Rufs: {yes[], no[], need, enough} */
  function callStatus(it) {
    const a = it.answers || {};
    const yes = Object.keys(a).filter((id) => a[id].a === 'yes');
    const no = Object.keys(a).filter((id) => a[id].a === 'no');
    const need = it.need === undefined ? 1 : it.need;
    return { yes, no, need, enough: need > 0 && yes.length >= need };
  }

  /** Braucht der Vorgang keine weitere Eskalation? */
  function satisfied(it) {
    if (isFinal(it)) return true;
    switch (it.kind) {
      case 'report': case 'absence': return it.state === 'taken';
      case 'call': return it.need === 0 || callStatus(it).enough;
      case 'sos': return Object.keys(it.answers || {}).length > 0;
      case 'post': return !it.needAck || ackStats(it).open.length === 0;
      case 'handover': return Object.keys(it.acks || {}).length > 0;
      case 'photo': return Object.keys(it.seen || {}).some((id) => id !== it.from) || it.state === 'taken';
      case 'task': return !it.escalate || it.state === 'done';
      default: return true;
    }
  }

  /* ---------- Senden ------------------------------------------------------ */
  /**
   * Vorgang anlegen. draft: beliebige Felder (kind, to, title, body, u, …).
   * Absender = by. Setzt Status, Frist (ackDue) und Eskalationsstartpunkt.
   */
  function send(draft, by, now) {
    now = now0(now);
    const me = M.emp(by);
    const kind = draft.kind || 'post';
    const it = Object.assign({
      kind, to: { type: 'person', ids: [] }, title: '', body: '', lang: 'de', u: false,
      state: 'sent', acks: {}, seen: {}, owner: null, thread: [],
      dept: me ? M.deptOf(me, now) : null, shift: M.currentShift(now) || (me && me.sh) || 'Früh',
    }, U.clone(draft), { id: draft.id || U.id(PREFIX[kind] || 'it'), from: by, createdAt: now });
    const min = M.deadlineMin(it);
    if (it.kind === 'task') it.ackDue = it.escalate && it.due ? it.due : null;
    else if (it.kind === 'post') it.ackDue = it.needAck ? now + min * MIN : null;
    else if (it.kind === 'shiftreq') it.ackDue = null;
    else it.ackDue = M.ackStart(it, now) + min * MIN;
    const rec = recipients(it);
    if (!rec.length && it.ackDue) it.ackDue = now; // niemand erreichbar → sofort eine Stufe höher
    it.esc = { level: 0, at: now, history: [{ level: 0, at: now, ids: rec }] };
    return SN.store.put('items', it.id, it).then((r) => (r.ok ? ok({ item: get(it.id) || it }) : { ok: false, reason: SN.store.ERROR_TEXT[r.code] || 'Nicht gespeichert.' }));
  }

  /** Anweisung / Info (M2). opts: {to, title, body, needAck, u, ackMin, briefing, kudos} */
  function post(by, opts) {
    return send(Object.assign({ kind: 'post', needAck: false }, opts), by);
  }

  /** Auftrag (M3). opts: {title, dept, act, min, due, u, owner, proofRequired, escalate, checklist[], templateId} */
  function task(by, opts) {
    const o = Object.assign({}, opts);
    o.act = o.act || 'Sonstiges';
    o.min = o.min || M.ACT_MIN[o.act] || 20;
    o.to = o.owner ? { type: 'person', ids: [o.owner] } : { type: 'dept', ids: [o.dept || 'Trocken sortiment'] };
    if (o.owner) {
      const chk = SN.dist ? SN.dist.canTake(M.emp(o.owner), o) : { ok: true };
      if (!chk.ok) return fail(chk.reason);
    }
    return send(Object.assign({ kind: 'task' }, o), by);
  }

  /**
   * Meldung von unten (M4). opts: {cat, dept, body, orig, lang, photos[], u}
   * Routing automatisch an die zuständige Person (Kategorie + Abteilung + Schicht).
   */
  function report(by, opts, now) {
    now = now0(now);
    const me = M.emp(by);
    const c = M.CAT[opts.cat] || M.CAT.other;
    const dept = c.dept || opts.dept || (me && M.deptOf(me, now)) || 'Info';
    const shift = M.currentShift(now) || (me && me.sh) || 'Früh';
    const ids = M.responsibleFor(c.key, dept, shift, now).filter((id) => id !== by);
    return send(Object.assign({}, opts, {
      kind: 'report', cat: c.key, dept, shift, title: opts.title || c.label,
      to: { type: 'person', ids: ids.length ? ids : M.responsibleFor(c.key, dept, shift, now) },
    }), by, now);
  }

  /* ---------- Reaktionen ------------------------------------------------- */
  /** Gesehen markieren (schreibt nur beim ersten Mal) */
  function markSeen(ref, by, now) {
    const it = get(ref); now = now0(now);
    if (!it || (it.seen && it.seen[by])) return Promise.resolve(ok({ item: it, unchanged: true }));
    const p = { seen: { [by]: now } };
    if (it.state === 'sent' && isRecipient(it, by)) p.state = 'seen';
    return SN.store.patch('items', it.id, p).then(() => ok({ item: get(it.id) }));
  }

  /** Quittieren („Gelesen und verstanden“, Übergabe-Empfang) */
  function ack(ref, by, now) {
    const it = get(ref); now = now0(now);
    if (!it) return fail('Vorgang nicht gefunden.');
    if (it.acks && it.acks[by]) return Promise.resolve(ok({ item: it, unchanged: true }));
    const p = { acks: { [by]: now } };
    if (!it.seen || !it.seen[by]) p.seen = { [by]: now };
    if (it.kind === 'handover') { p.state = 'done'; p.doneAt = now; p.doneBy = by; }
    else if (it.state === 'sent') p.state = 'seen';
    return SN.store.patch('items', it.id, p).then(() => ok({ item: get(it.id) }));
  }

  /** Übernehmen (Meldung, Auftrag, Ausfall). Aufträge nur innerhalb des Limits. */
  function take(ref, by, now) {
    const it = get(ref); now = now0(now);
    if (!it) return fail('Vorgang nicht gefunden.');
    if (isFinal(it)) return fail('Schon abgeschlossen.');
    if (it.owner && it.owner !== by) return fail('Schon übernommen von ' + M.name(it.owner) + '.');
    if (it.kind === 'task' && it.owner !== by) {
      const chk = SN.dist.canTake(M.emp(by), it, now);
      if (!chk.ok) return fail(chk.reason);
    }
    const p = { owner: by, state: 'taken', takenAt: now, seen: { [by]: (it.seen && it.seen[by]) || now } };
    if (it.kind === 'task') { p.to = { type: 'person', ids: [by] }; p.startedAt = now; }
    return SN.store.patch('items', it.id, p).then(() => ok({ item: get(it.id) }));
  }

  /** Auftrag starten („Gesehen/Starte“) – zugeteilter Auftrag wird „in Arbeit“ */
  function start(ref, by, now) {
    const it = get(ref); now = now0(now);
    if (!it || it.kind !== 'task') return fail('Auftrag nicht gefunden.');
    if (it.owner && it.owner !== by) return fail('Der Auftrag gehört ' + M.name(it.owner) + '.');
    if (!it.owner) return take(it, by, now);
    return SN.store.patch('items', it.id, { state: 'taken', startedAt: now, seen: { [by]: (it.seen && it.seen[by]) || now } })
      .then(() => ok({ item: get(it.id) }));
  }

  /** Weitergeben an andere Personen (Kette startet bei den neuen Empfängern neu) */
  function forward(ref, by, toIds, note, now) {
    const it = get(ref); now = now0(now);
    if (!it) return fail('Vorgang nicht gefunden.');
    toIds = U.uniq([].concat(toIds || [])).filter((id) => M.emp(id));
    if (!toIds.length) return fail('Bitte eine Person wählen.');
    const draft = Object.assign({}, it, { to: { type: 'person', ids: toIds }, owner: null });
    const min = M.deadlineMin(draft);
    const hist = ((it.esc && it.esc.history) || []).concat([{ level: 0, at: now, ids: toIds, fwd: true, by }]);
    const thread = (it.thread || []).concat([{ by, at: now, type: 'fwd', text: note || '', ids: toIds }]);
    return SN.store.patch('items', it.id, {
      to: { type: 'person', ids: toIds }, owner: null, state: 'sent',
      ackDue: min ? now + min * MIN : it.ackDue || null,
      esc: { level: 0, at: now, history: hist }, thread,
    }).then(() => ok({ item: get(it.id) }));
  }

  /**
   * Erledigt. opts: {text} kurze Antwort an den Melder, {photo} Foto-Nachweis (Media-ID).
   * Aufträge mit proofRequired brauchen ein Foto; die Leitung gibt frei (approve).
   */
  function done(ref, by, opts, now) {
    const it = get(ref); now = now0(now); opts = opts || {};
    if (!it) return fail('Vorgang nicht gefunden.');
    if (isFinal(it)) return Promise.resolve(ok({ item: it, unchanged: true }));
    if (it.kind === 'task' && it.proofRequired && !opts.photo) return fail('Bitte ein Foto als Nachweis anhängen.');
    const p = { state: 'done', doneAt: now, doneBy: by, owner: it.owner || by };
    if (opts.photo) { p.proof = opts.photo; p.approved = null; }
    if (opts.text) p.thread = (it.thread || []).concat([{ by, at: now, type: 'done', text: opts.text }]);
    return SN.store.patch('items', it.id, p).then(() => ok({ item: get(it.id) }));
  }

  /** Foto-Nachweis freigeben (yes) oder zurück zum Nachbessern */
  function approve(ref, by, yes, note, now) {
    const it = get(ref); now = now0(now);
    if (!it || it.kind !== 'task') return fail('Auftrag nicht gefunden.');
    const thread = note ? (it.thread || []).concat([{ by, at: now, type: yes ? 'ok' : 'redo', text: note }]) : undefined;
    const p = yes ? { approved: true, approvedBy: by, approvedAt: now } : { approved: false, state: 'taken', doneAt: null };
    if (thread) p.thread = thread;
    return SN.store.patch('items', it.id, p).then(() => ok({ item: get(it.id) }));
  }

  /** Antwort / Rückfrage im Verlauf eines Vorgangs */
  function reply(ref, by, text, now) {
    const it = get(ref); now = now0(now);
    if (!it) return fail('Vorgang nicht gefunden.');
    if (!String(text || '').trim()) return fail('Bitte einen Text eingeben.');
    const thread = (it.thread || []).concat([{ by, at: now, type: 'msg', text: String(text).trim() }]).slice(-100);
    return SN.store.patch('items', it.id, { thread, seen: { [by]: now } }).then(() => ok({ item: get(it.id) }));
  }

  /** Nachfassen: erinnert alle, die noch nicht quittiert haben → {ok, count} */
  function remind(ref, by, now) {
    const it = get(ref); now = now0(now);
    if (!it) return fail('Vorgang nicht gefunden.');
    const open = it.kind === 'call'
      ? recipients(it).filter((id) => !(it.answers || {})[id])
      : ackStats(it).open;
    if (!open.length) return Promise.resolve(ok({ count: 0, item: it }));
    const n = ((it.remind && it.remind.n) || 0) + 1;
    return SN.store.patch('items', it.id, { remind: { at: now, by, ids: open, n } })
      .then(() => ok({ count: open.length, item: get(it.id) }));
  }

  /** Auftrag zurückgeben (mit Grund) – wird wieder frei, nicht erneut an dieselbe Person */
  function giveBack(ref, by, reason, now) {
    const it = get(ref); now = now0(now);
    if (!it || it.kind !== 'task') return fail('Auftrag nicht gefunden.');
    if (!String(reason || '').trim()) return fail('Bitte einen Grund angeben.');
    const thread = (it.thread || []).concat([{ by, at: now, type: 'back', text: reason }]);
    return SN.store.patch('items', it.id, {
      owner: null, state: 'sent', help: false, startedAt: null, to: { type: 'dept', ids: [it.dept] },
      returned: { [by]: now }, thread,
    }).then(() => ok({ item: get(it.id) }));
  }

  /** Auftrag aus einer Meldung (Meldung gilt als übernommen) */
  async function toTask(ref, by, extra, now) {
    const it = get(ref); now = now0(now);
    if (!it) return { ok: false, reason: 'Meldung nicht gefunden.' };
    const actFor = { gap: 'Lücken füllen', price: 'Etikettierung', clean: 'Sonstiges', bottle: 'Leergut', delivery: 'Wareneinnahme' };
    const r = await task(by, Object.assign({
      title: it.title + (it.body ? ': ' + it.body : ''), dept: it.dept, act: actFor[it.cat] || 'Sonstiges',
      u: it.u, due: now + 60 * MIN, src: it.id, photos: it.photos || [],
    }, extra || {}));
    if (!r.ok) return r;
    const thread = (it.thread || []).concat([{ by, at: now, type: 'task', text: 'Auftrag erstellt', ref: r.item.id }]);
    await SN.store.patch('items', it.id, { owner: it.owner || by, state: it.state === 'done' ? 'done' : 'taken', takenAt: it.takenAt || now, thread, taskId: r.item.id });
    return ok({ item: r.item, report: get(it.id) });
  }

  /* ---------- Eskalation -------------------------------------------------- */
  /**
   * Fällige Vorgänge eine (oder mehrere) Stufen hochsetzen. Idempotent:
   * Zeitpunkte = abgelaufene Fristen, nicht „jetzt“. Schließt außerdem Rufe
   * mit genug Zusagen. Liefert die IDs geänderter Vorgänge.
   */
  function escalateDue(now) {
    now = now0(now);
    const changed = [];
    for (const it of items()) {
      if (it.kind === 'call' && it.state !== 'closed' && !isFinal(it) && callStatus(it).enough) {
        SN.store.patch('items', it.id, { state: 'closed', closedAt: now });
        changed.push(it.id);
        continue;
      }
      if (!it.ackDue || now < it.ackDue || satisfied(it)) continue;
      const chain = M.escalationChain(it, now);
      const max = chain.length - 1;
      let lvl = (it.esc && it.esc.level) || 0;
      if (lvl >= max) continue;
      const step = M.deadlineMin(it) * MIN || 5 * MIN;
      const hist = ((it.esc && it.esc.history) || []).slice();
      let due = it.ackDue;
      while (now >= due && lvl < max) {
        lvl++;
        hist.push({ level: lvl, at: due, ids: chain[lvl].ids, key: chain[lvl].key });
        due += step;
      }
      SN.store.patch('items', it.id, { esc: { level: lvl, at: hist[hist.length - 1].at, history: hist }, ackDue: due });
      changed.push(it.id);
    }
    return changed;
  }

  /** „Wartet auf …“-Text (leer, wenn nichts mehr offen ist) */
  function waitingOn(ref, now) {
    const it = get(ref); now = now0(now);
    if (!it) return '';
    const since = (ts) => U.fmt.dur(Math.max(0, (now - ts) / MIN));
    if (it.state === 'done') return it.doneBy ? 'Erledigt von ' + M.name(it.doneBy) : 'Erledigt';
    if (it.state === 'closed') return 'Geschlossen';
    if (it.state === 'accepted') return 'Angenommen';
    if (it.state === 'declined') return 'Abgelehnt';
    if (it.state === 'cancelled') return 'Zurückgezogen';
    switch (it.kind) {
      case 'post': {
        if (!it.needAck) return '';
        const s = ackStats(it);
        return s.open.length ? 'Wartet auf ' + U.fmt.count(s.open.length, 'Quittung', 'Quittungen') + ' (' + s.done + ' von ' + s.total + ')' : 'Alle haben quittiert';
      }
      case 'call': {
        const c = callStatus(it);
        if (c.need === 0) return 'Info an alle im Dienst';
        return 'Wartet auf Zusagen (' + c.yes.length + ' von ' + c.need + ')';
      }
      case 'task':
        if (it.owner) return (it.state === 'taken' ? 'In Arbeit bei ' : 'Zugeteilt an ') + M.name(it.owner);
        return 'Wartet auf Übernahme';
      case 'shiftreq':
        if (it.state === 'taken') return 'Wartet auf Freigabe der Leitung';
        return 'Wartet auf Antwort von ' + M.labelFor(recipients(it));
      case 'sos':
        if (Object.keys(it.answers || {}).length) return 'Hilfe kommt: ' + Object.keys(it.answers).map(M.first).join(', ');
        break;
      default:
        if (it.state === 'taken' && it.owner) return 'In Arbeit bei ' + M.name(it.owner);
    }
    const h = (it.esc && it.esc.history) || [];
    const last = h[h.length - 1] || { at: it.createdAt, ids: recipients(it) };
    const ids = last.ids || [];
    const label = last.key === 'slOpen' ? 'Schichtleitung' : last.key && M.STEP_LABEL[last.key] ? M.STEP_LABEL[last.key] : M.labelFor(ids);
    const isName = ids.length === 1 && label === M.name(ids[0]);
    const who = !isName && ids.length && ids.length <= 3 ? label + ' (' + ids.map(M.first).join(', ') + ')' : label;
    return 'Wartet auf ' + who + ' seit ' + since(last.at);
  }

  /** Zeitleiste eines Vorgangs für Melder und Empfänger: [{at, text, kind}] */
  function timeline(ref) {
    const it = get(ref);
    if (!it) return [];
    const out = [{ at: it.createdAt, kind: 'sent', text: 'Gesendet an ' + M.labelFor(((it.esc && it.esc.history[0]) || {}).ids || recipients(it)) }];
    for (const [id, ts] of Object.entries(it.seen || {})) if (id !== it.from) out.push({ at: ts, kind: 'seen', text: 'Gesehen von ' + M.name(id) });
    for (const [id, ts] of Object.entries(it.acks || {})) out.push({ at: ts, kind: 'ack', text: 'Quittiert von ' + M.name(id) });
    for (const h of ((it.esc && it.esc.history) || []).slice(1)) {
      out.push({ at: h.at, kind: h.fwd ? 'fwd' : 'esc', text: h.fwd ? 'Weitergegeben an ' + M.labelFor(h.ids || []) : 'Eskaliert an ' + (M.STEP_LABEL[h.key] || 'Schichtleitung') + ' (' + (h.ids || []).map(M.first).join(', ') + ')' });
    }
    for (const [id, a] of Object.entries(it.answers || {})) {
      out.push({ at: a.at, kind: 'answer', text: M.name(id) + ': ' + (a.a === 'yes' ? 'Ich komme' : a.a === 'coming' ? 'Hilfe kommt, ich gehe hin' : 'Kann nicht') });
    }
    if (it.takenAt && it.owner) out.push({ at: it.takenAt, kind: 'taken', text: 'Übernommen von ' + M.name(it.owner) });
    for (const t of it.thread || []) {
      if (t.type === 'fwd') continue;
      out.push({ at: t.at, kind: t.type || 'msg', text: M.name(t.by) + ': ' + (t.text || '') });
    }
    if (it.doneAt && it.state === 'done') out.push({ at: it.doneAt, kind: 'done', text: 'Erledigt' + (it.doneBy ? ' von ' + M.name(it.doneBy) : '') });
    if (it.closedAt) out.push({ at: it.closedAt, kind: 'closed', text: 'Geschlossen' });
    if (it.answeredAt) out.push({ at: it.answeredAt, kind: it.state, text: M.STATES[it.state] || '' });
    return U.sortBy(out, (x) => x.at);
  }

  /* ---------- Schnellruf (M5) -------------------------------------------- */
  /** Passende Personen für einen Ruf: im Dienst, nicht in Pause, passende Abteilung/Berechtigung */
  function callTargets(type, by, now) {
    now = now0(now);
    const c = M.CALL[type] || M.CALL.info;
    return M.staff().filter((e) => {
      if (e.id === by || !M.onDuty(e, now) || M.inPause(e) || e.role === 'clean') return false;
      if (!c.depts) return true;
      if (M.level(e) > 1) return false; // Leitung wird über die Eskalation erreicht
      return c.depts.includes(M.deptOf(e, now)) || (c.skill && e[c.skill]);
    }).map((e) => e.id);
  }
  /** Ruf auslösen: type kasse|info|goods|meeting. opts: {note, dept} */
  function call(by, type, opts, now) {
    now = now0(now); opts = opts || {};
    const c = M.CALL[type];
    if (!c) return fail('Unbekannter Ruf.');
    const ids = opts.ids || callTargets(type, by, now);
    const me = M.emp(by);
    return send({
      kind: 'call', type, title: c.label, body: opts.note || '', u: type !== 'meeting', need: M.callNeed(type), answers: {},
      dept: c.dept || opts.dept || (me && M.deptOf(me, now)), to: { type: 'person', ids }, standinFor: opts.standinFor || null,
    }, by, now);
  }
  /** Antwort auf einen Ruf: yes = „Ich komme“, sonst „Kann nicht“. Schließt bei genug Zusagen. */
  async function answerCall(ref, by, yes, now) {
    const it = get(ref); now = now0(now);
    if (!it || it.kind !== 'call') return { ok: false, reason: 'Ruf nicht gefunden.' };
    if (isFinal(it)) return { ok: false, reason: 'Der Ruf ist schon geschlossen. Danke!' };
    await SN.store.patch('items', it.id, { answers: { [by]: { a: yes ? 'yes' : 'no', at: now } }, seen: { [by]: (it.seen && it.seen[by]) || now } });
    const cur = get(it.id);
    let closed = false;
    if (yes && callStatus(cur).enough && cur.state !== 'closed') {
      await SN.store.patch('items', it.id, { state: 'closed', closedAt: now });
      closed = true;
    }
    return ok({ item: get(it.id), closed });
  }

  /* ---------- SOS (M7) ---------------------------------------------------- */
  /** SOS: an Leitung und Admins im Dienst (Fallback: alle Leitungen) */
  function sos(by, type, note, now) {
    now = now0(now);
    const t = M.SOS_TYPES.find((x) => x.key === type) || M.SOS_TYPES[0];
    const leads = M.staff().filter((e) => e.id !== by && M.isLead(e) && M.onDuty(e, now)).map((e) => e.id);
    let ids = U.uniq(leads.concat(M.adminOnDuty(now))).filter((id) => id !== by);
    if (!ids.length) ids = M.staff().filter((e) => e.id !== by && M.isLead(e)).map((e) => e.id);
    return send({ kind: 'sos', type: t.key, title: 'SOS: ' + t.label, body: note || '', u: true, answers: {}, tel: t.tel, to: { type: 'person', ids } }, by, now);
  }
  /** Leitung antwortet „Hilfe kommt, ich gehe hin“ */
  function sosRespond(ref, by, now) {
    const it = get(ref); now = now0(now);
    if (!it || it.kind !== 'sos') return fail('SOS nicht gefunden.');
    return SN.store.patch('items', it.id, {
      answers: { [by]: { a: 'coming', at: now } }, owner: it.owner || by, state: isFinal(it) ? it.state : 'taken',
      takenAt: it.takenAt || now, seen: { [by]: (it.seen && it.seen[by]) || now },
    }).then(() => ok({ item: get(it.id) }));
  }
  /** Ersthelfer/innen mit Status {id, name, onDuty, inPause} */
  function firstAiders(now) {
    now = now0(now);
    return M.staff().filter((e) => e.firstAid).map((e) => ({ id: e.id, name: e.name, onDuty: M.onDuty(e, now), inPause: M.inPause(e), dept: M.deptOf(e, now) }));
  }

  /* ---------- Schichtübergabe (M8) --------------------------------------- */
  /** Zusammenfassung für die Übergabe: offene Aufträge, Meldungen, Restware, Reinigung */
  function handoverSummary(shift, now) {
    now = now0(now);
    const open = items().filter((it) => !isFinal(it));
    const tasks = open.filter((it) => it.kind === 'task' && (!shift || it.shift === shift || !it.owner));
    const reports = open.filter((it) => it.kind === 'report' && it.cat !== 'clean');
    const cleaning = open.filter((it) => it.kind === 'report' && it.cat === 'clean');
    const rest = SN.store.list('rest').filter((r) => !r.done);
    const lines = [];
    if (tasks.length) lines.push(U.fmt.count(tasks.length, 'offener Auftrag', 'offene Aufträge'));
    if (reports.length) lines.push(U.fmt.count(reports.length, 'offene Meldung', 'offene Meldungen'));
    if (rest.length) lines.push(U.fmt.count(rest.length, 'Posten Restware', 'Posten Restware'));
    if (cleaning.length) lines.push(U.fmt.count(cleaning.length, 'Reinigung offen', 'Reinigungen offen'));
    return {
      shift, at: now,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, dept: t.dept, u: !!t.u, owner: t.owner })),
      reports: reports.map((r) => ({ id: r.id, title: r.title, dept: r.dept, u: !!r.u })),
      cleaning: cleaning.map((r) => ({ id: r.id, title: r.title, dept: r.dept })),
      rest: rest.map((r) => ({ id: r.id, name: r.name || r.note || 'Restware', dept: r.dept, place: r.place })),
      text: lines.length ? lines.join(', ') : 'Keine offenen Punkte',
    };
  }
  /** Übergabe an die nächste Schicht senden (Empfang muss quittiert werden) */
  function sendHandover(by, opts, now) {
    now = now0(now); opts = opts || {};
    const me = M.emp(by);
    const from = opts.fromShift || M.currentShift(now) || (me && me.sh) || 'Früh';
    const to = opts.toShift || M.nextShift(from);
    let ids = M.staff().filter((e) => e.role === 'sl' && e.sh === to).map((e) => e.id);
    if (!ids.length) ids = M.adminOnDuty(now);
    const sum = handoverSummary(from, now);
    return send({
      kind: 'handover', title: 'Übergabe ' + from + ' → ' + to, body: opts.notes || '', fromShift: from, toShift: to,
      summary: sum, shift: to, to: { type: 'person', ids: ids.filter((id) => id !== by) },
    }, by, now);
  }

  /* ---------- Schichtänderung nur als Anfrage (S2) ----------------------- */
  /** Anfrage: opts {day, date, shift, note, swap:boolean} – swap braucht Freigabe der Leitung */
  function shiftRequest(by, toId, opts, now) {
    opts = opts || {};
    if (!M.emp(toId)) return fail('Person nicht gefunden.');
    if (SN.ops && opts.day && opts.shift && !opts.swap) {
      const rc = SN.ops.restCheck(M.emp(toId), opts.day, opts.shift);
      if (!rc.ok) return fail(M.first(toId) + ': ' + rc.reason);
    }
    const title = opts.swap ? 'Schichttausch: ' + (opts.day || '') + ' ' + (opts.shift || '') : 'Kannst du ' + (opts.day || '') + ' ' + (opts.shift || '') + ' übernehmen?';
    return send({ kind: 'shiftreq', title: title.replace(/\s+/g, ' ').trim(), body: opts.note || '', req: { day: opts.day || null, date: opts.date || null, shift: opts.shift || null, swap: !!opts.swap }, to: { type: 'person', ids: [toId] } }, by, now);
  }
  /** Annehmen/Ablehnen. Tausch: annehmen → wartet auf Freigabe (state taken) */
  async function answerShiftReq(ref, by, accept, note, now) {
    const it = get(ref); now = now0(now);
    if (!it || it.kind !== 'shiftreq') return { ok: false, reason: 'Anfrage nicht gefunden.' };
    if (isFinal(it)) return { ok: false, reason: 'Die Anfrage ist schon beantwortet.' };
    if (!isRecipient(it, by)) return { ok: false, reason: 'Die Anfrage ist nicht an dich gerichtet.' };
    if (accept && SN.ops && it.req && it.req.day && it.req.shift) {
      const rc = SN.ops.restCheck(M.emp(by), it.req.day, it.req.shift);
      if (!rc.ok) return { ok: false, reason: rc.reason };
    }
    const swap = it.req && it.req.swap;
    const state = !accept ? 'declined' : swap ? 'taken' : 'accepted';
    const p = { state, answeredAt: now, answeredBy: by, owner: accept ? by : null, seen: { [by]: (it.seen && it.seen[by]) || now } };
    if (note) p.thread = (it.thread || []).concat([{ by, at: now, type: 'msg', text: note }]);
    await SN.store.patch('items', it.id, p);
    if (state !== 'taken') await log(by, 'Schichtanfrage ' + (accept ? 'angenommen' : 'abgelehnt') + ': ' + M.name(by) + ' · ' + it.title, now);
    return ok({ item: get(it.id) });
  }
  /** Tausch freigeben (Leitung) */
  async function approveSwap(ref, by, yes, now) {
    const it = get(ref); now = now0(now);
    if (!it || it.kind !== 'shiftreq') return { ok: false, reason: 'Anfrage nicht gefunden.' };
    if (!M.isLead(M.emp(by))) return { ok: false, reason: 'Nur die Leitung kann freigeben.' };
    await SN.store.patch('items', it.id, { state: yes ? 'accepted' : 'declined', approvedBy: by, approvedAt: now });
    await log(by, 'Schichttausch ' + (yes ? 'freigegeben' : 'abgelehnt') + ': ' + it.title + ' (' + M.name(it.from) + ' ↔ ' + M.name(it.owner) + ')', now);
    return ok({ item: get(it.id) });
  }

  /* ---------- Ausfall + Einspringer-Anfrage (S2) ------------------------- */
  /**
   * Ausfall melden: opts {type: sick|late|other, minutes, note, forId}
   * → sofort an die Schichtleitung; bei „krank“ zusätzlich „Wer kann einspringen?“
   *   an passende Kolleg/innen (gleiche Abteilung, nicht abwesend).
   */
  async function reportAbsence(by, opts, now) {
    now = now0(now); opts = opts || {};
    const who = M.emp(opts.forId || by);
    if (!who) return { ok: false, reason: 'Person nicht gefunden.' };
    const type = M.ABSENCE_TYPES[opts.type] ? opts.type : 'sick';
    const dept = M.deptOf(who, now);
    const shift = who.sh || M.currentShift(now) || 'Früh';
    let ids = M.shiftLeads(dept, shift).filter((id) => id !== by);
    if (!ids.length) ids = M.adminOnDuty(now);
    const title = M.ABSENCE_TYPES[type] + ': ' + who.name + (type === 'late' && opts.minutes ? ' (ca. ' + opts.minutes + ' Min)' : '');
    const r = await send({ kind: 'absence', type, title, body: opts.note || '', person: who.id, minutes: opts.minutes || null, dept, shift, u: type === 'sick', to: { type: 'person', ids } }, by, now);
    if (!r.ok) return r;
    let standin = null;
    if (type === 'sick') {
      const w = M.shiftWindow(who, now);
      await SN.store.patch('staff', who.id, { away: { type, at: now, until: w ? w.e : U.startOfDay(now) + U.DAY } });
      const cand = M.staff().filter((e) => e.id !== who.id && e.id !== by && M.level(e) <= 2 && e.role !== 'clean'
        && M.deptOf(e, now) === dept && !M.isAway(e, now)).map((e) => e.id);
      if (cand.length) {
        const c = await call(by, 'standin', { ids: cand, note: who.name + ' fällt aus (' + dept + ', ' + shift + '). Wer kann einspringen?', dept, standinFor: r.item.id }, now);
        if (c.ok) { standin = c.item; await SN.store.patch('items', r.item.id, { standinCall: standin.id }); }
      }
    }
    await log(by, 'Ausfall gemeldet: ' + title, now);
    return ok({ item: get(r.item.id), standin });
  }

  /* ---------- Kudos (S6), Stimmung (S7), Protokoll ----------------------- */
  /** Lob senden (keine Zähler, keine Ranglisten) */
  function kudos(by, toId, text) {
    return post(by, { to: { type: 'person', ids: [toId] }, title: 'Danke!', body: text || '', kudos: true });
  }
  /** Stimmung abgeben (anonym, nur Aggregat je Tag + Schicht): value 1..4 (1 = sehr gut, 4 = schlecht) */
  function vote(value, shift, now) {
    now = now0(now);
    const v = Math.min(4, Math.max(1, Math.round(value)));
    const d = U.fmt.dayKey(now);
    shift = shift || M.currentShift(now) || 'Früh';
    const id = d + '_' + U.slug(shift);
    const cur = SN.store.peek('mood', id);
    const c = Object.assign({ 1: 0, 2: 0, 3: 0, 4: 0 }, (cur && cur.c) || {});
    c[v] += 1; // Hinweis: letzter Schreiber gewinnt; selten, akzeptiert
    return SN.store.patch('mood', id, { d, sh: shift, c }).then(() => ok());
  }
  /** Aggregat für die Filialleitung: null unter 5 Antworten */
  function moodAggregate(day, shift) {
    const doc = SN.store.peek('mood', day + '_' + U.slug(shift));
    if (!doc) return null;
    const n = [1, 2, 3, 4].reduce((s, k) => s + (doc.c[k] || 0), 0);
    if (n < 5) return null;
    return { n, c: Object.assign({}, doc.c), avg: [1, 2, 3, 4].reduce((s, k) => s + k * (doc.c[k] || 0), 0) / n };
  }
  /** Änderungsprotokoll, ein Dokument je Tag (max. 300 Einträge) */
  function log(by, text, now) {
    now = now0(now);
    const id = U.fmt.dayKey(now);
    const cur = SN.store.peek('log', id);
    const entries = ((cur && cur.entries) || []).concat([{ at: now, by, text }]).slice(-300);
    return SN.store.patch('log', id, { d: id, entries });
  }

  /* ---------- Vorlagen (M3) ---------------------------------------------- */
  /** Vorlagen, die heute fällig und noch nicht angelegt sind */
  function dueTemplates(now) {
    now = now0(now);
    const day = U.fmt.dayKey(now);
    const wd = (new Date(now).getDay() + 6) % 7; // 0 = Mo
    return SN.store.list('templates').filter((t) => (!t.days || t.days.includes(wd)) && t.lastRun !== day);
  }
  /** Vorlage heute als Auftrag anlegen (Checklisten mit Uhrzeit eskalieren, wenn nicht abgehakt) */
  async function runTemplate(tpl, by, now) {
    now = now0(now);
    const at = tpl.at ? U.startOfDay(now) + U.fmt.hm(tpl.at) * MIN : now + 60 * MIN;
    const r = await task(by, {
      title: tpl.title, dept: tpl.dept, act: tpl.act, min: tpl.min, u: !!tpl.u, due: at, templateId: tpl.id,
      checklist: (tpl.checklist || []).map((t) => ({ text: t, done: false })), escalate: !!tpl.escalate, proofRequired: !!tpl.proofRequired,
    });
    if (r.ok) await SN.store.patch('templates', tpl.id, { lastRun: U.fmt.dayKey(now) });
    return r;
  }
  /** Checklisten-Punkt abhaken */
  function checkItem(ref, by, index, value) {
    const it = get(ref);
    if (!it || !Array.isArray(it.checklist) || !it.checklist[index]) return fail('Punkt nicht gefunden.');
    const list = it.checklist.map((c, i) => (i === index ? Object.assign({}, c, { done: value !== false, by, at: SN.clock.now() }) : c));
    return SN.store.patch('items', it.id, { checklist: list }).then(() => ok({ item: get(it.id) }));
  }

  /* ---------- Abfragen für Ansichten -------------------------------------- */
  /** Sortierung: Dringendes zuerst, dann früheste Frist, dann neueste */
  const dueOf = (it) => it.due || it.ackDue || Infinity;
  const urgentFirst = (a) => a.slice().sort((x, y) => (y.u ? 1 : 0) - (x.u ? 1 : 0) || (dueOf(x) - dueOf(y)) || (y.createdAt - x.createdAt));
  const INBOX_KINDS = ['report', 'absence', 'call', 'sos', 'handover', 'shiftreq', 'photo'];

  /** Eingang: Vorgänge, die mich betreffen (Empfänger, Eskalationsstufe, Besitzer), offen */
  function inbox(empId) {
    return urgentFirst(items().filter((it) => INBOX_KINDS.includes(it.kind) && !isFinal(it) && it.from !== empId
      && (involved(it).includes(empId))));
  }
  /** Meine Aufträge (offen), dringend zuerst, dann Frist */
  const notFuture = (it) => !it.plannedFor || it.plannedFor <= U.fmt.dayKey(now0());
  const myTasks = (empId) => urgentFirst(items().filter((it) => it.kind === 'task' && it.owner === empId && it.state !== 'done' && notFuture(it)));
  /** Freie Aufträge (optional Abteilung) */
  const freeTasks = (dept) => urgentFirst(items().filter((it) => it.kind === 'task' && !it.owner && !isFinal(it) && notFuture(it) && (!dept || it.dept === dept)));
  /** Erledigte Aufträge einer Person (neueste zuerst) */
  const doneTasks = (empId) => U.sortBy(items().filter((it) => it.kind === 'task' && it.state === 'done' && it.owner === empId), (it) => -(it.doneAt || 0));
  /** Zu quittieren: Pflicht-Infos und Übergaben, die ich noch nicht quittiert habe */
  const toAck = (empId) => urgentFirst(items().filter((it) => (it.kind === 'post' && it.needAck || it.kind === 'handover')
    && !isFinal(it) && isRecipient(it, empId) && !(it.acks || {})[empId]));
  /** Infos/Anweisungen an mich (neueste zuerst) */
  const postsFor = (empId) => U.sortBy(items().filter((it) => it.kind === 'post' && isRecipient(it, empId)), (it) => -it.createdAt);
  /** Von mir gesendet (neueste zuerst) */
  const sentBy = (empId, kind) => U.sortBy(items().filter((it) => it.from === empId && (!kind || it.kind === kind)), (it) => -it.createdAt);
  /** Offene Rufe an mich ohne meine Antwort */
  const openCalls = (empId) => items().filter((it) => it.kind === 'call' && !isFinal(it) && isRecipient(it, empId) && !(it.answers || {})[empId]);
  /** Aktive SOS (nicht abgeschlossen) */
  const activeSos = () => items().filter((it) => it.kind === 'sos' && !isFinal(it));
  /** Kurzbriefing meiner Schicht heute (neuestes) */
  function briefingFor(empId, now) {
    now = now0(now);
    const d = U.fmt.dayKey(now);
    const l = items().filter((it) => it.kind === 'post' && it.briefing && isRecipient(it, empId) && U.fmt.dayKey(it.createdAt) === d);
    return U.sortBy(l, (it) => -it.createdAt)[0] || null;
  }

  /**
   * Brennpunkte für Leitungs-Live (S1): [{type, item?, dept?, level, text}]
   * type: report | post | task | call | sos | dept
   */
  function hotspots(now) {
    now = now0(now);
    const out = [];
    for (const it of items()) {
      if (isFinal(it)) continue;
      const lvl = (it.esc && it.esc.level) || 0;
      if (it.kind === 'sos') out.push({ type: 'sos', item: it, level: 9, text: it.title + ' · ' + waitingOn(it, now) });
      else if ((it.kind === 'report' || it.kind === 'absence') && it.state !== 'taken') out.push({ type: 'report', item: it, level: lvl + (it.u ? 1 : 0), text: (it.u ? 'Dringend: ' : '') + it.title + ' · ' + waitingOn(it, now) });
      else if (it.kind === 'post' && it.needAck && ((it.esc && it.esc.level > 0) || (it.ackDue && now >= it.ackDue)) && ackStats(it).open.length) out.push({ type: 'post', item: it, level: lvl, text: it.title + ' · ' + waitingOn(it, now) });
      else if (it.kind === 'task' && it.u && !it.owner) out.push({ type: 'task', item: it, level: 1, text: 'Dringend: ' + it.title + ' · unbesetzt' });
      else if (it.kind === 'call' && it.need > 0 && !callStatus(it).enough) out.push({ type: 'call', item: it, level: lvl + 1, text: it.title + ' · ' + waitingOn(it, now) });
    }
    if (SN.dist) for (const d of SN.dist.overloaded(now)) out.push({ type: 'dept', dept: d.dept, level: 0, text: d.dept + ' überlastet: ' + U.fmt.dur(d.open) + ' offen, ' + U.fmt.count(d.people, 'Person', 'Personen') + ' da' });
    return U.sortBy(out, (x) => -x.level);
  }

  /** Vorgänge, die gelöscht werden können (abgeschlossen und älter als days Tage) */
  function prunable(days, now) {
    now = now0(now);
    const lim = now - (days || 14) * U.DAY;
    return items().filter((it) => isFinal(it) && (it.doneAt || it.closedAt || it.answeredAt || it.createdAt) < lim).map((it) => it.id);
  }

  /* ==========================================================================
     Chat (M6): ein Dokument je Thread in chats
       {id, type: dm|dept|lead, members?[], dept?, msgs:{msgId: msg}, read:{empId: ts}, last}
       msg = {id, by, at, text, photo?, lang?}
     Nachrichten als Objekt (nicht Array): gleichzeitiges Senden merged ohne Verlust.
     Über 200 Nachrichten wird auf die neuesten 180 verdichtet (put).
     ========================================================================== */
  const CHAT_MAX = 200, CHAT_KEEP = 180;
  const threadId = {
    dm: (a, b) => 'dm~' + [a, b].sort().join('~'),
    dept: (dept) => 'dept~' + U.slug(dept),
    lead: () => 'lead',
  };
  /** Thread-Metadaten aus der ID: {type, members?, dept?} */
  function threadInfo(tid) {
    if (tid === 'lead') return { type: 'lead' };
    if (tid.startsWith('dm~')) return { type: 'dm', members: tid.slice(3).split('~') };
    if (tid.startsWith('dept~')) {
      const slug = tid.slice(5);
      return { type: 'dept', dept: M.DEPTS.find((d) => U.slug(d) === slug) || slug };
    }
    return { type: 'unknown' };
  }
  /** Darf empId diesen Thread lesen/schreiben? */
  function canUseThread(tid, empId) {
    const e = M.emp(empId);
    const info = threadInfo(tid);
    if (!e) return false;
    if (info.type === 'lead') return M.inLeadChannel(e);
    if (info.type === 'dm') return info.members.includes(empId);
    if (info.type === 'dept') return M.isLead(e) || e.dept === info.dept || M.deptOf(e) === info.dept;
    return false;
  }
  /** Titel eines Threads aus Sicht von empId */
  function threadTitle(tid, empId) {
    const info = threadInfo(tid);
    if (info.type === 'lead') return 'Leitung';
    if (info.type === 'dept') return M.deptLabel(info.dept);
    if (info.type === 'dm') return M.name(info.members.find((m) => m !== empId) || empId);
    return tid;
  }
  /** Nachrichten eines Threads, chronologisch */
  function messages(tid) {
    const t = SN.store.peek('chats', tid);
    return t ? U.sortBy(Object.values(t.msgs || {}).filter(Boolean), (m) => m.at) : [];
  }

  /** Nachricht senden: msg {text, photo?, lang?} */
  async function chatSend(tid, by, msg, now) {
    now = now0(now); msg = msg || {};
    if (!canUseThread(tid, by)) return { ok: false, reason: 'Kein Zugriff auf diesen Chat.' };
    const text = String(msg.text || '').trim();
    if (!text && !msg.photo) return { ok: false, reason: 'Bitte einen Text eingeben.' };
    const m = { id: U.id('m'), by, at: now, text };
    if (msg.photo) m.photo = msg.photo;
    if (msg.lang && msg.lang !== 'de') m.lang = msg.lang;
    const info = threadInfo(tid);
    const p = { type: info.type, msgs: { [m.id]: m }, last: now, read: { [by]: now } };
    if (info.members) p.members = info.members;
    if (info.dept) p.dept = info.dept;
    await SN.store.patch('chats', tid, p);
    const doc = SN.store.peek('chats', tid);
    const all = messages(tid);
    if (all.length > CHAT_MAX) {
      const keep = all.slice(-CHAT_KEEP);
      await SN.store.put('chats', tid, Object.assign({}, U.clone(doc), { msgs: Object.fromEntries(keep.map((x) => [x.id, x])) }));
    }
    return ok({ msg: m });
  }
  /** Thread als gelesen markieren (schreibt nur, wenn es Neues gibt) */
  function chatRead(tid, by, now) {
    now = now0(now);
    const t = SN.store.peek('chats', tid);
    if (!t || (t.read && t.read[by] >= (t.last || 0))) return Promise.resolve(ok({ unchanged: true }));
    return SN.store.patch('chats', tid, { read: { [by]: now } }).then(() => ok());
  }
  /** Ungelesene Nachrichten anderer in einem Thread */
  function unread(tid, by) {
    const t = SN.store.peek('chats', tid);
    if (!t) return 0;
    const r = (t.read && t.read[by]) || 0;
    return Object.values(t.msgs || {}).filter((m) => m && m.by !== by && m.at > r).length;
  }
  /** Lesehaken: 'read' (Doppelhaken), wenn ein anderes Mitglied nach der Nachricht gelesen hat, sonst 'sent' (Haken) */
  function receipt(tid, msg) {
    const t = SN.store.peek('chats', tid);
    if (!t || !msg) return 'sent';
    return Object.entries(t.read || {}).some(([id, ts]) => id !== msg.by && ts >= msg.at) ? 'read' : 'sent';
  }
  /** Threads für eine Person: Abteilungskanal, ggf. Leitung, alle 1:1 → [{id, type, title, last, unread}] */
  function threadsFor(empId) {
    const e = M.emp(empId);
    if (!e) return [];
    const ids = new Set([threadId.dept(M.deptOf(e) || e.dept || 'Info')]);
    if (M.inLeadChannel(e)) ids.add(threadId.lead());
    for (const t of SN.store.list('chats')) {
      if (t.type === 'dm' && (t.members || []).includes(empId)) ids.add(t.id);
      else if (t.type === 'dept' && canUseThread(t.id, empId) && M.isLead(e)) ids.add(t.id);
    }
    const out = Array.from(ids).filter((id) => canUseThread(id, empId)).map((id) => {
      const t = SN.store.peek('chats', id);
      return { id, type: threadInfo(id).type, title: threadTitle(id, empId), last: (t && t.last) || 0, unread: unread(id, empId) };
    });
    return U.sortBy(out, (x) => -x.last);
  }
  const totalUnread = (empId) => threadsFor(empId).reduce((s, t) => s + t.unread, 0);

  SN.comm = {
    // Lesen
    get, isFinal, recipients, isRecipient, involved, currentIds, ackStats, callStatus, satisfied,
    // Kern M1
    send, post, task, report, markSeen, ack, take, start, forward, done, approve, reply, remind, giveBack, toTask,
    escalateDue, waitingOn, timeline,
    // M5, M7, M8, S2
    callTargets, call, answerCall, sos, sosRespond, firstAiders,
    handoverSummary, sendHandover, shiftRequest, answerShiftReq, approveSwap, reportAbsence,
    // S6, S7, Protokoll, Vorlagen
    kudos, vote, moodAggregate, log, dueTemplates, runTemplate, checkItem,
    // Abfragen
    urgentFirst, inbox, myTasks, freeTasks, doneTasks, toAck, postsFor, sentBy, openCalls, activeSos, briefingFor, hotspots, prunable,
    // Chat
    CHAT_MAX, threadId, threadInfo, canUseThread, threadTitle, messages, chatSend, chatRead, unread, receipt, threadsFor, totalUnread,
  };
})(window.SN = window.SN || {});
