'use strict'
/**
 * Migration 004 — Agent/Project/DeptConfig 元数据表
 *
 * agents — 替代 agents/{id}/agent.json 目录遍历
 * projects — 替代 projects/{dept}/{slug}/.project-meta.json 目录扫描
 * dept_config — 替代 departments/{id}/config.json 目录扫描
 */
module.exports = {
  version: 4,
  name: 'metadata-tables',
  up(db) {
    db.exec(`
      CREATE TABLE agents (
        id           TEXT PRIMARY KEY,
        template_id  TEXT,
        name         TEXT NOT NULL,
        role         TEXT,
        description  TEXT,
        model        TEXT,
        skills       TEXT,
        peers        TEXT,
        department   TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX idx_agent_dept ON agents(department);

      CREATE TABLE projects (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        status          TEXT NOT NULL DEFAULT 'planning',
        current_phase   INTEGER DEFAULT 1,
        total_phases    INTEGER DEFAULT 1,
        phases          TEXT,
        department      TEXT,
        assigned_agents TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT
      );
      CREATE INDEX idx_project_dept   ON projects(department);
      CREATE INDEX idx_project_status ON projects(status);

      CREATE TABLE dept_config (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        head       TEXT,
        interval_s INTEGER DEFAULT 600,
        enabled    INTEGER DEFAULT 0,
        agents     TEXT,
        budget     TEXT,
        kpis       TEXT,
        workflow   TEXT,
        updated_at TEXT
      );
    `)
  },
}
