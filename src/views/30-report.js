/* ==========================================================================
   Melden (M4) – von unten nach oben in ≤ 3 Taps:
   1. Kategorie antippen  2. (optional) Foto/Text  3. Senden
   Die App leitet automatisch an die zuständige Person weiter und zeigt dem
   Melder jeden Schritt (gesehen, übernommen, eskaliert, erledigt).
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  let photos = [];

  function whoGets(cat, dept, me, now) {
    const ids = M.responsibleFor(cat, dept, M.currentShift(now) || me.sh, now).filter((id) => id !== me.id);
    return ids.length ? M.labelFor(ids) + (ids.length <= 3 ? ' (' + ids.map(M.first).join(', ') + ')' : '') : 'Admin vom Dienst';
  }

  function render({ me, now, sub }) {
    const cat = sub.repCat || null;
    const c = cat ? M.CAT[cat] : null;
    const dept = sub.repDept || (c && c.dept) || M.deptOf(me, now) || 'Info';
    let h = '<p class="sn-muted">Was ist los? Antippen – die richtige Person bekommt es sofort und du siehst, wer reagiert.</p>'
      + '<div class="sn-cats">' + M.REPORT_CATS.map((x) => '<button type="button" class="sn-cat" data-act="rep-cat" data-k="' + x.key + '" aria-pressed="' + (x.key === cat) + '"><span aria-hidden="true">' + x.icon + '</span>' + esc(x.label) + '</button>').join('') + '</div>'
      + '<div class="sn-quicklinks">' + P.btn('Restware erfassen', 'rest-new', {}, 'secondary', 'plus') + P.btn('Bruch erfassen', 'br-new', {}, 'secondary', 'plus') + '</div>';
    if (c) {
      h += '<section class="sn-card" style="padding:14px;margin-top:12px" id="rep-form"><h2 class="sn-section-title" style="margin-top:0">' + c.icon + ' ' + esc(c.label) + '</h2>'
        + '<p class="sn-small">Geht an: <b>' + esc(whoGets(c.key, dept, me, now)) + '</b> · eskaliert nach ' + U.fmt.dur(M.settings().deadlines[c.dl] || 15) + ' ohne Reaktion</p>'
        + (c.dept ? '' : '<div class="sn-field"><label class="sn-label" for="rep-dept">Abteilung</label><select class="sn-select" id="rep-dept" data-change="rep-dept">' + M.DEPTS.map((d) => '<option' + (d === dept ? ' selected' : '') + ' value="' + esc(d) + '">' + esc((M.DEPT_ICONS[d] || '') + ' ' + d) + '</option>').join('') + '</select></div>')
        + '<div class="sn-row"><label class="sn-btn sn-btn--secondary sn-btn--icon" for="rep-photo">' + icon('camera') + '<span>Foto (' + photos.length + '/4)</span></label><input type="file" id="rep-photo" accept="image/*" capture="environment" multiple hidden data-change="rep-photo">'
        + (SN.ai.dictation.available() ? '<button type="button" class="sn-btn sn-btn--secondary sn-btn--icon" data-act="mic" data-target="rep-text">' + icon('mic') + '<span>Sprechen</span></button>' : '') + '</div>'
        + '<div class="sn-photos">' + photos.map((p, i) => '<img alt="Foto ' + (i + 1) + '" src="' + esc(p) + '">').join('') + '</div>'
        + '<div class="sn-field"><label class="sn-label" for="rep-text">Kurz beschreiben (optional, jede Sprache)</label><textarea class="sn-textarea" id="rep-text" rows="2" placeholder="z. B. Gang 7, oberes Regal"></textarea><p class="sn-field__help">Wird automatisch ins Deutsche übersetzt, das Original bleibt erhalten.</p></div>'
        + '<label class="sn-check"><input type="checkbox" id="rep-u"' + (['defect', 'safety', 'absence'].includes(c.key) ? ' checked' : '') + '>🔥 Dringend</label>'
        + '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" data-act="rep-send" id="rep-send">' + icon('send') + '<span>Jetzt melden</span></button></section>';
    }
    const mine = C.sentBy(me.id).filter((it) => it.kind === 'report' || it.kind === 'absence');
    const open = mine.filter((it) => !C.isFinal(it)), closed = mine.filter((it) => C.isFinal(it)).slice(0, 5);
    h += P.sec('Meine Meldungen', open.length || '') + (open.length ? P.list(open, me, now, '', { showTimeline: true }) : P.empty('Keine offenen Meldungen', 'Du siehst hier jeden Schritt deiner Meldung.', true));
    if (closed.length) h += P.sec('Zuletzt erledigt') + P.list(closed, me, now, '', { compact: true });
    return h;
  }

  ui.registerView('report', { label: 'Melden', icon: 'report', groups: ['emp', 'lead', 'admin'], order: 30, render, show: (me) => !M.isLead(me) });

  ui.on('rep-cat', (el) => { photos = []; ui.sub('repDept', null); ui.sub('repCat', el.dataset.k); setTimeout(() => { const f = document.getElementById('rep-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); });
  ui.onChange('rep-dept', (el) => ui.sub('repDept', el.value));
  ui.onChange('rep-photo', async (el) => {
    const add = await P.readPhotos(el, 4 - photos.length);
    photos = photos.concat(add).slice(0, 4); ui.render(true);
  });
  ui.on('rep-send', async (el) => {
    const me = SN.session.me(), sub = ui.sub;
    const cat = sub('repCat'); if (!cat) return;
    const txt = String(ui.sheetVal('rep-text') || '').trim();
    el.disabled = true; el.querySelector('span').textContent = 'Wird gesendet …';
    let body = txt, orig = '';
    if (txt && SN.ai.available().text) {
      const t = await SN.ai.toGerman(txt);
      if (t && t.from && t.from !== 'de') { body = t.text; orig = txt; }
    }
    const r = await C.report(me.id, { cat, dept: ui.sheetVal('rep-dept') || undefined, body, orig: orig || undefined, photos: photos.slice(), u: !!ui.sheetVal('rep-u') });
    if (ui.result(r, 'Gemeldet – du siehst hier, wer reagiert')) { photos = []; ui.sub('repCat', null); }
    else { el.disabled = false; }
  });

  /* ---------- Diktat für beliebige Textfelder ------------------------------ */
  ui.on('mic', (el) => {
    const t = document.getElementById(el.dataset.target);
    if (!t) return;
    if (SN.ai.dictation.active()) { SN.ai.dictation.stop(); return; }
    const base = t.value;
    SN.ai.dictation.start({
      onPartial: (x) => { t.value = (base + ' ' + x).trim(); },
      onFinal: (x) => { t.value = (base + ' ' + x).trim(); },
      onState: (s) => { el.classList.toggle('is-active', s === 'listening'); el.querySelector('span').textContent = s === 'listening' ? 'Stopp' : 'Sprechen'; },
    }).then((ok) => { if (!ok) ui.toast('Sprechen ist hier nicht verfügbar. Bitte tippen.', 'warn'); });
  });
})(window.SN = window.SN || {});
