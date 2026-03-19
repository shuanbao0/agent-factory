'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, rmSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { BaseRepository } = require('../../../core/repo/base.cjs')

const TEST_DIR = join(tmpdir(), `project-meta-test-${Date.now()}`)

describe('ProjectMetaRepository-style operations', () => {
  let repo

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new BaseRepository()
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('readMeta returns null for missing project', () => {
    const result = repo.read(join(TEST_DIR, 'missing', '.project-meta.json'))
    assert.strictEqual(result, null)
  })

  it('writeMeta + readMeta roundtrip', () => {
    const metaPath = join(TEST_DIR, 'novel', '.project-meta.json')
    const meta = { name: 'novel', status: 'planning', tasks: [] }
    repo.write(metaPath, meta)
    const loaded = repo.read(metaPath)
    assert.deepStrictEqual(loaded, meta)
  })

  it('updateMeta applies mutator', () => {
    const metaPath = join(TEST_DIR, 'novel', '.project-meta.json')
    repo.write(metaPath, { name: 'novel', tasks: [] })
    const result = repo.update(metaPath, meta => {
      meta.tasks.push({ id: 'task-1', name: 'Test' })
      return meta
    })
    assert.strictEqual(result.tasks.length, 1)
    assert.strictEqual(result.tasks[0].id, 'task-1')
  })

  it('write creates parent directories', () => {
    const metaPath = join(TEST_DIR, 'deep', 'nested', 'project', '.project-meta.json')
    repo.write(metaPath, { name: 'deep' })
    const loaded = repo.read(metaPath)
    assert.strictEqual(loaded.name, 'deep')
  })
})
