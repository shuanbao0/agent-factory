'use strict'
/**
 * Migration 001 — Tier1 核心表
 *
 * cost_entries — 替代 autopilot-costs.jsonl
 * tasks — 统一 tasks.json + projects/.project-meta.json
 * task_transitions — 任务状态转换审计
 * events — 替代 autopilot-events.jsonl
 */
module.exports = {
  version: 1,
  name: 'initial-core-tables',
  up(db) {
    db.exec(`
      CREATE TABLE cost_entries (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ts            TEXT    NOT NULL,
        date          TEXT    NOT NULL,
        model         TEXT    NOT NULL DEFAULT 'unknown',
        input_tokens  INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost          REAL    NOT NULL DEFAULT 0.0,
        source        TEXT    NOT NULL DEFAULT 'unknown',
        agent_id      TEXT
      );
      CREATE INDEX idx_cost_date        ON cost_entries(date);
      CREATE INDEX idx_cost_source      ON cost_entries(source);
      CREATE INDEX idx_cost_date_source ON cost_entries(date, source);

      CREATE TABLE tasks (
        id              TEXT PRIMARY KEY,
        name            TEXT    NOT NULL,
        description     TEXT,
        project_id      TEXT,
        phase           INTEGER,
        status          TEXT    NOT NULL DEFAULT 'pending',
        priority        TEXT    NOT NULL DEFAULT 'P1',
        assignees       TEXT,
        assigned_agent  TEXT,
        creator         TEXT    NOT NULL DEFAULT 'user',
        progress        INTEGER NOT NULL DEFAULT 0,
        dependencies    TEXT,
        output          TEXT,
        tags            TEXT,
        type            TEXT,
        parent_task_id  TEXT,
        quality         TEXT,
        rework_count    INTEGER DEFAULT 0,
        rework_from_id  TEXT,
        failure_reason  TEXT,
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL,
        completed_at    TEXT
      );
      CREATE INDEX idx_task_status   ON tasks(status);
      CREATE INDEX idx_task_project  ON tasks(project_id);
      CREATE INDEX idx_task_assignee ON tasks(assigned_agent);
      CREATE INDEX idx_task_type     ON tasks(type);

      CREATE TABLE task_transitions (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT    NOT NULL,
        from_st TEXT    NOT NULL,
        to_st   TEXT    NOT NULL,
        actor   TEXT    NOT NULL DEFAULT 'system',
        reason  TEXT,
        at      TEXT    NOT NULL
      );
      CREATE INDEX idx_tt_task ON task_transitions(task_id);
      CREATE INDEX idx_tt_at   ON task_transitions(at);

      CREATE TABLE events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        type    TEXT    NOT NULL,
        ts      TEXT    NOT NULL,
        payload TEXT    NOT NULL DEFAULT '{}'
      );
      CREATE INDEX idx_event_type ON events(type);
      CREATE INDEX idx_event_ts   ON events(ts);
    `)
  },
}
