/* Kopiert dist/index.html nach www/ und setzt die Standard-Serveradresse für die App.
   Aufruf: node inject-config.js [https://server]   (oder Umgebungsvariable SN_SERVER) */
'use strict';
const fs = require('fs');
const path = require('path');
const url = process.argv[2] || process.env.SN_SERVER || '';
if (url && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) { console.error('Ungültige Adresse (nur https://host): ' + url); process.exit(1); }
let html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
if (url) html = html.replace('<script>', '<script>window.SN_DEFAULT_SERVER=' + JSON.stringify(url) + ';</script><script>');
fs.mkdirSync(path.join(__dirname, 'www'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'www', 'index.html'), html);
console.log('www/index.html geschrieben' + (url ? ' · Standard-Server: ' + url : ' · ohne Standard-Server'));
