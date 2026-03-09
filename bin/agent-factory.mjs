#!/usr/bin/env node
//
// agent-factory CLI — unified command-line interface
//
// Usage:
//   agent-factory <command>
//
// Commands:
//   start     Start Dashboard + Gateway (background)
//   stop      Stop all services
//   restart   Restart all services
//   status    Show running status (ports, PIDs, version)
//   logs      Tail service logs
//   update    Update to latest version
//   version   Show version
//   doctor    Check environment (Node, deps, config)
//

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';

// ─── Colors ──────────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  blue:   s => isTTY ? `\x1b[34m${s}\x1b[0m` : s,
  cyan:   s => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m` : s,
  dim:    s => isTTY ? `\x1b[2m${s}\x1b[0m` : s,
};

// ─── Resolve project root ────────────────────────────────────────────────────

function resolveRoot() {
  // 1. AGENT_FACTORY_DIR env var
  if (process.env.AGENT_FACTORY_DIR) {
    const dir = process.env.AGENT_FACTORY_DIR;
    if (existsSync(resolve(dir, 'package.json'))) return dir;
  }

  // 2. ~/.agent-factory-root file
  const rootFile = resolve(homedir(), '.agent-factory-root');
  if (existsSync(rootFile)) {
    const dir = readFileSync(rootFile, 'utf-8').trim();
    if (dir && existsSync(resolve(dir, 'package.json'))) return dir;
  }

  // 3. Fallback: relative to this script (bin/../)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fallback = resolve(__dirname, '..');
  if (existsSync(resolve(fallback, 'package.json'))) return fallback;

  // 4. Fixed install location ~/.agent-factory
  const fixed = resolve(homedir(), '.agent-factory');
  if (existsSync(resolve(fixed, 'package.json'))) return fixed;

  console.error(c.red('Error: Cannot locate agent-factory project directory.'));
  console.error('Set AGENT_FACTORY_DIR or run install.sh to configure.');
  process.exit(1);
}

const ROOT = resolveRoot();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function checkPort(port) {
  return new Promise(resolve_ => {
    const conn = createConnection({ port, host: '127.0.0.1' });
    conn.on('connect', () => { conn.end(); resolve_(true); });
    conn.on('error', () => resolve_(false));
    conn.setTimeout(1000, () => { conn.destroy(); resolve_(false); });
  });
}

function findPidOnPort(port) {
  // Try lsof first (macOS + some Linux)
  try {
    const output = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const pids = output.trim().split('\n').filter(Boolean);
    if (pids.length > 0) return pids;
  } catch { /* lsof not available or no results */ }

  // Fallback: ss (Linux)
  try {
    const output = execSync(`ss -tlnp sport = :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const pids = [];
    for (const match of output.matchAll(/pid=(\d+)/g)) {
      pids.push(match[1]);
    }
    return pids;
  } catch { /* ss not available */ }

  return [];
}

function killPort(port) {
  const pids = findPidOnPort(port);
  if (pids.length === 0) return false;
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch { /* already dead */ }
  }
  return true;
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdStart() {
  const logDir = resolve(ROOT, '.openclaw-state');
  mkdirSync(logDir, { recursive: true });
  const logFile = resolve(logDir, 'startup.log');
  const { openSync } = await import('node:fs');
  const out = openSync(logFile, 'a');

  const child = spawn('node', ['scripts/start.mjs'], {
    cwd: ROOT,
    stdio: ['ignore', out, out],
    env: { ...process.env, AGENT_FACTORY_DIR: ROOT },
    detached: true,
  });
  child.unref();

  console.log(c.green('Agent Factory started.'));
  console.log(`  Dashboard:  ${c.cyan('http://localhost:3100')}`);
  console.log(`  Logs:       ${c.dim('agent-factory logs')}`);
  console.log(`  Stop:       ${c.dim('agent-factory stop')}`);
}

async function cmdStop() {
  const UI_PORT = 3100;
  const GW_PORT = parseInt(process.env.OPENCLAW_GATEWAY_PORT || '19100', 10);

  let stopped = false;

  if (killPort(UI_PORT)) {
    console.log(c.green(`Stopped Dashboard (port ${UI_PORT})`));
    stopped = true;
  }
  if (killPort(GW_PORT)) {
    console.log(c.green(`Stopped Gateway (port ${GW_PORT})`));
    stopped = true;
  }

  if (!stopped) {
    console.log(c.yellow('No running services found.'));
  }
}

