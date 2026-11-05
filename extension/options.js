const api = globalThis.browser || globalThis.chrome;
const DEFAULTS = { autoScan: false, syncEnabled: false, bridgeUrl: 'http://127.0.0.1:8765', bridgeToken: '' };
const ids = Object.keys(DEFAULTS);
function bridgeHeaders(settings) { const headers = {}; if (settings.bridgeToken) headers.Authorization = 'Bearer ' + settings.bridgeToken; return headers; }
async function currentSettings() { return Object.assign({}, DEFAULTS, (await api.storage.local.get('settings')).settings); }
async function gmailStatus() {
  const settings = await currentSettings();
  try {
    const r = await fetch(settings.bridgeUrl.replace(/\/$/, '') + '/auth/gmail/status', { headers: bridgeHeaders(settings) });
    const data = await r.json();
    document.getElementById('gmailStatus').textContent = data.connected ? `Connected: ${data.email || 'Gmail account'}${data.lastSyncAt ? ` · Last sync ${data.lastSyncAt}` : ''}` : (data.configured ? 'Gmail OAuth is configured but no account is connected.' : 'Gmail OAuth is not configured on the bridge.');
  } catch { document.getElementById('gmailStatus').textContent = 'Bridge unavailable. Start the local bridge and save settings.'; }
}
(async () => {
  const s = Object.assign({}, DEFAULTS, (await api.storage.local.get('settings')).settings);
  for (const k of ids) { const e = document.getElementById(k); if (e.type === 'checkbox') e.checked = s[k]; else e.value = s[k]; }
})();
document.getElementById('save').onclick = async () => {
  const s = {};
  for (const k of ids) { const e = document.getElementById(k); s[k] = e.type === 'checkbox' ? e.checked : e.value.trim(); }
  const msg = document.getElementById('msg');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(s.bridgeUrl)) { msg.textContent = 'Bridge URL must be localhost.'; return; }
  if (s.autoScan) s.autoScan = await api.permissions.request({ origins: ['<all_urls>'] });
  else await api.permissions.remove({ origins: ['<all_urls>'] }).catch(() => {});
  await api.storage.local.set({ settings: s });
  msg.textContent = s.autoScan || !document.getElementById('autoScan').checked ? 'Saved.' : 'Saved (auto-scan permission denied).';
  await gmailStatus();
};
document.getElementById('connectGmail').onclick = async () => {
  try { const s = await currentSettings(); await api.tabs.create({ url: s.bridgeUrl.replace(/\/$/, '') + '/auth/gmail/start' }); } catch (e) { document.getElementById('gmailStatus').textContent = String(e.message || e); }
};
document.getElementById('syncGmail').onclick = async () => {
  try {
    const s = await currentSettings();
    const r = await fetch(s.bridgeUrl.replace(/\/$/, '') + '/outreach/sync', { method: 'POST', headers: bridgeHeaders(s) });
    const data = await r.json();
    document.getElementById('gmailStatus').textContent = data.error || (data.connected ? `Synced ${data.sent || 0} sent and ${data.replies || 0} replies.` : 'Gmail is not connected.');
  } catch (e) { document.getElementById('gmailStatus').textContent = String(e.message || e); }
};
document.getElementById('disconnectGmail').onclick = async () => {
  try { const s = await currentSettings(); await fetch(s.bridgeUrl.replace(/\/$/, '') + '/auth/gmail/disconnect', { method: 'POST', headers: bridgeHeaders(s) }); await gmailStatus(); } catch (e) { document.getElementById('gmailStatus').textContent = String(e.message || e); }
};
gmailStatus();
