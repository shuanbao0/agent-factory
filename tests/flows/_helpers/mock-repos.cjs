'use strict'

/**
 * In-memory ConfigRepository mock
 */
function createInMemoryConfigRepo(initial = {}) {
  let config = { agents: [], ...initial }
  const calls = { addAgent: [], removeAgent: [] }
  return {
    getConfig: () => ({ ...config }),
    updateConfig: (mutator) => { config = mutator(config); return config },
    getGatewayConfig: () => ({ port: 19100, token: 'test-token' }),
    addAgent: (id, dir, model) => {
      calls.addAgent.push({ id, dir, model })
      config.agents = config.agents || []
      config.agents.push({ id, workspace: dir, model })
    },
    removeAgent: (id) => {
      calls.removeAgent.push({ id })
      config.agents = (config.agents || []).filter(a => a.id !== id)
    },
    calls,
  }
}

/**
 * In-memory DeptConfigRepository mock
 */
function createInMemoryDeptConfigRepo(configs = {}) {
  const data = { ...configs }
  return {
    load: (deptId) => data[deptId] || null,
    save: (deptId, config) => { data[deptId] = config },
    updateConfig: (deptId, mutator) => {
      data[deptId] = mutator(data[deptId] || {})
      return data[deptId]
    },
    listDeptIds: () => Object.keys(data),
    configPath: (deptId) => `/mock/departments/${deptId}/config.json`,
    _data: data,
  }
}

/**
 * In-memory DeptStateRepository mock
 */
function createInMemoryDeptStateRepo(states = {}) {
  const data = { ...states }
  return {
    load: (deptId) => data[deptId] || { status: 'stopped', pid: null, cycleCount: 0, tokensUsedToday: 0 },
    save: (deptId, state) => { data[deptId] = state },
    updateState: (deptId, mutator) => {
      const current = data[deptId] || { status: 'stopped', pid: null, cycleCount: 0, tokensUsedToday: 0 }
      data[deptId] = mutator(current)
      return data[deptId]
    },
    _data: data,
  }
}

/**
 * In-memory TaskRepository mock
 */
function createInMemoryTaskRepo(tasks = []) {
  let standalone = [...tasks]
  return {
    readStandaloneTasks: () => [...standalone],
    writeStandaloneTasks: (t) => { standalone = [...t] },
    findAllTasks: () => [...standalone],
    findTaskById: (id) => {
      const task = standalone.find(t => t.id === id)
      return task ? { task, source: 'standalone' } : null
    },
    updateTaskInPlace: (id, updates) => {
      const idx = standalone.findIndex(t => t.id === id)
      if (idx === -1) return null
      standalone[idx] = { ...standalone[idx], ...updates }
      return standalone[idx]
    },
    _data: () => standalone,
  }
}

module.exports = {
  createInMemoryConfigRepo,
  createInMemoryDeptConfigRepo,
  createInMemoryDeptStateRepo,
  createInMemoryTaskRepo,
}
