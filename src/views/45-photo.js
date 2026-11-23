/* ==========================================================================
   Foto nach oben – entlang der Hierarchie, statt WhatsApp:
   Mitarbeitende → zuständige Schichtleitung · Schichtleitung → Filialleitung (oder Admin, Teamleitung).
   Kamera zuerst (1 Tap) → Empfänger (Standard: eine Stufe höher) → Kategorie → optional Text → Senden.
   Empfänger sehen einen Foto-Feed (Ungesehenes zuerst) mit Schnellantworten; wird ein Foto nicht gesehen,
   rückt es automatisch eine Stufe höher (Eskalation).
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, O = SN.ops, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  let shots = [];        // [{url, busy}]
  let cat = 'order';
  let target = null;     // gewählter Empfänger-Schlüssel (null = Standard)

  const isBoss = (me) => M.isAdmin(me);
  const unseenFor = (me) => SN.store.list('items').filter((it) => it.kind === 'photo' && C.isRecipient(it, me.id) && !(it.seen || {})[me.id]);

  function photoCard(it, me, now) {
    const seenBy = Object.keys(it.seen || {}).filter((id) => id !== it.from);
    const replies = (it.thread || []).filter((t) => t.type !== 'fwd');
    const fresh = C.isRecipient(it, me.id) && !(it.seen || {})[me.id];
    return '<article class="sn-card sn-photo-card' + (it.u ? ' sn-card--urgent' : '') + (fresh ? ' is-new' : '') + '" data-item="' + it.id + '">'
      + (it.u ? '<div class="sn-card__flag">' + ui.urgent() + '</div>' : '')
      + (it.photosRemoved && !(it.photos || []).length ? '<p class="sn-photo-card__gone">' + icon('trash') + ' ' + U.fmt.count(it.photosRemoved, 'Foto', 'Fotos') + ' nach Löschfrist entfernt (Datenschutz)</p>' : '')
      + '<div class="sn-photo-card__media" data-act="ph-open" data-id="' + it.id + '">' + (it.photos || []).slice(0, 4).map((p, i) => '<img alt="Fotobericht ' + (i + 1) + '" loading="lazy" src="' + esc(p) + '">').join('') + (fresh ? '<span class="sn-photo-card__new">Neu</span>' : '') + '</div>'
      + '<div class="sn-photo-card__body"><div class="sn-card__head"><h3 class="sn-card__title">' + icon((O.PHOTO_CAT[it.cat] || {}).icon || 'camera', 'sn-icon--sm') + ' ' + esc(it.title) + '</h3>'
      + '<span class="sn-receipt sn-receipt--' + (replies.length ? 'ack' : seenBy.length ? 'read' : 'sent') + '">' + (replies.length ? 'beantwortet' : seenBy.length ? 'gesehen' : 'gesendet') + '</span></div>'
      + '<p class="sn-muted sn-small">' + esc((it.from === me.id ? 'Du' : M.name(it.from)) + ' · ' + (it.dept || '') + ' · ' + U.fmt.when(it.createdAt) + (it.from === me.id ? ' · an ' + M.labelFor(C.recipients(it)) : '')) + '</p>'
      + (it.body ? '<p class="sn-card__body">' + esc(it.body) + '</p>' : '')
      + replies.map((r) => '<p class="sn-photo-card__reply"><b>' + esc(M.first(r.by)) + ':</b> ' + esc(r.text) + ' <small>' + U.fmt.time(r.at) + '</small></p>').join('')
      + (C.isRecipient(it, me.id) ? '<div class="sn-chips">' + O.PHOTO_REPLIES.map((q) => '<button type="button" class="sn-chip sn-chip--outline" data-act="ph-reply" data-id="' + it.id + '" data-x="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' : '')
      + '</div></article>';
  }

  function leadView({ me, now }) {
    const mine = C.sentBy(me.id, 'photo').filter((it) => now - it.createdAt < 2 * U.DAY);
    const today = mine.filter((it) => U.fmt.dayKey(it.createdAt) === U.fmt.dayKey(now));
    const opts = O.photoTargetOptions(me, now);
    const cur = opts.find((o) => o.key === target) || opts[0] || { key: 'fl', label: 'Filialleitung', ids: [] };
    const to = cur.label + (cur.ids.length <= 2 ? ' (' + cur.ids.map(M.first).join(', ') + ')' : '');
    let h = (opts.length > 1 ? '<div class="sn-chips sn-chips--scroll" role="radiogroup" aria-label="Empfänger"><span class="sn-muted sn-small" style="align-self:center">An:</span>' + opts.map((o) => '<button type="button" role="radio" aria-checked="' + (o.key === cur.key) + '" class="sn-chip ' + (o.key === cur.key ? 'sn-chip--solid' : 'sn-chip--outline') + '" data-act="ph-to" data-k="' + o.key + '">' + icon('user-check') + esc(o.label) + '</button>').join('') + '</div>' : '')
      + '<section class="sn-shoot">'
      + (shots.length
        ? '<div class="sn-shoot__strip">' + shots.map((s, i) => '<figure><img alt="Aufnahme ' + (i + 1) + '" src="' + esc(s.url) + '"><button type="button" aria-label="Foto entfernen" data-act="ph-del" data-i="' + i + '">' + icon('x') + '</button></figure>').join('')
          + (shots.length < 4 ? '<label class="sn-shoot__more" for="ph-cam">' + icon('plus') + '<span>Noch ein Foto</span></label>' : '') + '</div>'
        : '<label class="sn-shoot__cam" for="ph-cam"><span class="sn-shoot__lens">' + icon('camera', 'sn-icon--lg') + '</span><b>Foto aufnehmen</b><small>Geht direkt an ' + esc(to) + '</small></label>')
      + '<input type="file" id="ph-cam" accept="image/*" capture="environment" hidden data-change="ph-shot">'
      + '</section>';
    if (shots.length) {
      h += '<div class="sn-chips sn-chips--scroll" role="radiogroup" aria-label="Kategorie">' + O.PHOTO_CATS.map((c) => '<button type="button" role="radio" aria-checked="' + (c.key === cat) + '" class="sn-chip ' + (c.key === cat ? 'sn-chip--solid' : 'sn-chip--outline') + '" data-act="ph-cat" data-k="' + c.key + '">' + icon(c.icon) + esc(c.label) + '</button>').join('') + '</div>'
        + '<div class="sn-field"><label class="sn-label" for="ph-text">Kurz dazu (optional)</label><input class="sn-input" id="ph-text" placeholder="z. B. Aktion Gang 7 steht, 2 Paletten offen"></div>'
        + '<div class="sn-row" style="gap:8px"><label class="sn-check"><input type="checkbox" id="ph-u"><span class="sn-inline">' + ui.urgent() + '</span></label>' + (cur.key !== 'admin' && opts.some((o) => o.key === 'admin') ? '<label class="sn-check"><input type="checkbox" id="ph-admin">auch Admin vom Dienst</label>' : '') + '</div>'
        + '<button type="button" class="sn-btn sn-btn--primary sn-btn--lg sn-btn--block" data-act="ph-send" id="ph-send">' + icon('send') + '<span>An ' + esc(to) + ' senden</span></button>';
    }
    h += '<div class="sn-row sn-row--between"><h2 class="sn-section-title">Heute gesendet</h2><span class="sn-chip sn-chip--outline">' + U.fmt.count(today.length, 'Foto', 'Fotos') + '</span></div>'
      + (mine.length ? mine.map((it) => photoCard(it, me, now)).join('') : P.empty('Noch kein Foto gesendet', 'Ein Foto sagt deinem Vorgesetzten mehr als jede Nachricht – ohne WhatsApp.'));
    return h;
  }

  function bossView({ me, now, sub }) {
    const all = U.sortBy(SN.store.list('items').filter((it) => it.kind === 'photo' && (C.isRecipient(it, me.id) || C.involved(it).includes(me.id) || M.isAdmin(me)) && it.from !== me.id && now - it.createdAt < 3 * U.DAY), (it) => -it.createdAt);
    const f = sub.phF || 'new';
    const unseen = all.filter((it) => !(it.seen || {})[me.id] && it.from !== me.id);
    const list = f === 'new' ? unseen : all;
    return '<div class="sn-segment sn-segment--sticky" role="tablist"><button type="button" role="tab" class="sn-segment__tab" data-act="ph-f" data-k="new" aria-selected="' + (f === 'new') + '">Ungesehen' + (unseen.length ? ' <span class="sn-badge">' + unseen.length + '</span>' : '') + '</button>'
      + '<button type="button" role="tab" class="sn-segment__tab" data-act="ph-f" data-k="all" aria-selected="' + (f === 'all') + '">Alle (' + all.length + ')</button></div>'
      + (list.length ? list.map((it) => photoCard(it, me, now)).join('') : P.empty(f === 'new' ? 'Alles gesehen' : 'Noch keine Fotos', 'Neue Fotos deines Teams erscheinen hier sofort.', f === 'new'));
  }

  // Schichtleitung: zwei Reiter „Senden“ (an Vorgesetzte) und „Eingang“ (von Mitarbeitenden); Admin: Eingang; Mitarbeitende: nur Senden
  function render(ctx) {
    const { me, sub } = ctx;
    if (isBoss(me)) return bossView(ctx);
    if (!M.isLead(me)) return leadView(ctx);
    const inc = unseenFor(me).length, t = sub.phT || (inc ? 'in' : 'out');
    return '<div class="sn-segment" role="tablist"><button type="button" role="tab" class="sn-segment__tab" data-act="ph-t" data-k="out" aria-selected="' + (t === 'out') + '">An Vorgesetzte</button>'
      + '<button type="button" role="tab" class="sn-segment__tab" data-act="ph-t" data-k="in" aria-selected="' + (t === 'in') + '">Von Mitarbeitenden' + (inc ? ' <span class="sn-badge">' + inc + '</span>' : '') + '</button></div>'
      + (t === 'in' ? bossView(ctx) : leadView(ctx));
  }
  const badge = (me) => (isBoss(me) || M.isLead(me) ? unseenFor(me).length : 0) + (!isBoss(me) ? C.sentBy(me.id, 'photo').filter((it) => (it.thread || []).some((t) => t.by !== me.id && t.at > (it.readReplies || 0))).length : 0);
  ui.registerView('photo', { label: 'Foto', icon: 'camera', groups: ['emp', 'lead', 'admin'], order: 15, render, badge, show: (me) => M.isLead(me) });
  SN.photoBadge = badge;

  ui.onChange('ph-shot', async (el) => {
    const f = el.files && el.files[0]; if (!f) return;
    const img = await U.shrinkImage(f, 1280, 0.72);
    const i = shots.push({ url: img.dataUrl, busy: true }) - 1;
    ui.render(true);
    try { shots[i].url = await SN.store.upload(img.blob, img.dataUrl); } catch (e) { ui.toast('Foto konnte nicht hochgeladen werden – wird im Bericht mitgeschickt.', 'warn'); }
    shots[i].busy = false;
  });
  ui.on('ph-to', (el) => { target = el.dataset.k; ui.render(true); });
  ui.on('ph-t', (el) => ui.sub('phT', el.dataset.k));
  ui.on('ph-del', (el) => { shots.splice(+el.dataset.i, 1); ui.render(true); });
  ui.on('ph-cat', (el) => { cat = el.dataset.k; ui.render(true); });
  ui.on('ph-f', (el) => ui.sub('phF', el.dataset.k));
  ui.on('ph-send', async (el) => {
    if (shots.some((s) => s.busy)) return ui.toast('Foto wird noch hochgeladen …', 'info');
    el.disabled = true;
    const me = SN.session.me();
    const txt = String(ui.sheetVal('ph-text') || '').trim();
    let body = txt, orig;
    if (txt && SN.ai.available().text) { const t = await SN.ai.toGerman(txt); if (t && t.from && t.from !== 'de') { body = t.text; orig = txt; } }
    const base = { cat, dept: M.deptOf(me, SN.clock.now()), body, orig, photos: shots.map((s) => s.url), u: !!ui.sheetVal('ph-u') };
    const r = await O.photoReport(me.id, Object.assign({ to: target || undefined }, base));
    if (r.ok && ui.sheetVal('ph-admin')) await O.photoReport(me.id, Object.assign({ to: 'admin' }, base));
    if (ui.result(r, 'Gesendet – du siehst, wann es gesehen wird')) { shots = []; cat = 'order'; target = null; ui.render(false); } else el.disabled = false;
  });
  ui.on('ph-reply', async (el) => {
    const me = SN.session.me();
    await C.markSeen(el.dataset.id, me.id);
    ui.result(await C.reply(el.dataset.id, me.id, el.dataset.x), 'Antwort gesendet');
  });
  ui.on('ph-open', async (el) => {
    const it = C.get(el.dataset.id); if (!it) return;
    const me = SN.session.me();
    if (it.from === me.id && (it.thread || []).length) await SN.store.patch('items', it.id, { readReplies: SN.clock.now() });
    else await C.markSeen(it.id, me.id);
    ui.sheet(it.title, '<div class="sn-photo-full">' + (it.photos || []).map((p) => '<img alt="Foto" src="' + esc(p) + '">').join('') + '</div>' + (it.body ? '<p>' + esc(it.body) + '</p>' : '')
      + '<p class="sn-muted sn-small">' + esc(M.name(it.from) + ' · ' + U.fmt.when(it.createdAt)) + '</p>'
      + '<div class="sn-field"><label class="sn-label" for="it-reply">Antwort</label><textarea class="sn-textarea" id="it-reply" rows="2"></textarea></div>',
    P.btn('Antwort senden', 'it-reply', { id: it.id }, 'primary', 'send'));
  });
  SN.photoOpen = () => ui.go('photo', {});
})(window.SN = window.SN || {});
