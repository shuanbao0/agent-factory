'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const os = require('os')
const { AgentService } = require('../../core/common/agent-service.cjs')
const { AgentMetaRepository } = require('../../core/repo/agent-meta.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')

const TEST_ID = 'zzz-test-lifecycle-' + process.pid

describe('Agent lifecycle — create → update → delete', () => {
  let service
  let addedAgents
  let removedAgents
  let hookCalls

  beforeEach(() => {
    addedAgents = []
    removedAgents = []
    hookCalls = { baseRules: 0, skillsSync: 0, gateway: 0 }

    const mockConfigRepo = {
      addAgent: (id, dir, model) => { addedAgents.push({ id, dir, model }) },
      removeAgent: (id) => { removedAgents.push(id) },
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
    const agentDir = join(AGENTS_DIR, TEST_ID)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })
    const wsDir = join(WORKSPACES_DIR, TEST_ID)
    if (existsSync(wsDir)) rmSync(wsDir, { recursive: true, force: true })
    // Clean up archived workspaces
    const archivePrefix = join(WORKSPACES_DIR, TEST_ID + '_archived_')
    try {
      const { readdirSync } = require('fs')
      for (const name of readdirSync(WORKSPACES_DIR)) {
        if (name.startsWith(TEST_ID)) {
          rmSync(join(WORKSPACES_DIR, name), { recursive: true, force: true })
        }
      }
    } catch { /* ignore */ }
  })

  it('full lifecycle: create → verify → update → verify → delete → verify', async () => {
    const hooks = {
      onBaseRulesInject: () => { hookCalls.baseRules++ },
      onSkillsSync: () => { hookCalls.skillsSync++ },
      onGatewayRestart: () => { hookCalls.gateway++; return true },
    }

    // ── Create ──
    const createResult = await service.createAgent({
      id: TEST_ID,
      name: 'Test Agent',
      description: 'A test agent for lifecycle',
      skills: ['peer-status'],
      peers: [],
    }, hooks)

    assert.equal(createResult.ok, true)
    assert.equal(createResult.id, TEST_ID)
    assert.equal(createResult.deployed, true)
    assert.equal(createResult.restarted, true)

    // Verify directory structure
    const agentDir = join(AGENTS_DIR, TEST_ID)
    assert.ok(existsSync(agentDir))
    assert.ok(existsSync(join(agentDir, 'agent.json')))
    assert.ok(existsSync(join(agentDir, 'AGENTS.md')))
    assert.ok(existsSync(join(agentDir, 'TOOLS.md')))
    assert.ok(existsSync(join(agentDir, 'IDENTITY.md')))
    assert.ok(existsSync(join(agentDir, 'SOUL.md')))
    assert.ok(existsSync(join(agentDir, 'MEMORY.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'KNOWLEDGE_TREE.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'relationships', 'peers.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'relationships', 'stakeholders.md')))
    assert.ok(existsSync(join(agentDir, 'memory', 'domains')))
    assert.ok(existsSync(join(agentDir, 'memory', 'projects')))
    assert.ok(existsSync(join(agentDir, 'memory', 'decisions')))

    // Verify workspace created
    assert.ok(existsSync(join(WORKSPACES_DIR, TEST_ID)))

    // Verify agent.json content
    const agentJson = JSON.parse(readFileSync(join(agentDir, 'agent.json'), 'utf-8'))
    assert.equal(agentJson.id, TEST_ID)
    assert.equal(agentJson.name, 'Test Agent')
    assert.equal(agentJson.description, 'A test agent for lifecycle')
    assert.ok(agentJson.createdAt)

    // Verify hooks called
    assert.equal(hookCalls.baseRules, 1)
    assert.equal(hookCalls.skillsSync, 1)
    assert.equal(hookCalls.gateway, 1)

    // Verify registered in config
    assert.equal(addedAgents.length, 1)
    assert.equal(addedAgents[0].id, TEST_ID)

    // ── Update ──
    const updateResult = await service.updateAgent({
      id: TEST_ID,
      description: 'Updated description',
    }, hooks)

    assert.equal(updateResult.ok, true)

    const updatedJson = JSON.parse(readFileSync(join(agentDir, 'agent.json'), 'utf-8'))
    assert.equal(updatedJson.description, 'Updated description')
    assert.equal(updatedJson.name, 'Test Agent') // unchanged

    // ── Delete ──
    const deleteResult = await service.deleteAgent(TEST_ID)
    assert.equal(deleteResult.ok, true)

    // Verify agent dir deleted
    assert.equal(existsSync(join(AGENTS_DIR, TEST_ID)), false)
  })

  it('create fails: missing id', async () => {
    const result = await service.createAgent({ name: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('create fails: invalid ID format (UPPERCASE)', async () => {
    const result = await service.createAgent({ id: 'INVALID_UPPER', name: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('create fails: duplicate ID', async () => {
    const agentDir = join(AGENTS_DIR, TEST_ID)
    mkdirSync(agentDir, { recursive: true })
    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify({ id: TEST_ID }))

    const result = await service.createAgent({ id: TEST_ID, name: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
  })

  it('works without hooks (undefined safe)', async () => {
    const result = await service.createAgent({
      id: TEST_ID,
      name: 'Test Agent',
    })

    assert.equal(result.ok, true)
    assert.equal(result.restarted, false)
  })

  it('create from template: applies template defaults', async () => {
    // Set up mock template repo that returns template data
    const tmpDir = join(os.tmpdir(), 'zzz-test-template-' + process.pid)
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(join(tmpDir, 'AGENTS.md'), '# Template Agent\nYou are a PM.')
    writeFileSync(join(tmpDir, 'SOUL.md'), '# Template Soul\nBe helpful.')
    writeFileSync(join(tmpDir, 'IDENTITY.md'), '# Template Identity\nPM role.')

    const mockTemplateRepo = {
      readTemplate: (id) => {
        if (id === 'pm') {
          return {
            id: 'pm',
            defaults: { model: 'minimax/MiniMax-M2.5', skills: ['github'], peers: ['ceo'] },
            group: 'executive',
          }
        }
        return null
      },
      getTemplateDir: (id) => id === 'pm' ? tmpDir : null,
      readTemplateFile: (dir, filename) => {
        const filePath = join(dir, filename)
        if (existsSync(filePath)) return readFileSync(filePath, 'utf-8')
        return null
      },
    }

    const mockConfigRepo = {
      addAgent: (id, dir, model) => { addedAgents.push({ id, dir, model }) },
      removeAgent: () => {},
    }
    const mockAgentMetaRepo = new AgentMetaRepository({ cacheTtlMs: 0 })
    const mockDeptConfigRepo = { load: () => null, save: () => {} }

    const svc = new AgentService(mockConfigRepo, mockAgentMetaRepo, mockDeptConfigRepo, mockTemplateRepo)
    const result = await svc.createAgent({
      id: TEST_ID,
      name: 'Test PM',
      templateId: 'pm',
    })

    assert.equal(result.ok, true)
    assert.equal(result.hasIdentityFiles, true)

    const agentJson = JSON.parse(readFileSync(join(AGENTS_DIR, TEST_ID, 'agent.json'), 'utf-8'))
    assert.ok(agentJson.skills.includes('github'))
    assert.ok(agentJson.skills.includes('peer-status'))
    assert.deepEqual(agentJson.peers, ['ceo'])

    // Verify template files were used
    const agentsMd = readFileSync(join(AGENTS_DIR, TEST_ID, 'AGENTS.md'), 'utf-8')
    assert.ok(agentsMd.includes('Template Agent'))

    const identityMd = readFileSync(join(AGENTS_DIR, TEST_ID, 'IDENTITY.md'), 'utf-8')
    assert.ok(identityMd.includes('Template Identity'))

    // Clean up template dir
    rmSync(tmpDir, { recursive: true, force: true })
  })
})
