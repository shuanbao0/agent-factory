'use strict'
const { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } = require('fs')
const { dirname } = require('path')

class BaseRepository {
  /**
   * @param {object} opts
   * @param {number} [opts.cacheTtlMs=0] - Cache TTL. 0=no cache (API routes), 30000=autopilot
   */
  constructor({ cacheTtlMs = 0 } = {}) {
    this._cacheTtlMs = cacheTtlMs
    this._cache = new Map() // path → { data, ts }
  }

  /**
   * Read a JSON file with optional TTL cache.
   */
  read(filePath) {
    if (this._cacheTtlMs > 0) {
      const cached = this._cache.get(filePath)
      if (cached && Date.now() - cached.ts < this._cacheTtlMs) {
        return cached.data
      }
    }
    try {
      if (!existsSync(filePath)) return null
      const data = JSON.parse(readFileSync(filePath, 'utf-8'))
      if (this._cacheTtlMs > 0) {
        this._cache.set(filePath, { data, ts: Date.now() })
      }
      return data
    } catch {
      return null
    }
  }

  /**
   * Atomic write: tmp + rename, fallback to direct write.
   */
  write(filePath, data) {
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const json = JSON.stringify(data, null, 2) + '\n'
    const tmp = filePath + '.tmp'
    try {
      writeFileSync(tmp, json)
      renameSync(tmp, filePath)
    } catch {
      writeFileSync(filePath, json)
    }
    if (this._cacheTtlMs > 0) {
      this._cache.set(filePath, { data, ts: Date.now() })
    }
  }

  /**
   * Atomic read-mutate-write.
   * @param {string} filePath
   * @param {function} mutator - (currentData) => newData
   * @param {object} [defaultValue] - Default when file doesn't exist
   * @returns {object} The written data
   */
  update(filePath, mutator, defaultValue = {}) {
    const current = this.read(filePath) ?? defaultValue
    const updated = mutator(current)
    this.write(filePath, updated)
    return updated
  }

  /** Clear specific or all cache entries */
  invalidate(filePath) {
    if (filePath) this._cache.delete(filePath)
    else this._cache.clear()
  }
}

module.exports = { BaseRepository }
