'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { existsSync, rmSync } = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { AgentService } = require('../../core/common/agent-service.cjs')
const { AgentMetaRepository } = require('../../core/repo/agent-meta.cjs')

describe('AgentService', () => {
  const createdAgentIds = []

  // Mock dependencies to avoid side effects on real config
  let addedAgents = []
  let removedAgents = []

  const mockConfigRepo = {
    addAgent: (id, dir, model) => { addedAgents.push({ id, dir, model }) },
    removeAgent: (id) => { removedAgents.push(id) },
  }
  const mockAgentMetaRepo = new AgentMetaRepository({ cacheTtlMs: 0 })
  const mockDeptConfigRepo = { load: () => null, save: () => {} }
  const mockTemplateRepo = { readTemplate: () => null, getTemplateDir: () => null, readTemplateFile: () => null }

  const svc = new AgentService(mockConfigRepo, mockAgentMetaRepo, mockDeptConfigRepo, mockTemplateRepo)

  afterEach(() => {
    addedAgents = []
    removedAgents = []
    // Clean up test agents and workspaces
    for (const id of createdAgentIds) {
      const agentDir = join(PROJECT_ROOT, 'agents', id)
      if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })
      const wsDir = join(PROJECT_ROOT, 'workspaces', id)
      if (existsSync(wsDir)) rmSync(wsDir, { recursive: true, force: true })
    }
    createdAgentIds.length = 0
  })

  it('createAgent with valid data returns ok=true and creates files', async () => {
    const id = `zzz-test-agent-${Date.now()}`
    createdAgentIds.push(id)
    const result = await svc.createAgent({ id, name: 'Test Agent' })
    assert.equal(result.ok, true)
    assert.equal(result.id, id)
    assert.ok(mockAgentMetaRepo.exists(id))
  })

  it('createAgent rejects missing id with ok=false, status=400', async () => {
    const result = await svc.createAgent({ name: 'Test Agent' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('createAgent rejects missing name with ok=false, status=400', async () => {
    const result = await svc.createAgent({ id: 'zzz-test-no-name' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('createAgent rejects invalid id with ok=false, status=400', async () => {
    const result = await svc.createAgent({ id: 'INVALID ID!', name: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('updateAgent updates agent.json fields', async () => {
    const id = `zzz-test-agent-upd-${Date.now()}`
    createdAgentIds.push(id)
    await svc.createAgent({ id, name: 'Original Name' })

    const result = await svc.updateAgent({ id, name: 'Updated Name', description: 'New desc' })
    assert.equal(result.ok, true)

    const meta = mockAgentMetaRepo.readMeta(id)
    assert.equal(meta.name, 'Updated Name')
    assert.equal(meta.description, 'New desc')
  })

  it('deleteAgent removes agent directory', async () => {
    const id = `zzz-test-agent-del-${Date.now()}`
    createdAgentIds.push(id)
    await svc.createAgent({ id, name: 'To Delete' })
    assert.ok(mockAgentMetaRepo.exists(id))

    const result = await svc.deleteAgent(id)
    assert.equal(result.ok, true)
    assert.ok(!mockAgentMetaRepo.exists(id))
  })

  it('peer-status skill is auto-included', async () => {
    const id = `zzz-test-agent-peer-${Date.now()}`
    createdAgentIds.push(id)
    await svc.createAgent({ id, name: 'Peer Test', skills: ['github'] })

    const meta = mockAgentMetaRepo.readMeta(id)
    assert.ok(meta.skills.includes('peer-status'))
  })
})
