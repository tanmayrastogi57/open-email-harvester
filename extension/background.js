/* global OEHExtractor, OEHValidate, OEHStore, importScripts */
if (typeof importScripts === 'function' && typeof OEHExtractor === 'undefined') {
  importScripts('src/browser-shim.js', 'src/extractor.js', 'src/validate.js', 'src/store.js');
}
const api = globalThis.browser || globalThis.chrome;
const DEFAULTS = { autoScan: false, syncEnabled: false, bridgeUrl: 'http://127.0.0.1:8765', bridgeToken: '' };

async function getSettings() { return Object.assign({}, DEFAULTS, (await api.storage.local.get('settings')).settings); }
async function getContacts() { return (await api.storage.local.get('contacts')).contacts || []; }
async function setContacts(list) { await api.storage.local.set({ contacts: list }); }

async function syncToBridge(items) {
  const s = await getSettings();
  if (!s.syncEnabled || !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/.test(s.bridgeUrl)) return { synced: false };
  const headers = { 'Content-Type': 'application/json' };
  if (s.bridgeToken) headers.Authorization = 'Bearer ' + s.bridgeToken;
  try {
    const r = await fetch(s.bridgeUrl.replace(/\/$/, '') + '/contacts', { method: 'POST', headers, body: JSON.stringify(items) });
    return { synced: r.ok };
  } catch (e) { return { synced: false, error: String(e) }; }
}

async function scanTab(tabId) {
  const [res] = await api.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  if (!res || !res.result) throw new Error('Could not read this page');
  const scan = OEHExtractor.extractAll(res.result);
  const items = OEHStore.fromScan(scan).map((c) => (c.email ? Object.assign(c, { validity: OEHValidate.validate(c.email).status }) : c));
  const { list, added } = OEHStore.merge(await getContacts(), items);
  await setContacts(list);
  const sync = await syncToBridge(items);
  return { scan: { url: scan.url, title: scan.title, emails: scan.emails.length, phones: scan.phones.length, socials: scan.socials.length }, added, total: list.length, sync };
}

api.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg.type === 'scan') return scanTab(msg.tabId);
    if (msg.type === 'syncAll') return syncToBridge(await getContacts());
    return null;
  })().then(reply, (e) => reply({ error: String(e.message || e) }));
  return true;
});

api.commands && api.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'scan-page') return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (tab) scanTab(tab.id).catch(() => {});
});

// Auto-scan only runs when the user enabled it AND granted optional host permission.
api.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !/^https?:/.test(tab.url || '')) return;
  const s = await getSettings();
  if (!s.autoScan) return;
  const ok = await api.permissions.contains({ origins: ['<all_urls>'] });
  if (ok) scanTab(tabId).catch(() => {});
});
