/* ==========================================================================
   SN.model – Fachkonstanten, Rollen, Hierarchie, Zuständigkeiten
   --------------------------------------------------------------------------
   Liest Personal und Einstellungen aus SN.store (Cache, synchron).
   Hierarchie-Stufen (Eskalationskette, unten → oben):
     1 Mitarbeiter/in, Azubi (Reinigung ebenfalls 1)
     2 Schichtleiter/in (je Schicht, zuständig für Abteilungen in `scope`)
     3 Teamleiter/in (je Abteilungsgruppe)
     4 Admin vom Dienst (settings.main.adminOnDuty)
     5 Stellv. Filialleiter/in, Filialleiter/in
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util;

  /* ---------- Abteilungen ---------------------------------------------- */
  const DEPTS = [
    'Trocken sortiment', 'Getränkeabteilung', 'Kasse', 'Info', 'MoPro', 'Moon Food Abteilung',
    'Alkoholische Getränke', 'Drogerie', 'Fertige Gerichte', 'Konserven', 'Obst und Gemüse',
    'Backshop und Frischetheke', 'Lager', 'Wareneinnahme', 'Leergut',
  ];
  // Icon-NAMEN aus dem Sprite (src/ui/icons.svg), Darstellung über SN.ui.icon(name)
  const DEPT_ICONS = {
    'Trocken sortiment': 'dept-trocken', 'Getränkeabteilung': 'dept-getraenke', 'Kasse': 'dept-kasse', 'Info': 'dept-info', 'MoPro': 'dept-mopro',
    'Moon Food Abteilung': 'dept-moon', 'Alkoholische Getränke': 'dept-alkohol', 'Drogerie': 'dept-drogerie', 'Fertige Gerichte': 'dept-fertig',
    'Konserven': 'dept-konserven', 'Obst und Gemüse': 'dept-obst', 'Backshop und Frischetheke': 'dept-backshop', 'Lager': 'dept-lager',
    'Wareneinnahme': 'dept-wareneingang', 'Leergut': 'dept-leergut',
  };
  // Abteilungsgruppen (Zuständigkeit der Teamleitungen)
  const DEPT_GROUPS = {
    frische: { label: 'Frische', depts: ['MoPro', 'Obst und Gemüse', 'Backshop und Frischetheke', 'Fertige Gerichte', 'Moon Food Abteilung'] },
    trocken: { label: 'Trocken & Drogerie', depts: ['Trocken sortiment', 'Konserven', 'Drogerie'] },
    getraenke: { label: 'Getränke & Leergut', depts: ['Getränkeabteilung', 'Alkoholische Getränke', 'Leergut'] },
    kasse: { label: 'Kasse & Info', depts: ['Kasse', 'Info'] },
    logistik: { label: 'Lager & Wareneinnahme', depts: ['Lager', 'Wareneinnahme'] },
  };

  /* ---------- Tätigkeiten (Richtwert in Minuten) ----------------------- */
  const ACTS = [
    ['Warenverräumung', 30], ['Grundordnung', 20], ['Warenpflege', 20], ['Aktionsregal aufbauen', 45],
    ['Etikettierung', 25], ['Plakate erstellen', 30], ['Lücken füllen', 20], ['Wareneinnahme', 45],
    ['Leergut', 30], ['Sonstiges', 20],
  ].map(([key, min]) => ({ key, label: key, min }));
  const ACT_MIN = Object.fromEntries(ACTS.map((a) => [a.key, a.min]));

  /* ---------- Mengen, Ware --------------------------------------------- */
  const UNITS = { pal: 'Paletten', kkp: 'KKP (Kaufland Klapp Pallets)', disp: 'Displays', cart: 'Wagen' };
  const EFFORT = { pal: 8, kkp: 4, disp: 6 }; // Min Entladeaufwand je Einheit
  const PALLET_TYPES = {
    normal: ['Europalette', 'Halbpalette', 'Rollcontainer'],
    werbung: ['Displaypalette', 'Aktionspalette', 'Viertelpalette (Display)', 'Europalette'],
  };
  const ZONES = {
    normal: ['Regallager A', 'Regallager B', 'Kühllager', 'Bodenlager'],
    werbung: ['Werbelager W1', 'Werbelager W2', 'Aktionsfläche vor Ort'],
  };
  const BREAK_REASONS = ['Glasbruch', 'Verpackung beschädigt', 'MHD abgelaufen', 'Transportschaden', 'Verderb, ausgelaufen', 'Sonstiges'];
  const CLEAN_TYPES = ['Glasbruch', 'Verschüttete Flüssigkeit', 'Ausgelaufenes Produkt', 'Verstreute Ware', 'Müll, Verpackung', 'Sonstiges'];

  /* ---------- Schichten ------------------------------------------------- */
  const SHIFTS = { 'Früh': { s: 6, e: 14, label: 'Früh · 06–14' }, 'Spät': { s: 14, e: 22, label: 'Spät · 14–22' } };
  const SHIFT_NAMES = ['Früh', 'Spät'];
  const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  /* ---------- Rollen ---------------------------------------------------- */
  // group = Navigations-/Ansichtsgruppe (registerView roles), level = Hierarchiestufe
  const ROLES = {
    azubi: { label: 'Azubi', level: 1, group: 'emp' },
    emp: { label: 'Mitarbeiter/in', level: 1, group: 'emp' },
    clean: { label: 'Reinigung', level: 1, group: 'clean' },
    sl: { label: 'Schichtleiter/in', level: 2, group: 'lead' },
    tl: { label: 'Teamleiter/in', level: 3, group: 'lead' },
    admin: { label: 'Admin (Disponent)', level: 4, group: 'admin' },
    sfl: { label: 'Stellv. Filialleiter/in', level: 5, group: 'admin' },
    fl: { label: 'Filialleiter/in', level: 5, group: 'admin' },
  };
  const ROLE_GROUPS = { emp: 'Mitarbeitende', lead: 'Schicht- und Teamleitung', admin: 'Admin und Filialleitung', clean: 'Reinigung' };
  const LEVELS = { 1: 'Mitarbeitende', 2: 'Schichtleitung', 3: 'Teamleitung', 4: 'Admin vom Dienst', 5: 'Filialleitung' };
  // Empfänger-Auswahl „an Rolle“ (Senden)
  const ROLE_TARGETS = {
    emp: 'Mitarbeitende und Azubis', sl: 'Schichtleitungen', tl: 'Teamleitungen', leads: 'Alle Leitungen',
    admin: 'Admins', fl: 'Filialleitung', clean: 'Reinigung',
  };

  /* ---------- Vorgänge (M1) -------------------------------------------- */
  const KINDS = {
    post: 'Anweisung', task: 'Auftrag', report: 'Meldung', call: 'Schnellruf', sos: 'SOS',
    handover: 'Schichtübergabe', shiftreq: 'Schichtanfrage', absence: 'Ausfall', photo: 'Fotobericht',
  };
  const STATES = {
    sent: 'Gesendet', seen: 'Gesehen', taken: 'Übernommen', done: 'Erledigt', closed: 'Geschlossen',
    accepted: 'Angenommen', declined: 'Abgelehnt', cancelled: 'Zurückgezogen',
  };
  const FINAL_STATES = ['done', 'closed', 'accepted', 'declined', 'cancelled'];

  // Eskalationsfristen in Minuten (Standard, änderbar in settings.main.deadlines)
  const DEFAULT_DEADLINES = {
    urgent: 3, absence: 5, defect: 5, call: 2, minor: 15, other: 20, post: 30, postUrgent: 10, sos: 2, handover: 15, photo: 20,
  };
  const DEADLINE_LABELS = {
    urgent: 'Dringende Meldung', absence: 'Personalausfall', defect: 'Defekt / Sicherheit', call: 'Kasse-/Info-Ruf',
    minor: 'Lücke / Preis / Reinigung', other: 'Sonstiges', post: 'Anweisung mit Quittung', postUrgent: 'Dringende Anweisung mit Quittung',
    sos: 'SOS ohne Antwort', handover: 'Schichtübergabe', photo: 'Fotobericht ungesehen',
  };

  // Meldungs-Kategorien (M4). route = erste zuständige Stufe; dept = feste Abteilung
  const REPORT_CATS = [
    { key: 'gap', label: 'Lücke im Regal', icon: 'box', route: 'sl', dl: 'minor' },
    { key: 'price', label: 'Preis falsch', icon: 'tag', route: 'tl', dl: 'minor' },
    { key: 'clean', label: 'Reinigung nötig', icon: 'broom', route: 'clean', dl: 'minor' },
    { key: 'defect', label: 'Defekt (Kühlung, Kasse, Technik)', icon: 'wrench', route: 'admin', dl: 'defect' },
    { key: 'bottle', label: 'Leergutautomat', icon: 'recycle', route: 'sl', dl: 'minor', dept: 'Leergut' },
    { key: 'absence', label: 'Personalausfall', icon: 'thermometer', route: 'sl', dl: 'absence' },
    { key: 'delivery', label: 'Lieferung', icon: 'truck', route: 'sl', dl: 'other', dept: 'Wareneinnahme' },
    { key: 'safety', label: 'Sicherheit', icon: 'alert', route: 'sl', dl: 'defect' },
    { key: 'other', label: 'Sonstiges', icon: 'chat', route: 'sl', dl: 'other' },
  ];
  const CAT = Object.fromEntries(REPORT_CATS.map((c) => [c.key, c]));

  // Schnellrufe (M5). need = nötige Zusagen (überschreibbar: settings.main.callNeed)
  const CALL_TYPES = [
    { key: 'kasse', label: 'Kasse öffnen', icon: 'dept-kasse', need: 2, depts: ['Kasse', 'Info'], skill: 'kasse', dept: 'Kasse' },
    { key: 'info', label: 'Hilfe an Info', icon: 'dept-info', need: 1, depts: ['Info', 'Kasse'], dept: 'Info' },
    { key: 'goods', label: 'Hilfe Wareneingang', icon: 'truck', need: 1, depts: ['Wareneinnahme', 'Lager', 'Leergut'], dept: 'Wareneinnahme' },
    { key: 'meeting', label: 'Alle zur Besprechung', icon: 'report', need: 0, depts: null, dept: null },
  ];
  const CALL = Object.fromEntries(CALL_TYPES.map((c) => [c.key, c]));
  // interner Ruf bei Ausfall (S2), nicht als Knopf
  CALL.standin = { key: 'standin', label: 'Wer kann einspringen?', icon: 'hand', need: 1, depts: null, dept: null };

  const SOS_TYPES = [
    { key: 'theft', label: 'Diebstahl', icon: 'sos', tel: '110' },
    { key: 'fire', label: 'Brand', icon: 'flame', tel: '112' },
    { key: 'accident', label: 'Unfall', icon: 'medical', tel: '112' },
  ];
  const EMERGENCY = [
    { tel: '112', label: 'Notruf 112 (Feuer, Rettung)' },
    { tel: '110', label: 'Polizei 110' },
  ];
  const ABSENCE_TYPES = { sick: 'Krank', late: 'Verspätet', other: 'Sonstiger Ausfall' };

  /* ---------- Zugriff auf Store-Daten ----------------------------------- */
  const staff = () => SN.store.list('staff');
  const emp = (id) => (id ? SN.store.peek('staff', id) : null);
  const name = (id) => { const e = emp(id); return e ? e.name : 'Unbekannt'; };
  const first = (id) => name(id).split(' ')[0];

  /** Einstellungen (Dokument settings/main) mit Standardwerten */
  function settings() {
    const s = SN.store.peek('settings', 'main') || {};
    return Object.assign({}, s, {
      deadlines: Object.assign({}, DEFAULT_DEADLINES, s.deadlines || {}),
      callNeed: Object.assign({}, s.callNeed || {}),
    });
  }

  /* ---------- Rollenprüfungen ------------------------------------------- */
  const role = (e) => (e && ROLES[e.role]) || ROLES.emp;
  const level = (e) => role(e).level;
  const group = (e) => role(e).group;
  const isLead = (e) => !!e && e.role !== 'clean' && level(e) >= 2;
  const isAdmin = (e) => !!e && level(e) >= 4;
  const isClean = (e) => !!e && e.role === 'clean';
  /** KI-Sprachassistent (K1): nur Konten mit aiAssist (im Demo: Mustafa) */
  const canAiAssist = (e) => !!(e && e.aiAssist);
  /** Kanal „Leitung“: Schichtleitung und höher */
  const inLeadChannel = (e) => isLead(e);
  const groupOf = (dept) => Object.keys(DEPT_GROUPS).find((g) => DEPT_GROUPS[g].depts.includes(dept)) || null;
  const deptLabel = (d) => d; // nur Text; Icon über SN.ui.icon(DEPT_ICONS[d])

  /* ---------- Zeit und Dienst ------------------------------------------- */
  /** Aktuelle Schicht nach Uhrzeit: Früh 06–14, Spät 14–22, sonst null */
  function currentShift(now) {
    const h = new Date(now === undefined ? SN.clock.now() : now).getHours();
    if (h >= 6 && h < 14) return 'Früh';
    if (h >= 14 && h < 22) return 'Spät';
    return null;
  }
  const nextShift = (sh) => (sh === 'Früh' ? 'Spät' : 'Früh');

  /**
   * Arbeitsfenster heute {s, e, p} (Zeitstempel, Pause in Min oder null):
   * aus dem Plan (Collection plans, Dokument-ID = Personal-ID), sonst Schicht.
   * null = heute frei.
   */
  function shiftWindow(e, now) {
    now = now === undefined ? SN.clock.now() : now;
    const day0 = U.startOfDay(now);
    const plan = e && SN.store.peek('plans', e.id);
    const wd = DAYS[(new Date(now).getDay() + 6) % 7];
    const p = plan && Array.isArray(plan.days) ? plan.days.find((d) => d.d === wd) : null;
    if (p) {
      if (p.off) return null;
      return { s: day0 + U.fmt.hm(p.s) * U.MIN, e: day0 + U.fmt.hm(p.e) * U.MIN, p: p.p === undefined ? null : p.p };
    }
    const sh = SHIFTS[(e && e.sh) || 'Früh'] || SHIFTS['Früh'];
    return { s: day0 + sh.s * U.HOUR, e: day0 + sh.e * U.HOUR, p: null };
  }

  /** Abwesend (krank gemeldet o. ä.) bis away.until */
  const isAway = (e, now) => !!(e && e.away && e.away.until > (now === undefined ? SN.clock.now() : now));
  /** In Pause (Pause läuft, auch überzogen) */
  const inPause = (e) => !!(e && e.brk);

  /** Im Dienst: Arbeitsfenster läuft und nicht abwesend */
  function onDuty(e, now) {
    now = now === undefined ? SN.clock.now() : now;
    if (!e || isAway(e, now)) return false;
    const w = shiftWindow(e, now);
    return !!w && now >= w.s && now < w.e;
  }
  /** Benachrichtigungen nur in der eigenen Schicht (Leitbild 5) */
  const notifyAllowed = (e, now) => onDuty(e, now);

  /** Abteilung unter Berücksichtigung von „Umsetzen“ (loan) */
  function deptOf(e, now) {
    now = now === undefined ? SN.clock.now() : now;
    if (e && e.loan && (!e.loan.until || e.loan.until > now)) return e.loan.to;
    return e ? e.dept : null;
  }

  /* ---------- Personen je Stufe ----------------------------------------- */
  /** Schichtleitungen für Abteilung + Schicht (Fallback: alle SL der Schicht) */
  function shiftLeads(dept, shift) {
    const sl = staff().filter((e) => e.role === 'sl' && (!shift || e.sh === shift));
    const exact = sl.filter((e) => (e.scope || [e.dept]).includes(dept));
    return (exact.length ? exact : sl).map((e) => e.id);
  }
  /** Teamleitungen der Abteilungsgruppe (Fallback: alle TL) */
  function teamLeads(dept) {
    const g = groupOf(dept);
    const tl = staff().filter((e) => e.role === 'tl');
    const exact = tl.filter((e) => e.group === g);
    return (exact.length ? exact : tl).map((e) => e.id);
  }
  const admins = () => staff().filter((e) => e.role === 'admin').map((e) => e.id);
  /** Admin vom Dienst: settings.main.adminOnDuty, sonst erster Admin im Dienst, sonst erster Admin */
  function adminOnDuty(now) {
    const s = settings();
    const set = s.adminOnDuty && emp(s.adminOnDuty);
    if (set && set.role === 'admin') return [set.id];
    const all = staff().filter((e) => e.role === 'admin');
    const on = all.find((e) => onDuty(e, now));
    return on ? [on.id] : all.length ? [all[0].id] : [];
  }
  const branchLeads = () => staff().filter((e) => e.role === 'fl' || e.role === 'sfl').map((e) => e.id);
  const cleaners = () => staff().filter((e) => e.role === 'clean').map((e) => e.id);

  /** Personen einer Stufe (Schlüssel sl|tl|admin|fl|clean) für Abteilung + Schicht */
  function peopleFor(key, dept, shift, now) {
    switch (key) {
      case 'clean': return cleaners();
      case 'sl': return shiftLeads(dept, shift);
      case 'tl': return teamLeads(dept);
      case 'admin': return adminOnDuty(now);
      case 'fl': return branchLeads();
      default: return [];
    }
  }
  const STEP_LEVEL = { clean: 1, sl: 2, tl: 3, admin: 4, fl: 5 };
  const STEP_LABEL = { clean: 'Reinigung', sl: 'Schichtleitung', tl: 'Teamleitung', admin: 'Admin vom Dienst', fl: 'Filialleitung' };

  /**
   * Zuständige Personen für eine Meldung (M4): Kategorie + Abteilung + Schicht.
   * Reinigung → Reinigungskonto, Defekt → Admin vom Dienst, Preis → Teamleitung,
   * sonst Schichtleitung der Abteilung. Fällt eine Stufe leer aus, rückt die nächste nach.
   */
  function responsibleFor(category, dept, shift, now) {
    const c = CAT[category] || CAT.other;
    dept = c.dept || dept;
    shift = shift || currentShift(now) || 'Früh';
    const order = ['clean', 'sl', 'tl', 'admin', 'fl'];
    for (let i = order.indexOf(c.route); i < order.length; i++) {
      const ids = peopleFor(order[i], dept, shift, now);
      if (ids.length) return ids;
    }
    return [];
  }

  /** Höchste Stufe einer Personengruppe (für den Start der Kette) */
  function maxLevel(ids) {
    return ids.reduce((m, id) => Math.max(m, level(emp(id))), 0);
  }

  /** Bezeichnung einer Empfängergruppe: „Schichtleitung“, „Reinigung“, Name … */
  function labelFor(ids) {
    if (!ids.length) return 'niemand';
    if (ids.length === 1) {
      const e = emp(ids[0]);
      if (!e) return 'Unbekannt';
      const adm = adminOnDuty();
      return e.role === 'admin' && adm[0] === e.id ? 'Admin vom Dienst' : name(e.id);
    }
    const roles = U.uniq(ids.map((id) => (emp(id) || {}).role));
    if (roles.length === 1) {
      const r = roles[0];
      if (r === 'sl') return 'Schichtleitung';
      if (r === 'tl') return 'Teamleitung';
      if (r === 'admin') return 'Admins';
      if (r === 'clean') return 'Reinigung';
    }
    if (roles.every((r) => r === 'fl' || r === 'sfl')) return 'Filialleitung';
    return ids.length + ' Personen';
  }

  // Welche Stufen nach den Empfängern folgen, je Vorgangsart
  const CHAIN_KEYS = {
    report: ['sl', 'tl', 'admin', 'fl'],
    absence: ['sl', 'tl', 'admin', 'fl'],
    call: ['sl', 'admin'],
    sos: ['admin', 'fl'],
    handover: ['admin'],
    task: ['sl', 'tl'], // nur für Checklisten-Aufträge mit escalate:true
    photo: ['sl', 'tl', 'admin', 'fl'], // Fotobericht: ungesehen → eine Stufe höher
  };

  /**
   * Eskalationskette eines Vorgangs: Array von Stufen
   *   [{key, level, label, ids[]}, …]
   * Index 0 = aktuelle Empfänger (to), danach die Stufen darüber.
   * Leere Stufen werden übersprungen, bereits benachrichtigte Personen nicht wiederholt.
   */
  function escalationChain(item, now) {
    if (!item) return [];
    now = now === undefined ? SN.clock.now() : now;
    const rec = SN.comm ? SN.comm.recipients(item) : resolveTo(item.to);
    // Startstufe: bei gezielten Empfängern deren höchste Stufe, bei Abteilung/Schicht/alle Stufe 1
    const direct = (item.to && item.to.type === 'person') || (item.kind === 'task' && item.owner);
    const chain = [{ key: 'to', level: direct ? maxLevel(rec) : 1, label: labelFor(rec), ids: rec }];
    // Absender nie als eigene Stufe; bei Abteilung/Schicht zählen Leitungen dort nicht als schon erreicht
    const seen = new Set((direct ? rec : []).concat(item.from ? [item.from] : []));
    const push = (key, ids) => {
      ids = ids.filter((id) => !seen.has(id));
      if (!ids.length) return;
      ids.forEach((id) => seen.add(id));
      chain.push({ key, level: STEP_LEVEL[key] || 2, label: key === 'slOpen' ? 'Schichtleitung der Offenen' : STEP_LABEL[key], ids });
    };
    if (item.kind === 'post') {
      // Pflicht-Quittung abgelaufen → Hinweis an die Schichtleitung der Offenen
      if (!item.needAck) return chain;
      const open = SN.comm ? SN.comm.ackStats(item).open : [];
      push('slOpen', U.uniq([].concat(...open.map((id) => {
        const e = emp(id);
        return e ? shiftLeads(deptOf(e, now), e.sh) : [];
      }))));
      return chain;
    }
    if (item.kind === 'task' && !item.escalate) return chain;
    const keys = CHAIN_KEYS[item.kind] || [];
    const base = chain[0].level;
    const dept = item.dept || null;
    const shift = item.shift || currentShift(now) || 'Früh';
    for (const k of keys) {
      if (STEP_LEVEL[k] <= base) continue;
      push(k, peopleFor(k, dept, shift, now));
    }
    return chain;
  }

  /**
   * Empfänger auflösen: to = {type, ids[], shift?}
   *  person → IDs, dept → Personal der Abteilung, shift → Personal der Schicht,
   *  role → Rollen-Auswahl (ROLE_TARGETS), all → alle.
   */
  function resolveTo(to, now) {
    if (!to) return [];
    const ids = to.ids || [];
    const all = staff();
    let out;
    switch (to.type) {
      case 'person': out = ids.filter((id) => emp(id)); break;
      case 'dept': out = all.filter((e) => ids.includes(deptOf(e, now)) || ids.includes(e.dept)).map((e) => e.id); break;
      case 'shift': out = all.filter((e) => ids.includes(e.sh)).map((e) => e.id); break;
      case 'role': out = all.filter((e) => ids.some((r) => matchRole(e, r))).map((e) => e.id); break;
      case 'all': out = all.map((e) => e.id); break;
      default: out = [];
    }
    if (to.shift && to.type !== 'person') out = out.filter((id) => (emp(id) || {}).sh === to.shift);
    return U.uniq(out);
  }
  function matchRole(e, r) {
    if (r === 'emp') return e.role === 'emp' || e.role === 'azubi';
    if (r === 'leads') return isLead(e);
    if (r === 'fl') return e.role === 'fl' || e.role === 'sfl';
    return e.role === r;
  }

  /** Eskalationsfrist (Min) eines Vorgangs je Stufe */
  function deadlineMin(item) {
    const d = settings().deadlines;
    switch (item.kind) {
      case 'report': {
        const c = CAT[item.cat] || CAT.other;
        const m = d[c.dl] || d.other;
        return item.u ? Math.min(m, d.urgent) : m;
      }
      case 'absence': return d.absence;
      case 'call': return d.call;
      case 'sos': return d.sos;
      case 'handover': return d.handover;
      case 'photo': return item.u ? d.postUrgent : d.photo;
      case 'post': return item.ackMin || (item.u ? d.postUrgent : d.post);
      case 'task': return item.escalate ? (item.u ? d.urgent : d.minor) : 0;
      default: return d.other;
    }
  }

  /** Beginn der nächsten (oder laufenden) Schicht `name` ab Zeitpunkt ts */
  function shiftStartFrom(name, ts) {
    const sh = SHIFTS[name] || SHIFTS['Früh'];
    const d = U.startOfDay(ts) + sh.s * U.HOUR;
    return ts < d + (sh.e - sh.s) * U.HOUR ? d : d + U.DAY;
  }
  /** Frist-Start eines Vorgangs: Übergaben zählen ab Beginn der Empfangsschicht */
  function ackStart(it, ts) {
    if (it.kind === 'handover' && it.toShift) return Math.max(ts, shiftStartFrom(it.toShift, ts));
    return ts;
  }

  /** Nötige Zusagen für einen Ruf */
  function callNeed(type) {
    const s = settings();
    if (s.callNeed[type] !== undefined) return s.callNeed[type];
    return CALL[type] ? CALL[type].need : 1;
  }

  SN.model = {
    DEPTS, DEPT_ICONS, DEPT_GROUPS, ACTS, ACT_MIN, UNITS, EFFORT, PALLET_TYPES, ZONES, BREAK_REASONS, CLEAN_TYPES,
    SHIFTS, SHIFT_NAMES, DAYS, ROLES, ROLE_GROUPS, LEVELS, ROLE_TARGETS, KINDS, STATES, FINAL_STATES,
    DEFAULT_DEADLINES, DEADLINE_LABELS, REPORT_CATS, CAT, CALL_TYPES, CALL, SOS_TYPES, EMERGENCY, ABSENCE_TYPES,
    STEP_LABEL, STEP_LEVEL,
    staff, emp, name, first, settings,
    role, level, group, isLead, isAdmin, isClean, canAiAssist, inLeadChannel, groupOf, deptLabel,
    currentShift, nextShift, shiftWindow, isAway, inPause, onDuty, notifyAllowed, deptOf,
    shiftLeads, teamLeads, admins, adminOnDuty, branchLeads, cleaners, peopleFor,
    responsibleFor, escalationChain, resolveTo, labelFor, maxLevel, deadlineMin, callNeed, shiftStartFrom, ackStart,
  };
})(window.SN = window.SN || {});
