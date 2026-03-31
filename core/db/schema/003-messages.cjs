'use strict'
/**
 * Migration 003 — messages 表（全量消息追踪）
 *
 * 记录所有 Agent 通信：指令、质量门、状态查询、记忆提取、peer-send、Dashboard 聊天
 * pair_id 关联 request + response 两条记录
 */
module.exports = {
  version: 3,
  name: 'messages',
  up(db) {
    db.exec(`
      CREATE TABLE messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ts              TEXT    NOT NULL,
        agent_id        TEXT    NOT NULL,
        session_key     TEXT    NOT NULL,
        message_type    TEXT    NOT NULL DEFAULT 'chat',
        direction       TEXT    NOT NULL DEFAULT 'request',
        channel         TEXT    NOT NULL DEFAULT 'gateway-pool',
        content         TEXT,
        ok              INTEGER,
        error           TEXT,
        model           TEXT,
        input_tokens    INTEGER DEFAULT 0,
        output_tokens   INTEGER DEFAULT 0,
        total_tokens    INTEGER DEFAULT 0,
        cost            REAL    DEFAULT 0.0,
        source          TEXT,
        from_agent      TEXT,
        pair_id         TEXT
      );
      CREATE INDEX idx_msg_ts      ON messages(ts);
      CREATE INDEX idx_msg_agent   ON messages(agent_id);
      CREATE INDEX idx_msg_type    ON messages(message_type);
      CREATE INDEX idx_msg_pair    ON messages(pair_id);
      CREATE INDEX idx_msg_channel ON messages(channel);
    `)
  },
}
