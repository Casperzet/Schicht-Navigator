/* ==========================================================================
   Etikett-Scan für Lieferungs-Touren: jede KKP, Palette, Box wird beim
   Abschluss gescannt (Kamera mit BarcodeDetector, Handeingabe, Demo-Scan).
   Format- und Doppelprüfung; ohne Netz landet der Scan in der Warteschlange.
   ========================================================================== */
(function (SN) {
  'use strict';
  const U = SN.util, O = SN.ops, ui = SN.ui, P = SN.parts, esc = U.esc, icon = ui.icon;
  let cam = null; // {stream, timer}

  function stopCam() {
    if (!cam) return;
    clearInterval(cam.timer);
    cam.stream.getTracks().forEach((t) => t.stop());
    cam = null;
  }
  function body(it, msg, bad) {
    const st = O.scanState(it);
    return '<p class="sn-muted">Einheit für Einheit scannen. Nach der letzten ist die Tour erledigt.</p>'
      + '<ol class="sn-scanlist">' + st.units.map((u) => '<li class="' + (st.doneNos.has(u.no) ? 'is-done' : st.next && st.next.no === u.no ? 'is-next' : '') + '">'
        + (st.doneNos.has(u.no) ? '✓ ' : st.next && st.next.no === u.no ? '▶ ' : '○ ') + esc(O.unitLabel(u)) + (u.depts && u.depts.length ? ' <small>' + esc(u.depts.join(', ')) + '</small>' : '') + '</li>').join('') + '</ol>'
      + (msg ? '<div class="sn-alert sn-alert--' + (bad ? 'warn' : 'info') + ' sn-alert--card" role="alert"><p class="sn-alert__title">' + esc(msg) + '</p></div>' : '')
      + '<video id="scan-video" playsinline muted hidden></video>'
      + '<div class="sn-field"><label class="sn-label" for="scan-code">Etikett-Code</label><input class="sn-input" id="scan-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + esc(O.SCAN_RULE.text) + '" data-enter="scan-go"></div>'
      + '<div class="sn-row" style="gap:8px">' + ('BarcodeDetector' in window ? P.btn('Kamera', 'scan-cam', { id: it.id }, 'secondary', 'camera') : '') + P.btn('Demo-Scan', 'scan-demo', { id: it.id }, 'ghost') + '</div>';
  }
  function open(id, msg, bad) {
    const it = SN.comm.get(id); if (!it) return;
    const st = O.scanState(it);
    ui.sheet('Etikett scannen · ' + st.done + ' von ' + st.total, body(it, msg, bad), P.btn('Senden', 'scan-go', { id }, 'primary', 'send'));
  }
  async function submit(id, code) {
    const r = await O.scanUnit(id, SN.session.id, code);
    if (!r.ok) { U.vibrate(80); open(id, r.reason, true); return; }
    U.vibrate(25);
    if (r.truckDone) { stopCam(); ui.closeSheet(); ui.toast('Lieferung komplett verräumt – Bericht ans System gesendet'); return; }
    if (r.tourDone) { stopCam(); ui.closeSheet(); ui.toast('Tour erledigt – danke!'); return; }
    open(id, '✓ ' + O.unitLabel(r.unit) + ' gescannt · noch ' + r.left + (SN.store.pending ? ' · wird gesendet, sobald Netz da ist' : ''), false);
  }

  ui.on('scan-open', (el) => open(el.dataset.id));
  ui.on('scan-go', (el) => {
    const id = el.dataset.id || (document.querySelector('[data-act="scan-go"][data-id]') || {}).dataset.id;
    const v = ui.sheetVal('scan-code');
    if (!v) return ui.toast('Bitte Code eingeben oder scannen.', 'warn');
    submit(id, v);
  });
  ui.on('scan-demo', (el) => submit(el.dataset.id, 'KL' + String(Date.now()).slice(-9) + Math.floor(Math.random() * 90 + 10)));
  ui.on('scan-cam', async (el) => {
    const id = el.dataset.id;
    try {
      stopCam();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = document.getElementById('scan-video');
      v.hidden = false; v.srcObject = stream; await v.play();
      const det = new window.BarcodeDetector();
      cam = { stream, timer: setInterval(async () => {
        const sheetOpen = document.getElementById('sheet').classList.contains('is-open');
        if (!sheetOpen) return stopCam();
        try { const r = await det.detect(v); if (r && r.length) { stopCam(); submit(id, r[0].rawValue); } } catch (e) { /* weiter versuchen */ }
      }, 300) };
    } catch (e) { ui.toast('Kamera nicht verfügbar – bitte Code eintippen.', 'warn'); }
  });
})(window.SN = window.SN || {});
