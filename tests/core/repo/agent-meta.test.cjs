'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, rmSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { BaseRepository } = require('../../../core/repo/base.cjs')

const TEST_DIR = join(tmpdir(), `agent-meta-test-${Date.now()}`)

describe('AgentMetaRepository-style operations', () => {
  let repo

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new BaseRepository()
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('readMeta returns null for missing agent', () => {
    const result = repo.read(join(TEST_DIR, 'missing', 'agent.json'))
    assert.strictEqual(result, null)
  })

  it('writeMeta + readMeta roundtrip', () => {
    const metaPath = join(TEST_DIR, 'pm', 'agent.json')
    const meta = { id: 'pm', name: 'Project Manager', role: 'pm' }
    repo.write(metaPath, meta)
    const loaded = repo.read(metaPath)
    assert.deepStrictEqual(loaded, meta)
  })

  it('updateMeta applies mutator', () => {
    const metaPath = join(TEST_DIR, 'pm', 'agent.json')
    repo.write(metaPath, { id: 'pm', name: 'PM' })
    const result = repo.update(metaPath, meta => {
      meta.name = 'Project Manager'
      return meta
    })
    assert.strictEqual(result.name, 'Project Manager')
  })
})
