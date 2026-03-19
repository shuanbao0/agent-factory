'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { existsSync, readFileSync, writeFileSync } = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const MODELS_FILE = join(PROJECT_ROOT, 'config', 'models.json')
const { ModelsRepository, modelsRepo } = require('../../core/repo/models-repo.cjs')

describe('ModelsRepository', () => {
  let backupRaw

  beforeEach(() => {
    backupRaw = existsSync(MODELS_FILE) ? readFileSync(MODELS_FILE, 'utf-8') : null
  })

  afterEach(() => {
    if (backupRaw !== null) writeFileSync(MODELS_FILE, backupRaw)
    modelsRepo.invalidate()
  })

  it('readModels returns object with providers key', () => {
    const result = modelsRepo.readModels()
    assert.equal(typeof result, 'object')
    assert.ok(result !== null)
    assert.ok('providers' in result)
  })

  it('ensureDefaults does not throw', () => {
    assert.doesNotThrow(() => {
      modelsRepo.ensureDefaults()
    })
  })

  it('updateModels applies mutator', () => {
    modelsRepo.updateModels(cfg => {
      cfg._zzz_test_key = 'test-value'
      return cfg
    })

    const after = modelsRepo.readModels()
    assert.equal(after._zzz_test_key, 'test-value')
  })

  it('writeModels + readModels roundtrip', () => {
    const current = modelsRepo.readModels()
    const modified = { ...current, _zzz_test_roundtrip: true }
    modelsRepo.writeModels(modified)

    const after = modelsRepo.readModels()
    assert.equal(after._zzz_test_roundtrip, true)
  })
})
