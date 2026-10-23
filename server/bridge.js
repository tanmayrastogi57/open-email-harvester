#!/usr/bin/env node
'use strict';
/* Tiny localhost REST bridge. Binds to 127.0.0.1 only. Optional bearer token via OEH_TOKEN env. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db.js');

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
  if (TOKEN && req.headers.authorization !== 'Bearer ' + TOKEN) return send(res, 401, { error: 'unauthorized' });
  const m = u.pathname.match(/^\/contacts\/([^/]+)$/);
  try {
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
  return new Promise((ok) => srv.listen(port, host, () => ok(srv)));
}
module.exports = { start };
if (require.main === module) start(PORT, HOST).then(() => console.log(`Open Email Harvester bridge on http://${HOST}:${PORT} (data: ${db.FILE})`));
