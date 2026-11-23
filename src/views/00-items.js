/* ==========================================================================
   Gemeinsame Bausteine für alle Ansichten (SN.parts) und Aktionen auf Vorgängen
   Eine Karte zeigt immer: was, von wem, Frist, Zustand („Wartet auf …“) und
   genau die Aktionen, die die angemeldete Person jetzt tun kann.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, esc = U.esc, icon = ui.icon;
  const tr = {}; // Übersetzungen (nur in dieser Sitzung)
  let photoTmp = null;

  /* ---------- kleine Bausteine ------------------------------------------- */
  const sec = (title, small) => '<h2 class="sn-section-title">' + esc(title) + (small !== undefined && small !== '' ? ' <small>' + esc(small) + '</small>' : '') + '</h2>';
  const empty = (title, text, ok) => '<div class="sn-empty' + (ok ? ' sn-empty--ok' : '') + '"><span class="sn-empty__icon">' + icon(ok ? 'check' : 'inbox') + '</span><p class="sn-empty__title">' + esc(title) + '</p>' + (text ? '<p class="sn-empty__text">' + esc(text) + '</p>' : '') + '</div>';
  const chip = (text, mod) => '<span class="sn-chip' + (mod ? ' sn-chip--' + mod : '') + '">' + esc(text) + '</span>';
  const btn = (label, act, data, mod, ic) => '<button type="button" class="sn-btn sn-btn--' + (mod || 'secondary') + '" data-act="' + act + '"'
    + Object.entries(data || {}).map(([k, v]) => ' data-' + k + '="' + esc(v) + '"').join('') + '>' + (ic ? icon(ic) : '') + '<span>' + esc(label) + '</span></button>';
  const initials = (n) => String(n || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();

  function deadline(ts) {
    if (!ts) return '';
    const l = U.fmt.left(ts);
    return '<span class="sn-deadline' + (l.late ? ' sn-deadline--overdue' : l.soon ? ' sn-deadline--soon' : '') + '">bis ' + U.fmt.time(ts) + ' · ' + esc(l.text) + '</span>';
  }
  function receipt(it, me) {
    if (it.from !== me.id) return '';
    const rec = C.recipients(it);
    if (!rec.length) return '';
    const ack = rec.filter((id) => (it.acks || {})[id]).length;
    const seen = rec.filter((id) => (it.seen || {})[id]).length;
    if (it.needAck) return '<span class="sn-receipt sn-receipt--' + (ack === rec.length ? 'ack' : seen ? 'read' : 'sent') + '">' + ack + ' von ' + rec.length + ' quittiert</span>';
    return '<span class="sn-receipt sn-receipt--' + (seen ? 'read' : 'sent') + '">' + (seen ? 'gelesen' : 'gesendet') + '</span>';
  }
  function ackbar(it, me) {
    const s = C.ackStats(it);
    if (!s.total) return '';
    const read = s.open.filter((id) => (it.seen || {})[id]).length;
    const sent = s.open.length - read;
    const pct = Math.round(s.done / s.total * 100);
    return '<section class="sn-ackbar"><div class="sn-ackbar__head"><p class="sn-ackbar__count">' + s.done + ' <small>von ' + s.total + ' quittiert</small></p><span class="sn-ackbar__pct">' + pct + ' %</span></div>'
      + '<div class="sn-ackbar__bar" role="img" aria-label="' + s.done + ' quittiert, ' + read + ' gelesen, ' + sent + ' nur gesendet">'
      + '<span class="sn-ackbar__seg sn-ackbar__seg--ack" style="--n:' + s.done + '"></span><span class="sn-ackbar__seg sn-ackbar__seg--read" style="--n:' + read + '"></span><span class="sn-ackbar__seg sn-ackbar__seg--sent" style="--n:' + sent + '"></span></div>'
      + (s.open.length && (it.from === me.id || M.isLead(me)) ? '<div class="sn-ackbar__actions">' + btn('Nachfassen · ' + s.open.length, 'it-remind', { id: it.id }, 'secondary', 'bell') + btn('Wer fehlt?', 'it-open', { id: it.id }, 'ghost') + '</div>' : '')
      + '</section>';
  }
  function steps(it) {
    const h = (it.esc && it.esc.history) || [];
    if (h.length < 2) return '';
    return '<ol class="sn-steps">' + h.map((x, i) => '<li class="sn-steps__item' + (i === h.length - 1 ? ' is-current' : ' is-done') + '"><span>' + esc(x.fwd ? 'Weitergegeben' : i === 0 ? 'Start' : 'Stufe ' + i) + '</span><small>' + esc(x.key && M.STEP_LABEL[x.key] ? M.STEP_LABEL[x.key] : M.labelFor(x.ids || [])) + ' · ' + U.fmt.time(x.at) + '</small></li>').join('') + '</ol>';
  }
  function timeline(it) {
    return '<ol class="sn-timeline">' + C.timeline(it).map((t) => '<li><time>' + U.fmt.time(t.at) + '</time> ' + esc(t.text) + '</li>').join('') + '</ol>';
  }
  function body(it, me) {
    if (!it.body) return '';
    const t = tr[it.id];
    const lang = me.lang || 'de';
    const canTr = SN.ai.available().text;
    return '<p class="sn-card__body">' + esc(it.body) + '</p>'
      + (it.orig && it.orig !== it.body ? '<p class="sn-muted sn-small">Original: ' + esc(it.orig) + '</p>' : '')
      + (t ? '<p class="sn-translation">🌐 ' + esc(t) + '</p>' : canTr && lang !== 'de' ? '<button type="button" class="sn-link" data-act="it-translate" data-id="' + it.id + '">🌐 In ' + esc(SN.ai.LANGS[lang] || lang) + ' übersetzen</button>' : '');
  }

  /* ---------- Aktionen je Art und Rolle --------------------------------- */
  function actions(it, me) {
    const a = [];
    const mine = it.from === me.id;
    const rec = C.isRecipient(it, me.id) || C.currentIds(it).includes(me.id);
    const fin = C.isFinal(it);
    if (fin) return '';
    switch (it.kind) {
      case 'post':
      case 'handover':
        if ((it.needAck || it.kind === 'handover') && rec && !(it.acks || {})[me.id]) return '<button type="button" class="sn-btn sn-btn--ack" data-act="it-ack" data-id="' + it.id + '">' + icon('check') + '<span>' + (it.kind === 'handover' ? 'Übergabe erhalten' : 'Gelesen und verstanden') + '</span></button>';
        if ((it.acks || {})[me.id]) return '<span class="sn-receipt sn-receipt--ack">quittiert ' + U.fmt.time(it.acks[me.id]) + '</span>';
        break;
      case 'task':
        if (it.owner === me.id) {
          if (it.state !== 'taken') a.push(btn('Starten', 'it-start', { id: it.id }, 'primary', 'play'));
          else if (it.units && it.units.length) { const sc = SN.ops.scanState(it); a.push(btn('Etikett scannen (' + sc.done + '/' + sc.total + ')', 'scan-open', { id: it.id }, 'primary', 'check')); }
          else a.push(btn('Erledigt', 'it-done', { id: it.id }, 'primary', 'check'));
          a.push(btn('Nachfragen', 'it-ask', { id: it.id }, 'secondary', 'chat'));
          a.push(btn('Zurückgeben', 'it-giveback', { id: it.id }, 'ghost'));
        } else if (!it.owner) {
          a.push(btn('Übernehme ich', 'it-take', { id: it.id }, 'primary', 'check'));
          if (M.isLead(me)) a.push(btn('Zuteilen', 'it-assign', { id: it.id }, 'secondary', 'users'));
        } else if (M.isLead(me)) a.push(btn('Umverteilen', 'it-assign', { id: it.id }, 'ghost', 'users'));
        break;
      case 'report':
      case 'absence':
        if (rec && !mine) {
          if (it.state !== 'taken') a.push(btn('Übernehmen', 'it-take', { id: it.id }, 'primary', 'check'));
          else a.push(btn('Erledigt', 'it-done', { id: it.id }, 'primary', 'check'));
          a.push(btn('Weitergeben', 'it-forward', { id: it.id }, 'secondary', 'forward'));
          if (M.isLead(me) && it.kind === 'report' && !it.taskId) a.push(btn('➕ Auftrag', 'it-totask', { id: it.id }, 'ghost'));
        }
        break;
      case 'call':
        if (rec && !(it.answers || {})[me.id]) { a.push(btn('Ich komme', 'call-yes', { id: it.id }, 'primary', 'run')); a.push(btn('Kann nicht', 'call-no', { id: it.id }, 'secondary')); }
        if (mine || M.isLead(me)) a.push(btn('Schließen', 'it-close', { id: it.id }, 'ghost'));
        break;
      case 'shiftreq':
        if (rec && it.state === 'sent' || rec && it.state === 'seen') { a.push(btn('Annehmen', 'sr-yes', { id: it.id }, 'primary', 'check')); a.push(btn('Ablehnen', 'sr-no', { id: it.id }, 'secondary', 'x')); }
        if (it.swap && it.state === 'taken' && M.isLead(me)) { a.push(btn('Tausch freigeben', 'swap-ok', { id: it.id }, 'primary', 'check')); a.push(btn('Ablehnen', 'swap-no', { id: it.id }, 'ghost')); }
        break;
      case 'sos':
        if (!mine && M.isLead(me) && !(it.answers || {})[me.id]) a.push(btn('Hilfe kommt, ich gehe hin', 'sos-respond', { id: it.id }, 'primary', 'run'));
        break;
      default:
    }
    if (it.kind === 'task' && it.state === 'done' && it.proof && it.approved == null && M.isLead(me)) {
      a.push(btn('Nachweis ok', 'it-approve', { id: it.id, yes: '1' }, 'primary', 'check'));
      a.push(btn('Nachbessern', 'it-approve', { id: it.id, yes: '' }, 'ghost'));
    }
    return a.length ? '<div class="sn-card__actions">' + a.join('') + '</div>' : '';
  }

  /**
   * Karte für einen Vorgang. opts: {compact, showTimeline}
   */
  function itemCard(it, me, now, opts) {
    opts = opts || {};
    const fin = C.isFinal(it);
    // Eskalationsdetails sehen Absender, Leitung und die aktuell Zuständigen – nicht jede Empfängerin einer Info
    const insider = it.from === me.id || M.isLead(me) || it.kind === 'report' || it.kind === 'absence';
    const lvl = insider ? ((it.esc && it.esc.level) || 0) : 0;
    const cls = ['sn-card', it.kind === 'task' ? 'sn-task' : it.kind === 'report' || it.kind === 'absence' ? 'sn-report' : 'sn-message'];
    if (it.u && !fin) cls.push('sn-card--urgent');
    if (lvl > 0 && !fin) cls.push('sn-card--escalated');
    if (fin) cls.push('is-done');
    const cat = it.kind === 'report' ? M.CAT[it.cat] : null;
    const kindLabel = cat ? cat.icon + ' ' + cat.label : M.KINDS[it.kind] || it.kind;
    const stateLabel = it.kind === 'task' && it.state === 'taken' ? '▶ In Arbeit' : M.STATES[it.state] || it.state;
    const due = it.kind === 'task' ? it.due : it.ackDue;
    const meta = [];
    if (due && !fin) meta.push('<div class="sn-meta__item">' + icon('clock') + '<dt class="sn-sr-only">Frist</dt><dd>' + deadline(due) + '</dd></div>');
    meta.push('<div class="sn-meta__item"><dt>Von</dt><dd>' + esc(it.from === me.id ? 'dir' : M.name(it.from)) + ' · ' + esc(U.fmt.ago(it.createdAt)) + '</dd></div>');
    if (it.dept) meta.push('<div class="sn-meta__item">' + icon('pin') + '<dt class="sn-sr-only">Abteilung</dt><dd>' + esc(it.dept) + '</dd></div>');
    if (it.kind === 'task' && it.min) meta.push('<div class="sn-meta__item"><dt>Dauer</dt><dd>ca. ' + esc(U.fmt.dur(it.min)) + (it.act ? ' · ' + esc(it.act) : '') + '</dd></div>');
    const wait = insider || it.kind === 'task' || it.kind === 'call' ? C.waitingOn(it, now) : '';
    return '<article class="' + cls.join(' ') + '" data-item="' + it.id + '">'
      + (it.u && !fin ? '<div class="sn-card__flag">🔥 Dringend' + (it.needAck && !fin ? ' · Bitte quittieren' : '') + '</div>' : lvl > 0 && !fin ? '<div class="sn-card__flag">Eskaliert · Stufe ' + lvl + '</div>' : '')
      + '<div class="sn-card__head"><h3 class="sn-card__title"><button type="button" class="sn-card__open" data-act="it-open" data-id="' + it.id + '">' + esc(it.title || kindLabel) + '</button></h3>'
      + chip(stateLabel, fin ? 'ok' : it.state === 'taken' ? 'info' : lvl > 0 ? 'escalated' : '') + '</div>'
      + '<p class="sn-card__kind">' + esc(kindLabel) + (it.to && it.from === me.id ? ' · an ' + esc(M.labelFor(C.recipients(it))) : '') + '</p>'
      + (opts.compact ? '' : body(it, me))
      + (it.photos && it.photos.length && !opts.compact ? '<div class="sn-photos">' + it.photos.slice(0, 4).map((p) => '<img alt="Foto zur Meldung" src="' + esc(p) + '">').join('') + '</div>' : '')
      + (it.checklist && it.checklist.length ? checklist(it, me) : '')
      + '<dl class="sn-meta">' + meta.join('') + '</dl>'
      + (wait && !fin ? '<p class="sn-waiting">' + icon('clock') + esc(wait) + '</p>' : '')
      + (it.kind === 'post' && it.needAck && (it.from === me.id || M.isLead(me)) ? ackbar(it, me) : receipt(it, me))
      + (opts.showTimeline ? steps(it) + timeline(it) : '')
      + actions(it, me)
      + '</article>';
  }
  function checklist(it, me) {
    const can = it.owner === me.id || M.isLead(me);
    return '<ul class="sn-checklist">' + it.checklist.map((c, i) => '<li><label class="sn-check"><input type="checkbox" data-change="check-item" data-id="' + it.id + '" data-i="' + i + '"' + (c.done ? ' checked' : '') + (can ? '' : ' disabled') + '>' + esc(c.text) + (c.at ? ' <small>' + esc(c.at) + '</small>' : '') + '</label></li>').join('') + '</ul>';
  }
  function list(items, me, now, emptyHtml, opts) {
    return items.length ? items.map((it) => itemCard(it, me, now, opts)).join('') : (emptyHtml || '');
  }

  /* ---------- Auswahl: Person ------------------------------------------- */
  function personPicker(name, ids, me, now, sel) {
    return '<div class="sn-pick" role="radiogroup">' + ids.map((id) => {
      const e = M.emp(id); if (!e) return '';
      const s = SN.dist.status(e, now);
      return '<label class="sn-choice sn-choice--person"><input type="radio" name="' + name + '" value="' + id + '"' + (sel === id ? ' checked' : '') + '><span><b>' + esc(e.name) + '</b><small>' + esc(M.role(e).label + ' · ' + (M.deptOf(e, now) || '') + ' · ' + s.text) + '</small></span></label>';
    }).join('') + '</div>';
  }
  const picked = (name) => { const x = document.querySelector('input[name="' + name + '"]:checked'); return x ? x.value : null; };

  /* ---------- Aktionen ---------------------------------------------------- */
  const me = () => SN.session.me();
  const now = () => SN.clock.now();
  const R = ui.result;

  ui.on('it-ack', async (el) => R(await C.ack(el.dataset.id, me().id), 'Quittiert – der Absender sieht es sofort'));
  ui.on('it-take', async (el) => { const r = await C.take(el.dataset.id, me().id); if (R(r, 'Übernommen – der Melder sieht es sofort')) ui.closeSheet(); });
  ui.on('it-start', async (el) => R(await C.start(el.dataset.id, me().id), 'Gestartet'));
  ui.on('it-remind', async (el) => { const r = await C.remind(el.dataset.id, me().id); R(r, r.ok ? 'Erinnerung an ' + r.count + ' gesendet' : ''); });
  ui.on('call-yes', async (el) => { const r = await C.answerCall(el.dataset.id, me().id, true); R(r, r.closed ? 'Danke! Genug Zusagen – Ruf geschlossen' : 'Danke – der Rufer sieht deine Zusage'); });
  ui.on('call-no', async (el) => R(await C.answerCall(el.dataset.id, me().id, false), 'Rückmeldung gesendet'));
  ui.on('sos-respond', async (el) => R(await C.sosRespond(el.dataset.id, me().id), 'Der Auslöser sieht: Hilfe kommt'));
  ui.on('it-close', async (el) => { const r = await C.done(el.dataset.id, me().id, {}); if (R(r, 'Abgeschlossen')) ui.closeSheet(); });
  ui.on('it-approve', async (el) => R(await C.approve(el.dataset.id, me().id, !!el.dataset.yes, el.dataset.yes ? '' : 'Bitte nachbessern'), el.dataset.yes ? 'Nachweis freigegeben' : 'Zurück zum Nachbessern'));
  ui.on('sr-yes', async (el) => R(await C.answerShiftReq(el.dataset.id, me().id, true, ''), 'Angenommen'));
  ui.on('sr-no', async (el) => R(await C.answerShiftReq(el.dataset.id, me().id, false, ''), 'Abgelehnt – die Leitung sieht es'));
  ui.on('swap-ok', async (el) => R(await C.approveSwap(el.dataset.id, me().id, true), 'Tausch freigegeben'));
  ui.on('swap-no', async (el) => R(await C.approveSwap(el.dataset.id, me().id, false), 'Tausch abgelehnt'));
  ui.onChange('check-item', async (el) => { await C.checkItem(el.dataset.id, me().id, +el.dataset.i, el.checked); });

  ui.on('it-translate', async (el) => {
    const it = C.get(el.dataset.id); if (!it) return;
    el.disabled = true; el.textContent = 'Übersetze …';
    const r = await SN.ai.translate(it.body, me().lang || 'de');
    if (!r) { el.disabled = false; return ui.toast((SN.ai.lastError && SN.ai.lastError.message) || 'Übersetzung nicht verfügbar.', 'warn'); }
    tr[it.id] = r.text; ui.render(true);
  });

  ui.on('it-open', async (el) => {
    const it = C.get(el.dataset.id); if (!it) return;
    await C.markSeen(it, me().id);
    const fresh = C.get(it.id);
    let extra = '';
    if (fresh.kind === 'post' && fresh.needAck && (fresh.from === me().id || M.isLead(me()))) {
      const s = C.ackStats(fresh);
      extra = s.open.length ? sec('Noch nicht quittiert', s.open.length) + '<ul class="sn-namelist">' + s.open.map((id) => '<li>' + esc(M.name(id)) + ((fresh.seen || {})[id] ? ' <small>gelesen</small>' : ' <small>nur gesendet</small>') + '</li>').join('') + '</ul>' : '';
    }
    ui.sheet(fresh.title || M.KINDS[fresh.kind], itemCard(fresh, me(), now(), { showTimeline: true }) + extra
      + '<div class="sn-field"><label class="sn-label" for="it-reply">Antwort / Rückfrage</label><textarea class="sn-textarea" id="it-reply" rows="2" placeholder="Kurz schreiben – in jeder Sprache"></textarea></div>',
      btn('Antwort senden', 'it-reply', { id: fresh.id }, 'primary', 'send'));
  });
  ui.on('it-reply', async (el) => {
    const t = String(ui.sheetVal('it-reply') || '').trim();
    if (!t) return ui.toast('Bitte Text eingeben.', 'warn');
    const r = await C.reply(el.dataset.id, me().id, t);
    if (R(r, 'Antwort gesendet')) ui.closeSheet();
  });
  ui.on('it-ask', (el) => {
    const it = C.get(el.dataset.id); if (!it) return;
    ui.go('chat', { tid: C.threadId.dm(me().id, it.from), draft: 'Zu „' + it.title + '“: ' });
  });

  ui.on('it-giveback', (el) => {
    ui.sheet('Auftrag zurückgeben', '<p>Der Auftrag wird wieder frei und neu verteilt – nicht wieder an dich.</p>'
      + '<fieldset class="sn-choices"><legend class="sn-label">Grund</legend>' + ['Keine Zeit mehr', 'Fehlt Material oder Ware', 'Nicht meine Tätigkeit', 'Sonstiges'].map((g, i) => '<label class="sn-choice"><input type="radio" name="gb" value="' + esc(g) + '"' + (i ? '' : ' checked') + '><span>' + esc(g) + '</span></label>').join('') + '</fieldset>',
      btn('Zurückgeben', 'it-giveback-go', { id: el.dataset.id }, 'primary'));
  });
  ui.on('it-giveback-go', async (el) => { const r = await C.giveBack(el.dataset.id, me().id, picked('gb')); if (R(r, 'Zurückgegeben')) { ui.closeSheet(); SN.dist.run(me().id); } });

  ui.on('it-done', (el) => {
    const it = C.get(el.dataset.id); if (!it) return;
    photoTmp = null;
    const needPhoto = it.kind === 'task' && it.proofRequired;
    const askText = it.kind === 'report' || it.kind === 'absence';
    if (!needPhoto && !askText) return C.done(it.id, me().id, {}).then((r) => R(r, 'Erledigt – danke!'));
    ui.sheet('Erledigt', (needPhoto ? '<p>Für diesen Auftrag ist ein Foto als Nachweis nötig. Die Leitung gibt es frei.</p><label class="sn-btn sn-btn--secondary sn-btn--block" for="done-photo">' + icon('camera') + '<span>Foto aufnehmen</span></label><input type="file" id="done-photo" accept="image/*" capture="environment" data-change="photo-tmp" hidden><div id="done-prev" class="sn-photos"></div>' : '')
      + (askText ? '<div class="sn-field"><label class="sn-label" for="done-text">Kurze Antwort an ' + esc(M.first(it.from)) + '</label><input class="sn-input" id="done-text" value="Ist erledigt, danke für die Meldung!"></div>' : ''),
      btn('Als erledigt melden', 'it-done-go', { id: it.id }, 'primary', 'check'));
  });
  ui.onChange('photo-tmp', async (el) => {
    const f = el.files && el.files[0]; if (!f) return;
    photoTmp = (await U.shrinkImage(f, 640, 0.6)).dataUrl;
    const p = document.getElementById('done-prev'); if (p) p.innerHTML = '<img alt="Nachweisfoto" src="' + photoTmp + '">';
  });
  ui.on('it-done-go', async (el) => {
    const r = await C.done(el.dataset.id, me().id, { photo: photoTmp || undefined, text: ui.sheetVal('done-text') || undefined });
    if (R(r, 'Erledigt – der Melder bekommt Bescheid')) { photoTmp = null; ui.closeSheet(); }
  });

  ui.on('it-forward', (el) => {
    const it = C.get(el.dataset.id); if (!it) return;
    const ids = M.staff().filter((e) => e.id !== me().id && M.isLead(e) || e.role === 'clean').map((e) => e.id);
    ui.sheet('Weitergeben an …', personPicker('fw', U.sortBy(ids, (id) => -M.level(M.emp(id))), me(), now())
      + '<div class="sn-field"><label class="sn-label" for="fw-note">Hinweis (optional)</label><input class="sn-input" id="fw-note"></div>',
      btn('Weitergeben', 'it-forward-go', { id: it.id }, 'primary', 'forward'));
  });
  ui.on('it-forward-go', async (el) => {
    const to = picked('fw'); if (!to) return ui.toast('Bitte eine Person wählen.', 'warn');
    const r = await C.forward(el.dataset.id, me().id, [to], ui.sheetVal('fw-note'));
    if (R(r, 'Weitergegeben an ' + M.first(to))) ui.closeSheet();
  });
  ui.on('it-totask', async (el) => { const r = await C.toTask(el.dataset.id, me().id, {}); if (R(r, 'Auftrag angelegt und verteilt')) SN.dist.run(me().id); });

  ui.on('it-assign', (el) => {
    const it = C.get(el.dataset.id); if (!it) return;
    const n = now();
    const cands = SN.dist.candidates(n).filter((e) => e.id !== it.owner);
    const ranked = U.sortBy(cands, (e) => (M.deptOf(e, n) === it.dept ? 0 : 1) * 1000 + SN.dist.loadOf(e.id) - SN.dist.limitOf(e, n) / 10).slice(0, 25);
    ui.sheet('Zuteilen: ' + it.title, '<p class="sn-muted">Gleiche Abteilung zuerst, dann geringste Auslastung. Über das Limit wird nie zugeteilt.</p>'
      + personPicker('as', ranked.map((e) => e.id), me(), n), btn('Zuteilen', 'it-assign-go', { id: it.id }, 'primary', 'check'));
  });
  ui.on('it-assign-go', async (el) => {
    const to = picked('as'); if (!to) return ui.toast('Bitte eine Person wählen.', 'warn');
    const it = C.get(el.dataset.id);
    const chk = SN.dist.canTake(M.emp(to), Object.assign({}, it, { owner: null }), now());
    if (!chk.ok) return ui.toast(chk.reason, 'warn');
    await SN.store.patch('items', it.id, { owner: to, to: { type: 'person', ids: [to] }, state: 'sent', startedAt: null });
    await C.log(me().id, 'Auftrag „' + it.title + '“ an ' + M.name(to) + ' zugeteilt');
    ui.toast('Zugeteilt an ' + M.first(to)); ui.closeSheet();
  });

  /* ---------- Fotos für Formulare --------------------------------------- */
  async function readPhotos(input, max) {
    const out = [];
    for (const f of Array.from(input.files || []).slice(0, max || 4)) out.push((await U.shrinkImage(f, 640, 0.6)).dataUrl);
    return out;
  }

  SN.parts = { sec, empty, chip, btn, deadline, receipt, ackbar, steps, timeline, itemCard, list, personPicker, picked, initials, readPhotos, icon };
})(window.SN = window.SN || {});
