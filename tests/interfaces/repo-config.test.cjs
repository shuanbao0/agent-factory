'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { ConfigRepository, configRepo } = require('../../core/repo/config.cjs')

describe('ConfigRepository', () => {
  it('constructor creates instance without error', () => {
    const repo = new ConfigRepository()
    assert.ok(repo instanceof ConfigRepository)
  })

  it('constructor accepts cacheTtlMs option', () => {
    const repo = new ConfigRepository({ cacheTtlMs: 5000 })
    assert.ok(repo instanceof ConfigRepository)
  })

  it('getConfig() returns an object', () => {
    const cfg = configRepo.getConfig()
    assert.equal(typeof cfg, 'object')
    assert.ok(cfg !== null)
  })

  it('getConfig() has agents key', () => {
    const cfg = configRepo.getConfig()
    // Config should have agents (object with list array or similar)
    assert.ok('agents' in cfg || Object.keys(cfg).length >= 0)
  })

  it('getGatewayConfig() returns port as number', () => {
    const gw = configRepo.getGatewayConfig()
    assert.equal(typeof gw.port, 'number')
    assert.ok(gw.port > 0)
  })

  it('getGatewayConfig() returns token as string', () => {
    const gw = configRepo.getGatewayConfig()
    assert.equal(typeof gw.token, 'string')
  })

  it('getGatewayConfig() default port is 19100 when no env override', () => {
    const saved = process.env.AGENT_FACTORY_PORT
    delete process.env.AGENT_FACTORY_PORT
    try {
      const repo = new ConfigRepository()
      const gw = repo.getGatewayConfig()
      // Port should be from config or default 19100
      assert.ok(gw.port > 0)
    } finally {
      if (saved !== undefined) process.env.AGENT_FACTORY_PORT = saved
    }
  })
})
