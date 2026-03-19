'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, existsSync, writeFileSync, rmSync } = require('fs')
const { join } = require('path')
const { AgentService } = require('../../../core/common/agent-service.cjs')

// Use a temp directory to avoid touching real project data
const TEST_DIR = join(__dirname, '..', '_test_agent_service_tmp')
const AGENTS_DIR = join(TEST_DIR, 'agents')
const WORKSPACES_DIR = join(TEST_DIR, 'workspaces')
const STATE_DIR = join(TEST_DIR, '.openclaw-state', 'agents')

describe('AgentService', () => {
  // We test with mocked repos to avoid filesystem side effects
  let removedAgents
  let service

  beforeEach(() => {
    removedAgents = []
    const mockConfigRepo = {
      removeAgent: (id) => { removedAgents.push(id) },
    }
    const mockAgentMetaRepo = {}
    service = new AgentService(mockConfigRepo, mockAgentMetaRepo)

    // Create temp directories
    mkdirSync(AGENTS_DIR, { recursive: true })
    mkdirSync(WORKSPACES_DIR, { recursive: true })
    mkdirSync(STATE_DIR, { recursive: true })
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  it('deleteAgent removes agent from config', async () => {
    const result = await service.deleteAgent('test-agent')
    assert.equal(result.ok, true)
    assert.deepEqual(removedAgents, ['test-agent'])
  })

  it('deleteAgent returns ok even when agent dir does not exist', async () => {
    const result = await service.deleteAgent('nonexistent')
    assert.equal(result.ok, true)
    assert.equal(result.archivedTo, null)
  })

  it('constructor uses defaults when no deps provided', () => {
    // Should not throw
    const svc = new AgentService()
    assert.ok(svc)
  })

  it('deleteAgent returns archivedTo as null when no workspace exists', async () => {
    const result = await service.deleteAgent('no-workspace')
    assert.equal(result.archivedTo, null)
  })

  it('deleteAgent removes config for each unique agent', async () => {
    await service.deleteAgent('agent-a')
    await service.deleteAgent('agent-b')
    assert.deepEqual(removedAgents, ['agent-a', 'agent-b'])
  })

  it('deleteAgent handles agent with special characters in id', async () => {
    const result = await service.deleteAgent('test-agent-123')
    assert.equal(result.ok, true)
  })
})
