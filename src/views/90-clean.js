/* ==========================================================================
   Reinigung: Aufträge aus Meldungen „Reinigung nötig“ – Übernehmen, Sauber.
   Der Melder sieht sofort „Reinigung kommt“ und „Sauber“.
   ========================================================================== */
(function (SN) {
  'use strict';
  const C = SN.comm, ui = SN.ui, P = SN.parts;
  function render({ me, now }) {
    const open = C.inbox(me.id);
    const done = SN.store.list('items').filter((it) => it.kind === 'report' && it.cat === 'clean' && it.state === 'done' && now - (it.doneAt || 0) < SN.util.DAY);
    return P.sec('Offen', open.length) + P.list(open, me, now, P.empty('Alles sauber', 'Neue Aufträge erscheinen hier sofort – mit Ort und Foto.', true))
      + (done.length ? P.sec('Heute erledigt', done.length) + P.list(done, me, now, '', { compact: true }) : '');
  }
  ui.registerView('clean', { label: 'Reinigung', icon: 'tasks', groups: ['clean'], order: 10, render, badge: (me) => C.inbox(me.id).length });
})(window.SN = window.SN || {});
