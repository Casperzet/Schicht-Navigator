#!/usr/bin/env node
/* ==========================================================================
   Schicht-Navigator Server – gemeinsame Daten für alle Geräte der Filiale
   --------------------------------------------------------------------------
   Ohne Abhängigkeiten (nur Node ≥ 18). Speichert Dokumente je Collection als
   JSON-Datei, Fotos als Dateien, und verteilt jede Änderung sofort per
   Server-Sent Events (SSE) an alle verbundenen Geräte.

   Umgebungsvariablen:
     PORT          Port (Standard 8080)
     DATA_DIR      Datenordner (Standard ./data)
     FILIAL_KEY    Filial-Schlüssel, den jedes Gerät einmal eingibt (Pflicht im Betrieb)
     ALLOW_ORIGIN  CORS-Herkunft (Standard *; die App sendet den Schlüssel im Header)
     MEDIA_DAYS    Fotos nach so vielen Tagen löschen (Standard 30, 0 = nie) – Datenschutz

   API (alle /api-Aufrufe brauchen  Authorization: Bearer <FILIAL_KEY>,
   SSE und Fotos alternativ ?key=<FILIAL_KEY>):
     GET    /api/health                 → {ok, name, rev}         (ohne Schlüssel)
     GET    /api/snapshot               → {rev, cols:{col:[doc]}}
     GET    /api/events                 → SSE: data {rev, col, id, doc|null}
     PUT    /api/doc/:col/:id           Dokument ersetzen
     PATCH  /api/doc/:col/:id           tief mergen (legt an, falls neu)
     DELETE /api/doc/:col/:id
     POST   /api/media                  Rohbild (image/jpeg|png|webp, ≤ 6 MB) → {id, url}
     GET    /media/:id                  Foto
     GET    /                           Web-App (dist/index.html)
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const KEY = process.env.FILIAL_KEY || '';
const ORIGIN = process.env.ALLOW_ORIGIN || '*';
const APP = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, '..', 'dist', 'index.html')].find((f) => fs.existsSync(f));
const COLS = ['staff', 'items', 'chats', 'templates', 'plans', 'settings', 'mood', 'trucks', 'goods', 'rest', 'breakage', 'log', 'reports'];
const MAX_JSON = 512 * 1024, MAX_MEDIA = 6 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

if (!KEY) console.warn('[SN] WARNUNG: FILIAL_KEY ist nicht gesetzt – jeder mit der Adresse kann Daten lesen und schreiben. Nur für Tests!');
fs.mkdirSync(path.join(DATA, 'media'), { recursive: true });

/* ---------- Speicher -------------------------------------------------- */
const db = {};          // col → {id: doc}
let rev = 0;
for (const c of COLS) {
  const f = path.join(DATA, c + '.json');
  try { db[c] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { db[c] = {}; }
}
try { rev = JSON.parse(fs.readFileSync(path.join(DATA, 'meta.json'), 'utf8')).rev || 0; } catch (e) { /* neu */ }

const dirty = new Set();
let saveT = null;
function save(col) {
  dirty.add(col);
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    for (const c of dirty) {
      const f = path.join(DATA, c + '.json');
      fs.writeFileSync(f + '.tmp', JSON.stringify(db[c]));
      fs.renameSync(f + '.tmp', f); // atomar: nie halbe Dateien
    }
    dirty.clear();
    fs.writeFileSync(path.join(DATA, 'meta.json'), JSON.stringify({ rev }));
  }, 200);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const o = isObj(a) ? Object.assign({}, a) : {};
  for (const k of Object.keys(b)) o[k] = isObj(b[k]) ? merge(o[k], b[k]) : b[k];
  return o;
}

/* ---------- Live-Verteilung (SSE) -------------------------------------- */
const clients = new Set();
function broadcast(col, id, doc) {
  rev++;
  const msg = 'id: ' + rev + '\ndata: ' + JSON.stringify({ rev, col, id, doc }) + '\n\n';
  for (const res of clients) res.write(msg);
  return rev;
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

/* ---------- Löschfrist für Fotos (Datenschutz) --------------------------- */
// Auf Fotos können Mitarbeitende und Kunden zu sehen sein: nach MEDIA_DAYS Tagen
// werden die Dateien gelöscht und in den Vorgängen als „gelöscht“ markiert.
const MEDIA_DAYS = process.env.MEDIA_DAYS === undefined ? 30 : Math.max(0, +process.env.MEDIA_DAYS || 0);
function cleanupMedia(now) {
  if (!MEDIA_DAYS) return { files: 0, items: 0 };
  now = now || Date.now();
  const limit = now - MEDIA_DAYS * 864e5;
  const dir = path.join(DATA, 'media');
  let files = 0, items = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    try { if (fs.statSync(p).mtimeMs < limit) { fs.unlinkSync(p); files++; } } catch (e) { /* schon weg */ }
  }
  for (const [id, it] of Object.entries(db.items)) {
    if (!Array.isArray(it.photos) || !it.photos.length || !(it.createdAt < limit)) continue;
    const next = Object.assign({}, it, { photos: [], photosRemoved: it.photos.length });
    db.items[id] = next; save('items');
    broadcast('items', id, Object.assign({}, next, { id }));
    items++;
  }
  if (files || items) console.log('[SN] Löschfrist ' + MEDIA_DAYS + ' Tage: ' + files + ' Fotos gelöscht, ' + items + ' Vorgänge bereinigt');
  return { files, items };
}
cleanupMedia();
setInterval(cleanupMedia, 6 * 3600e3).unref();

