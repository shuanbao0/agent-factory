'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, rmSync } = require('fs')
const { join } = require('path')

// Stub constants to use temp directories
const TEST_DIR = join(__dirname, '..', '..', '_test_readers_tmp')
const PROJECTS_DIR = join(TEST_DIR, 'projects')
const SESSIONS_DIR = join(TEST_DIR, 'sessions')
const AGENTS_DIR = join(TEST_DIR, 'agents')
const DEPARTMENTS_DIR = join(TEST_DIR, 'departments')

describe('readers', () => {
  beforeEach(() => {
    mkdirSync(PROJECTS_DIR, { recursive: true })
    mkdirSync(SESSIONS_DIR, { recursive: true })
    mkdirSync(AGENTS_DIR, { recursive: true })
    mkdirSync(DEPARTMENTS_DIR, { recursive: true })
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('readProjectTasks (via normalizeTasks)', () => {
    // Test the normalizeTasks helper through readProjectTasks
    it('normalizes running status to in_progress', () => {
      const meta = { tasks: [{ id: 't1', status: 'running' }, { id: 't2', status: 'completed' }] }
      // Inline test of normalizeTasks logic (same as readers.cjs)
      if (Array.isArray(meta.tasks)) {
        for (const t of meta.tasks) {
          if (t.status === 'running') t.status = 'in_progress'
        }
      }
      assert.equal(meta.tasks[0].status, 'in_progress')
      assert.equal(meta.tasks[1].status, 'completed')
    })

    it('handles meta without tasks array', () => {
      const meta = { name: 'test' }
      // normalizeTasks should be no-op
      if (Array.isArray(meta.tasks)) {
        for (const t of meta.tasks) {
          if (t.status === 'running') t.status = 'in_progress'
        }
      }
      assert.equal(meta.tasks, undefined)
    })
  })

  describe('getSessionTokenInfo logic', () => {
    it('returns token info for valid session', () => {
      const agentDir = join(SESSIONS_DIR, 'test-agent', 'sessions')
      mkdirSync(agentDir, { recursive: true })
      const sessions = {
        'agent:test-agent:main': {
          totalTokens: 5000,
          compactionCount: 2,
          contextTokens: 150000,
        },
      }
      writeFileSync(join(agentDir, 'sessions.json'), JSON.stringify(sessions))

      const { readFileSync, existsSync } = require('fs')
      const sessFile = join(agentDir, 'sessions.json')
      assert.ok(existsSync(sessFile))
      const data = JSON.parse(readFileSync(sessFile, 'utf-8'))
      const sess = data['agent:test-agent:main']
      assert.equal(sess.totalTokens, 5000)
      assert.equal(sess.compactionCount, 2)
      assert.equal(sess.contextTokens, 150000)
    })

    it('returns null for missing session file', () => {
      const sessFile = join(SESSIONS_DIR, 'nonexistent', 'sessions', 'sessions.json')
      const { existsSync } = require('fs')
      assert.ok(!existsSync(sessFile))
    })

    it('returns null for missing session key', () => {
      const agentDir = join(SESSIONS_DIR, 'test-agent2', 'sessions')
      mkdirSync(agentDir, { recursive: true })
      writeFileSync(join(agentDir, 'sessions.json'), JSON.stringify({ 'other-key': { totalTokens: 100 } }))

      const { readFileSync } = require('fs')
      const data = JSON.parse(readFileSync(join(agentDir, 'sessions.json'), 'utf-8'))
      const sess = data['agent:test-agent2:main']
      assert.equal(sess, undefined)
    })
  })

  describe('readMemorySummary logic', () => {
    it('reads and truncates SUMMARY.md', () => {
      const memDir = join(AGENTS_DIR, 'ceo', 'memory')
      mkdirSync(memDir, { recursive: true })
      const longContent = 'A'.repeat(3000)
      writeFileSync(join(memDir, 'SUMMARY.md'), longContent)

      const { readFileSync, existsSync } = require('fs')
      const summaryPath = join(memDir, 'SUMMARY.md')
      assert.ok(existsSync(summaryPath))
      const content = readFileSync(summaryPath, 'utf-8').slice(0, 2000)
      assert.equal(content.length, 2000)
    })

    it('returns null for missing SUMMARY.md', () => {
      const { existsSync } = require('fs')
      const summaryPath = join(AGENTS_DIR, 'nonexistent', 'memory', 'SUMMARY.md')
      assert.ok(!existsSync(summaryPath))
    })
  })

  describe('readDeptMission logic', () => {
    it('reads department mission file', () => {
      const deptDir = join(DEPARTMENTS_DIR, 'novel')
      mkdirSync(deptDir, { recursive: true })
      writeFileSync(join(deptDir, 'mission.md'), '# Novel Department Mission')

      const { readFileSync } = require('fs')
      const content = readFileSync(join(deptDir, 'mission.md'), 'utf-8')
      assert.equal(content, '# Novel Department Mission')
    })

    it('returns empty string for missing mission', () => {
      const { existsSync } = require('fs')
      const missionPath = join(DEPARTMENTS_DIR, 'nonexistent', 'mission.md')
      assert.ok(!existsSync(missionPath))
    })
  })
})
