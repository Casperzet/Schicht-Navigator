#!/usr/bin/env node
/* ==========================================================================
   build.js – fügt alles zu EINER Datei dist/index.html zusammen (ohne Abhängigkeiten)
   --------------------------------------------------------------------------
   Aufruf:  node build.js            → dist/index.html
            node build.js --check    → nur Syntaxprüfung, nichts schreiben

   Reihenfolge CSS (Platzhalter „CSS“ in src/shell.html):
     1. design/tokens.css        (fehlt → Warnung, wird übersprungen)
     2. design/components.css    (fehlt → Warnung, wird übersprungen)
     3. src/app.css

   Reihenfolge JS (Platzhalter „JS“, jedes Modul ist eine IIFE und setzt SN.<modul>):
     1. Kernmodule, feste Liste CORE (siehe unten)
     2. src/ui/*.js      alphabetisch, ohne boot.js (z. B. shell.js = SN.ui)
     3. src/views/**.js  alphabetisch (rekursiv) – neue Ansichten einfach dort
                         ablegen, build.js muss dafür NICHT geändert werden
     4. src/ui/boot.js   immer zuletzt (startet die App)

   Icons: src/ui/icons.svg (nur <symbol>-Elemente) wird, falls vorhanden,
   an <!--SPRITE--> eingesetzt.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const abs = (p) => path.join(ROOT, p);

const CSS = ['design/tokens.css', 'design/components.css', 'src/app.css'];
const OPTIONAL_CSS = ['design/tokens.css', 'design/components.css'];
const CORE = [
  'src/core/util.js',   // SN.util, SN.clock
  'src/core/model.js',  // SN.model
  'src/core/store.js',  // SN.store, SN.session
  'src/core/demo.js',   // SN.demo (Daten nur im Demo-Modus geladen)
  'src/core/comm.js',   // SN.comm
  'src/core/dist.js',   // SN.dist
  'src/core/ai.js',     // SN.ai
  'src/core/ops.js',    // SN.ops (Fotobericht, Lieferung, Wochenplan)
];
const BOOT = 'src/ui/boot.js';

/** Alle .js-Dateien eines Ordners (rekursiv), alphabetisch nach Pfad */
function listJs(dir) {
  const d = abs(dir);
  if (!fs.existsSync(d)) return [];
  const out = [];
  (function walk(p) {
    for (const name of fs.readdirSync(p).sort()) {
      const f = path.join(p, name);
      if (fs.statSync(f).isDirectory()) walk(f);
      else if (name.endsWith('.js')) out.push(rel(f));
    }
  })(d);
  return out.sort();
}

/** Modulliste in Einbau-Reihenfolge */
function moduleList() {
  const ui = listJs('src/ui').filter((f) => f !== BOOT);
  const views = listJs('src/views');
  return CORE.concat(ui, views, fs.existsSync(abs(BOOT)) ? [BOOT] : []);
}

function read(p) { return fs.readFileSync(abs(p), 'utf8'); }

/** Syntax eines Moduls prüfen (ohne es auszuführen) */
function checkSyntax(file, code) {
  try { new vm.Script(code, { filename: file }); } catch (e) {
    const err = new Error('Syntaxfehler in ' + file + ': ' + e.message);
    err.stack = e.stack;
    throw err;
  }
}

function build(opts) {
  opts = opts || {};
  const warn = [];
  const shell = read('src/shell.html');
  if (!shell.includes('/*CSS*/') || !shell.includes('/*JS*/')) throw new Error('src/shell.html braucht die Platzhalter /*CSS*/ und /*JS*/');

  const css = [];
  for (const f of CSS) {
    if (!fs.existsSync(abs(f))) {
      if (OPTIONAL_CSS.includes(f)) { warn.push('Warnung: ' + f + ' fehlt noch – übersprungen.'); continue; }
      throw new Error(f + ' fehlt.');
    }
    css.push('/* ===== ' + f + ' ===== */\n' + read(f).trim());
  }

  const mods = moduleList();
  const js = [];
  for (const f of mods) {
    if (!fs.existsSync(abs(f))) throw new Error('Modul fehlt: ' + f);
    const code = read(f);
    checkSyntax(f, code);
    // </script> im Code würde das Skript-Tag beenden
    // Jedes Modul abgeschirmt: ein Ladefehler stoppt nicht die übrigen Module
    js.push('/* ===== ' + f + ' ===== */\ntry {\n' + code.trim().replace(/<\/script/gi, '<\\/script')
      + '\n} catch (e) { console.error(' + JSON.stringify('[SN] Modul ' + f + ' konnte nicht geladen werden:') + ', e); }');
  }

  let sprite = '';
  if (fs.existsSync(abs('src/ui/icons.svg'))) sprite = read('src/ui/icons.svg').replace(/<\?xml[^>]*>/, '').replace(/<\/?svg[^>]*>/g, '').trim();

  // Ersetzen per Funktion: $-Zeichen im Code bleiben unangetastet
  const html = shell
    .replace('/*CSS*/', () => css.join('\n\n').replace(/<\/style/gi, '<\\/style'))
    .replace('<!--SPRITE-->', () => sprite)
    .replace('/*JS*/', () => '\nwindow.SN = window.SN || {};\n' + js.join('\n\n') + '\n');

  if (!opts.check) {
    fs.mkdirSync(abs('dist'), { recursive: true });
    fs.writeFileSync(abs('dist/index.html'), html);
  }
  return { html, modules: mods, warnings: warn, bytes: Buffer.byteLength(html) };
}

if (require.main === module) {
  try {
    const check = process.argv.includes('--check');
    const r = build({ check });
    r.warnings.forEach((w) => console.warn(w));
    console.log((check ? 'Syntax ok: ' : 'Gebaut: dist/index.html (' + Math.round(r.bytes / 1024) + ' KB), ') + r.modules.length + ' Module');
    for (const m of r.modules) console.log('  · ' + m);
  } catch (e) {
    console.error('Build fehlgeschlagen: ' + e.message);
    process.exit(1);
  }
}

module.exports = { build, moduleList, CORE, CSS };