/* ---------- HTTP -------------------------------------------------------- */
function send(res, code, obj, headers) {
  const body = typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}
function authed(req, url) {
  if (!KEY) return true;
  const h = req.headers.authorization || '';
  const given = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('key') || '';
  const a = Buffer.from(given), b = Buffer.from(KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(Object.assign(new Error('zu groß'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/' || p === '/index.html') {
      if (!APP) return send(res, 404, 'App nicht gebaut (node build.js)', { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 200, fs.readFileSync(APP), { 'Content-Type': 'text/html; charset=utf-8' });
    }
    if (p === '/api/health') return send(res, 200, { ok: true, name: 'Schicht-Navigator', rev, keyRequired: !!KEY, mediaDays: MEDIA_DAYS });
    if (p.startsWith('/media/')) {
      if (!authed(req, url)) return send(res, 401, { error: 'unauthorized' });
      const id = p.slice(7);
      if (!ID_RE.test(id)) return send(res, 400, { error: 'invalid_argument' });
      const f = path.join(DATA, 'media', id);
      if (!fs.existsSync(f)) return send(res, 404, { error: 'not_found' });
      return send(res, 200, fs.readFileSync(f), { 'Content-Type': id.endsWith('.png') ? 'image/png' : id.endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
    }
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'not_found' });
    if (!authed(req, url)) return send(res, 401, { error: 'unauthorized' });

    if (p === '/api/snapshot') {
      const cols = {};
      for (const c of COLS) cols[c] = Object.entries(db[c]).map(([id, d]) => Object.assign({}, d, { id }));
      return send(res, 200, { rev, cols });
    }
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n: verbunden\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/media' && req.method === 'POST') {
      const type = (req.headers['content-type'] || '').split(';')[0];
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[type];
      if (!ext) return send(res, 415, { error: 'unsupported_type' });
      const buf = await readBody(req, MAX_MEDIA);
      if (!buf.length) return send(res, 400, { error: 'empty' });
      const id = crypto.randomBytes(12).toString('hex') + ext;
      fs.writeFileSync(path.join(DATA, 'media', id), buf);
      return send(res, 200, { id, url: '/media/' + id });
    }
    const m = /^\/api\/doc\/([^/]+)\/([^/]+)$/.exec(p);
    if (m) {
      const col = m[1], id = decodeURIComponent(m[2]);
      if (!COLS.includes(col) || !ID_RE.test(id)) return send(res, 400, { error: 'invalid_argument' });
      if (req.method === 'DELETE') {
        delete db[col][id]; save(col);
        return send(res, 200, { ok: true, rev: broadcast(col, id, null) });
      }
      if (req.method !== 'PUT' && req.method !== 'PATCH') return send(res, 405, { error: 'method' });
      let data;
      try { data = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8')); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'too_large' : 'invalid_json' }); }
      if (!isObj(data)) return send(res, 400, { error: 'invalid_argument' });
      delete data.id;
      const next = req.method === 'PUT' ? data : merge(db[col][id], data);
      db[col][id] = next; save(col);
      return send(res, 200, { ok: true, rev: broadcast(col, id, Object.assign({}, next, { id })) });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error('[SN]', e);
    return send(res, e.code === 413 ? 413 : 500, { error: e.code === 413 ? 'too_large' : 'server_error' });
  }
});

server.listen(PORT, () => console.log('[SN] Schicht-Navigator Server läuft auf Port ' + PORT + ' · Daten: ' + DATA + (APP ? ' · App: ' + APP : '')));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (saveT) { clearTimeout(saveT); saveT = null; for (const c of COLS) fs.writeFileSync(path.join(DATA, c + '.json'), JSON.stringify(db[c])); } process.exit(0); });
