'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { validateAgentId, validateTaskStatus, sanitizePath } = require('./validators.cjs')

describe('Validators', () => {
  it('validateAgentId: valid lowercase with hyphens', () => {
    assert.ok(validateAgentId('my-agent-1').valid)
  })

  it('validateAgentId: rejects empty', () => {
    assert.ok(!validateAgentId('').valid)
    assert.ok(!validateAgentId(null).valid)
  })

  it('validateAgentId: rejects uppercase', () => {
    assert.ok(!validateAgentId('MyAgent').valid)
  })

  it('validateAgentId: rejects too long', () => {
    assert.ok(!validateAgentId('a'.repeat(65)).valid)
  })

  it('validateTaskStatus: valid statuses', () => {
    assert.ok(validateTaskStatus('pending'))
    assert.ok(validateTaskStatus('in_progress'))
    assert.ok(validateTaskStatus('rework'))
    assert.ok(!validateTaskStatus('running'))
    assert.ok(!validateTaskStatus('unknown'))
  })

  it('sanitizePath: rejects path traversal', () => {
    assert.strictEqual(sanitizePath('../etc/passwd'), null)
    assert.strictEqual(sanitizePath('valid/path'), 'valid/path')
    assert.strictEqual(sanitizePath(null), null)
    assert.strictEqual(sanitizePath(''), null)
  })
})
