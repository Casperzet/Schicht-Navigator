/* ==========================================================================
   Eingang (Leitung, Admin) + Senden (Anweisung, Auftrag, Kurzbriefing, Lob, Ruf)
   Eingang: alles, was gerade bei mir liegt – zuerst Eskaliertes und Dringendes.
   Gesendet: eigene Anweisungen mit Quittungsleiste und „Nachfassen“.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;

  function render({ me, now, sub }) {
    const f = sub.inTab || 'mine';
    const mine = C.inbox(me.id);
    const sent = C.sentBy(me.id).filter((it) => ['post', 'task', 'call', 'handover', 'shiftreq'].includes(it.kind) && !it.kudos && now - it.createdAt < 2 * U.DAY);
    const allOpen = M.isAdmin(me) ? C.urgentFirst(SN.store.list('items').filter((it) => ['report', 'absence', 'call', 'sos'].includes(it.kind) && !C.isFinal(it))) : [];
    const segs = [['mine', 'Für mich', mine.length], ['sent', 'Gesendet', sent.filter((x) => !C.isFinal(x)).length]];
    if (M.isAdmin(me)) segs.push(['all', 'Alle offen', allOpen.length]);
    let h = '<div class="sn-segment sn-segment--sticky" role="tablist">' + segs.map(([k, l, n]) => '<button type="button" role="tab" class="sn-segment__tab" data-act="in-tab" data-k="' + k + '" aria-selected="' + (f === k) + '">' + l + (n ? ' <span class="sn-badge sn-badge--neutral">' + n + '</span>' : '') + '</button>').join('') + '</div>';
    if (f === 'mine') {
      const esc1 = mine.filter((it) => it.esc && it.esc.level > 0), rest = mine.filter((it) => !(it.esc && it.esc.level > 0));
      if (!mine.length) return h + P.empty('Nichts offen', 'Meldungen, Ausfälle und Rufe an dich erscheinen hier sofort.', true);
      if (esc1.length) h += P.sec('Eskaliert – wartet zu lange', esc1.length) + P.list(esc1, me, now);
      if (rest.length) h += P.sec('Neu und offen', rest.length) + P.list(rest, me, now);
      return h;
    }
    if (f === 'sent') return h + (sent.length ? P.list(sent, me, now) : P.empty('Noch nichts gesendet', 'Über „Senden“ erreichst du Personen, Abteilungen oder die ganze Schicht.'));
    return h + (allOpen.length ? P.list(allOpen, me, now) : P.empty('Alles im Griff', 'Keine offenen Meldungen in der Filiale.', true));
  }

  ui.registerView('inbox', {
    label: 'Eingang', icon: 'inbox', groups: ['lead', 'admin'], order: 25, render,
    badge: (me) => { const l = C.inbox(me.id); return l.length ? { n: l.length, urgent: l.some((i) => i.u || (i.esc && i.esc.level > 0)) } : 0; },
    fab: () => ({ label: 'Senden', icon: 'send', act: 'send-sheet' }),
  });
  ui.on('in-tab', (el) => ui.sub('inTab', el.dataset.k));

  /* ---------- Senden ----------------------------------------------------------- */
  let mode = 'post';
  const choice = (name, opts, sel) => '<fieldset class="sn-choices"><legend class="sn-label">' + esc(opts.legend) + '</legend>' + opts.items.map(([v, l]) => '<label class="sn-choice"><input type="radio" name="' + name + '" value="' + esc(v) + '"' + (v === sel ? ' checked' : '') + (opts.change ? ' data-change="' + opts.change + '"' : '') + '><span>' + esc(l) + '</span></label>').join('') + '</fieldset>';
  const deptSelect = (id, sel) => '<select class="sn-select" id="' + id + '">' + M.DEPTS.map((d) => '<option value="' + esc(d) + '"' + (d === sel ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select>';

  function targetFields(me, now) {
    const sh = M.currentShift(now) || me.sh || 'Früh';
    return choice('to-type', { legend: 'An wen?', change: 'send-to', items: [['shift', 'Ganze Schicht (' + sh + ')'], ['dept', 'Abteilung'], ['role', 'Rolle'], ['person', 'Person'], ['all', 'Alle']] }, 'shift')
      + '<div class="sn-field" data-to="dept" hidden><label class="sn-label" for="to-dept">Abteilung</label>' + deptSelect('to-dept', M.deptOf(me, now)) + '</div>'
      + '<div class="sn-field" data-to="role" hidden><label class="sn-label" for="to-role">Rolle</label><select class="sn-select" id="to-role">' + Object.entries(M.ROLE_TARGETS).map(([k, l]) => '<option value="' + k + '">' + esc(l) + '</option>').join('') + '</select></div>'
      + '<div class="sn-field" data-to="person" hidden><label class="sn-label" for="to-person">Person</label><select class="sn-select" id="to-person">' + U.sortBy(M.staff().filter((e) => e.id !== me.id), (e) => e.name).map((e) => '<option value="' + e.id + '">' + esc(e.name + ' · ' + M.role(e).label) + '</option>').join('') + '</select></div>'
      + '<label class="sn-check"><input type="checkbox" id="to-onduty" checked>Nur wer gerade im Dienst ist</label>';
  }
  function readTarget(now) {
    const t = P.picked('to-type') || 'shift';
    const sh = M.currentShift(now) || SN.session.me().sh;
    if (t === 'shift') return { type: 'shift', ids: [sh] };
    if (t === 'dept') return { type: 'dept', ids: [ui.sheetVal('to-dept')] };
    if (t === 'role') return { type: 'role', ids: [ui.sheetVal('to-role')] };
    if (t === 'person') return { type: 'person', ids: [ui.sheetVal('to-person')] };
    return { type: 'all', ids: [] };
  }
  function onlyOnDuty(to, now) {
    if (!ui.sheetVal('to-onduty') || to.type === 'person') return to;
    const ids = M.resolveTo(to, now).filter((id) => M.onDuty(M.emp(id), now) || M.isAdmin(M.emp(id)));
    return { type: 'person', ids, label: to };
  }

  let refShots = []; // Referenzfotos (nach unten: „so soll es aussehen“)
  const refField = () => '<div class="sn-field"><span class="sn-label">Referenzfoto (optional)</span>' + (refShots.length ? '<div class="sn-photos">' + refShots.map((u, k) => '<figure style="position:relative;margin:0"><img alt="Referenzfoto ' + (k + 1) + '" src="' + esc(u) + '"><button type="button" class="sn-btn sn-btn--icon" style="position:absolute;top:4px;right:4px;min-height:40px;min-width:40px" aria-label="Foto entfernen" data-act="ref-del" data-i="' + k + '">' + icon('x') + '</button></figure>').join('') + '</div>' : '')
    + (refShots.length < 2 ? '<label class="sn-btn sn-btn--secondary sn-btn--block" for="ref-photo">' + icon('camera') + '<span>Foto anhängen – „So soll es aussehen“</span></label><input type="file" id="ref-photo" accept="image/*" capture="environment" hidden data-change="ref-photo">' : '') + '</div>';
  function form(me, now) {
    if (mode === 'post' || mode === 'briefing') {
      return (mode === 'briefing' ? '<p class="sn-muted">Die 3 wichtigsten Infos zum Schichtbeginn. Alle der Schicht müssen quittieren.</p>' + [1, 2, 3].map((i) => '<div class="sn-field"><label class="sn-label" for="br-' + i + '">' + i + '. Info</label><input class="sn-input" id="br-' + i + '"></div>').join('')
        : targetFields(me, now)
          + '<div class="sn-field"><label class="sn-label" for="po-title">Betreff</label><input class="sn-input" id="po-title" placeholder="z. B. Rückruf Babybrei – Regal räumen"></div>'
          + '<div class="sn-field"><label class="sn-label" for="po-body">Text</label><textarea class="sn-textarea" id="po-body" rows="3"></textarea></div>'
          + refField() + '<label class="sn-switch">Quittierung verlangen<input type="checkbox" role="switch" id="po-ack" checked></label>')
        + '<label class="sn-check"><input type="checkbox" id="po-u"><span><span class="sn-inline">' + ui.urgent() + '</span> (Frist ' + M.settings().deadlines.postUrgent + ' statt ' + M.settings().deadlines.post + ' Min, dann eskaliert es an die Schichtleitung)</span></label>';
    }
    if (mode === 'task') {
      return '<div class="sn-field"><label class="sn-label" for="tk-title">Was ist zu tun?</label><textarea class="sn-textarea" id="tk-title" rows="2" placeholder="Ein Auftrag pro Zeile"></textarea></div>'
        + '<div class="sn-field"><label class="sn-label" for="tk-dept">Abteilung</label>' + deptSelect('tk-dept', M.deptOf(me, now)) + '</div>'
        + '<div class="sn-field"><label class="sn-label" for="tk-act">Tätigkeit (Dauer nach Richtwert)</label><select class="sn-select" id="tk-act">' + M.ACTS.map((a) => '<option value="' + esc(a.key) + '">' + esc(a.label) + '</option>').join('') + '</select></div>'
        + choice('tk-due', { legend: 'Frist', items: [['60', 'In 1 Stunde'], ['shift', 'Bis Schichtende'], ['tomorrow', 'Morgen']] }, 'shift')
        + '<label class="sn-check"><input type="checkbox" id="tk-u"><span class="sn-inline">' + ui.urgent() + '</span></label>'
        + refField() + '<label class="sn-switch">Foto als Nachweis<input type="checkbox" role="switch" id="tk-proof"></label>'
        + '<label class="sn-switch">Eskalieren, wenn bis Frist nicht erledigt<input type="checkbox" role="switch" id="tk-esc" checked></label>'
        + '<p class="sn-muted sn-small">Wird automatisch verteilt: gleiche Abteilung und passende Tätigkeit zuerst, geringste Auslastung gewinnt, nie über das Limit.</p>';
    }
    if (mode === 'kudos') {
      return '<div class="sn-field"><label class="sn-label" for="ku-to">Für wen?</label><select class="sn-select" id="ku-to">' + U.sortBy(M.staff().filter((e) => e.id !== me.id), (e) => e.name).map((e) => '<option value="' + e.id + '">' + esc(e.name) + '</option>').join('') + '</select></div>'
        + '<div class="sn-field"><label class="sn-label" for="ku-text">Danke für …</label><input class="sn-input" id="ku-text" placeholder="z. B. die schnelle Hilfe an Kasse 3"></div>'
        + '<p class="sn-muted sn-small">Lob ist persönlich. Es gibt keine Zähler und keine Ranglisten.</p>';
    }
    return '';
  }

  function openSend() {
    const me = SN.session.me(), now = SN.clock.now();
    const modes = [['post', 'Anweisung', 'report'], ['task', 'Auftrag', 'tasks'], ['briefing', 'Briefing', 'sun'], ['kudos', 'Lob', 'heart']];
    ui.sheet('Senden', '<div class="sn-segment" role="tablist">' + modes.map(([k, l, ic]) => '<button type="button" role="tab" class="sn-segment__tab sn-segment__tab--icon" data-act="send-mode" data-k="' + k + '" aria-selected="' + (k === mode) + '">' + icon(ic) + '<span>' + l + '</span></button>').join('') + '</div>'
      + '<button type="button" class="sn-btn sn-btn--ghost sn-btn--block" data-act="call-sheet">' + icon('bell') + '<span>Schnellruf (Kasse öffnen, Besprechung …)</span></button>'
      + '<div id="send-form">' + form(me, now) + '</div>',
      '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" data-act="send-go">' + icon('send') + '<span>Senden</span></button>');
  }
  ui.on('send-sheet', () => { mode = 'post'; refShots = []; openSend(); });
  ui.onChange('ref-photo', async (el) => { const f = el.files && el.files[0]; if (!f) return; const img = await U.shrinkImage(f, 1280, 0.72); let u = img.dataUrl; try { u = await SN.store.upload(img.blob, img.dataUrl); } catch (e) { /* bleibt im Vorgang */ } refShots.push(u); openSend(); });
  ui.on('ref-del', (el) => { refShots.splice(+el.dataset.i, 1); openSend(); });
  ui.on('send-mode', (el) => { mode = el.dataset.k; openSend(); });
  ui.onChange('send-to', (el) => document.querySelectorAll('[data-to]').forEach((x) => { x.hidden = x.dataset.to !== el.value; }));

  function dueFrom(v, now, me) {
    if (v === '60') return now + 60 * U.MIN;
    if (v === 'tomorrow') return U.startOfDay(now) + U.DAY + 12 * U.HOUR;
    const w = M.shiftWindow(me, now);
    return w && w.e > now ? w.e : now + 4 * U.HOUR;
  }

  ui.on('send-go', async (el) => {
    const me = SN.session.me(), now = SN.clock.now();
    let r;
    if (mode === 'post') {
      const title = String(ui.sheetVal('po-title') || '').trim();
      if (!title) return ui.toast('Bitte einen Betreff eingeben.', 'warn');
      const to = onlyOnDuty(readTarget(now), now);
      if (!M.resolveTo(to, now).filter((id) => id !== me.id).length) return ui.toast('Niemand erreichbar mit dieser Auswahl.', 'warn');
      r = await C.post(me.id, { to, title, body: ui.sheetVal('po-body') || '', needAck: !!ui.sheetVal('po-ack'), u: !!ui.sheetVal('po-u'), photos: refShots.slice() });
    } else if (mode === 'briefing') {
      const lines = [1, 2, 3].map((i) => String(ui.sheetVal('br-' + i) || '').trim()).filter(Boolean);
      if (!lines.length) return ui.toast('Bitte mindestens eine Info eintragen.', 'warn');
      const sh = M.currentShift(now) || me.sh;
      r = await C.post(me.id, { to: { type: 'shift', ids: [sh] }, title: 'Kurzbriefing ' + sh + 'schicht', body: lines.map((l, i) => (i + 1) + '. ' + l).join('\n'), needAck: true, briefing: true, u: !!ui.sheetVal('po-u') });
    } else if (mode === 'task') {
      const lines = String(ui.sheetVal('tk-title') || '').split('\n').map((x) => x.trim()).filter(Boolean);
      if (!lines.length) return ui.toast('Bitte beschreiben, was zu tun ist.', 'warn');
      const due = dueFrom(P.picked('tk-due'), now, me);
      for (const title of lines) {
        r = await C.task(me.id, { title, dept: ui.sheetVal('tk-dept'), act: ui.sheetVal('tk-act'), due, u: !!ui.sheetVal('tk-u'), proofRequired: !!ui.sheetVal('tk-proof'), escalate: !!ui.sheetVal('tk-esc'), photos: refShots.slice() });
        if (!r.ok) break;
      }
      if (r.ok) { refShots = []; const d = await SN.dist.run(me.id); ui.result(r, lines.length + ' gesendet. ' + SN.dist.resultText(d)); ui.closeSheet(); return; }
    } else if (mode === 'kudos') {
      const text = String(ui.sheetVal('ku-text') || '').trim();
      if (!text) return ui.toast('Bitte kurz schreiben, wofür.', 'warn');
      r = await C.kudos(me.id, ui.sheetVal('ku-to'), text);
    }
    if (r && r.ok) refShots = [];
    if (ui.result(r, mode === 'kudos' ? 'Lob gesendet' : 'Gesendet – du siehst live, wer es gelesen und quittiert hat')) { ui.closeSheet(); ui.go('inbox', {}); ui.sub('inTab', 'sent'); }
  });
})(window.SN = window.SN || {});
