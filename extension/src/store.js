/* Pure contact-store logic (merge/dedupe/filter/CSV). Shared by extension and server. */
(function (root) {
  'use strict';
  function key(c) { return (c.email || c.phone || c.url || '').toLowerCase(); }

  function merge(list, incoming) {
    const map = new Map(list.map((c) => [key(c), c]));
    let added = 0;
    for (const c of incoming) {
      const k = key(c);
      if (!k) continue;
      const prev = map.get(k);
      if (prev) {
        prev.tags = [...new Set([...(prev.tags || []), ...(c.tags || [])])];
        prev.sources = [...new Set([...(prev.sources || []), ...(c.sources || [])])];
        if (!prev.name && c.name) prev.name = c.name;
        if (c.notes && !prev.notes) prev.notes = c.notes;
      } else {
        map.set(k, Object.assign({ id: k, tags: [], sources: [], notes: '', createdAt: new Date().toISOString() }, c));
        added++;
      }
    }
    return { list: [...map.values()], added };
  }

  function fromScan(scan) {
    const src = scan.url ? [scan.url] : [];
    const base = { pageTitle: scan.title, company: scan.domain, sources: src };
    return [
      ...scan.emails.map((e) => Object.assign({ type: 'email', email: e.email, name: e.name, domain: e.domain }, base)),
      ...scan.phones.map((p) => Object.assign({ type: 'phone', phone: p, domain: scan.domain }, base)),
      ...scan.socials.map((u) => Object.assign({ type: 'social', url: u, domain: scan.domain }, base)),
    ];
  }

  function filter(list, q) {
    const opts = q || {};
    const s = (opts.query || '').toLowerCase();
    return list.filter((c) =>
      (!s || JSON.stringify(c).toLowerCase().includes(s)) &&
      (!opts.tag || (c.tags || []).includes(opts.tag)) &&
      (!opts.type || c.type === opts.type) &&
      (!opts.domain || c.domain === opts.domain));
  }

  function groupByDomain(list) {
    const g = {};
    for (const c of list) (g[c.domain || '(none)'] = g[c.domain || '(none)'] || []).push(c);
    return g;
  }

  const COLS = ['type', 'email', 'phone', 'url', 'name', 'domain', 'company', 'pageTitle', 'tags', 'notes', 'sources', 'createdAt'];
  function csvCell(v) {
    const s = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(list) {
    return [COLS.join(','), ...list.map((c) => COLS.map((k) => csvCell(c[k])).join(','))].join('\n');
  }
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const [head, ...body] = rows;
    return body.filter((r) => r.length > 1).map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = ['tags', 'sources'].includes(h) ? (r[i] ? r[i].split('|') : []) : r[i] || ''; });
      return o;
    });
  }

  const api = { merge, fromScan, filter, groupByDomain, toCSV, parseCSV, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OEHStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
