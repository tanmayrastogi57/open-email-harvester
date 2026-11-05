#!/usr/bin/env node
'use strict';
/* Tiny localhost REST bridge. Binds to 127.0.0.1 only. Optional bearer token via OEH_TOKEN env. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db.js');
const outreach = require('./outreach.js');
const gmail = require('./gmail.js');

const PORT = Number(process.env.OEH_PORT || 8765);
const HOST = process.env.OEH_HOST || '127.0.0.1';
const TOKEN = process.env.OEH_TOKEN || '';

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}
function page(res, code, title, message) {
  const safe = String(message || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return send(res, code, `<!doctype html><meta charset="utf-8"><title>${title}</title><p>${safe}</p><p><a href="/outreach/dashboard">Return to dashboard</a></p>`, 'text/html');
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let d = ''; req.on('data', (c) => { d += c; if (d.length > 5e6) req.destroy(); });
    req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { fail(e); } });
  });
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const u = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(u.searchParams);
  if (u.pathname === '/health') return send(res, 200, { ok: true });
  if (u.pathname === '/openapi.yaml') return send(res, 200, fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'), 'text/yaml');
  if (u.pathname === '/auth/gmail/start' && req.method === 'GET') {
    try { return redirect(res, gmail.authUrl()); } catch (e) { return page(res, 503, 'Gmail setup required', e.message); }
  }
  if (u.pathname === '/auth/gmail/callback' && req.method === 'GET') {
    try { await gmail.exchangeCode(q.code, q.state); return redirect(res, '/outreach/dashboard?gmail=connected'); } catch (e) { return page(res, 400, 'Gmail connection failed', e.message); }
  }
  if (TOKEN && req.headers.authorization !== 'Bearer ' + TOKEN) return send(res, 401, { error: 'unauthorized' });
  const m = u.pathname.match(/^\/contacts\/([^/]+)$/);
  const om = u.pathname.match(/^\/outreach\/([^/]+)$/);
  try {
    if (u.pathname === '/outreach/dashboard' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8'), 'text/html');
    if (u.pathname === '/auth/gmail/status' && req.method === 'GET') return send(res, 200, gmail.status());
    if (u.pathname === '/auth/gmail/disconnect' && req.method === 'POST') return send(res, 200, await gmail.disconnect());
    if (u.pathname === '/outreach/sync' && req.method === 'POST') return send(res, 200, await gmail.syncOutreach());
    if (u.pathname === '/outreach' && req.method === 'GET') return send(res, 200, outreach.list(q));
    if (u.pathname === '/outreach/summary' && req.method === 'GET') return send(res, 200, outreach.summary());
    if (u.pathname === '/outreach' && req.method === 'POST') return send(res, 200, outreach.upsert(await readBody(req)));
    if (u.pathname === '/outreach/event' && req.method === 'POST') { const b = await readBody(req); return send(res, 200, outreach.recordEvent(b.email, b)); }
    if (om && req.method === 'PATCH') { const b = await readBody(req); const c = outreach.setFollowUp(decodeURIComponent(om[1]), b.nextFollowUpAt, b.note); return c ? send(res, 200, c) : send(res, 404, { error: 'not found' }); }
    if (u.pathname === '/outreach/export' && req.method === 'GET') return send(res, 200, outreach.exportJson(q), 'application/json');
    if (u.pathname === '/contacts' && req.method === 'GET') return send(res, 200, db.list(q));
    if (u.pathname === '/contacts' && req.method === 'POST') return send(res, 200, db.add(await readBody(req)));
    if (u.pathname === '/contacts' && req.method === 'DELETE') { db.clear(); return send(res, 200, { cleared: true }); }
    if (m && req.method === 'PATCH') { const b = await readBody(req); const c = db.tag(decodeURIComponent(m[1]), b.tags, b.notes); return c ? send(res, 200, c) : send(res, 404, { error: 'not found' }); }
    if (m && req.method === 'DELETE') return send(res, 200, { removed: db.remove(decodeURIComponent(m[1])) });
    if (u.pathname === '/domains') return send(res, 200, db.groups());
    if (u.pathname === '/export') return q.format === 'csv' ? send(res, 200, db.exportAs('csv', q), 'text/csv') : send(res, 200, db.exportAs('json', q));
    if (u.pathname === '/extract' && req.method === 'POST') {
      const b = await readBody(req); const scan = db.extract(b);
      if (b.save) { const S = require('../extension/src/store.js'); scan.saved = db.add(S.fromScan(scan)); }
      return send(res, 200, scan);
    }
    if (u.pathname === '/validate') return send(res, 200, db.validate(q.email));
    return send(res, 404, { error: 'not found' });
  } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
}

function start(port, host) {
  const srv = http.createServer(handle);
  return new Promise((ok) => srv.listen(port, host, () => { gmail.startBackgroundSync(); ok(srv); }));
}
module.exports = { start };
if (require.main === module) start(PORT, HOST).then(() => console.log(`Open Email Harvester bridge on http://${HOST}:${PORT} (data: ${db.FILE})`));
