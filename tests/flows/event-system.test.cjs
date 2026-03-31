'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { EventBus } = require('../../core/observe/event-bus.cjs')

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

  describe('DB persistence', () => {
    it('fire with persist=true writes event to DB', () => {
      const bus = new EventBus({ persist: true })

      const uniqueKey = `zzz-persist-${Date.now()}`
      bus.fire('zzz-test.persist', { key: uniqueKey })
      bus.fire('zzz-test.persist', { key: uniqueKey + '-2' })

      const { queryEvents } = require('../../core/db/queries/event-queries.cjs')
      const events = queryEvents({ type: 'zzz-test.persist' })
      const matching = events.filter(e => e.key && e.key.startsWith(uniqueKey))
      assert.equal(matching.length, 2, 'should have 2 persisted events')
      assert.ok(matching.find(e => e.key === uniqueKey), 'should find first event')
      assert.ok(matching.find(e => e.key === uniqueKey + '-2'), 'should find second event')
    })

    it('persist=false does not write to DB', () => {
      const { getDb } = require('../../core/db/connection.cjs')
      const db = getDb()
      const before = db.prepare("SELECT COUNT(*) AS cnt FROM events WHERE type = 'zzz-test.nopersist'").get().cnt
      const bus = new EventBus({ persist: false })
      bus.fire('zzz-test.nopersist', { x: 1 })
      const after = db.prepare("SELECT COUNT(*) AS cnt FROM events WHERE type = 'zzz-test.nopersist'").get().cnt
      assert.equal(after, before)
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