async function cmdRestart() {
  await cmdStop();
  // Brief pause to let ports release
  await new Promise(r => setTimeout(r, 1000));
  await cmdStart();
}

async function cmdStatus() {
  const version = readVersion();
  const UI_PORT = 3100;
  const GW_PORT = parseInt(process.env.OPENCLAW_GATEWAY_PORT || '19100', 10);

  const [uiUp, gwUp] = await Promise.all([checkPort(UI_PORT), checkPort(GW_PORT)]);

  console.log(c.bold('Agent Factory Status'));
  console.log('');
  console.log(`  Version:     ${c.cyan('v' + version)}`);
  console.log(`  Project:     ${c.dim(ROOT)}`);
  console.log('');
  console.log(`  Dashboard:   ${uiUp ? c.green('running') : c.red('stopped')}  (port ${UI_PORT})`);
  console.log(`  Gateway:     ${gwUp ? c.green('running') : c.red('stopped')}  (port ${GW_PORT})`);

  if (uiUp) {
    const uiPids = findPidOnPort(UI_PORT);
    if (uiPids.length) console.log(`               ${c.dim('PID: ' + uiPids.join(', '))}`);
  }
  if (gwUp) {
    const gwPids = findPidOnPort(GW_PORT);
    if (gwPids.length) console.log(`               ${c.dim('PID: ' + gwPids.join(', '))}`);
  }
  console.log('');
}

async function cmdLogs() {
  const logFile = resolve(ROOT, '.openclaw-state/startup.log');
  if (!existsSync(logFile)) {
    console.log(c.yellow('No log file found at: ' + logFile));
    console.log(c.dim('Start the service first with: agent-factory start'));
    return;
  }

  console.log(c.dim('Tailing ' + logFile + ' (Ctrl-C to stop)'));
  const child = spawn('tail', ['-f', logFile], { stdio: 'inherit' });
  process.on('SIGINT', () => { child.kill(); process.exit(0); });
  child.on('exit', (code) => process.exit(code ?? 0));
}

