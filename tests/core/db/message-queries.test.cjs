'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

describe('Message Queries', () => {
  let db

  before(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => { if (db) db.close() })

  it('should insert and query messages', () => {
    const stmt = db.prepare(`
      INSERT INTO messages (ts, agent_id, session_key, message_type, direction, channel, content, ok, model, input_tokens, output_tokens, total_tokens, cost, source, from_agent, pair_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Request
    stmt.run('2026-03-31T10:00:00Z', 'ceo', 'agent:ceo:autopilot', 'directive', 'request', 'gateway-pool', 'Build the plan', null, null, 0, 0, 0, 0, null, null, 'pair-1')
    // Response
    stmt.run('2026-03-31T10:00:05Z', 'ceo', 'agent:ceo:autopilot', 'directive', 'response', 'gateway-pool', 'Plan created', 1, 'claude-sonnet-4-6', 1000, 500, 1500, 0.0105, 'ceo', null, 'pair-1')

    // Quality check
    stmt.run('2026-03-31T10:01:00Z', 'writer', 'agent:writer:quality-check:t1', 'quality-check', 'request', 'gateway-pool', 'Check quality', null, null, 0, 0, 0, 0, null, null, 'pair-2')
    stmt.run('2026-03-31T10:01:05Z', 'writer', 'agent:writer:quality-check:t1', 'quality-check', 'response', 'gateway-pool', 'SCORE: 85', 1, 'claude-sonnet-4-6', 800, 200, 1000, 0.0069, 'writer', null, 'pair-2')

    // Peer message
    stmt.run('2026-03-31T10:02:00Z', 'writer', 'agent:writer:main', 'peer-message', 'request', 'peer-send', 'Write chapter 3', null, null, 0, 0, 0, 0, null, 'novel-chief', 'pair-3')
    stmt.run('2026-03-31T10:02:30Z', 'writer', 'agent:writer:main', 'peer-message', 'response', 'peer-send', 'Chapter 3 done', 1, 'MiniMax-M2.5', 2000, 3000, 5000, 0, 'peer:novel-chief->writer', 'novel-chief', 'pair-3')

    const all = db.prepare('SELECT COUNT(*) AS cnt FROM messages').get()
    assert.equal(all.cnt, 6)
  })

  it('should filter by agent_id', () => {
    const ceoMsgs = db.prepare("SELECT * FROM messages WHERE agent_id = 'ceo'").all()
    assert.equal(ceoMsgs.length, 2)
  })

  it('should filter by message_type', () => {
    const qc = db.prepare("SELECT * FROM messages WHERE message_type = 'quality-check'").all()
    assert.equal(qc.length, 2)
  })

  it('should filter by channel', () => {
    const peer = db.prepare("SELECT * FROM messages WHERE channel = 'peer-send'").all()
    assert.equal(peer.length, 2)
  })

  it('should aggregate by pair_id', () => {
    const pairs = db.prepare("SELECT pair_id, COUNT(*) AS cnt FROM messages WHERE pair_id IS NOT NULL GROUP BY pair_id").all()
    assert.equal(pairs.length, 3)
    for (const p of pairs) assert.equal(p.cnt, 2)
  })

  it('should compute stats by agent', () => {
    const stats = db.prepare(`
      SELECT agent_id, COUNT(*) AS count, SUM(input_tokens) AS inputTokens,
             SUM(output_tokens) AS outputTokens, ROUND(SUM(cost), 6) AS cost
      FROM messages WHERE direction = 'response'
      GROUP BY agent_id ORDER BY cost DESC
    `).all()
    assert.ok(stats.length >= 2)
    const ceo = stats.find(s => s.agent_id === 'ceo')
    assert.equal(ceo.inputTokens, 1000)
    assert.equal(ceo.outputTokens, 500)
  })

  it('should compute stats by message_type', () => {
    const stats = db.prepare(`
      SELECT message_type, COUNT(*) AS count
      FROM messages WHERE direction = 'response'
      GROUP BY message_type
    `).all()
    assert.ok(stats.length >= 3)
  })
})

describe('deriveMessageType', () => {
  const { deriveMessageType } = require('../../../core/db/queries/message-queries.cjs')

  it('autopilot → directive', () => {
    assert.equal(deriveMessageType('agent:ceo:autopilot'), 'directive')
  })

  it('dept-autopilot → directive', () => {
    assert.equal(deriveMessageType('agent:novel-chief:dept-autopilot'), 'directive')
  })

  it('quality-check:task-1 → quality-check', () => {
    assert.equal(deriveMessageType('agent:writer:quality-check:task-1'), 'quality-check')
  })

  it('peer-review:task-1 → peer-review', () => {
    assert.equal(deriveMessageType('agent:reviewer:peer-review:task-1'), 'peer-review')
  })

  it('approval:task-1 → approval', () => {
    assert.equal(deriveMessageType('agent:chief:approval:task-1'), 'approval')
  })

  it('[系统查询] message → status-query', () => {
    assert.equal(deriveMessageType('agent:writer:main', '[系统查询] 当前任务状态？'), 'status-query')
  })

  it('default → chat', () => {
    assert.equal(deriveMessageType('agent:writer:main', 'hello'), 'chat')
  })
})

describe('deriveSource', () => {
  const { deriveSource } = require('../../../core/db/queries/message-queries.cjs')

  it('ceo autopilot → ceo', () => {
    assert.equal(deriveSource('ceo', 'agent:ceo:autopilot'), 'ceo')
  })

  it('dept-autopilot → dept:agentId', () => {
    assert.equal(deriveSource('novel-chief', 'agent:novel-chief:dept-autopilot'), 'dept:novel-chief')
  })

  it('other → agentId', () => {
    assert.equal(deriveSource('writer', 'agent:writer:main'), 'writer')
  })
})
