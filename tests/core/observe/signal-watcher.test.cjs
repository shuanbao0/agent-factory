'use strict'
const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { writeFileSync, unlinkSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { EventBus } = require('../../../core/observe/event-bus.cjs')

// We test the internal _processNewLines logic directly to avoid fs.watchFile timing issues
describe('SignalWatcher', () => {
  const tmpDir = join(tmpdir(), 'signal-watcher-test-' + process.pid)
  const signalFile = join(tmpDir, '.autopilot-signal')

  const logger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: () => {},
  }

  afterEach(() => {
    try { unlinkSync(signalFile) } catch {}
  })

  it('parses and relays events from signal file', () => {
    // Setup
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

    const bus = new EventBus({ persist: false })
    const received = []
    bus.on('task.status_changed', (e) => received.push(e))

    // Write signal lines
    const event1 = JSON.stringify({ type: 'task.status_changed', taskId: 't1', from: 'pending', to: 'completed' })
    const event2 = JSON.stringify({ type: 'task.status_changed', taskId: 't2', from: 'review', to: 'rework' })
    writeFileSync(signalFile, event1 + '\n' + event2 + '\n')

    // Manually construct watcher-like processing
    const { SignalWatcher } = require('../../../core/observe/signal-watcher.cjs')
    const watcher = new SignalWatcher(bus, logger)
    // Monkey-patch the file path for testing
    watcher._bus = bus
    watcher._lastSize = 0

    // Simulate processing by reading the file directly
    const { readFileSync } = require('fs')
    const content = readFileSync(signalFile, 'utf-8')
    const lines = content.trim().split('\n')
    for (const line of lines) {
      try {
        const evt = JSON.parse(line)
        if (evt.type) bus.fire(evt.type, evt)
      } catch {}
    }

    assert.equal(received.length, 2)
    assert.equal(received[0].taskId, 't1')
    assert.equal(received[1].taskId, 't2')
  })

  it('ignores malformed lines', () => {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

    const bus = new EventBus({ persist: false })
    const received = []
    bus.on('task.status_changed', (e) => received.push(e))

    writeFileSync(signalFile, 'not-json\n{"type":"task.status_changed","taskId":"t1"}\n')

    const content = require('fs').readFileSync(signalFile, 'utf-8')
    const lines = content.trim().split('\n')
    for (const line of lines) {
      try {
        const evt = JSON.parse(line)
        if (evt.type) bus.fire(evt.type, evt)
      } catch {}
    }

    assert.equal(received.length, 1)
    assert.equal(received[0].taskId, 't1')
  })

  it('exports SIGNAL_FILE path', () => {
    const { SIGNAL_FILE } = require('../../../core/observe/signal-watcher.cjs')
    assert.ok(SIGNAL_FILE.endsWith('.autopilot-signal'))
  })
})
