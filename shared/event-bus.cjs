'use strict'
/**
 * Event Bus — lightweight EventEmitter wrapper with optional JSONL persistence.
 *
 * Phase 4.1 step 1: emit events only, no reactive subscribers yet.
 * Provides structured event logging (more semantic than raw logger calls)
 * and a future attachment point for Reactors.
 */
const { EventEmitter } = require('events')
const { appendFileSync, existsSync, mkdirSync } = require('fs')
const { join, dirname } = require('path')

const CONFIG_DIR = join(require('path').resolve(__dirname, '..'), 'config')
const EVENTS_FILE = join(CONFIG_DIR, 'autopilot-events.jsonl')

class EventBus extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.persist=false] - Write events to JSONL file
   * @param {string} [opts.filePath] - Override default events file path
   */
  constructor(opts = {}) {
    super()
    this._persist = opts.persist || false
    this._filePath = opts.filePath || EVENTS_FILE
  }

  /**
   * Emit a typed event with structured payload.
   * Fire-and-forget: errors in listeners or persistence never propagate.
   *
   * @param {string} eventType - Dot-separated event name (e.g. 'cycle.start')
   * @param {Object} payload - Event data
   */
  fire(eventType, payload = {}) {
    const event = {
      type: eventType,
      ts: new Date().toISOString(),
      ...payload,
    }

    try {
      super.emit(eventType, event)
    } catch {
      // Listener error — swallow to protect main flow
    }

    if (this._persist) {
      try {
        const dir = dirname(this._filePath)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        appendFileSync(this._filePath, JSON.stringify(event) + '\n')
      } catch {
        // Persistence error — swallow
      }
    }
  }

  /**
   * Return listener count for a given event (delegates to EventEmitter).
   * Useful for debugging / verifying reactor registration.
   *
   * @param {string} eventType
   * @returns {number}
   */
  listenerCount(eventType) {
    return super.listenerCount(eventType)
  }
}

// Singleton instance for the autopilot runtime
const eventBus = new EventBus({ persist: true })

module.exports = { EventBus, eventBus }
