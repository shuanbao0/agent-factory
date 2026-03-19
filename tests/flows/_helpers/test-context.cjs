'use strict'
const { mkdirSync, rmSync, existsSync, readdirSync } = require('fs')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config', 'departments')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

function createTestContext(name) {
  const ts = Date.now().toString(36)
  const testId = `zzz-test-${name}-${ts}`
  const testDir = join(PROJECT_ROOT, 'tmp-test', testId)

  return {
    testDir,
    testId,
    PROJECT_ROOT,
    AGENTS_DIR,
    WORKSPACES_DIR,
    DEPARTMENTS_DIR,
    PROJECTS_DIR,

    setup() {
      mkdirSync(testDir, { recursive: true })
    },

    cleanup() {
      // Remove temp test dir
      try { rmSync(testDir, { recursive: true, force: true }) } catch (_) {}

      // Clean up any zzz-test- artifacts
      for (const dir of [AGENTS_DIR, WORKSPACES_DIR, DEPARTMENTS_DIR, PROJECTS_DIR]) {
        try {
          if (!existsSync(dir)) continue
          for (const entry of readdirSync(dir)) {
            if (entry.startsWith('zzz-test-')) {
              try { rmSync(join(dir, entry), { recursive: true, force: true }) } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // Clean up tmp-test dir if empty
      try { rmSync(join(PROJECT_ROOT, 'tmp-test'), { recursive: true, force: true }) } catch (_) {}
    },
  }
}

module.exports = { createTestContext, PROJECT_ROOT, AGENTS_DIR, WORKSPACES_DIR, DEPARTMENTS_DIR, PROJECTS_DIR }
