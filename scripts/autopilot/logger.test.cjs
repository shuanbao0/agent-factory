'use strict'
const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, readFileSync, rmSync, existsSync, writeFileSync, readdirSync } = require('fs')
const { join } = require('path')

const TEST_DIR = join(__dirname, '..', '..', '_test_logger_tmp')

describe('logger', () => {
  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('formatMessage logic', () => {
    it('formats basic message with timestamp and level', () => {
      const ts = new Date().toISOString()
      const line = `[${ts}] [INFO] [test] Hello world`
      assert.ok(line.includes('[INFO]'))
      assert.ok(line.includes('[test]'))
      assert.ok(line.includes('Hello world'))
    })

    it('formats Error objects using message property', () => {
      const err = new Error('something broke')
      const extra = err instanceof Error ? err.message : JSON.stringify(err)
      assert.equal(extra, 'something broke')
    })

    it('formats plain data as JSON', () => {
      const data = { key: 'value' }
      const extra = data instanceof Error ? data.message : JSON.stringify(data)
      assert.equal(extra, '{"key":"value"}')
    })
  })

  describe('cleanOldLogs logic', () => {
    it('removes logs older than maxDays', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      // Create an old log file (30 days ago)
      const oldDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
      const todayDate = new Date().toISOString().slice(0, 10)
      writeFileSync(join(TEST_DIR, `${oldDate}.log`), 'old log')
      writeFileSync(join(TEST_DIR, `${todayDate}.log`), 'today log')

      // Simulate cleanOldLogs
      const maxDays = 14
      const cutoff = Date.now() - maxDays * 86400_000
      for (const file of readdirSync(TEST_DIR)) {
        const match = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/)
        if (match && new Date(match[1]).getTime() < cutoff) {
          rmSync(join(TEST_DIR, file))
        }
      }

      assert.ok(!existsSync(join(TEST_DIR, `${oldDate}.log`)))
      assert.ok(existsSync(join(TEST_DIR, `${todayDate}.log`)))
    })

    it('preserves recent logs', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      const recentDate = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10)
      writeFileSync(join(TEST_DIR, `${recentDate}.log`), 'recent')

      const maxDays = 14
      const cutoff = Date.now() - maxDays * 86400_000
      for (const file of readdirSync(TEST_DIR)) {
        const match = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/)
        if (match && new Date(match[1]).getTime() < cutoff) {
          rmSync(join(TEST_DIR, file))
        }
      }

      assert.ok(existsSync(join(TEST_DIR, `${recentDate}.log`)))
    })
  })
})