async function cmdUpdate() {
  const currentVersion = readVersion();
  console.log(c.bold('Agent Factory Update'));
  console.log(`  Current version: ${c.cyan('v' + currentVersion)}`);
  console.log('');

  // 1. Query latest release
  console.log('Checking for updates...');
  let latestTag;
  try {
    const response = execSync(
      'curl -fsSL https://api.github.com/repos/shuanbao0/agent-factory/releases/latest',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const data = JSON.parse(response);
    latestTag = data.tag_name;
  } catch {
    console.error(c.red('Failed to check for updates. Check your internet connection.'));
    process.exit(1);
  }

  if (!latestTag) {
    console.error(c.red('No releases found.'));
    process.exit(1);
  }

  const latestVersion = latestTag.replace(/^v/, '');
  if (latestVersion === currentVersion) {
    console.log(c.green(`Already up to date (v${currentVersion}).`));
    return;
  }

  console.log(`  Latest version:  ${c.green('v' + latestVersion)}`);
  console.log('');

  // 2. Stop running services
  console.log('Stopping services...');
  await cmdStop();

  // 3. Download and extract tarball (preserving user data)
  console.log(`Downloading v${latestVersion}...`);
  const tarball = `/tmp/agent-factory-${latestTag}.tar.gz`;
  const downloadUrl = `https://github.com/shuanbao0/agent-factory/releases/download/${latestTag}/agent-factory-${latestTag}.tar.gz`;

  try {
    execSync(`curl -fsSL -o "${tarball}" "${downloadUrl}"`, { stdio: 'inherit' });
  } catch {
    console.error(c.red('Failed to download release tarball.'));
    process.exit(1);
  }

  // Extract to a temp dir first, then overlay (preserving user data dirs)
  const tmpDir = `/tmp/agent-factory-update-${Date.now()}`;
  mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`tar -xzf "${tarball}" -C "${tmpDir}" --strip-components=1`, { stdio: 'inherit' });
  } catch {
    console.error(c.red('Failed to extract release tarball.'));
    process.exit(1);
  }

  // Preserve user data directories and config files (smart-merged later by migrate scripts)
  const preserveDirs = ['agents', 'workspaces', 'projects', 'templates/custom', '.openclaw-state', 'config/departments'];
  const preserveFiles = ['.env', 'config/openclaw.json', 'config/models.json', 'config/autopilot-state.json', 'config/departments.json'];
  // Note: config/base-rules.md is intentionally NOT preserved — always updated from new version

  // Copy new files over, skipping preserved dirs/files
  console.log('Applying update...');
  try {
    // Build rsync exclude list
    const excludes = [
      ...preserveDirs.map(d => `--exclude=/${d}/`),
      ...preserveFiles.map(f => `--exclude=/${f}`),
    ];
    execSync(
      `rsync -a ${excludes.join(' ')} "${tmpDir}/" "${ROOT}/"`,
      { stdio: 'inherit' }
    );
  } catch {
    // Fallback: manual copy without rsync
    console.log(c.dim('rsync not available, using cp...'));
    const skipTopLevel = new Set(['node_modules']);
    for (const d of preserveDirs) skipTopLevel.add(d.split('/')[0]);
    // Copy top-level entries, skip preserved top-level dirs
    const entries = readdirSync(tmpDir);
    for (const entry of entries) {
      if (skipTopLevel.has(entry)) continue;
      if (entry === 'config') {
        // For config/, copy selectively — skip preserved files and subdirs
        const configSrc = resolve(tmpDir, 'config');
        const configDst = resolve(ROOT, 'config');
        mkdirSync(configDst, { recursive: true });
        const preservedConfigFiles = new Set(preserveFiles.filter(f => f.startsWith('config/')).map(f => f.replace('config/', '')));
        const preservedConfigDirs = new Set(preserveDirs.filter(d => d.startsWith('config/')).map(d => d.replace('config/', '')));
        for (const cf of readdirSync(configSrc)) {
          if (preservedConfigFiles.has(cf) || preservedConfigDirs.has(cf)) continue;
          execSync(`cp -R "${resolve(configSrc, cf)}" "${configDst}/"`, { stdio: 'inherit' });
        }
      } else {
        execSync(`cp -R "${resolve(tmpDir, entry)}" "${ROOT}/"`, { stdio: 'inherit' });
      }
    }
  }

  // 4. Reinstall dependencies
  console.log('Installing dependencies...');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });

  if (existsSync(resolve(ROOT, 'ui/package.json'))) {
    execSync('npm install', { cwd: resolve(ROOT, 'ui'), stdio: 'inherit' });
  }

  // 5. Run migration scripts (with AF_UPDATE_DIR so they can read new version files)
  try {
    const scriptsDir = resolve(ROOT, 'scripts');
    const migrationScripts = readdirSync(scriptsDir)
      .filter(f => f.startsWith('migrate-') && f.endsWith('.mjs'))
      .sort();

    if (migrationScripts.length > 0) {
      console.log('Running migrations...');
      const env = { ...process.env, AF_UPDATE_DIR: tmpDir };
      for (const script of migrationScripts) {
        console.log(c.dim(`  Running ${script}...`));
        execSync(`node "scripts/${script}"`, { cwd: ROOT, stdio: 'inherit', env });
      }
    }
  } catch (e) {
    console.log(c.yellow('Migration check skipped: ' + e.message));
  }

  // Cleanup tmpDir (after migrations have used it)
  execSync(`rm -rf "${tmpDir}" "${tarball}"`);

  // 6. Re-inject base-rules into all agents
  const injectScript = resolve(ROOT, 'scripts/inject-base-rules.mjs');
  if (existsSync(injectScript)) {
    console.log('Re-injecting base-rules...');
    execSync(`node "${injectScript}"`, { cwd: ROOT, stdio: 'inherit' });
  }

  // 7. Done
  const newVersion = readVersion();
  console.log('');
  console.log(c.green(`Updated to v${newVersion} successfully!`));
  console.log(`Run ${c.cyan('agent-factory start')} to restart services.`);
}

async function cmdVersion() {
  console.log(`agent-factory v${readVersion()}`);
}

