/* ==========================================================================
   Chat (M6): 1:1, Abteilungskanal, Kanal „Leitung“. Lesehaken, Schnellantworten,
   Übersetzen-Knopf an jeder Nachricht, Direkt-Knöpfe zu den Admins.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  const tr = {};
  let openTid = null;

  function threadView(tid, me, now, draft) {
    const msgs = C.messages(tid);
    const info = C.threadInfo(tid);
    const quick = M.isLead(me) ? ['Danke!', 'Bitte zur Info kommen', 'Pause jetzt möglich', 'Komm bitte zur Rampe'] : ['Verstanden', 'Ich komme', 'Brauche Hilfe', 'Bin in der Pause'];
    let lastDay = '';
    const canTr = SN.ai.available().text;
    const body = msgs.map((m) => {
      const out = m.by === me.id;
      const day = U.fmt.dayKey(m.at);
      const sep = day !== lastDay ? '<p class="sn-chat__day">' + esc(U.fmt.date(m.at)) + '</p>' : '';
      lastDay = day;
      return sep + '<div class="sn-bubble' + (out ? ' sn-bubble--out' : '') + '">'
        + (!out && info.type !== 'dm' ? '<p class="sn-bubble__author">' + esc(M.name(m.by)) + '</p>' : '')
        + (m.text ? '<p class="sn-bubble__text">' + esc(m.text) + '</p>' : '')
        + (m.photo ? '<img alt="Foto" src="' + esc(m.photo) + '" style="max-width:100%;border-radius:8px">' : '')
        + (tr[m.id] ? '<p class="sn-translation">🌐 ' + esc(tr[m.id]) + '</p>' : '')
        + '<div class="sn-bubble__meta">' + U.fmt.time(m.at)
        + (out ? ' <span class="sn-receipt sn-receipt--' + C.receipt(tid, m) + '">' + (C.receipt(tid, m) === 'read' ? 'gelesen' : 'gesendet') + '</span>' : '')
        + (!out && canTr && m.text && !tr[m.id] ? ' <button type="button" class="sn-link" data-act="chat-tr" data-tid="' + esc(tid) + '" data-id="' + m.id + '">Übersetzen</button>' : '')
        + '</div></div>';
    }).join('');
    return '<div class="sn-row sn-row--between"><button type="button" class="sn-btn sn-btn--ghost" data-act="chat-back">' + icon('back') + '<span>Chats</span></button><h2 class="sn-section-title" style="margin:0">' + esc(C.threadTitle(tid, me.id)) + '</h2></div>'
      + (info.type === 'dm' ? '<p class="sn-muted sn-small">🔒 Nur ihr beide seht diesen Chat.</p>' : info.type === 'lead' ? '<p class="sn-muted sn-small">Kanal für Schichtleitung und höher – Abstimmung ohne WhatsApp.</p>' : '')
      + '<div class="sn-chat" id="chat-list">' + (body || P.empty('Noch keine Nachrichten', 'Schreib die erste oder tippe eine Schnellantwort.')) + '</div>'
      + '<div class="sn-chips">' + quick.map((q) => '<button type="button" class="sn-chip sn-chip--outline" data-act="chat-quick" data-x="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>'
      + '<div class="sn-composer"><label class="sn-sr-only" for="chat-in">Nachricht</label><input class="sn-input" id="chat-in" autocomplete="off" placeholder="Nachricht" data-enter="chat-send" value="' + esc(draft || '') + '">'
      + (SN.ai.dictation.available() ? '<button type="button" class="sn-btn sn-btn--icon" data-act="mic" data-target="chat-in">' + icon('mic') + '<span>Sprechen</span></button>' : '')
      + '<button type="button" class="sn-btn sn-btn--primary sn-btn--icon" data-act="chat-send">' + icon('send') + '<span>Senden</span></button></div>';
  }

  function listView(me) {
    const th = C.threadsFor(me.id);
    const admins = M.admins().map(M.emp).filter(Boolean);
    return '<h2 class="sn-section-title">Direkt zu den Admins</h2><div class="sn-chips">' + admins.filter((a) => a.id !== me.id).map((a) => '<button type="button" class="sn-chip sn-chip--solid" data-act="chat-open" data-tid="' + esc(C.threadId.dm(me.id, a.id)) + '">' + esc(a.name) + (M.adminOnDuty(SN.clock.now()) === a.id ? ' · vom Dienst' : '') + '</button>').join('') + '</div>'
      + '<button type="button" class="sn-btn sn-btn--secondary sn-btn--block" data-act="chat-new">' + icon('plus') + '<span>Neuer Chat mit Kolleg/in</span></button>'
      + P.sec('Chats', th.length) + '<ul class="sn-list">' + th.map((t) => {
        const last = C.messages(t.id).slice(-1)[0];
        return '<li class="sn-list__item"><button type="button" class="sn-card sn-card--tap" data-act="chat-open" data-tid="' + esc(t.id) + '" style="width:100%;text-align:left;padding:12px"><span class="sn-list__body"><span class="sn-list__title">' + (t.type === 'lead' ? '🛡 ' : t.type === 'dept' ? '# ' : '') + esc(t.title) + (t.unread ? ' <span class="sn-badge">' + t.unread + '</span>' : '') + '</span>'
          + '<span class="sn-list__sub">' + (last ? esc(M.first(last.by) + ': ' + (last.text || '📷 Foto')) + ' · ' + esc(U.fmt.ago(last.at)) : 'Noch keine Nachrichten') + '</span></span></button></li>';
      }).join('') + '</ul>';
  }

  function render({ me, now, params }) {
    if (params.tid && params.tid !== openTid) { openTid = params.tid; params.tid = null; }
    if (openTid && !C.canUseThread(openTid, me.id)) openTid = null;
    return openTid ? threadView(openTid, me, now, params.draft) : listView(me);
  }
  function mount(root, { me }) {
    if (!openTid) return;
    const l = root.querySelector('#chat-list');
    if (l) root.scrollTop = root.scrollHeight;
    if (C.unread(openTid, me.id)) C.chatRead(openTid, me.id);
    ui.params.draft = '';
  }

  ui.registerView('chat', {
    label: 'Chat', icon: 'chat', groups: ['emp', 'lead', 'admin', 'clean'], order: 40, render, mount,
    badge: (me) => C.totalUnread(me.id),
  });
  ui.on('chat-open', (el) => { openTid = el.dataset.tid; ui.go('chat', {}); });
  ui.on('chat-back', () => { openTid = null; ui.render(false); });
  async function send(text) {
    const me = SN.session.me();
    const r = await C.chatSend(openTid, me.id, { text, lang: me.lang });
    if (r.ok) { const i = document.getElementById('chat-in'); if (i) { i.value = ''; } ui.render(true); const n = document.getElementById('chat-in'); if (n) n.focus(); }
    else ui.result(r);
  }
  ui.on('chat-send', () => { const v = String(ui.sheetVal('chat-in') || '').trim(); if (v) send(v); });
  ui.on('chat-quick', (el) => send(el.dataset.x));
  ui.on('chat-tr', async (el) => {
    const m = C.messages(el.dataset.tid).find((x) => x.id === el.dataset.id); if (!m) return;
    el.disabled = true; el.textContent = 'Übersetze …';
    const r = await SN.ai.translate(m.text, SN.session.me().lang || 'de');
    if (!r) return ui.toast('Übersetzung nur in Claude verfügbar.', 'warn');
    tr[m.id] = r.text; ui.render(true);
  });
  ui.on('chat-new', () => {
    const me = SN.session.me();
    ui.sheet('Neuer Chat', '<div class="sn-field"><label class="sn-label" for="cn-p">Mit wem?</label><select class="sn-select" id="cn-p">'
      + U.sortBy(M.staff().filter((e) => e.id !== me.id), (e) => e.name).map((e) => '<option value="' + e.id + '">' + esc(e.name + ' · ' + M.role(e).label + (e.dept ? ' · ' + e.dept : '')) + '</option>').join('') + '</select></div>',
    '<button type="button" class="sn-btn sn-btn--primary sn-btn--block" data-act="chat-new-go">Chat öffnen</button>');
  });
  ui.on('chat-new-go', () => { openTid = C.threadId.dm(SN.session.id, ui.sheetVal('cn-p')); ui.closeSheet(); ui.go('chat', {}); });
  SN.chatOpen = (tid) => { openTid = tid; ui.go('chat', {}); };
})(window.SN = window.SN || {});
