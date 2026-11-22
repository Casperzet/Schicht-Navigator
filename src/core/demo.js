/* ==========================================================================
   SN.demo – Demo-Datensatz (NUR im Demo-Modus geladen, nie in die db)
   --------------------------------------------------------------------------
   build(now) → {staff, items, chats, templates, plans, settings, mood,
                 trucks, goods, rest, breakage, log, media}
   70 Mitarbeitende (inkl. Filialleitung, Teamleitungen, Schichtleitungen,
   Azubis) + 5 Admins (Mustafa, Niels, Chiki, Marino, Arek) + Reinigung Ivana.
   Alle PINs: 1234. Zeiten relativ zu „now“, damit die Demo immer frisch wirkt.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model;
  const MIN = U.MIN, HOUR = U.HOUR;

  // [Name, Sprache] – Mitarbeitende und Azubis (57), keine Dubletten
  const PEOPLE = [
    ['Anna Müller', 'de'], ['Lukas Schmidt', 'de'], ['Mia Wagner', 'de'], ['Jonas Fischer', 'de'], ['Lena Meyer', 'de'],
    ['Felix Hartmann', 'de'], ['Sarah Klein', 'de'], ['Tim Wolf', 'de'], ['Nina Braun', 'de'], ['Paul Zimmermann', 'de'],
    ['Jan Krüger', 'de'], ['Eva Neumann', 'de'], ['Max Schwarz', 'de'], ['Lea Hofmann', 'de'], ['Tom Richter', 'de'],
    ['Ida Schäfer', 'de'], ['Laura König', 'de'], ['Finn Lange', 'de'], ['Marie Walter', 'de'], ['Ben Peters', 'de'],
    ['Hannah Vogel', 'de'], ['Emre Demir', 'de'], ['Aylin Kaya', 'tr'], ['Zeynep Çelik', 'de'], ['Murat Öztürk', 'tr'],
    ['Elif Arslan', 'de'], ['Agnieszka Lewandowska', 'pl'], ['Tomasz Nowak', 'pl'], ['Magdalena Zielińska', 'de'],
    ['Olga Iwanowa', 'ru'], ['Dmitri Smirnow', 'ru'], ['Oksana Melnyk', 'uk'], ['Andrij Bondarenko', 'uk'],
    ['Giulia Romano', 'it'], ['Luca Esposito', 'de'], ['Francesca Bruno', 'de'], ['Nikos Papadopoulos', 'el'],
    ['Eleni Georgiou', 'de'], ['Marko Petrović', 'hr'], ['Jelena Kovačević', 'de'], ['Amir Hodžić', 'de'],
    ['Ioana Dumitru', 'ro'], ['Andrei Ionescu', 'de'], ['Omar Haddad', 'ar'], ['Layla Nasser', 'ar'], ['Yusuf Al-Hassan', 'de'],
    ['Farid Ahmadi', 'fa'], ['Soraya Karimi', 'de'], ['Linh Nguyen', 'vi'], ['Minh Tran', 'de'], ['Carlos García', 'es'],
    ['Ana Ferreira', 'de'], ['Rojin Doğan', 'de'], ['Arben Krasniqi', 'de'], ['Senait Tesfay', 'de'], ['Kwame Mensah', 'en'],
    ['Chidi Okeke', 'en'],
  ];
  // Abteilungen in Reihenfolge der PEOPLE-Liste (Anzahl je Abteilung)
  const DEPT_PLAN = [
    ['Drogerie', 4], ['Kasse', 8], ['Info', 3], ['Trocken sortiment', 4], ['Getränkeabteilung', 4], ['MoPro', 4],
    ['Moon Food Abteilung', 3], ['Alkoholische Getränke', 3], ['Fertige Gerichte', 3], ['Konserven', 3],
    ['Obst und Gemüse', 4], ['Backshop und Frischetheke', 4], ['Lager', 3], ['Wareneinnahme', 4], ['Leergut', 3],
  ];
  const AZUBIS = ['Ida Schäfer', 'Finn Lange', 'Ben Peters', 'Hannah Vogel'];
  const ROTATE = ['Warenverräumung', 'Grundordnung', 'Warenpflege', 'Aktionsregal aufbauen', 'Etikettierung', 'Plakate erstellen', 'Lücken füllen'];
  const HOURS = [8, 6, 8, 5, 8, 6, 7, 8, 9];

  function actsFor(dept, i) {
    if (dept === 'Kasse' || dept === 'Info') return ['Sonstiges', 'Grundordnung'];
    if (dept === 'Wareneinnahme' || dept === 'Lager') return ['Wareneinnahme', 'Warenverräumung', 'Grundordnung'];
    if (dept === 'Leergut') return ['Leergut', 'Grundordnung'];
    return U.uniq([ROTATE[i % 7], ROTATE[(i * 3 + 1) % 7], ROTATE[(i * 5 + 2) % 7]]);
  }
  const pid = (n) => 'e' + String(n).padStart(3, '0');

  function buildStaff() {
    const staff = [];
    let n = 1;
    let k = 0;
    for (const [dept, count] of DEPT_PLAN) {
      for (let j = 0; j < count; j++, k++) {
        const [name, lang] = PEOPLE[k];
        const h = name === 'Anna Müller' ? 8 : HOURS[k % HOURS.length];
        staff.push({
          id: pid(n++), name, lang, role: AZUBIS.includes(name) ? 'azubi' : 'emp', dept,
          sh: name === 'Anna Müller' ? 'Früh' : j % 2 ? 'Spät' : 'Früh', h,
          acts: name === 'Anna Müller' ? ['Warenverräumung', 'Etikettierung', 'Lücken füllen', 'Grundordnung'] : actsFor(dept, k),
          kasse: dept === 'Kasse' || dept === 'Info' || k % 6 === 0, firstAid: k % 8 === 3,
        });
      }
    }
    // Leitungen (13) → zusammen 70
    const frische = M.DEPT_GROUPS.frische.depts;
    const trockenGetr = ['Trocken sortiment', 'Konserven', 'Drogerie', 'Getränkeabteilung', 'Alkoholische Getränke'];
    const kasseLog = ['Kasse', 'Info', 'Lager', 'Wareneinnahme', 'Leergut'];
    const leads = [
      { name: 'Sabine Krämer', role: 'fl', dept: 'Info', sh: 'Früh', h: 8 },
      { name: 'Thomas Weber', role: 'sfl', dept: 'Info', sh: 'Spät', h: 8 },
      { name: 'Katarina Novak', role: 'tl', group: 'frische', dept: 'MoPro', sh: 'Früh', h: 8, lang: 'hr' },
      { name: 'Dirk Hoffmann', role: 'tl', group: 'trocken', dept: 'Trocken sortiment', sh: 'Früh', h: 8 },
      { name: 'Ahmet Yılmaz', role: 'tl', group: 'getraenke', dept: 'Getränkeabteilung', sh: 'Spät', h: 8, lang: 'tr' },
      { name: 'Monika Schulz', role: 'tl', group: 'kasse', dept: 'Kasse', sh: 'Früh', h: 8 },
      { name: 'Piotr Kowalski', role: 'tl', group: 'logistik', dept: 'Wareneinnahme', sh: 'Früh', h: 8, lang: 'pl' },
      { name: 'Julia Becker', role: 'sl', scope: frische, dept: 'Obst und Gemüse', sh: 'Früh', h: 8, firstAid: true },
      { name: 'Kemal Aydın', role: 'sl', scope: trockenGetr, dept: 'Drogerie', sh: 'Früh', h: 8, lang: 'tr' },
      { name: 'Natalia Wójcik', role: 'sl', scope: kasseLog, dept: 'Kasse', sh: 'Früh', h: 8, firstAid: true },
      { name: 'Markus Lehmann', role: 'sl', scope: frische, dept: 'MoPro', sh: 'Spät', h: 8 },
      { name: 'Elena Popescu', role: 'sl', scope: trockenGetr, dept: 'Getränkeabteilung', sh: 'Spät', h: 8, lang: 'ro', firstAid: true },
      { name: 'Daniel Schröder', role: 'sl', scope: kasseLog, dept: 'Kasse', sh: 'Spät', h: 8 },
    ];
    for (const l of leads) staff.push(Object.assign({ id: pid(n++), lang: 'de', acts: [], kasse: l.dept === 'Kasse', firstAid: false }, l));
    // Admins (Disponenten) – Marino ist zugleich Schichtleiter, hier als Admin geführt
    const adm = [['Mustafa', 'Früh', true], ['Niels', 'Früh'], ['Chiki', 'Spät'], ['Marino', 'Früh'], ['Arek', 'Spät']];
    for (const [name, sh, ai] of adm) {
      staff.push({ id: pid(n++), name, role: 'admin', dept: 'Info', sh, h: 8, lang: 'de', acts: [], aiAssist: !!ai, note: name === 'Marino' ? 'zugleich Schichtleiter' : undefined });
    }
    staff.push({ id: pid(n++), name: 'Ivana Horvat', role: 'clean', dept: null, sh: 'Früh', h: 8, lang: 'hr', acts: [] });
    return staff.map((e) => JSON.parse(JSON.stringify(e)));
  }

  /** Versatz, damit die Demo außerhalb der Ladenzeiten (06–21:30) um 10:30 spielt */
  function clockOffset(now) {
    const d = new Date(now);
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 6 && h < 21.5) return 0;
    const t = new Date(now); t.setHours(10, 30, 0, 0);
    return t.getTime() - now;
  }

  function build(now) {
    now = now === undefined ? SN.clock.now() : now;
    const T = now;
    const sh = M.currentShift(T) || 'Früh';
    const day = U.fmt.dayKey(T);
    const staff = buildStaff();
    const by = (name) => staff.find((e) => e.name === name).id;
    const inDept = (dept, s) => staff.filter((e) => e.dept === dept && (e.role === 'emp' || e.role === 'azubi') && (!s || e.sh === s));
    const sl = (scopeDept) => staff.find((e) => e.role === 'sl' && e.sh === sh && e.scope.includes(scopeDept)).id;
    const tlOf = (g) => staff.find((e) => e.role === 'tl' && e.group === g).id;
    const anna = by('Anna Müller');
    const adminDuty = sh === 'Früh' ? by('Mustafa') : by('Chiki');
    const ivana = by('Ivana Horvat');
    const fl = by('Sabine Krämer');
    const p1 = (dept, i) => (inDept(dept, sh)[i || 0] || inDept(dept)[i || 0]).id;

    // lokale Empfängerauflösung (der Store ist beim Bauen noch leer)
    const resolve = (to) => {
      if (to.type === 'person') return to.ids.slice();
      if (to.type === 'dept') return staff.filter((e) => to.ids.includes(e.dept)).map((e) => e.id);
      if (to.type === 'shift') return staff.filter((e) => to.ids.includes(e.sh)).map((e) => e.id);
      return staff.map((e) => e.id);
    };
    let seq = 0;
    const items = [];
    // Vorgang mit Standardfeldern; ackDue aus den Standardfristen
    function mk(o) {
      const it = Object.assign({
        id: 'demo-' + (++seq), kind: 'post', lang: 'de', u: false, state: 'sent', acks: {}, seen: {}, owner: null, thread: [],
        body: '', shift: sh, to: { type: 'person', ids: [] },
      }, o);
      const rec = (it.kind === 'task' && it.owner ? [it.owner] : resolve(it.to)).filter((id) => id !== it.from || it.kind === 'task');
      if (it.ackDue === undefined) {
        const m = M.deadlineMin(it);
        it.ackDue = it.kind === 'task' ? (it.escalate ? it.due : null) : it.kind === 'post' && !it.needAck ? null : it.kind === 'shiftreq' ? null : it.createdAt + m * MIN;
      }
      it.esc = it.esc || { level: 0, at: it.createdAt, history: [{ level: 0, at: it.createdAt, ids: rec }] };
      items.push(it);
      return it;
    }
    const ackSome = (it, share, t0) => {
      const rec = resolve(it.to).filter((id) => id !== it.from);
      rec.forEach((id, i) => {
        if (i % 10 < share * 10) { it.acks[id] = t0 + (i % 17) * MIN; it.seen[id] = t0 + (i % 17) * MIN; }
        else if (i % 3 === 0) it.seen[id] = t0 + 20 * MIN;
      });
    };

    /* --- Anweisungen / Infos (M2) --- */
    const brief = mk({
      kind: 'post', briefing: true, needAck: true, from: fl, createdAt: T - 90 * MIN, u: false,
      to: { type: 'shift', ids: [sh] }, title: 'Kurzbriefing ' + sh + 'schicht',
      body: '1. 🔥 Aktion Drogerie: Displays bis 10 Uhr aufbauen\n2. Kasse 3 ist defekt – bitte Kasse 4 nutzen\n3. Danke für den starken Samstag!',
    });
    ackSome(brief, 0.6, T - 85 * MIN);
    const plano = mk({
      kind: 'post', needAck: true, from: by('Mustafa'), createdAt: T - 20 * MIN, ackMin: 30,
      to: { type: 'dept', ids: ['Drogerie'] }, title: 'Neue Planogramme Drogerie ab Montag', body: 'Bitte die neuen Pläne im Lagerbüro ansehen. Umbau Montag ab 7 Uhr.',
    });
    ackSome(plano, 0.3, T - 18 * MIN);
    mk({ kind: 'post', from: fl, createdAt: T - 3 * HOUR, to: { type: 'all', ids: [] }, title: 'Betriebsversammlung Donnerstag 15 Uhr', body: 'Im Pausenraum. Kaffee und Kuchen gibt es auch.' });
    mk({ kind: 'post', kudos: true, from: sl('Drogerie'), createdAt: T - 40 * MIN, to: { type: 'person', ids: [anna] }, title: 'Danke!', body: 'Danke für die schnelle Hilfe an der Kasse heute Morgen!' });

    /* --- Aufträge (M3) --- */
    mk({ kind: 'task', from: sl('Drogerie'), owner: anna, state: 'taken', createdAt: T - 50 * MIN, startedAt: T - 30 * MIN, takenAt: T - 30 * MIN,
      title: 'Aktionsdisplays Drogerie aufbauen', dept: 'Drogerie', act: 'Aktionsregal aufbauen', min: 45, u: true, due: T + 40 * MIN, to: { type: 'person', ids: [anna] } });
    mk({ kind: 'task', from: sl('Drogerie'), owner: anna, createdAt: T - 45 * MIN, title: 'Etiketten Duschgel tauschen', dept: 'Drogerie', act: 'Etikettierung', min: 25, due: T + 2 * HOUR, to: { type: 'person', ids: [anna] } });
    mk({ kind: 'task', from: sl('Drogerie'), owner: anna, state: 'done', createdAt: T - 2 * HOUR, doneAt: T - 30 * MIN, doneBy: anna, title: 'Lücken Zahnpasta füllen', dept: 'Drogerie', act: 'Lücken füllen', min: 20, due: T - 20 * MIN, to: { type: 'person', ids: [anna] } });
    mk({ kind: 'task', from: sl('Getränkeabteilung'), createdAt: T - 10 * MIN, title: 'Lücken im Getränkeregal füllen', dept: 'Getränkeabteilung', act: 'Lücken füllen', min: 20, u: true, due: T + 15 * MIN, to: { type: 'dept', ids: ['Getränkeabteilung'] } });
    mk({ kind: 'task', from: sl('Obst und Gemüse'), createdAt: T - 30 * MIN, title: 'Obstregal säubern und auffüllen', dept: 'Obst und Gemüse', act: 'Warenpflege', min: 25, due: T + 3 * HOUR, to: { type: 'dept', ids: ['Obst und Gemüse'] } });
    mk({ kind: 'task', from: sl('Leergut'), createdAt: T - 25 * MIN, title: 'Leergut-Bereich aufräumen', dept: 'Leergut', act: 'Leergut', min: 30, due: T + 2 * HOUR, to: { type: 'dept', ids: ['Leergut'] } });
    mk({ kind: 'task', from: by('Piotr Kowalski'), createdAt: T - 35 * MIN, title: 'Konserven: 2 Paletten Regalware verräumen', dept: 'Konserven', act: 'Warenverräumung', min: 45, due: T + 3 * HOUR, to: { type: 'dept', ids: ['Konserven'] }, goods: 'demo-g1' });
    mk({ kind: 'task', from: sl('Drogerie'), createdAt: T - 15 * MIN, title: 'Plakate für die Wochenaktion', dept: 'Drogerie', act: 'Plakate erstellen', min: 30, due: T + 4 * HOUR, to: { type: 'dept', ids: ['Drogerie'] } });
    const mopro = p1('MoPro');
    mk({ kind: 'task', from: sl('MoPro'), owner: mopro, state: 'taken', createdAt: T - 40 * MIN, takenAt: T - 35 * MIN, startedAt: T - 35 * MIN, title: 'MHD Joghurt prüfen', dept: 'MoPro', act: 'Warenpflege', min: 20, due: T + 30 * MIN, to: { type: 'person', ids: [mopro] } });
    const getr = p1('Getränkeabteilung');
    mk({ kind: 'task', from: sl('Getränkeabteilung'), owner: getr, state: 'done', proofRequired: true, proof: 'demo-m1', approved: null, createdAt: T - 2 * HOUR, doneAt: T - 12 * MIN, doneBy: getr,
      title: 'Aktionsregal Getränke aufbauen', dept: 'Getränkeabteilung', act: 'Aktionsregal aufbauen', min: 45, due: T, to: { type: 'person', ids: [getr] } });
    const rund = p1('MoPro', 1);
    mk({ kind: 'task', from: sl('MoPro'), owner: rund, templateId: 'demo-t1', escalate: true, createdAt: T - 70 * MIN, due: T - 10 * MIN,
      title: 'Frische-Rundgang MHD', dept: 'MoPro', act: 'Warenpflege', min: 20, to: { type: 'person', ids: [rund] },
      checklist: [{ text: 'Joghurt und Quark MHD prüfen', done: true, by: rund, at: T - 20 * MIN }, { text: 'Käse-Theke prüfen', done: false }, { text: 'Abgelaufenes aussortieren', done: false }] });

    /* --- Meldungen (M4) --- */
    mk({ kind: 'report', cat: 'gap', from: anna, createdAt: T - 18 * MIN, dept: 'Drogerie', title: 'Lücke im Regal', body: 'Zahnpasta-Aktion ist leer, im Lager sind noch 2 KKP.', to: { type: 'person', ids: [sl('Drogerie')] }, seen: { [sl('Drogerie')]: T - 16 * MIN }, state: 'seen' });
    const kasse1 = p1('Kasse');
    mk({ kind: 'report', cat: 'defect', u: true, from: kasse1, createdAt: T - 25 * MIN, dept: 'Kasse', title: 'Defekt (Kühlung, Kasse, Technik)', body: 'Kasse 3 zeigt einen Fehler, Kunden warten.',
      to: { type: 'person', ids: [adminDuty] }, owner: adminDuty, state: 'taken', takenAt: T - 22 * MIN, seen: { [adminDuty]: T - 24 * MIN },
      thread: [{ by: adminDuty, at: T - 21 * MIN, type: 'msg', text: 'Techniker ist informiert, kommt gegen 11 Uhr.' }] });
    const mo2 = p1('MoPro');
    mk({ kind: 'report', cat: 'clean', from: mo2, createdAt: T - 6 * MIN, dept: 'MoPro', title: 'Reinigung nötig', body: 'Joghurt ausgelaufen in Gang 7.', to: { type: 'person', ids: [ivana] }, seen: { [ivana]: T - 5 * MIN }, state: 'seen' });
    const oug = staff.find((e) => e.dept === 'Obst und Gemüse' && e.lang === 'de' && e.role === 'emp') || inDept('Obst und Gemüse')[0];
    const ougTr = staff.find((e) => e.lang === 'tr' && e.role === 'emp') || oug;
    mk({ kind: 'report', cat: 'price', from: ougTr.id, createdAt: T - 9 * MIN, dept: 'Obst und Gemüse', title: 'Preis falsch', lang: 'tr',
      orig: 'Muzların fiyatı yanlış, etikette 1,29 yazıyor ama kasada 1,49.', body: 'Der Preis der Bananen ist falsch: Auf dem Etikett steht 1,29, an der Kasse 1,49.', to: { type: 'person', ids: [tlOf('frische')] } });
    mk({ kind: 'report', cat: 'safety', from: p1('Lager'), createdAt: T - 2 * HOUR, dept: 'Lager', title: 'Sicherheit', body: 'Palette blockiert den Notausgang im Lager.',
      to: { type: 'person', ids: [sl('Lager')] }, owner: sl('Lager'), state: 'done', takenAt: T - 115 * MIN, doneAt: T - 105 * MIN, doneBy: sl('Lager'),
      thread: [{ by: sl('Lager'), at: T - 105 * MIN, type: 'done', text: 'Palette weggeräumt, danke für die Meldung!' }] });
    mk({ kind: 'report', cat: 'bottle', from: p1('Info'), createdAt: T - 4 * MIN, dept: 'Leergut', title: 'Leergutautomat', body: 'Automat 2 ist voll, Kunden stehen an.', to: { type: 'person', ids: [sl('Leergut')] } });

    /* --- Ausfall + Einspringer (S2) --- */
    const sick = inDept('Kasse', sh)[1] || inDept('Kasse')[1];
    sick.away = { type: 'sick', at: T - 50 * MIN, until: U.startOfDay(T) + (sh === 'Früh' ? 14 : 22) * HOUR };
    const abs = mk({ kind: 'absence', type: 'sick', u: true, person: sick.id, from: sick.id, createdAt: T - 50 * MIN, dept: 'Kasse', title: 'Krank: ' + sick.name,
      to: { type: 'person', ids: [sl('Kasse')] }, owner: sl('Kasse'), state: 'taken', takenAt: T - 47 * MIN, seen: { [sl('Kasse')]: T - 48 * MIN } });
    const helper = inDept('Kasse').find((e) => e.id !== sick.id && e.sh !== sh) || inDept('Info')[0];
    const stand = mk({ kind: 'call', type: 'standin', need: 1, from: sl('Kasse'), createdAt: T - 46 * MIN, dept: 'Kasse', u: true, title: 'Wer kann einspringen?',
      body: sick.name + ' fällt aus (Kasse, ' + sh + '). Wer kann einspringen?', standinFor: abs.id,
      to: { type: 'person', ids: inDept('Kasse').filter((e) => e.id !== sick.id).map((e) => e.id) },
      answers: { [helper.id]: { a: 'yes', at: T - 40 * MIN } }, state: 'closed', closedAt: T - 40 * MIN });
    abs.standinCall = stand.id;

    /* --- Schnellrufe (M5) --- */
    const kasseOn = staff.filter((e) => (e.dept === 'Kasse' || e.dept === 'Info' || e.kasse) && e.sh === sh && e.id !== sick.id && (e.role === 'emp' || e.role === 'azubi'));
    mk({ kind: 'call', type: 'kasse', need: 2, from: sl('Kasse'), createdAt: T - 1 * MIN, dept: 'Kasse', u: true, title: 'Kasse öffnen', body: 'Schlange an Kasse 1–4',
      to: { type: 'person', ids: kasseOn.map((e) => e.id) }, answers: kasseOn[0] ? { [kasseOn[0].id]: { a: 'yes', at: T - 0.5 * MIN } } : {} });
    mk({ kind: 'call', type: 'goods', need: 1, from: by('Piotr Kowalski'), createdAt: T - 2 * HOUR, dept: 'Wareneinnahme', u: true, title: 'Hilfe Wareneingang',
      to: { type: 'person', ids: inDept('Lager').map((e) => e.id) }, answers: { [inDept('Lager')[0].id]: { a: 'yes', at: T - 118 * MIN } }, state: 'closed', closedAt: T - 118 * MIN });

    /* --- SOS (gestern, abgeschlossen) --- */
    mk({ kind: 'sos', type: 'accident', from: p1('Backshop und Frischetheke'), createdAt: T - 26 * HOUR, u: true, title: 'SOS: Unfall', body: 'Kollegin hat sich an der Schneidemaschine geschnitten.', tel: '112',
      to: { type: 'person', ids: [sl('Backshop und Frischetheke'), adminDuty] }, answers: { [by('Julia Becker')]: { a: 'coming', at: T - 26 * HOUR + MIN } },
      owner: by('Julia Becker'), state: 'done', takenAt: T - 26 * HOUR + MIN, doneAt: T - 25 * HOUR, doneBy: by('Julia Becker') });

    /* --- Schichtübergabe (M8) --- */
    const prev = M.nextShift(sh);
    const nextSl = staff.filter((e) => e.role === 'sl' && e.sh === sh).map((e) => e.id);
    const prevSl = staff.find((e) => e.role === 'sl' && e.sh === prev).id;
    const hoAt = sh === 'Früh' ? U.startOfDay(T) - 2 * HOUR - 10 * MIN : U.startOfDay(T) + 13 * HOUR + 50 * MIN;
    mk({ kind: 'handover', from: prevSl, createdAt: Math.min(hoAt, T - 30 * MIN), fromShift: prev, toShift: sh, shift: sh, title: 'Übergabe ' + prev + ' → ' + sh,
      body: 'Kühlregal MoPro piept ab und zu – Technik ist informiert. 3 Rollcontainer Getränke stehen noch im Lager.',
      summary: { text: '2 offene Aufträge, 1 Posten Restware', tasks: [], reports: [], cleaning: [], rest: [] }, to: { type: 'person', ids: nextSl } });

    /* --- Schichtanfragen (S2) --- */
    mk({ kind: 'shiftreq', from: sl('Drogerie'), createdAt: T - 2 * HOUR, title: 'Kannst du Sa Spät übernehmen?', body: 'Wir sind am Samstag knapp besetzt.', req: { day: 'Sa', shift: 'Spät', swap: false }, to: { type: 'person', ids: [anna] } });
    const a1 = inDept('Getränkeabteilung')[1], a2 = inDept('Getränkeabteilung')[2];
    mk({ kind: 'shiftreq', from: a1.id, createdAt: T - 5 * HOUR, title: 'Schichttausch: Fr Früh', body: 'Ich habe einen Arzttermin.', req: { day: 'Fr', shift: 'Früh', swap: true },
      to: { type: 'person', ids: [a2.id] }, state: 'taken', owner: a2.id, answeredAt: T - 4 * HOUR, answeredBy: a2.id });
    mk({ kind: 'shiftreq', from: by('Monika Schulz'), createdAt: T - 26 * HOUR, title: 'Kannst du Mi Früh übernehmen?', req: { day: 'Mi', shift: 'Früh', swap: false },
      to: { type: 'person', ids: [kasse1] }, state: 'accepted', owner: kasse1, answeredAt: T - 25 * HOUR, answeredBy: kasse1 });

    /* --- Chats (M6) --- */
    const mid = () => 'demo-m' + (++seq);
    const thread = (id, type, extra, msgs, read) => {
      const o = Object.assign({ id, type, msgs: {}, read: read || {}, last: 0 }, extra);
      for (const m of msgs) { const k = mid(); o.msgs[k] = Object.assign({ id: k }, m); o.last = Math.max(o.last, m.at); }
      return o;
    };
    const mus = by('Mustafa'), kem = sl('Drogerie');
    const chats = [
      thread(SN.comm ? SN.comm.threadId.dm(anna, mus) : 'dm~' + [anna, mus].sort().join('~'), 'dm', { members: [anna, mus].sort() }, [
        { by: mus, at: T - 35 * MIN, text: 'Hallo Anna, bitte nach der Pause kurz zur Rampe kommen.' },
        { by: anna, at: T - 33 * MIN, text: 'Mache ich, bis gleich!' },
      ], { [anna]: T - 33 * MIN, [mus]: T - 32 * MIN }),
      thread('dm~' + [anna, kem].sort().join('~'), 'dm', { members: [anna, kem].sort() }, [
        { by: kem, at: T - 12 * MIN, text: 'Anna, schau bitte kurz bei der Info vorbei, 5 Minuten.' },
      ], { [kem]: T - 12 * MIN }),
      thread('dept~drogerie', 'dept', { dept: 'Drogerie' }, [
        { by: kem, at: T - 80 * MIN, text: 'Guten Morgen! Heute Aktion Duschgel, Displays stehen im Werbelager W1.' },
        { by: staff.find((e) => e.dept === 'Drogerie' && e.id !== anna).id, at: T - 70 * MIN, text: 'Ich hole schon mal den Hubwagen.' },
        { by: anna, at: T - 60 * MIN, text: 'Super, ich fange mit den Etiketten an.' },
      ], { [anna]: T - 60 * MIN }),
      thread('dept~kasse', 'dept', { dept: 'Kasse' }, [
        { by: sl('Kasse'), at: T - 45 * MIN, text: 'Kasse 3 ist gesperrt, bitte Kunden zu Kasse 4 schicken.' },
        { by: ougTr.id, at: T - 30 * MIN, text: 'Tamam, anladım.', lang: 'tr' },
      ], {}),
      thread('lead', 'lead', {}, [
        { by: fl, at: T - 100 * MIN, text: 'Regionalleitung kommt Donnerstag, bitte Gänge frei halten.' },
        { by: sl('Kasse'), at: T - 48 * MIN, text: sick.name + ' ist krank, Einspringer ist gefunden.' },
        { by: mus, at: T - 20 * MIN, text: 'Techniker für Kasse 3 kommt gegen 11 Uhr.' },
      ], { [fl]: T - 20 * MIN }),
    ];

    /* --- Vorlagen, Pläne, Einstellungen --- */
    const templates = [
      { id: 'demo-t1', title: 'Frische-Rundgang MHD', dept: 'MoPro', act: 'Warenpflege', min: 20, at: '09:00', days: [0, 1, 2, 3, 4, 5], escalate: true,
        checklist: ['Joghurt und Quark MHD prüfen', 'Käse-Theke prüfen', 'Abgelaufenes aussortieren'], lastRun: day },
      { id: 'demo-t2', title: 'Reinigungsrundgang Kassenzone', dept: 'Kasse', act: 'Sonstiges', min: 15, at: '12:00', days: [0, 1, 2, 3, 4, 5], escalate: true,
        checklist: ['Bänder abwischen', 'Müll leeren', 'Boden prüfen'] },
      { id: 'demo-t3', title: 'Grundordnung Drogerie', dept: 'Drogerie', act: 'Grundordnung', min: 20, at: '19:00', days: [0, 1, 2, 3, 4, 5] },
      { id: 'demo-t4', title: 'Leergutraum leeren', dept: 'Leergut', act: 'Leergut', min: 30, at: '16:00', days: [0, 1, 2, 3, 4, 5] },
      { id: 'demo-t5', title: 'Aktionswechsel Preisschilder', dept: 'Trocken sortiment', act: 'Etikettierung', min: 25, at: '07:00', days: [0], proofRequired: true },
    ];
    const todayIdx = (new Date(T).getDay() + 6) % 7;
    const plans = [{ id: anna, week: day, days: M.DAYS.map((d, i) => ({ d, off: i !== todayIdx && (i === 6 || i === (todayIdx + 3) % 7), s: '06:00', e: '14:00', p: 30 })) }];
    const settings = [{ id: 'main', adminOnDuty: adminDuty, deadlines: Object.assign({}, M.DEFAULT_DEADLINES), callNeed: {}, setupDone: true, storeName: 'Kaufland Langenfeld · Rheindorfer Str.' }];

    /* --- Stimmung, Ware, Protokoll --- */
    const yday = U.fmt.dayKey(T - U.DAY);
    const mood = [
      { id: yday + '_frueh', d: yday, sh: 'Früh', c: { 1: 2, 2: 5, 3: 2, 4: 1 } },
      { id: yday + '_spaet', d: yday, sh: 'Spät', c: { 1: 1, 2: 2, 3: 1, 4: 0 } },
    ];
    const trucks = [{ id: 'demo-lkw1', at: T - 60 * MIN, title: 'LKW Zentrallager', pal: 12, kkp: 6, disp: 4, state: 'open', goods: ['demo-g1', 'demo-g2'] }];
    const goods = [
      { id: 'demo-g1', truck: 'demo-lkw1', kind: 'normal', dept: 'Konserven', name: 'Gurken im Glas', pt: 'Europalette', zone: 'Regallager A', pal: 2, kkp: 1, disp: 0, carts: 3, done: 1, codes: ['W-100231'] },
      { id: 'demo-g2', truck: 'demo-lkw1', kind: 'werbung', dept: 'Drogerie', name: 'Duschgel Aktion KW47', pt: 'Displaypalette', zone: 'Werbelager W1', pal: 1, kkp: 0, disp: 4, carts: 4, done: 0, codes: [] },
    ];
    const rest = [{ id: 'demo-r1', dept: 'Getränkeabteilung', name: 'Mineralwasser 6er, 3 Kisten', place: 'Lager Gang B', date: day, by: getr, at: T - 2 * HOUR, done: false }];
    const breakage = [{ id: 'demo-b1', reason: 'Glasbruch', dept: 'Konserven', name: 'Gurken im Glas', qty: 2, by: p1('Konserven'), at: T - 3 * HOUR }];
    const log = [{ id: day, d: day, entries: [
      { at: T - 25 * HOUR, by: kasse1, text: 'Schichtanfrage angenommen: Mi Früh' },
      { at: T - 50 * MIN, by: sick.id, text: 'Ausfall gemeldet: Krank: ' + sick.name },
    ] }];
    // Platzhalter-„Foto“ für den Nachweis (kleines SVG)
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#e9ecef"/><text x="160" y="105" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#555">Foto-Nachweis (Demo)</text></svg>';
    const media = [{ id: 'demo-m1', at: T - 12 * MIN, by: getr, type: 'image/svg+xml', data: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) }];

    return { staff, items, chats, templates, plans, settings, mood, trucks, goods, rest, breakage, log, media };
  }

  SN.demo = { build, clockOffset, PEOPLE };
})(window.SN = window.SN || {});
