/* ==========================================================================
   test/icons.test.js – Icon-System prüfen (ohne Browser)
   (a) Jeder im Code verwendete Icon-Name existiert im Sprite (src/ui/icons.svg);
       alle Pflicht-Icons sind vorhanden; Icon-Felder in model.js/ops.js sind Namen.
   (b) Kein Emoji / Pictogramm im Oberflächentext (alle .js unter src, shell.html, CSS).
   Aufruf: node test/icons.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

/* ---- Ausnahmen: Dateien anderer Arbeitspakete, werden später bereinigt. ----
   Zum Scharfschalten einfach den Eintrag löschen (Präfix-Vergleich auf den relativen Pfad). */
const EMOJI_EXCEPTIONS = [];

/* ---- Pflicht-Icons (Vertrag mit den anderen Ansichten) ---- */
const REQUIRED = ('home tasks chat report menu plus minus clock pin camera mic send escalate forward coffee sos shield check check-circle x users user '
  + 'user-plus user-check user-x phone bell back play pause filter inbox run sun moon auto alert flame truck box pallet cart route clipboard list chart eye eye-off '
  + 'edit trash search settings star heart calendar tag recycle broom wrench thermometer package image lock logout lightbulb snowflake bread apple drop spray medical '
  + 'flag target layers mood-1 mood-2 mood-3 mood-4 dept-trocken dept-getraenke dept-kasse dept-info dept-mopro dept-moon dept-alkohol dept-drogerie dept-fertig '
  + 'dept-konserven dept-obst dept-backshop dept-lager dept-wareneingang dept-leergut').split(' ');

let fails = 0, count = 0;
function ok(cond, text) { count++; if (cond) console.log('  ✓ ' + text); else { fails++; console.log('  ✗ ' + text); } }
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
function walk(dir, exts, out) {
  for (const n of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) walk(f, exts, out);
    else if (exts.some((e) => n.endsWith(e))) out.push(f);
  }
  return out;
}

const sprite = fs.readFileSync(path.join(ROOT, 'src/ui/icons.svg'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'src/shell.html'), 'utf8');
const defined = new Set([...sprite.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
for (const m of shell.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)) defined.add(m[1]);

const jsFiles = walk(path.join(ROOT, 'src'), ['.js'], []);
const textFiles = jsFiles.concat([path.join(ROOT, 'src/shell.html'), path.join(ROOT, 'src/app.css'), path.join(ROOT, 'design/tokens.css'), path.join(ROOT, 'design/components.css')]);

/* ---------- (a) Namen ---------- */
console.log('Sprite');
ok(defined.size >= REQUIRED.length, defined.size + ' Symbole im Sprite');
const missingReq = REQUIRED.filter((n) => !defined.has(n));
ok(!missingReq.length, 'alle Pflicht-Icons vorhanden' + (missingReq.length ? ': fehlt ' + missingReq.join(', ') : ''));
const dup = [...sprite.matchAll(/<symbol id="(i-[a-z0-9-]+)"/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) !== i);
ok(!dup.length, 'keine doppelten Symbol-IDs' + (dup.length ? ': ' + dup.join(', ') : ''));
ok(!/[\u{1F000}-\u{1FAFF}]/u.test(sprite), 'Sprite ohne Emoji');

/** Alle Argumentliteralle eines Aufrufs `icon(`…`)` (Klammern balanciert, Strings beachtet) */
function iconCalls(src) {
  const out = [];
  const re = /\bicon\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 1, q = null;
    const start = i;
    for (; i < src.length && depth; i++) {
      const c = src[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '\'' || c === '"') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const args = src.slice(start, i - 1);
    // Vergleichswerte (=== 'x') und Präfixe für zusammengesetzte Namen ('mood-' + i) sind keine Icon-Namen
    for (const l of args.matchAll(/(===?\s*)?'([a-z0-9][a-z0-9-]*)'/g)) if (!l[1] && !l[2].startsWith('sn-') && !l[2].endsWith('-')) out.push(l[2]);
  }
  return out;
}

console.log('Verwendung im Code');
const used = new Map(); // Name → erste Fundstelle
const use = (name, file) => { if (!used.has(name)) used.set(name, file); };
for (const f of textFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/#i-([a-z0-9-]+)/g)) use(m[1], rel(f));
  for (const m of src.matchAll(/\bicon: '([a-z0-9-]+)'/g)) use(m[1], rel(f));
  for (const m of src.matchAll(/\bic: '([a-z0-9-]+)'/g)) use(m[1], rel(f));
  if (f.endsWith('.js')) {
    for (const n of iconCalls(src)) use(n, rel(f));
    // P.btn(label, act, data, mod, 'icon')
    for (const m of src.matchAll(/\bbtn\('[^']*', '[^']*', (?:\{[^}]*\}|\w+), '[a-z]+', '([a-z0-9-]+)'\)/g)) use(m[1], rel(f));
  }
}
const missing = [...used].filter(([n]) => !defined.has(n));
ok(!missing.length, used.size + ' verwendete Namen existieren im Sprite' + (missing.length ? ' – fehlt: ' + missing.map(([n, f]) => n + ' (' + f + ')').join(', ') : ''));

