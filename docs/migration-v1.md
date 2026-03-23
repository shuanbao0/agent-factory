# Migration Guide: v0.x → v1.0

v1.0 introduces a unified `data/` directory structure. All runtime data (agents, workspaces, projects, config, logs) now lives under `data/` instead of scattered at the project root.

## Who needs this?

If your installation looks like this (directories at root level):

```
~/.agent-factory/
├── agents/          ← old location
├── workspaces/      ← old location
├── projects/        ← old location
├── .openclaw-state/ ← old location
├── config/
│   ├── openclaw.json
│   └── models.json
└── ...
```

You need to migrate. The new structure is:

```
~/.agent-factory/
├── data/
│   ├── agents/
│   ├── workspaces/
│   ├── projects/
│   ├── departments/
│   ├── config/
│   │   ├── openclaw.json
│   │   ├── models.json
│   │   ├── tasks.json
│   │   └── ...
│   ├── logs/
│   └── openclaw-state/
├── config/            ← source templates (git tracked, read-only)
├── core/
├── ui/
└── ...
```

## Migration Steps

### 1. Backup

```bash
cp -r ~/.agent-factory ~/.agent-factory.bak
```

### 2. Install v1.0

```bash
rm -rf ~/.agent-factory
curl -fsSL https://raw.githubusercontent.com/shuanbao0/agent-factory/main/scripts/install.sh | bash
```

### 3. Migrate Data

```bash
cd ~/.agent-factory

# Core data
cp -r ~/.agent-factory.bak/agents data/agents
cp -r ~/.agent-factory.bak/workspaces data/workspaces
cp -r ~/.agent-factory.bak/projects data/projects

# Environment
cp ~/.agent-factory.bak/.env .env

# Config (if customized)
cp ~/.agent-factory.bak/config/openclaw.json data/config/openclaw.json 2>/dev/null
cp ~/.agent-factory.bak/config/models.json data/config/models.json 2>/dev/null

# Gateway state (sessions, auth profiles)
cp -r ~/.agent-factory.bak/.openclaw-state/* data/openclaw-state/ 2>/dev/null
```

### 4. Run Migration Scripts

```bash
cd ~/.agent-factory
node scripts/migrate/migrate-sync-builtin.mjs   # sync agent templates
node scripts/migrate/migrate-sync-gateway.mjs    # sync gateway config
node scripts/migrate/migrate-multi-project.mjs   # fix project structure
node scripts/tools/inject-base-rules.mjs         # re-inject base rules
```

### 5. Start

```bash
agent-factory start
```

Open http://localhost:3100 to verify everything works.

## Rollback

If anything goes wrong:

```bash
agent-factory stop
rm -rf ~/.agent-factory
mv ~/.agent-factory.bak ~/.agent-factory
```

## Alternative: Upgrade in Place

If you prefer not to do a clean install, you can upgrade the existing installation directly:

```bash
cp -r ~/.agent-factory ~/.agent-factory.bak
curl -fsSL https://raw.githubusercontent.com/shuanbao0/agent-factory/main/scripts/install.sh | bash -s -- --upgrade
```

The `--upgrade` flag downloads the new version, overlays the code, and runs migration scripts automatically (including `migrate-data-dir.mjs` which moves directories to `data/`).
