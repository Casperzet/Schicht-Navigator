/* ==========================================================================
   SN.ui – Oberfläche: Router, Navigation, Banner, Toast, Sheet, Takt, Login
   --------------------------------------------------------------------------
   Ansichten registrieren sich mit SN.ui.registerView(tab, def):
     def = {title, icon, label, groups:['emp','lead','admin','clean'], order,
            show(me)?, badge(me)?, render(ctx) → html, fab?(me) → {label, icon, act}}
   ctx = {me, now, params, sub, ui}
   Aktionen: Elemente mit data-act="name" (+ data-*), Handler: SN.ui.on(name, fn(el, ev)).
   Änderungen: data-change="name" → SN.ui.onChange(name, fn(el, ev)).
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, $ = U.$, esc = U.esc;
  const byId = (id) => document.getElementById(id);

  const views = {};
  const acts = {};
  const changes = {};
  const st = { tab: null, params: {}, sub: {}, dirty: false, lastChatSeen: {}, notified: {}, started: false };

  function icon(name, cls) { return '<svg class="sn-icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }

  /* ---------- Registrierung ------------------------------------------------ */
  function registerView(tab, def) { views[tab] = Object.assign({ order: 50, groups: [] }, def, { tab }); }
  function on(act, fn) { acts[act] = fn; }
  function onChange(name, fn) { changes[name] = fn; }

  function navFor(me) {
    const g = M.group(me);
    return Object.values(views)
      .filter((v) => v.label && v.groups.includes(g) && (!v.show || v.show(me)))
      .sort((a, b) => a.order - b.order);
  }

  /* ---------- Navigation ---------------------------------------------------- */
  function go(tab, params) {
    st.tab = tab; st.params = params || {};
    closeSheet();
    render(false);
    const v = byId('view'); if (v) { v.scrollTop = 0; v.focus({ preventScroll: true }); }
  }
  function sub(key, val) { if (val === undefined) return st.sub[key]; st.sub[key] = val; render(true); return val; }

  /* ---------- Rendern ------------------------------------------------------- */
  function greeting(now) {
    const h = new Date(now).getHours();
    return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  }

  function header(me, now) {
    const t = byId('hdr-title'), s = byId('hdr-sub');
    if (!me) { t.textContent = 'Schicht-Navigator'; s.textContent = 'Kaufland Langenfeld'; return; }
    t.textContent = M.first(me.id);
    const sh = M.shiftWindow(me, now);
    const parts = [M.role(me).label];
    if (me.dept && M.group(me) !== 'admin') parts.push(M.deptOf(me, now));
    if (sh) parts.push(me.sh + ' ' + U.fmt.time(sh.s) + '–' + U.fmt.time(sh.e));
    if (M.isAdmin(me) && M.adminOnDuty(now) === me.id) parts.push('Admin vom Dienst');
    s.textContent = parts.join(' · ');
  }

  function nav(me) {
    const el = byId('nav');
    if (!me) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = navFor(me).map((v) => {
      const b = v.badge ? v.badge(me) : 0;
      const n = typeof b === 'object' ? b.n : b, urg = typeof b === 'object' && b.urgent;
      return '<button type="button" class="sn-nav__item" data-go="' + v.tab + '"' + (st.tab === v.tab ? ' aria-current="page"' : '') + '>'
        + '<span class="sn-nav__icon">' + icon(v.icon || 'home') + (n ? '<span class="sn-badge' + (urg ? ' sn-badge--urgent' : '') + '">' + (n > 99 ? '99+' : n) + '</span>' : '') + '</span>'
        + esc(v.label) + '</button>';
    }).join('');
  }

  function fab(me, view) {
    const b = byId('fab');
    const f = me && view && view.fab ? view.fab(me) : null;
    if (!f) { b.hidden = true; b.removeAttribute('data-act'); return; }
    b.hidden = false; b.dataset.act = f.act;
    b.innerHTML = icon(f.icon || 'plus') + esc(f.label);
  }

  /* ---------- Banner (oberste Priorität: SOS, Eskalation an mich, Rufe) ---- */
  function banners(me, now) {
    const out = [];
    const C = SN.comm;
    for (const it of C.activeSos()) {
      const mine = it.from === me.id;
      const ans = Object.keys(it.answers || {});
      if (!mine && !C.involved(it).includes(me.id) && !M.isLead(me)) continue;
      out.push('<div class="sn-alert sn-alert--sos" role="alert"><span class="sn-alert__icon">' + icon('sos') + '</span>'
        + '<p class="sn-alert__title">' + esc(it.title) + (it.dept ? ' · ' + esc(it.dept) : '') + '</p>'
        + '<p class="sn-alert__text">' + (mine ? 'Dein Notruf · ' : esc(M.name(it.from)) + ' · ') + esc(U.fmt.ago(it.createdAt))
        + (ans.length ? ' · Hilfe kommt: ' + esc(ans.map(M.first).join(', ')) : ' · noch keine Antwort') + '</p>'
        + '<div class="sn-alert__actions">'
        + (!mine && M.isLead(me) && !(it.answers || {})[me.id] ? '<button class="sn-btn sn-btn--on-accent" data-act="sos-respond" data-id="' + it.id + '">' + icon('run') + 'Hilfe kommt, ich gehe hin</button>' : '')
        + '<a class="sn-btn sn-btn--on-accent" href="tel:112">' + icon('phone') + '112</a><a class="sn-btn sn-btn--on-accent" href="tel:110">110</a>'
        + (mine || M.isLead(me) ? '<button class="sn-btn sn-btn--on-accent" data-act="it-close" data-id="' + it.id + '">Erledigt</button>' : '')
        + '</div></div>');
    }
    for (const it of C.openCalls(me.id)) {
      out.push('<div class="sn-alert sn-alert--warn" role="alert"><span class="sn-alert__icon">' + icon('bell') + '</span>'
        + '<p class="sn-alert__title">' + esc((M.CALL[it.type] || {}).icon || '📣') + ' ' + esc(it.title) + '</p>'
        + '<p class="sn-alert__text">' + esc(M.name(it.from)) + ' · ' + esc(U.fmt.ago(it.createdAt)) + (it.body ? ' · ' + esc(it.body) : '') + '</p>'
        + '<div class="sn-alert__actions"><button class="sn-btn sn-btn--primary" data-act="call-yes" data-id="' + it.id + '">' + icon('run') + 'Ich komme</button>'
        + '<button class="sn-btn sn-btn--secondary" data-act="call-no" data-id="' + it.id + '">Kann nicht</button></div></div>');
    }
    // Eskaliert an mich (ich bin in der aktuellen Stufe und nicht ursprünglicher Empfänger)
    const escd = C.inbox(me.id).filter((it) => it.esc && it.esc.level > 0 && C.currentIds(it).includes(me.id) && it.kind !== 'sos' && it.kind !== 'call');
    if (escd.length) {
      const it = escd[0];
      out.push('<div class="sn-alert sn-alert--escalation" role="alert"><span class="sn-alert__icon">' + icon('escalate') + '</span>'
        + '<p class="sn-alert__title">Eskaliert an dich: ' + esc(it.title) + (escd.length > 1 ? ' (+' + (escd.length - 1) + ')' : '') + '</p>'
        + '<p class="sn-alert__text">' + esc(C.waitingOn(it, now)) + '</p>'
        + '<div class="sn-alert__actions"><button class="sn-btn sn-btn--on-accent" data-act="it-take" data-id="' + it.id + '">Übernehmen</button>'
        + '<button class="sn-btn sn-btn--on-accent" data-act="it-open" data-id="' + it.id + '">Ansehen</button></div></div>');
    }
    // neue Chatnachricht (nicht im Chat-Tab)
    if (st.tab !== 'chat') {
      const t = C.threadsFor(me.id).find((x) => x.unread && (C.messages(x.id).slice(-1)[0] || {}).by !== me.id);
      const lm = t ? C.messages(t.id).slice(-1)[0] : null;
      if (t && lm) {
        t.preview = M.first(lm.by) + ': ' + (lm.text || '📷 Foto');
        out.push('<button type="button" class="sn-alert sn-alert--info sn-alert--tap" data-act="chat-open" data-tid="' + esc(t.id) + '"><span class="sn-alert__icon">' + icon('chat') + '</span>'
          + '<p class="sn-alert__title">Neue Nachricht · ' + esc(t.title) + '</p><p class="sn-alert__text">' + esc(t.preview || 'Antippen zum Lesen') + '</p></button>');
      }
    }
    return out.slice(0, 3).join('');
  }

  function snapshotInputs(root) {
    const snap = {};
    root.querySelectorAll('input[id],select[id],textarea[id]').forEach((x) => {
      if (x.type === 'file') return;
      snap[x.id] = x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.value;
    });
    return snap;
  }
  function restoreInputs(root, snap) {
    for (const id of Object.keys(snap)) {
      const x = root.querySelector('#' + CSS.escape(id));
      if (!x) continue;
      if (x.type === 'checkbox' || x.type === 'radio') x.checked = snap[id];
      else if (x.tagName !== 'SELECT' || Array.from(x.options).some((o) => o.value === snap[id])) x.value = snap[id];
    }
  }

  let renderQueued = false;
  function render(keep) {
    if (!st.started) return;
    const me = SN.session.me();
    const now = SN.clock.now();
    const v = byId('view');
    header(me, now);
    byId('sos').hidden = !me;
    if (!me) { nav(null); fab(null); byId('banners').innerHTML = ''; v.innerHTML = loginView(); return; }
    const list = navFor(me);
    // Zugriff: Gruppe passt (auch ohne eigenen Platz in der Navigation)
    const cur = views[st.tab];
    if (!cur || !cur.groups.includes(M.group(me)) || (cur.allow && !cur.allow(me))) st.tab = list[0] ? list[0].tab : null;
    const view = views[st.tab];
    nav(me);
    fab(me, view);
    byId('banners').innerHTML = banners(me, now);
    const top = v.scrollTop;
    const snap = keep ? snapshotInputs(v) : {};
    const active = keep && document.activeElement && v.contains(document.activeElement) ? document.activeElement.id : null;
    let html = '';
    try { html = view ? view.render({ me, now, params: st.params, sub: st.sub, ui: SN.ui }) : '<p>Keine Ansicht.</p>'; } catch (e) {
      console.error('[SN.ui] Ansicht fehlgeschlagen', st.tab, e);
      html = '<div class="sn-alert sn-alert--warn sn-alert--card" role="alert"><p class="sn-alert__title">Diese Ansicht hat einen Fehler.</p><p class="sn-alert__text">Bitte einen anderen Bereich wählen.</p></div>';
    }
    v.innerHTML = html;
    if (keep) {
      restoreInputs(v, snap);
      v.scrollTop = top;
      if (active) { const a = byId(active); if (a) a.focus({ preventScroll: true }); }
    }
    if (view && view.mount) try { view.mount(v, { me, now }); } catch (e) { console.error(e); }
  }
  /** Rendern nach Datenänderung: gebündelt; während jemand tippt, erst nach Verlassen des Feldes */
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      const a = document.activeElement;
      const typing = a && byId('view').contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'radio'));
      if (typing) { st.dirty = true; return; }
      render(true);
    }, 30);
  }

  /* ---------- Toast, Sheet --------------------------------------------------- */
  function toast(text, kind) {
    const r = byId('toast');
    const el = document.createElement('div');
    el.className = 'sn-toast sn-toast--' + (kind || 'ok');
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="sn-toast__icon">' + icon(kind === 'warn' ? 'x' : 'check') + '</span><span class="sn-toast__text">' + esc(text) + '</span>';
    r.appendChild(el);
    U.vibrate(12);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); }, kind === 'warn' ? 4500 : 2800);
  }
  /** Ergebnis einer Kernfunktion anzeigen: {ok, reason} */
  function result(r, okText) {
    if (r && r.ok === false) { toast(r.reason || 'Hat nicht geklappt.', 'warn'); return false; }
    if (okText) toast(okText);
    return true;
  }

  let sheetOpen = false;
  function sheet(title, body, foot) {
    const p = byId('sheet-panel');
    p.innerHTML = '<div class="sn-sheet__handle"></div><div class="sn-sheet__head"><h2 class="sn-sheet__title" id="sheet-title">' + esc(title) + '</h2>'
      + '<button type="button" class="sn-btn sn-btn--ghost" data-act="sheet-close">Schließen</button></div>'
      + '<div class="sn-sheet__body">' + body + '</div>' + (foot ? '<div class="sn-sheet__foot">' + foot + '</div>' : '');
    const s = byId('sheet');
    s.classList.add('is-open'); s.setAttribute('aria-hidden', 'false');
    sheetOpen = true;
    setTimeout(() => { const f = p.querySelector('[autofocus]') || p.querySelector('input,textarea,select,button.sn-btn--primary'); if (f) f.focus(); }, 60);
    return p;
  }
  function closeSheet() {
    const s = byId('sheet');
    if (!s || !sheetOpen) return;
    s.classList.remove('is-open'); s.setAttribute('aria-hidden', 'true');
    sheetOpen = false;
    if (st.dirty) { st.dirty = false; render(true); }
  }
  const sheetVal = (id) => { const x = byId(id); return x ? (x.type === 'checkbox' ? x.checked : x.value) : null; };

  /* ---------- Login ------------------------------------------------------------ */
  function loginView() {
    const staff = M.staff();
    if (!staff.length) return setupView();
    const groups = { admin: [], lead: [], emp: [], clean: [] };
    for (const e of U.sortBy(staff, (x) => x.name)) groups[M.group(e)].push(e);
    const opt = (e) => '<option value="' + esc(e.id) + '">' + esc(e.name + ' · ' + M.role(e).label + (e.dept && M.group(e) !== 'admin' ? ' · ' + e.dept : '')) + '</option>';
    const demo = SN.store.mode === 'demo';
    const quick = demo ? [['emp', 'Anna Müller'], ['lead', 'Julia Becker'], ['admin', 'Mustafa'], ['admin', 'Sabine Krämer']]
      .map(([g, n]) => staff.find((e) => e.name === n)).filter(Boolean) : [];
    return '<section class="sn-login">'
      + '<h2 class="sn-section-title">Anmelden</h2>'
      + '<p class="sn-muted">Jede Person hat ein eigenes Konto. ' + (demo ? 'Demo: PIN 1234 für alle.' : 'PIN von der Filialleitung.') + '</p>'
      + '<div class="sn-field"><label class="sn-label" for="lg-u">Konto</label><select class="sn-select" id="lg-u">'
      + ['admin', 'lead', 'emp', 'clean'].map((g) => groups[g].length ? '<optgroup label="' + esc(M.ROLE_GROUPS[g]) + '">' + groups[g].map(opt).join('') + '</optgroup>' : '').join('')
      + '</select></div>'
      + '<div class="sn-field"><label class="sn-label" for="lg-p">PIN</label><input class="sn-input" id="lg-p" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="••••"></div>'
      + '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" data-act="login">Anmelden</button>'
      + (quick.length ? '<h3 class="sn-section-title">Demo: schnell ausprobieren als</h3><div class="sn-quick">' + quick.map((e) => '<button type="button" class="sn-btn sn-btn--secondary" data-act="login-quick" data-id="' + e.id + '">' + esc(e.name) + '<small>' + esc(M.role(e).label) + '</small></button>').join('') + '</div>' : '')
      + '<p class="sn-muted sn-small">' + (demo ? 'Demo-Modus: Daten nur in diesem Fenster.' : 'Filialbetrieb: alle mit Zugriff sehen dieselben Daten live.') + '</p>'
      + '</section>';
  }
  function setupView() {
    return '<section class="sn-login"><h2 class="sn-section-title">Filialbetrieb einrichten</h2>'
      + '<p>Die gemeinsame Datenbank ist noch leer. Lege das erste Admin-Konto an. Weitere Mitarbeitende fügst du danach unter „Mehr → Team“ hinzu.</p>'
      + '<div class="sn-field"><label class="sn-label" for="su-n">Dein Name</label><input class="sn-input" id="su-n" autocomplete="name"></div>'
      + '<div class="sn-field"><label class="sn-label" for="su-r">Rolle</label><select class="sn-select" id="su-r"><option value="admin">Admin (Disponent)</option><option value="fl">Filialleiter/in</option><option value="sfl">Stellv. Filialleiter/in</option></select></div>'
      + '<div class="sn-field"><label class="sn-label" for="su-p">Eigene PIN (4–6 Ziffern)</label><input class="sn-input" id="su-p" inputmode="numeric" maxlength="6"></div>'
      + '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" data-act="setup">Konto anlegen</button></section>';
  }
  on('login', () => {
    const r = SN.session.login(sheetVal('lg-u'), sheetVal('lg-p'));
    if (!r.ok) return toast(r.reason, 'warn');
  });
  on('login-quick', (el) => { SN.session.login(el.dataset.id, (M.emp(el.dataset.id) || {}).pin || SN.session.DEMO_PIN); });
  on('logout', () => { SN.session.logout(); });
  on('setup', async () => {
    const n = String(sheetVal('su-n') || '').trim(), p = String(sheetVal('su-p') || '').trim();
    if (n.length < 2) return toast('Bitte einen Namen eingeben.', 'warn');
    if (!/^\d{4,6}$/.test(p)) return toast('PIN: 4 bis 6 Ziffern.', 'warn');
    const id = U.id('e');
    const r = await SN.store.put('staff', id, { id, name: n, role: sheetVal('su-r'), dept: 'Info', sh: 'Früh', h: 8, lang: 'de', acts: [], pin: p, aiAssist: false });
    if (!r.ok) return toast(SN.store.ERROR_TEXT[r.code] || 'Nicht gespeichert.', 'warn');
    await SN.store.put('settings', 'main', { adminOnDuty: id, deadlines: {}, callNeed: {} });
    SN.session.login(id, p);
  });

  /* ---------- Ereignisse --------------------------------------------------------- */
  function onClick(ev) {
    const g = ev.target.closest('[data-go]');
    if (g) { ev.preventDefault(); go(g.dataset.go, Object.assign({}, g.dataset)); return; }
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = acts[el.dataset.act];
    if (!fn) return;
    ev.preventDefault();
    Promise.resolve().then(() => fn(el, ev)).catch((e) => { console.error('[SN.ui] Aktion', el.dataset.act, e); toast('Das hat nicht geklappt.', 'warn'); });
  }
  on('sheet-close', () => closeSheet());

  /* ---------- Takt: Eskalation, Erinnerungen, Vorlagen ------------------------------ */
  async function tick() {
    const me = SN.session.me();
    if (!me) return;
    const now = SN.clock.now();
    try { await SN.comm.escalateDue(now); } catch (e) { console.warn(e); }
    // Pausen-Erinnerung (einmal pro Schicht)
    try {
      const ps = SN.dist.pauseStatus(me, now);
      const key = 'p-' + me.id + '-' + U.fmt.dayKey(now);
      if (ps.state === 'due' && !st.notified[key]) { st.notified[key] = 1; toast('☕ Seit 5,5 Std im Dienst: Bitte jetzt Pause nehmen.', 'warn'); }
      if (ps.state === 'over' && !st.notified[key + 'o']) { st.notified[key + 'o'] = 1; toast('☕ Deine Pause ist abgelaufen.', 'warn'); }
    } catch (e) { /* ohne Plan egal */ }
    // Vorlagen des Tages legt der Admin vom Dienst an
    if (M.isAdmin(me) && M.adminOnDuty(now) === me.id) {
      for (const tpl of SN.comm.dueTemplates(now)) { try { await SN.comm.runTemplate(tpl, me.id, now); } catch (e) { console.warn(e); } }
    }
    requestRender();
  }

  /* ---------- Start ------------------------------------------------------------------- */
  async function start(info) {
    st.started = true;
    document.addEventListener('click', onClick);
    document.addEventListener('change', (ev) => {
      const el = ev.target.closest('[data-change]');
      if (el && changes[el.dataset.change]) Promise.resolve().then(() => changes[el.dataset.change](el, ev)).catch((e) => console.error(e));
    });
    document.addEventListener('focusout', () => setTimeout(() => {
      const a = document.activeElement;
      if (st.dirty && !(a && byId('view').contains(a) && /INPUT|TEXTAREA/.test(a.tagName))) { st.dirty = false; render(true); }
    }, 0));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeSheet();
      if (ev.key === 'Enter' && ev.target.id === 'lg-p') { ev.preventDefault(); acts.login(); }
      if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.enter) { ev.preventDefault(); const b = $('[data-act="' + ev.target.dataset.enter + '"]'); if (b) b.click(); }
    });
    for (const c of SN.store.COLS) SN.store.sub(c, requestRender);
    SN.session.onChange((id) => {
      st.tab = null; st.params = {}; st.sub = {};
      if (id) toast('Willkommen, ' + M.first(id));
      render(false);
      if (id) tick();
    });
    const last = info && info.mode === 'db' ? await SN.session.last() : null;
    if (last && SN.store.mode === 'db') {
      // gleiches claude.ai-Konto: Konto vorauswählen, PIN bleibt nötig
      setTimeout(() => { const s = byId('lg-u'); if (s) s.value = last; }, 0);
    }
    render(false);
    setInterval(tick, 15000);
    setInterval(() => { if (!sheetOpen) requestRender(); }, 30000);
  }

  SN.ui = {
    registerView, on, onChange, go, render, requestRender, sub, toast, result, sheet, closeSheet, sheetVal, icon,
    get tab() { return st.tab; }, get params() { return st.params; }, views, start, tick,
  };
})(window.SN = window.SN || {});
