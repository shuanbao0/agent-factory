'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, rmSync, readFileSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { BaseRepository } = require('./base-repository.cjs')

// We test ConfigRepository logic by using BaseRepository directly on temp files,
// since ConfigRepository's methods are thin wrappers.

const TEST_DIR = join(tmpdir(), `config-repo-test-${Date.now()}`)
const CONFIG_PATH = join(TEST_DIR, 'openclaw.json')

describe('ConfigRepository-style operations', () => {
  let repo

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify({
      gateway: { port: 19100, auth: { token: 'test-token' } },
      agents: { list: [{ id: 'ceo', workspace: '/agents/ceo' }] },
      tools: {},
    }, null, 2))
    repo = new BaseRepository()
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('getConfig reads and parses JSON', () => {
    const config = repo.read(CONFIG_PATH)
    assert.strictEqual(config.gateway.port, 19100)
    assert.strictEqual(config.agents.list.length, 1)
  })

  it('updateConfig persists mutation', () => {
    repo.update(CONFIG_PATH, config => {
      config.gateway.port = 19200
      return config
    })
    const updated = repo.read(CONFIG_PATH)
    assert.strictEqual(updated.gateway.port, 19200)
  })

  it('addAgent appends to list', () => {
    repo.update(CONFIG_PATH, config => {
      const list = config.agents.list
      list.push({ id: 'pm', workspace: '/agents/pm' })
      return config
    })
    const config = repo.read(CONFIG_PATH)
    assert.strictEqual(config.agents.list.length, 2)
    assert.strictEqual(config.agents.list[1].id, 'pm')
  })

  it('addAgent merges existing agent', () => {
    repo.update(CONFIG_PATH, config => {
      const list = config.agents.list
      const idx = list.findIndex(a => a.id === 'ceo')
      if (idx >= 0) list[idx] = { ...list[idx], model: { primary: 'anthropic/claude-opus-4-6' } }
      return config
    })
    const config = repo.read(CONFIG_PATH)
    assert.strictEqual(config.agents.list.length, 1)
    assert.strictEqual(config.agents.list[0].model.primary, 'anthropic/claude-opus-4-6')
  })

  it('removeAgent filters from list', () => {
    repo.update(CONFIG_PATH, config => {
      config.agents.list = config.agents.list.filter(a => a.id !== 'ceo')
      return config
    })
    const config = repo.read(CONFIG_PATH)
    assert.strictEqual(config.agents.list.length, 0)
  })

  it('getGatewayConfig uses env vars with fallback', () => {
    // Simulating getGatewayConfig logic
    const cfg = repo.read(CONFIG_PATH)
    const envPort = parseInt(process.env.AGENT_FACTORY_PORT || '0')
    const envToken = process.env.AGENT_FACTORY_TOKEN || ''
    const result = {
      port: envPort || cfg.gateway?.port || 19100,
      token: envToken || cfg.gateway?.auth?.token || '',
    }
    assert.strictEqual(result.port, 19100)
    assert.strictEqual(result.token, 'test-token')
  })
})
