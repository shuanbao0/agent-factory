'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { EventBus } = require('../../../core/observe/event-bus.cjs')

describe('EventBus', () => {
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

  it('persists events to DB when enabled', () => {
    const bus = new EventBus({ persist: true })
    bus.fire('persist.test', { value: 42 })

    // Verify via DB query
    const { queryEvents } = require('../../../core/db/queries/event-queries.cjs')
    const events = queryEvents({ type: 'persist.test' })
    assert.ok(events.length >= 1, 'should have at least one persisted event')
    const found = events.find(e => e.value === 42)
    assert.ok(found, 'should find the persisted event')
  })

  it('does not persist when persist=false', () => {
    const { getDb } = require('../../../core/db/connection.cjs')
    const db = getDb()
    const before = db.prepare("SELECT COUNT(*) AS cnt FROM events WHERE type = 'no.persist.test'").get().cnt
    const bus = new EventBus({ persist: false })
    bus.fire('no.persist.test', { data: 1 })
    const after = db.prepare("SELECT COUNT(*) AS cnt FROM events WHERE type = 'no.persist.test'").get().cnt
    assert.equal(after, before, 'event count should not change')
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
    assert.ok(!isNaN(new Date(event.ts).getTime()))
  })
})
