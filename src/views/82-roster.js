/* ==========================================================================
   Dienstplan-Scan (Admin): Foto des Dienstplans → KI liest Namen und Zeiten →
   Vorschau „gefunden / nicht gefunden / mehrdeutig“ → nur Bestätigtes übernehmen.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, M = SN.model, O = SN.ops, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  let rows = [];

  function preview() {
    const people = U.sortBy(M.staff(), (e) => e.name);
    const found = rows.filter((r) => r.state === 'found').length;
    return '<p>' + found + ' von ' + rows.length + ' Namen sicher zugeordnet. Nicht gefundene bitte zuordnen oder abwählen.</p>'
      + '<table class="sn-roster"><tbody>' + rows.map((r, i) => '<tr><td><label class="sn-check"><input type="checkbox" id="ro-on-' + i + '"' + (r.state === 'found' ? ' checked' : '') + '></label></td>'
        + '<td><b class="' + (r.state === 'found' ? '' : 'is-miss') + '">' + esc(r.name) + '</b><br><small>' + (r.state === 'found' ? icon('check-circle', 'sn-icon--xs') + ' gefunden' : r.state === 'ambiguous' ? icon('alert', 'sn-icon--xs') + ' mehrdeutig' : icon('x-circle', 'sn-icon--xs') + ' nicht gefunden') + ' · '
        + esc((r.days || []).filter((d) => !d.off).map((d) => d.d + ' ' + d.s + '–' + d.e).join(', ') || 'frei') + '</small>'
        + '<select class="sn-select" id="ro-id-' + i + '" aria-label="Zuordnung für ' + esc(r.name) + '"><option value="">– Person wählen –</option>'
        + (r.candidates.length ? r.candidates : people.map((e) => e.id)).map((id) => '<option value="' + id + '"' + (id === r.id ? ' selected' : '') + '>' + esc(M.name(id)) + '</option>').join('')
        + '</select></td></tr>').join('') + '</tbody></table>';
  }
  ui.onChange('roster-photo', async (el) => {
    const f = el.files && el.files[0]; if (!f) return;
    if (!SN.ai.available().images) return ui.toast('Dienstplan lesen geht nur in der Claude-Ansicht. Pläne einzeln unter „Ich“ bearbeiten.', 'warn');
    ui.toast('Dienstplan wird gelesen …', 'info');
    const img = await U.shrinkImage(f, 1600, 0.75);
    const out = await SN.ai.image('Das Foto zeigt den Dienstplan einer Supermarkt-Filiale: pro Mitarbeiter Name und Arbeitszeiten je Tag. Antworte NUR mit JSON-Array [{"name":"Vorname Nachname","days":[{"d":"Mo","off":false,"s":"HH:MM","e":"HH:MM","p":Pause in Minuten oder null}]}] mit Mo bis So. off=true bei frei, Urlaub oder krank.', [img.blob]);
    if (!Array.isArray(out)) return ui.toast('Dienstplan nicht erkannt. Bitte gerader und näher fotografieren.', 'warn');
    rows = O.rosterPreview(out);
    ui.sheet('Dienstplan prüfen', preview(), P.btn('Bestätigte übernehmen', 'roster-apply', {}, 'primary', 'check'));
  });
  ui.on('roster-apply', async () => {
    const sel = rows.map((r, i) => Object.assign({}, r, { id: ui.sheetVal('ro-on-' + i) ? ui.sheetVal('ro-id-' + i) || null : null })).filter((r) => r.id);
    if (!sel.length) return ui.toast('Keine Zeile ausgewählt.', 'warn');
    const r = await O.applyRoster(SN.session.id, sel);
    ui.result(r, r.count + ' Wochenpläne übernommen'); ui.closeSheet(); rows = [];
  });
  SN.rosterTest = (data) => { rows = O.rosterPreview(data); ui.sheet('Dienstplan prüfen', preview(), P.btn('Bestätigte übernehmen', 'roster-apply', {}, 'primary', 'check')); };
})(window.SN = window.SN || {});
