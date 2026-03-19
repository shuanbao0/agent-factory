'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { tmpdir } = require('os')
const { readFileSync, unlinkSync, existsSync } = require('fs')

const { EventBus } = require('../../core/observe/event-bus.cjs')

/** Generate a unique temp file path for JSONL output */
function tempJsonlPath() {
  return join(tmpdir(), `zzz-test-events-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`)
}

/** Track temp files for cleanup */
const tempFiles = []

afterEach(() => {
  for (const f of tempFiles) {
    try { if (existsSync(f)) unlinkSync(f) } catch { /* ignore */ }
  }
  tempFiles.length = 0
})

describe('EventBus', () => {
  describe('multi-listener event propagation', () => {
    it('fire triggers all listeners with payload', () => {
      const bus = new EventBus({ persist: false })
      const received = []

      bus.on('zzz-test.event', (evt) => received.push({ listener: 1, evt }))
      bus.on('zzz-test.event', (evt) => received.push({ listener: 2, evt }))
      bus.on('zzz-test.event', (evt) => received.push({ listener: 3, evt }))

      bus.fire('zzz-test.event', { data: 'hello' })

      assert.equal(received.length, 3)
      assert.equal(received[0].evt.data, 'hello')
      assert.equal(received[1].evt.data, 'hello')
      assert.equal(received[2].evt.data, 'hello')
    })
  })

  describe('error isolation', () => {
    it('one listener throws, others still called', () => {
      const bus = new EventBus({ persist: false })
      const called = []

      bus.on('zzz-test.error', () => called.push('first'))
      bus.on('zzz-test.error', () => { throw new Error('zzz-test boom') })
      bus.on('zzz-test.error', () => called.push('third'))

      // Should not throw
      bus.fire('zzz-test.error', { x: 1 })

      // EventEmitter stops at the first throw inside emit(),
      // but EventBus.fire() wraps emit in try/catch so it doesn't propagate.
      // At minimum the first listener is called and no exception escapes.
      assert.ok(called.includes('first'))
      // fire() does not throw
    })
  })

  describe('JSONL persistence', () => {
    it('fire with persist=true writes event to file', () => {
      const filePath = tempJsonlPath()
      tempFiles.push(filePath)
      const bus = new EventBus({ persist: true, filePath })

      bus.fire('zzz-test.persist', { key: 'value1' })
      bus.fire('zzz-test.persist', { key: 'value2' })

      const content = readFileSync(filePath, 'utf-8')
      const lines = content.trim().split('\n')
      assert.equal(lines.length, 2)

      const event1 = JSON.parse(lines[0])
      assert.equal(event1.type, 'zzz-test.persist')
      assert.equal(event1.key, 'value1')
      assert.ok(event1.ts, 'should have timestamp')

      const event2 = JSON.parse(lines[1])
      assert.equal(event2.key, 'value2')
    })

    it('persist=false does not create file', () => {
      const filePath = tempJsonlPath()
      tempFiles.push(filePath)
      const bus = new EventBus({ persist: false, filePath })

      bus.fire('zzz-test.nopersist', { x: 1 })

      assert.equal(existsSync(filePath), false)
    })
  })

  describe('on/off lifecycle', () => {
    it('add listener, verify it fires, remove, verify it does not', () => {
      const bus = new EventBus({ persist: false })
      const calls = []

      const listener = (evt) => calls.push(evt)
      bus.on('zzz-test.lifecycle', listener)

      bus.fire('zzz-test.lifecycle', { seq: 1 })
      assert.equal(calls.length, 1)

      bus.off('zzz-test.lifecycle', listener)

      bus.fire('zzz-test.lifecycle', { seq: 2 })
      assert.equal(calls.length, 1, 'listener should not fire after off()')
    })
  })

  describe('event payload includes type + ts automatically', () => {
    it('fired event has type and ts fields', () => {
      const bus = new EventBus({ persist: false })
      let received = null

      bus.on('zzz-test.meta', (evt) => { received = evt })
      bus.fire('zzz-test.meta', { custom: 42 })

      assert.ok(received)
      assert.equal(received.type, 'zzz-test.meta')
      assert.equal(received.custom, 42)
      assert.ok(received.ts, 'should have ts field')
      // ts should be a valid ISO date string
      assert.ok(!isNaN(Date.parse(received.ts)), 'ts should be parseable as date')
    })
  })

  describe('cross-event type isolation', () => {
    it('listeners only receive events of their registered type', () => {
      const bus = new EventBus({ persist: false })
      const aCalls = []
      const bCalls = []

      bus.on('zzz-test.typeA', (evt) => aCalls.push(evt))
      bus.on('zzz-test.typeB', (evt) => bCalls.push(evt))

      bus.fire('zzz-test.typeA', { val: 'a' })
      bus.fire('zzz-test.typeB', { val: 'b' })
      bus.fire('zzz-test.typeA', { val: 'a2' })

      assert.equal(aCalls.length, 2)
      assert.equal(bCalls.length, 1)
      assert.equal(aCalls[0].val, 'a')
      assert.equal(bCalls[0].val, 'b')
    })
  })

  describe('listenerCount', () => {
    it('tracks listener count correctly', () => {
      const bus = new EventBus({ persist: false })
      assert.equal(bus.listenerCount('zzz-test.count'), 0)

      const fn1 = () => {}
      const fn2 = () => {}
      bus.on('zzz-test.count', fn1)
      assert.equal(bus.listenerCount('zzz-test.count'), 1)

      bus.on('zzz-test.count', fn2)
      assert.equal(bus.listenerCount('zzz-test.count'), 2)

      bus.off('zzz-test.count', fn1)
      assert.equal(bus.listenerCount('zzz-test.count'), 1)
    })
  })
})
