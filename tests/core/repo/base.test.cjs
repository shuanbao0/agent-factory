'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { BaseRepository } = require('../../../core/repo/base.cjs')

const TEST_DIR = join(tmpdir(), `base-repo-test-${Date.now()}`)

describe('BaseRepository', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('read() returns parsed JSON for existing file', () => {
    const fp = join(TEST_DIR, 'data.json')
    writeFileSync(fp, JSON.stringify({ key: 'value' }))
    const repo = new BaseRepository()
    const result = repo.read(fp)
    assert.deepStrictEqual(result, { key: 'value' })
  })

  it('read() returns null for non-existent file', () => {
    const repo = new BaseRepository()
    const result = repo.read(join(TEST_DIR, 'nope.json'))
    assert.strictEqual(result, null)
  })

  it('write() creates file that can be read back', () => {
    const fp = join(TEST_DIR, 'out.json')
    const repo = new BaseRepository()
    repo.write(fp, { hello: 'world' })
    const raw = readFileSync(fp, 'utf-8')
    assert.deepStrictEqual(JSON.parse(raw), { hello: 'world' })
  })

  it('write() uses atomic tmp+rename (no .tmp file left)', () => {
    const fp = join(TEST_DIR, 'atomic.json')
    const repo = new BaseRepository()
    repo.write(fp, { a: 1 })
    assert.ok(!existsSync(fp + '.tmp'))
    assert.ok(existsSync(fp))
  })

  it('update() performs read-mutate-write', () => {
    const fp = join(TEST_DIR, 'counter.json')
    writeFileSync(fp, JSON.stringify({ count: 5 }))
    const repo = new BaseRepository()
    const result = repo.update(fp, data => {
      data.count = data.count + 1
      return data
    })
    assert.strictEqual(result.count, 6)
    assert.strictEqual(repo.read(fp).count, 6)
  })

  it('cache: repeated reads use cache, invalidate() forces re-read', () => {
    const fp = join(TEST_DIR, 'cached.json')
    writeFileSync(fp, JSON.stringify({ v: 1 }))
    const repo = new BaseRepository({ cacheTtlMs: 60000 })

    const r1 = repo.read(fp)
    assert.strictEqual(r1.v, 1)

    // Write directly, bypassing cache
    writeFileSync(fp, JSON.stringify({ v: 2 }))

    // Still returns cached value
    const r2 = repo.read(fp)
    assert.strictEqual(r2.v, 1)

    // After invalidate, reads fresh
    repo.invalidate(fp)
    const r3 = repo.read(fp)
    assert.strictEqual(r3.v, 2)
  })
})
