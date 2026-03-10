#!/usr/bin/env node
/**
 * Agent Factory — Unified start script.
 * Starts Dashboard first, then Gateway (if API keys available).
 * Gateway missing keys = graceful degradation, not fatal.
 */

import { resolve } from 'node:path';
import { existsSync, readFileSync, copyFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';

const ROOT = resolve(import.meta.dirname, '..');
const GW_PORT = parseInt(process.env.OPENCLAW_GATEWAY_PORT || '19100');
const UI_PORT = 3100;
const STATE_DIR = resolve(ROOT, '.openclaw-state');
const CONFIG_PATH = resolve(ROOT, 'config/openclaw.json');
const MODELS_PATH = resolve(ROOT, 'config/models.json');
const PID_FILE = resolve(STATE_DIR, 'start.pid');

/** Copy from .default.json templates if runtime configs don't exist */
function ensureConfigFiles() {
  const pairs = [
    [MODELS_PATH, resolve(ROOT, 'config/models.default.json')],
    [CONFIG_PATH, resolve(ROOT, 'config/openclaw.default.json')],
  ];
  for (const [runtime, template] of pairs) {
    if (!existsSync(runtime) && existsSync(template)) {
      copyFileSync(template, runtime);
      console.log(`  [init] Created ${runtime.replace(ROOT + '/', '')} from template`);
    }
  }
}

// Load .env without failing
function loadEnvFile() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function hasAuthProfiles() {
  const authPath = resolve(STATE_DIR, 'agents/main/agent/auth-profiles.json');
  if (!existsSync(authPath)) return false;
  try {
    const data = JSON.parse(readFileSync(authPath, 'utf-8'));
    return Object.keys(data.profiles || {}).length > 0;
  } catch { return false; }
}

function hasAnyApiKey() {
  // Check all providers configured in models.json
  if (existsSync(MODELS_PATH)) {
    try {
      const modelsConfig = JSON.parse(readFileSync(MODELS_PATH, 'utf-8'));
      for (const provider of Object.values(modelsConfig.providers || {})) {
        const apiKey = provider.apiKey || '';
        const resolved = apiKey.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || '');
        if (resolved) return true;
      }
    } catch { /* ignore */ }
  }
  return hasAuthProfiles();
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

function killPort(port) {
  // Try lsof (macOS + some Linux)
  try {
    execSync(`lsof -ti:${port} | xargs kill 2>/dev/null`, { stdio: 'ignore' });
    return;
  } catch { /* lsof not available */ }

  // Fallback: ss (Linux)
  try {
    const output = execSync(`ss -tlnp sport = :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    for (const match of output.matchAll(/pid=(\d+)/g)) {
      try { process.kill(Number(match[1]), 'SIGTERM'); } catch { /* already dead */ }
    }
  } catch { /* ss not available */ }
}

function waitForPort(host, port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout waiting for ${host}:${port}`));
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); setTimeout(attempt, 500); });
      socket.once('timeout', () => { socket.destroy(); setTimeout(attempt, 500); });
      socket.connect(port, host);
    }
    attempt();
  });
}

let gatewayProcess = null;
let dashboardProcess = null;

function killOldStartProcess() {
  try {
    const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      process.kill(oldPid, 'SIGTERM');
    }
  } catch { /* no pid file or process already dead */ }
}

function writePidFile() {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
}

function cleanup() {
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  if (gatewayProcess) gatewayProcess.kill('SIGTERM');
  if (dashboardProcess) dashboardProcess.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function startDashboard() {
  console.log(`🖥️  Starting Dashboard on port ${UI_PORT}...`);

  // Kill any stale process on the port before starting
  if (await isPortInUse(UI_PORT)) {
    console.log(`  Port ${UI_PORT} in use, killing stale process...`);
    killPort(UI_PORT);
    // Brief wait for port release
    await new Promise(r => setTimeout(r, 1000));
  }

  const uiScript = process.env.NODE_ENV === 'production' ? 'start' : 'dev';
  dashboardProcess = spawn('npm', ['run', uiScript], {
    cwd: resolve(ROOT, 'ui'),
    env: {
      ...process.env,
      AGENT_FACTORY_DIR: ROOT,
      AGENT_FACTORY_PORT: String(GW_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  dashboardProcess.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`  [UI] ${line}`);
  });
  dashboardProcess.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line && !line.includes('ExperimentalWarning')) console.log(`  [UI] ${line}`);
  });

  dashboardProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`❌ Dashboard exited with code ${code}`);
    }
  });

  try {
    await waitForPort('127.0.0.1', UI_PORT, 60000);
    console.log(`✅ Dashboard ready: http://localhost:${UI_PORT}`);
  } catch {
    console.warn('⚠️  Dashboard may still be starting...');
  }
}

function findBin(name) {
  // Walk up from ROOT looking for node_modules/.bin/<name> (supports npm workspaces hoisting)
  let dir = ROOT;
  while (dir) {
    const bin = resolve(dir, 'node_modules/.bin', name);
    if (existsSync(bin)) return bin;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function startGateway() {
  const openclawBin = findBin('openclaw');
  if (!openclawBin) {
    console.error('❌ OpenClaw not found. Run: npm install');
    return null;
  }

  console.log(`🚀 Starting Gateway on port ${GW_PORT}...`);

  if (await isPortInUse(GW_PORT)) {
    console.log(`  Port ${GW_PORT} in use, killing stale process...`);
    killPort(GW_PORT);
    await new Promise(r => setTimeout(r, 1000));
  }

  gatewayProcess = spawn(openclawBin, ['gateway', '--port', String(GW_PORT), '--force'], {
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: STATE_DIR,
      OPENCLAW_CONFIG_PATH: CONFIG_PATH,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  gatewayProcess.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`  [GW] ${line}`);
  });
  gatewayProcess.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`  [GW] ${line}`);
  });

  gatewayProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`⚠️  Gateway exited with code ${code} — configure API keys via Dashboard`);
    }
    gatewayProcess = null;
  });

  try {
    await waitForPort('127.0.0.1', GW_PORT);
    console.log(`✅ Gateway ready: ws://127.0.0.1:${GW_PORT}`);
    return true;
  } catch {
    console.warn('⚠️  Gateway failed to start — configure API keys in Dashboard → Settings');
    return false;
  }
}

async function main() {
  console.log('🏭 Agent Factory starting...\n');
  loadEnvFile();
  ensureConfigFiles();
  killOldStartProcess();
  writePidFile();

  // Always start Dashboard first
  await startDashboard();

  // Try starting Gateway if we have keys
  if (hasAnyApiKey()) {
    await startGateway();
  } else {
    console.log('\n⚠️  No API keys found. Open Dashboard to configure:');
    console.log(`   http://localhost:${UI_PORT}/setup\n`);
  }

  console.log(`\n🏭 Agent Factory is running!`);
  console.log(`   Dashboard: http://localhost:${UI_PORT}`);
  if (gatewayProcess) console.log(`   Gateway:   ws://127.0.0.1:${GW_PORT}`);
  else console.log(`   Gateway:   Not running (configure keys in Dashboard)`);
  console.log(`\n   Press Ctrl+C to stop.\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