/* Icon-Felder der Modelle zur Laufzeit lesen (Kern ohne DOM laden) */
function loadCore() {
  const ctx = { window: {}, console, Date, Math, JSON, Object, Array, Set, Map, Promise, setTimeout, clearTimeout, Intl };
  ctx.window.SN = {}; ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['src/core/util.js', 'src/core/model.js', 'src/core/ops.js']) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); } catch (e) { return { err: f + ': ' + e.message }; }
  }
  return { SN: ctx.window.SN };
}
const core = loadCore();
ok(!core.err, 'Kernmodule ohne Browser ladbar' + (core.err ? ' (' + core.err + ')' : ''));
if (core.SN) {
  const M = core.SN.model, O = core.SN.ops;
  const names = [];
  const add = (label, v) => names.push([label, v]);
  for (const d of M.DEPTS) add('DEPT_ICONS[' + d + ']', M.DEPT_ICONS[d]);
  for (const c of M.REPORT_CATS) add('REPORT_CATS.' + c.key, c.icon);
  for (const c of M.CALL_TYPES) add('CALL_TYPES.' + c.key, c.icon);
  add('CALL.standin', M.CALL.standin.icon);
  for (const c of M.SOS_TYPES) add('SOS_TYPES.' + c.key, c.icon);
  for (const c of O.PHOTO_CATS) add('PHOTO_CATS.' + c.key, c.icon);
  for (const k of Object.keys(O.UNIT)) add('UNIT.' + k, O.UNIT[k].icon);
  const bad = names.filter(([, v]) => typeof v !== 'string' || !defined.has(v));
  ok(!bad.length, names.length + ' Icon-Felder in model.js/ops.js sind gültige Sprite-Namen' + (bad.length ? ' – ungültig: ' + bad.map(([l, v]) => l + '=' + v).join(', ') : ''));
  // Jede Abteilung hat ein eigenes Icon
  const depIcons = M.DEPTS.map((d) => M.DEPT_ICONS[d]);
  ok(new Set(depIcons).size === depIcons.length, 'jede Abteilung hat ein eigenes Icon');
}

/* ---------- (b) Emoji ---------- */
console.log('Emoji im Oberflächentext');
// Emoji, Pictogramme, Dingbats, Symbole (✓ ✗ ⚠ ⏰ ☕ ✅ ❌ ▶ ▼ …), Variantenselektor / Zero-Width-Joiner
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2139}\u{FE0F}\u{200D}\u{E0020}-\u{E007F}]/u;
const skipped = [];
const hits = [];
for (const f of textFiles) {
  const r = rel(f);
  if (EMOJI_EXCEPTIONS.some((p) => r.startsWith(p))) { skipped.push(r); continue; }
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const m = EMOJI.exec(line);
    if (m) hits.push(r + ':' + (i + 1) + ' ' + JSON.stringify(m[0]) + ' (U+' + m[0].codePointAt(0).toString(16).toUpperCase() + ')');
  });
}
ok(!hits.length, 'kein Emoji in ' + (textFiles.length - skipped.length) + ' Dateien' + (hits.length ? ':\n      ' + hits.slice(0, 25).join('\n      ') : ''));
if (skipped.length) console.log('  (Ausnahmeliste, bitte später entfernen: ' + EMOJI_EXCEPTIONS.join(', ') + ')');

console.log('\n' + (count - fails) + ' von ' + count + ' Prüfungen grün');
process.exit(fails ? 1 : 0);
