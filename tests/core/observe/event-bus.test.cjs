'use strict'
const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, rmSync, mkdirSync } = require('fs')
const { join } = require('path')
const { EventBus } = require('../../../core/observe/event-bus.cjs')

const TEST_DIR = join(__dirname, '..', '_test_event_bus_tmp')
const TEST_FILE = join(TEST_DIR, 'events.jsonl')

describe('EventBus', () => {
  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  it('emits events to listeners', () => {
    const bus = new EventBus()
    const received = []
    bus.on('test.event', (e) => received.push(e))
    bus.fire('test.event', { foo: 'bar' })
    assert.equal(received.length, 1)
    assert.equal(received[0].type, 'test.event')
    assert.equal(received[0].foo, 'bar')
    assert.ok(received[0].ts)
  })

  it('fire does not throw when no listeners', () => {
    const bus = new EventBus()
    assert.doesNotThrow(() => bus.fire('no.listeners', { data: 1 }))
  })

  it('swallows listener errors', () => {
    const bus = new EventBus()
    bus.on('error.event', () => { throw new Error('boom') })
    assert.doesNotThrow(() => bus.fire('error.event'))
  })

  it('persists events to JSONL when enabled', () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const bus = new EventBus({ persist: true, filePath: TEST_FILE })
    bus.fire('persist.test', { value: 42 })
    bus.fire('persist.test', { value: 43 })

    assert.ok(existsSync(TEST_FILE))
    const lines = readFileSync(TEST_FILE, 'utf-8').split('\n').filter(Boolean)
    assert.equal(lines.length, 2)
    const first = JSON.parse(lines[0])
    assert.equal(first.type, 'persist.test')
    assert.equal(first.value, 42)
  })

  it('does not persist when persist=false', () => {
    const bus = new EventBus({ persist: false, filePath: TEST_FILE })
    bus.fire('no.persist', { data: 1 })
    assert.ok(!existsSync(TEST_FILE))
  })

  it('on/off works correctly', () => {
    const bus = new EventBus()
    const received = []
    const handler = (e) => received.push(e)
    bus.on('toggle', handler)
    bus.fire('toggle', { n: 1 })
    bus.off('toggle', handler)
    bus.fire('toggle', { n: 2 })
    assert.equal(received.length, 1)
    assert.equal(received[0].n, 1)
  })

  it('event payload includes ts field', () => {
    const bus = new EventBus()
    let event
    bus.on('ts.test', (e) => { event = e })
    bus.fire('ts.test')
    assert.ok(event.ts)
    // Should be valid ISO date
    assert.ok(!isNaN(new Date(event.ts).getTime()))
  })

  it('creates directory if it does not exist', () => {
    const nestedFile = join(TEST_DIR, 'nested', 'deep', 'events.jsonl')
    const bus = new EventBus({ persist: true, filePath: nestedFile })
    bus.fire('mkdir.test', { ok: true })
    assert.ok(existsSync(nestedFile))
  })
})
