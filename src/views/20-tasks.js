/* ==========================================================================
   Aufträge (M3): Meine / Frei / Erledigt, Filter Abteilung, Dringend zuerst
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, C = SN.comm, ui = SN.ui, P = SN.parts, esc = U.esc;

  function render({ me, now, sub }) {
    const f = sub.taskTab || 'mine';
    const mine = C.myTasks(me.id);
    const dept = sub.taskDept || '';
    const free = C.freeTasks(dept || null);
    const done = C.doneTasks(me.id).filter((t) => now - (t.doneAt || 0) < U.DAY);
    const seg = [['mine', 'Meine', mine.length], ['free', 'Frei', C.freeTasks().length], ['done', 'Erledigt', done.length]];
    let h = '<div class="sn-segment sn-segment--sticky" role="tablist">' + seg.map(([k, l, n]) => '<button type="button" role="tab" class="sn-segment__tab" data-act="task-tab" data-k="' + k + '" aria-selected="' + (f === k) + '">' + l + (n ? ' <span class="sn-badge sn-badge--neutral">' + n + '</span>' : '') + '</button>').join('') + '</div>';
    const lim = SN.dist.limitOf(me, now), load = SN.dist.loadOf(me.id);
    if (lim) h += '<div class="sn-progress" style="--p:' + Math.min(100, Math.round(load / lim * 100)) + '" role="img" aria-label="Auslastung"><span class="sn-progress__bar"></span></div><p class="sn-muted sn-small">Verplant ' + U.fmt.dur(load) + ' von ' + U.fmt.dur(lim) + ' (20 % bleiben für Kunden). Über das Limit wird nie zugeteilt.</p>';
    if (f === 'free') {
      h += '<div class="sn-field"><label class="sn-label" for="task-dept">Abteilung</label><select class="sn-select" id="task-dept" data-change="task-dept"><option value="">Alle Abteilungen</option>'
        + M.DEPTS.map((d) => '<option value="' + esc(d) + '"' + (d === dept ? ' selected' : '') + '>' + esc((M.DEPT_ICONS[d] || '') + ' ' + d) + '</option>').join('') + '</select></div>';
    }
    const list = f === 'mine' ? mine : f === 'free' ? free : done;
    const urg = list.filter((t) => t.u), rest = list.filter((t) => !t.u);
    if (!list.length) return h + P.empty(f === 'mine' ? 'Keine Aufträge für dich' : f === 'free' ? 'Keine freien Aufträge' : 'Heute noch nichts erledigt', f === 'mine' ? 'Schau bei „Frei“ vorbei.' : '', f !== 'done');
    if (urg.length) h += P.sec('🔥 Dringend', urg.length) + P.list(urg, me, now);
    if (rest.length) h += P.sec(f === 'done' ? 'Erledigt heute' : 'Nach Frist', rest.length) + P.list(rest, me, now);
    return h;
  }

  ui.registerView('tasks', {
    label: 'Aufträge', icon: 'tasks', groups: ['emp', 'lead'], order: 20, render, show: (me) => !M.isLead(me),
    badge: (me) => { const l = C.myTasks(me.id); return l.length ? { n: l.length, urgent: l.some((t) => t.u) } : 0; },
  });
  ui.on('task-tab', (el) => ui.sub('taskTab', el.dataset.k));
  ui.onChange('task-dept', (el) => ui.sub('taskDept', el.value));
})(window.SN = window.SN || {});
