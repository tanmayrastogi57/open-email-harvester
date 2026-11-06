const api = globalThis.browser || globalThis.chrome;
const DEFAULTS = { autoScan: false, syncEnabled: false, openDashboardOnStartup: true, bridgeUrl: 'http://127.0.0.1:8765', bridgeToken: '' };
const ids = Object.keys(DEFAULTS);
function bridgeHeaders(settings) { const headers = {}; if (settings.bridgeToken) headers.Authorization = 'Bearer ' + settings.bridgeToken; return headers; }
async function currentSettings() { return Object.assign({}, DEFAULTS, (await api.storage.local.get('settings')).settings); }
function setBusy(id, busy, label) { const button = document.getElementById(id); button.disabled = busy; button.setAttribute('aria-busy', String(busy)); if (label) button.textContent = label; }
function renderGmailStatus(data) {
  const connected = Boolean(data.connected);
  const status = document.getElementById('gmailStatus');
  status.dataset.state = connected ? 'connected' : data.configured ? 'ready' : 'error';
  status.textContent = connected ? `Connected: ${data.email || 'Gmail account'}${data.lastSyncAt ? ` · Last sync ${data.lastSyncAt}` : ''}` : (data.configured ? 'Gmail OAuth is configured but no account is connected.' : 'Gmail OAuth is not configured on the bridge.');
  document.getElementById('connectGmail').textContent = connected ? 'Reconnect Gmail' : 'Connect Gmail';
  document.getElementById('syncGmail').textContent = 'Sync now';
  document.getElementById('disconnectGmail').textContent = 'Disconnect';
  document.getElementById('syncGmail').disabled = !connected;
  document.getElementById('disconnectGmail').disabled = !connected;
}
async function gmailStatus() {
  const settings = await currentSettings();
  try {
    const r = await fetch(settings.bridgeUrl.replace(/\/$/, '') + '/auth/gmail/status', { headers: bridgeHeaders(settings) });
    if (!r.ok) throw new Error('Status request failed');
    renderGmailStatus(await r.json());
  } catch { const status = document.getElementById('gmailStatus'); status.dataset.state = 'error'; status.textContent = 'Bridge unavailable. Start the local bridge and save settings.'; document.getElementById('connectGmail').textContent = 'Connect Gmail'; document.getElementById('syncGmail').textContent = 'Sync now'; document.getElementById('disconnectGmail').textContent = 'Disconnect'; document.getElementById('syncGmail').disabled = true; document.getElementById('disconnectGmail').disabled = true; }
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
  setBusy('connectGmail', true, 'Opening Gmail…');
  try { const s = await currentSettings(); await api.tabs.create({ url: s.bridgeUrl.replace(/\/$/, '') + '/auth/gmail/start' }); } catch (e) { document.getElementById('gmailStatus').textContent = String(e.message || e); setBusy('connectGmail', false, 'Connect Gmail'); }
};
document.getElementById('syncGmail').onclick = async () => {
  setBusy('syncGmail', true, 'Syncing…');
  try {
    const s = await currentSettings();
    const r = await fetch(s.bridgeUrl.replace(/\/$/, '') + '/outreach/sync', { method: 'POST', headers: bridgeHeaders(s) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Gmail sync failed');
    await gmailStatus();
  } catch (e) { document.getElementById('gmailStatus').textContent = String(e.message || e); } finally { await gmailStatus(); }
};
document.getElementById('disconnectGmail').onclick = async () => {
  setBusy('disconnectGmail', true, 'Disconnecting…');
  try { const s = await currentSettings(); const r = await fetch(s.bridgeUrl.replace(/\/$/, '') + '/auth/gmail/disconnect', { method: 'POST', headers: bridgeHeaders(s) }); if (!r.ok) throw new Error('Disconnect failed'); await gmailStatus(); } catch (e) { document.getElementById('gmailStatus').textContent = String(e.message || e); await gmailStatus(); }
};
gmailStatus();
setInterval(gmailStatus, 5000);
