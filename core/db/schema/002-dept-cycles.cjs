'use strict'
/**
 * Migration 002 — Tier2 部门循环 + KPI 快照
 *
 * dept_cycles: 部门循环执行记录
 * kpi_snapshots: KPI 指标快照
 */
module.exports = {
  version: 2,
  name: 'dept-cycles-and-kpi',
  up(db) {
    db.exec(`
      CREATE TABLE dept_cycles (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        dept_id      TEXT    NOT NULL,
        cycle_num    INTEGER NOT NULL,
        started_at   TEXT    NOT NULL,
        completed_at TEXT,
        elapsed_sec  REAL,
        result       TEXT,
        tokens_used  INTEGER DEFAULT 0
      );
      CREATE INDEX idx_dc_dept ON dept_cycles(dept_id);
      CREATE INDEX idx_dc_at   ON dept_cycles(started_at);

      CREATE TABLE kpi_snapshots (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        dept_id TEXT    NOT NULL,
        ts      TEXT    NOT NULL,
        kpis    TEXT    NOT NULL
      );
      CREATE INDEX idx_kpi_dept ON kpi_snapshots(dept_id);
      CREATE INDEX idx_kpi_ts   ON kpi_snapshots(ts);
    `)
  },
}
