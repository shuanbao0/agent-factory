'use strict'
/**
 * db-cleanup.cjs — 测试 DB 清理工具
 *
 * 清除所有 zzz-test-* 前缀的测试数据，
 * 防止 dual-write 产生的测试残留污染生产 DB。
 *
 * 用法：在 afterEach / cleanup 中调用 cleanTestDataFromDb()
 */

function cleanTestDataFromDb() {
  try {
    const { getDb } = require('../../core/db/connection.cjs')
    const db = getDb()

    db.transaction(() => {
      // 顺序：先清子表（外键依赖），再清主表
      db.prepare("DELETE FROM task_transitions WHERE task_id LIKE 'zzz-test-%'").run()
      db.prepare("DELETE FROM tasks WHERE id LIKE 'zzz-test-%' OR project_id LIKE '%zzz-test%'").run()
      db.prepare("DELETE FROM projects WHERE id LIKE '%zzz-test%'").run()
      db.prepare("DELETE FROM agents WHERE id LIKE 'zzz-test-%'").run()
      db.prepare("DELETE FROM dept_config WHERE id LIKE 'zzz-test-%'").run()
      db.prepare("DELETE FROM cost_entries WHERE agent_id LIKE 'zzz-test-%'").run()
      db.prepare("DELETE FROM messages WHERE agent_id LIKE 'zzz-test-%'").run()
      db.prepare("DELETE FROM dept_cycles WHERE dept_id LIKE 'zzz-test-%'").run()
      db.prepare("DELETE FROM kpi_snapshots WHERE dept_id LIKE 'zzz-test-%'").run()
      db.prepare("DELETE FROM events WHERE type LIKE 'zzz-test-%'").run()
    })()
  } catch (_) {
    // DB 不可用时静默跳过（纯单元测试场景）
  }
}

module.exports = { cleanTestDataFromDb }
