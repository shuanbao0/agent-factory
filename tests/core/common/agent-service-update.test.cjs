'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const { AGENTS_DIR } = require('../../../core/common/paths.cjs')
const { AgentService } = require('../../../core/common/agent-service.cjs')
const { AgentMetaRepository } = require('../../../core/repo/agent-meta.cjs')

const TEST_AGENT_ID = 'zzz-test-update-agent'

describe('AgentService.updateAgent', () => {
  let service
  let addedAgents
  let hookCalls

  beforeEach(() => {
    addedAgents = []
    hookCalls = { baseRules: 0, skillsSync: 0, gateway: 0 }

    const mockConfigRepo = {
      addAgent: (id, dir, model) => { addedAgents.push({ id, dir, model }) },
      removeAgent: () => {},
    }
    const mockAgentMetaRepo = new AgentMetaRepository({ cacheTtlMs: 0 })
    const mockDeptConfigRepo = { load: () => null, save: () => {} }
    const mockTemplateRepo = {
      readTemplate: () => null,
      getTemplateDir: () => null,
      readTemplateFile: () => null,
    }

    service = new AgentService(mockConfigRepo, mockAgentMetaRepo, mockDeptConfigRepo, mockTemplateRepo)

    // Create test agent directory with agent.json
    const agentDir = join(AGENTS_DIR, TEST_AGENT_ID)
    mkdirSync(join(agentDir, 'skills'), { recursive: true })
    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify({
      id: TEST_AGENT_ID,
      name: 'Original Name',
      description: 'Original desc',
      model: 'test/model',
      skills: ['peer-status'],
      peers: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }, null, 2))
    writeFileSync(join(agentDir, 'AGENTS.md'), '# Original')
  })

  afterEach(() => {
    const agentDir = join(AGENTS_DIR, TEST_AGENT_ID)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })
  })

  it('rejects missing id', async () => {
    const result = await service.updateAgent({})
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('rejects nonexistent agent', async () => {
    const result = await service.updateAgent({ id: '__nonexistent_agent_xyz__' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 404)
  })

  it('updates name and description', async () => {
    const hooks = {
      onBaseRulesInject: () => { hookCalls.baseRules++ },
    }
    const result = await service.updateAgent({
      id: TEST_AGENT_ID,
      name: 'New Name',
      description: 'New desc',
    }, hooks)

    assert.equal(result.ok, true)

    const agentJson = JSON.parse(readFileSync(join(AGENTS_DIR, TEST_AGENT_ID, 'agent.json'), 'utf-8'))
    assert.equal(agentJson.name, 'New Name')
    assert.equal(agentJson.description, 'New desc')
    assert.ok(agentJson.updatedAt > '2026-01-01')
  })

  it('updates AGENTS.md when systemPrompt provided', async () => {
    const hooks = {
      onBaseRulesInject: () => { hookCalls.baseRules++ },
    }
    const result = await service.updateAgent({
      id: TEST_AGENT_ID,
      systemPrompt: '# New Prompt',
    }, hooks)

    assert.equal(result.ok, true)
    const agentsMd = readFileSync(join(AGENTS_DIR, TEST_AGENT_ID, 'AGENTS.md'), 'utf-8')
    assert.equal(agentsMd, '# New Prompt')
    assert.equal(hookCalls.baseRules, 1)
  })

  it('regenerates TOOLS.md when skills change', async () => {
    const hooks = {
      onBaseRulesInject: () => { hookCalls.baseRules++ },
      onSkillsSync: () => { hookCalls.skillsSync++ },
    }
    const result = await service.updateAgent({
      id: TEST_AGENT_ID,
      skills: ['peer-status', 'github'],
    }, hooks)

    assert.equal(result.ok, true)
    assert.equal(hookCalls.skillsSync, 1)
    assert.ok(existsSync(join(AGENTS_DIR, TEST_AGENT_ID, 'TOOLS.md')))
  })

  it('updates openclaw.json and restarts when model changes', async () => {
    const hooks = {
      onBaseRulesInject: () => { hookCalls.baseRules++ },
      onGatewayRestart: () => { hookCalls.gateway++; return true },
    }
    const result = await service.updateAgent({
      id: TEST_AGENT_ID,
      model: 'new/model',
    }, hooks)

    assert.equal(result.ok, true)
    assert.equal(addedAgents.length, 1)
    assert.equal(hookCalls.gateway, 1)
  })

  it('works without hooks', async () => {
    const result = await service.updateAgent({
      id: TEST_AGENT_ID,
      name: 'Updated',
    })

    assert.equal(result.ok, true)
  })
})
