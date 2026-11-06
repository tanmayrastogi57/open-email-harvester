'use strict';

/*
 * Small lifecycle helper shared by the MCP entrypoint and Windows startup
 * integration. It only starts the local bridge; it never starts a public
 * listener and never writes credentials to disk.
 */
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function config() {
  const port = Number(process.env.OEH_PORT || 8765);
  const host = process.env.OEH_HOST || '127.0.0.1';
  return { port, host, url: `http://${host.includes(':') ? `[${host}]` : host}:${port}` };
}

function isBridgeHealthy(timeoutMs = 500) {
  const { url } = config();
  return new Promise((resolve) => {
    const req = http.get(`${url}/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function startBridge() {
  const child = spawn(process.execPath, [path.join(__dirname, 'bridge.js')], {
    cwd: ROOT,
    env: process.env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return child.pid;
}

async function ensureBridge(options = {}) {
  if (process.env.OEH_AUTO_START_BRIDGE === '0') return { disabled: true, started: false };
  if (await isBridgeHealthy()) return { disabled: false, started: false };

  const pid = startBridge();
  const timeoutMs = Number(options.timeoutMs || 8000);
  const pollMs = Number(options.pollMs || 200);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBridgeHealthy()) return { disabled: false, started: true, pid };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Bridge did not become healthy at ${config().url}`);
}

module.exports = { config, isBridgeHealthy, startBridge, ensureBridge };
