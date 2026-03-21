'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const { AGENTS_DIR, WORKSPACES_DIR } = require('../../../core/common/paths.cjs')
const { AgentService } = require('../../../core/common/agent-service.cjs')
const { AgentMetaRepository } = require('../../../core/repo/agent-meta.cjs')

const TEST_AGENT_ID = 'zzz-test-create-agent'

describe('AgentService.createAgent', () => {
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
  })

  afterEach(() => {
    const agentDir = join(AGENTS_DIR, TEST_AGENT_ID)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })
    const wsDir = join(WORKSPACES_DIR, TEST_AGENT_ID)
    if (existsSync(wsDir)) rmSync(wsDir, { recursive: true, force: true })
  })

  it('rejects missing id', async () => {
    const result = await service.createAgent({ name: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('rejects missing name', async () => {
    const result = await service.createAgent({ id: TEST_AGENT_ID })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('rejects invalid id format', async () => {
    const result = await service.createAgent({ id: 'INVALID_ID', name: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('rejects duplicate agent', async () => {
    mkdirSync(join(AGENTS_DIR, TEST_AGENT_ID), { recursive: true })
    writeFileSync(join(AGENTS_DIR, TEST_AGENT_ID, 'agent.json'), JSON.stringify({ id: TEST_AGENT_ID }))
    const result = await service.createAgent({ id: TEST_AGENT_ID, name: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
  })

  it('creates agent with full directory structure', async () => {
    const hooks = {
      onBaseRulesInject: () => { hookCalls.baseRules++ },
      onSkillsSync: () => { hookCalls.skillsSync++ },
      onGatewayRestart: () => { hookCalls.gateway++; return true },
    }

    const result = await service.createAgent({
      id: TEST_AGENT_ID,
      name: 'Test Agent',
      description: 'A test agent',
      skills: ['peer-status'],
      peers: [],
    }, hooks)

    assert.equal(result.ok, true)
    assert.equal(result.id, TEST_AGENT_ID)
    assert.equal(result.deployed, true)
    assert.equal(result.restarted, true)

    // Verify directory structure
    const agentDir = join(AGENTS_DIR, TEST_AGENT_ID)
    assert.ok(existsSync(agentDir))
    assert.ok(existsSync(join(agentDir, 'agent.json')))
    assert.ok(existsSync(join(agentDir, 'AGENTS.md')))
    assert.ok(existsSync(join(agentDir, 'TOOLS.md')))
    assert.ok(existsSync(join(agentDir, 'IDENTITY.md')))
    assert.ok(existsSync(join(agentDir, 'SOUL.md')))
    assert.ok(existsSync(join(agentDir, 'USER.md')))
    assert.ok(existsSync(join(agentDir, 'HEARTBEAT.md')))
    assert.ok(existsSync(join(agentDir, 'MEMORY.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'KNOWLEDGE_TREE.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'relationships', 'peers.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'relationships', 'stakeholders.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'domains')))
    assert.ok(existsSync(join(agentDir, 'memory', 'projects')))
    assert.ok(existsSync(join(agentDir, 'memory', 'decisions')))

    // Verify workspace created
    assert.ok(existsSync(join(WORKSPACES_DIR, TEST_AGENT_ID)))

    // Verify agent.json content
    const agentJson = JSON.parse(readFileSync(join(agentDir, 'agent.json'), 'utf-8'))
    assert.equal(agentJson.id, TEST_AGENT_ID)
    assert.equal(agentJson.name, 'Test Agent')
    assert.equal(agentJson.description, 'A test agent')
    assert.ok(agentJson.createdAt)

    // Verify hooks called
    assert.equal(hookCalls.baseRules, 1)
    assert.equal(hookCalls.skillsSync, 1)
    assert.equal(hookCalls.gateway, 1)

    // Verify registered in config
    assert.equal(addedAgents.length, 1)
    assert.equal(addedAgents[0].id, TEST_AGENT_ID)
  })

  it('ensures peer-status skill is always included', async () => {
    const result = await service.createAgent({
      id: TEST_AGENT_ID,
      name: 'Test Agent',
      skills: ['github'],
    })

    assert.equal(result.ok, true)
    const agentJson = JSON.parse(readFileSync(join(AGENTS_DIR, TEST_AGENT_ID, 'agent.json'), 'utf-8'))
    assert.ok(agentJson.skills.includes('peer-status'))
    assert.ok(agentJson.skills.includes('github'))
  })

  it('works without hooks (undefined safe)', async () => {
    const result = await service.createAgent({
      id: TEST_AGENT_ID,
      name: 'Test Agent',
    })

    assert.equal(result.ok, true)
    assert.equal(result.restarted, false)
  })

  it('uses custom systemPrompt for AGENTS.md', async () => {
    const result = await service.createAgent({
      id: TEST_AGENT_ID,
      name: 'Test Agent',
      systemPrompt: '# Custom Prompt\nDo things.',
    })

    assert.equal(result.ok, true)
    const agentsMd = readFileSync(join(AGENTS_DIR, TEST_AGENT_ID, 'AGENTS.md'), 'utf-8')
    assert.equal(agentsMd, '# Custom Prompt\nDo things.')
  })
})
