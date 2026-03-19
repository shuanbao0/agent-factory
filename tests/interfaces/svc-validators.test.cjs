'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { validateAgentId, validateTaskStatus, sanitizePath } = require('../../core/common/validators.cjs')

describe('Validators', () => {
  describe('validateAgentId', () => {
    it('valid IDs return {valid: true}', () => {
      const validIds = ['ceo', 'my-agent', 'agent-123', 'a', 'test-agent-v2']
      for (const id of validIds) {
        const result = validateAgentId(id)
        assert.equal(result.valid, true, `expected "${id}" to be valid`)
      }
    })

    it('invalid IDs return {valid: false, error: string}', () => {
      const invalidIds = [
        'CEO',           // uppercase
        'my agent',      // spaces
        '',              // empty
        null,            // null
        undefined,       // undefined
        'a'.repeat(65),  // too long
      ]
      for (const id of invalidIds) {
        const result = validateAgentId(id)
        assert.equal(result.valid, false, `expected "${id}" to be invalid`)
        assert.equal(typeof result.error, 'string')
      }
    })
  })

  describe('validateTaskStatus', () => {
    it('valid statuses return true', () => {
      const validStatuses = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework']
      for (const status of validStatuses) {
        assert.equal(validateTaskStatus(status), true, `expected "${status}" to be valid`)
      }
    })

    it('invalid status returns false', () => {
      assert.equal(validateTaskStatus('nonexistent'), false)
      assert.equal(validateTaskStatus(''), false)
      assert.equal(validateTaskStatus('PENDING'), false)
    })
  })

  describe('sanitizePath', () => {
    it('normal paths return the path', () => {
      assert.equal(sanitizePath('docs/readme.md'), 'docs/readme.md')
      assert.equal(sanitizePath('src/index.js'), 'src/index.js')
      assert.equal(sanitizePath('file.txt'), 'file.txt')
    })

    it('path traversal ("..") returns null', () => {
      assert.equal(sanitizePath('../etc/passwd'), null)
      assert.equal(sanitizePath('foo/../../bar'), null)
      assert.equal(sanitizePath('..'), null)
    })

    it('empty or non-string returns null', () => {
      assert.equal(sanitizePath(''), null)
      assert.equal(sanitizePath(null), null)
      assert.equal(sanitizePath(undefined), null)
    })
  })
})