async function cmdDoctor() {
  console.log(c.bold('Agent Factory Doctor'));
  console.log('');

  let issues = 0;

  // 1. Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);
  if (nodeMajor >= 22) {
    console.log(c.green('  [OK]') + `   Node.js ${nodeVersion}`);
  } else {
    console.log(c.red('  [ERR]') + `  Node.js ${nodeVersion} — v22+ required`);
    issues++;
  }

  // 2. npm
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    console.log(c.green('  [OK]') + `   npm ${npmVersion}`);
  } catch {
    console.log(c.red('  [ERR]') + '  npm not found');
    issues++;
  }

  // 3. Project directory
  console.log(c.green('  [OK]') + `   Project: ${ROOT}`);

  // 4. package.json
  const pkgPath = resolve(ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    const version = readVersion();
    console.log(c.green('  [OK]') + `   Version: ${version}`);
  } else {
    console.log(c.red('  [ERR]') + '  package.json not found');
    issues++;
  }

  // 5. OpenClaw CLI
  const oclawBin = resolve(ROOT, 'node_modules/.bin/openclaw');
  if (existsSync(oclawBin)) {
    try {
      const ocVersion = execSync(`"${oclawBin}" --version`, { encoding: 'utf-8' }).trim();
      console.log(c.green('  [OK]') + `   OpenClaw CLI: ${ocVersion}`);
    } catch {
      console.log(c.yellow('  [WARN]') + '  OpenClaw CLI found but version check failed');
    }
  } else {
    console.log(c.red('  [ERR]') + '  OpenClaw CLI not found — run npm install');
    issues++;
  }

  // 6. Config files
  const configs = [
    ['config/openclaw.json', 'Gateway config'],
    ['config/models.json', 'Models config'],
    ['.env', 'Environment file'],
  ];
  for (const [file, label] of configs) {
    if (existsSync(resolve(ROOT, file))) {
      console.log(c.green('  [OK]') + `   ${label}: ${file}`);
    } else {
      console.log(c.yellow('  [WARN]') + `  ${label} missing: ${file}`);
      issues++;
    }
  }

  // 7. UI dependencies
  const uiModules = resolve(ROOT, 'ui/node_modules');
  if (existsSync(uiModules)) {
    console.log(c.green('  [OK]') + '   UI dependencies installed');
  } else {
    console.log(c.yellow('  [WARN]') + '  UI dependencies not installed — run: cd ui && npm install');
    issues++;
  }

  // 8. Required directories
  const dirs = ['agents', 'workspaces', 'projects', 'templates/builtin'];
  for (const dir of dirs) {
    if (existsSync(resolve(ROOT, dir))) {
      console.log(c.green('  [OK]') + `   Directory: ${dir}/`);
    } else {
      console.log(c.yellow('  [WARN]') + `  Directory missing: ${dir}/`);
    }
  }

  console.log('');
  if (issues === 0) {
    console.log(c.green('All checks passed!'));
  } else {
    console.log(c.yellow(`${issues} issue(s) found.`));
  }
}

function showHelp() {
  console.log(`
${c.bold('agent-factory')} — AI Employee Factory CLI

${c.bold('Usage:')}
  agent-factory <command>

${c.bold('Commands:')}
  start       Start Dashboard + Gateway (background)
  stop        Stop all services
  restart     Restart all services
  status      Show running status (ports, PIDs, version)
  logs        Tail service logs
  update      Update to latest version
  version     Show version
  doctor      Check environment (Node, deps, config)

${c.bold('Examples:')}
  agent-factory start
  agent-factory status
  agent-factory update
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const command = process.argv[2];

const commands = {
  start:   cmdStart,
  stop:    cmdStop,
  restart: cmdRestart,
  status:  cmdStatus,
  logs:    cmdLogs,
  update:  cmdUpdate,
  version: cmdVersion,
  doctor:  cmdDoctor,
  help:    () => { showHelp(); },
  '--help': () => { showHelp(); },
  '-h':    () => { showHelp(); },
  '-v':    cmdVersion,
  '--version': cmdVersion,
};

if (!command || !commands[command]) {
  showHelp();
  process.exit(command ? 1 : 0);
} else {
  commands[command]();
}
