'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { rmSync, existsSync } = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { AgentMetaRepository } = require('../../core/repo/agent-meta.cjs')

const ts = Date.now()
const testAgentId = `zzz-test-agentmeta-${ts}`
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

describe('AgentMetaRepository', () => {
  let repo

  afterEach(() => {
    const testDir = join(AGENTS_DIR, testAgentId)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('exists returns false for non-existent agent', () => {
    repo = new AgentMetaRepository()
    assert.equal(repo.exists('zzz-nonexistent-agent-' + Date.now()), false)
  })

  it('writeMeta + readMeta roundtrip', () => {
    repo = new AgentMetaRepository()
    repo.ensureAgentDir(testAgentId)
    const meta = { id: testAgentId, name: 'Test Agent', model: 'sonnet', department: 'test-dept' }
    repo.writeMeta(testAgentId, meta)
    const loaded = repo.readMeta(testAgentId)
    assert.ok(loaded)
    assert.equal(loaded.id, testAgentId)
    assert.equal(loaded.name, 'Test Agent')
    assert.equal(loaded.model, 'sonnet')
  })

  it('updateMeta applies mutator', () => {
    repo = new AgentMetaRepository()
    repo.ensureAgentDir(testAgentId)
    repo.writeMeta(testAgentId, { id: testAgentId, name: 'Before' })
    const updated = repo.updateMeta(testAgentId, m => {
      m.name = 'After'
      m.model = 'opus'
      return m
    })
    assert.equal(updated.name, 'After')
    assert.equal(updated.model, 'opus')

    const loaded = repo.readMeta(testAgentId)
    assert.equal(loaded.name, 'After')
  })

  it('readMeta returns null for non-existent', () => {
    repo = new AgentMetaRepository()
    const result = repo.readMeta('zzz-nonexistent-' + Date.now())
    assert.equal(result, null)
  })

  it('writeAgentFile + readAgentFile roundtrip', () => {
    repo = new AgentMetaRepository()
    repo.ensureAgentDir(testAgentId)
    repo.writeAgentFile(testAgentId, 'AGENTS.md', '# Test Agent Rules\n')
    const content = repo.readAgentFile(testAgentId, 'AGENTS.md')
    assert.equal(content, '# Test Agent Rules\n')
  })

  it('agentFileExists returns false for missing file', () => {
    repo = new AgentMetaRepository()
    assert.equal(repo.agentFileExists('zzz-nonexistent-' + Date.now(), 'AGENTS.md'), false)
  })

  it('listAllAgentIds returns array of strings', () => {
    repo = new AgentMetaRepository()
    const ids = repo.listAllAgentIds()
    assert.ok(Array.isArray(ids))
    for (const id of ids) {
      assert.equal(typeof id, 'string')
    }
  })

  it('deleteAgentDir removes directory', () => {
    repo = new AgentMetaRepository()
    repo.ensureAgentDir(testAgentId)
    repo.writeMeta(testAgentId, { id: testAgentId })
    assert.equal(repo.exists(testAgentId), true)
    repo.deleteAgentDir(testAgentId)
    assert.equal(repo.exists(testAgentId), false)
  })

  it('ensureAgentDir creates nested subdirs', () => {
    repo = new AgentMetaRepository()
    repo.ensureAgentDir(testAgentId, 'memory')
    const memDir = join(AGENTS_DIR, testAgentId, 'memory')
    assert.ok(existsSync(memDir))
  })
})
