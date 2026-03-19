'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, rmSync, writeFileSync, readFileSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { BaseRepository } = require('../../../core/repo/base.cjs')

const TEST_DIR = join(tmpdir(), `dept-config-test-${Date.now()}`)

describe('DeptConfigRepository-style operations', () => {
  let repo

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new BaseRepository()
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('load returns null when file missing', () => {
    const result = repo.read(join(TEST_DIR, 'nonexistent', 'config.json'))
    assert.strictEqual(result, null)
  })

  it('save + load roundtrip', () => {
    const fp = join(TEST_DIR, 'config.json')
    const config = { name: 'test-dept', head: 'test-chief', agents: ['test-chief', 'worker-1'] }
    repo.write(fp, config)
    const loaded = repo.read(fp)
    assert.deepStrictEqual(loaded, config)
  })

  it('atomic update adds agent without losing data', () => {
    const fp = join(TEST_DIR, 'config.json')
    repo.write(fp, { name: 'dept', head: 'chief', agents: ['chief'] })

    const result = repo.update(fp, config => {
      const agents = config.agents || []
      if (!agents.includes('worker-1')) agents.push('worker-1')
      config.agents = agents
      return config
    })

    assert.deepStrictEqual(result.agents, ['chief', 'worker-1'])
    assert.strictEqual(result.name, 'dept')
    assert.strictEqual(result.head, 'chief')
  })

  it('atomic update is idempotent for duplicate agent add', () => {
    const fp = join(TEST_DIR, 'config.json')
    repo.write(fp, { agents: ['chief', 'worker-1'] })

    const result = repo.update(fp, config => {
      const agents = config.agents || []
      if (!agents.includes('worker-1')) agents.push('worker-1')
      config.agents = agents
      return config
    })

    assert.deepStrictEqual(result.agents, ['chief', 'worker-1'])
  })

  it('atomic update removes agent correctly', () => {
    const fp = join(TEST_DIR, 'config.json')
    repo.write(fp, { agents: ['chief', 'worker-1', 'worker-2'] })

    const result = repo.update(fp, config => {
      config.agents = (config.agents || []).filter(a => a !== 'worker-1')
      return config
    })

    assert.deepStrictEqual(result.agents, ['chief', 'worker-2'])
  })

  it('atomic update auto-sets head for head-like agent', () => {
    const fp = join(TEST_DIR, 'config.json')
    repo.write(fp, { agents: [] })

    const result = repo.update(fp, config => {
      const agents = config.agents || []
      const agentId = 'novel-chief'
      if (!agents.includes(agentId)) agents.push(agentId)
      config.agents = agents
      if (!config.head && /chief|head|manager|director/.test(agentId)) {
        config.head = agentId
      }
      return config
    })

    assert.strictEqual(result.head, 'novel-chief')
    assert.deepStrictEqual(result.agents, ['novel-chief'])
  })
})
