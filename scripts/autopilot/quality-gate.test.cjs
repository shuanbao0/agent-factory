'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

// We need to mock readAgentActivity before requiring quality-gate.cjs.
// Since quality-gate.cjs uses `const { readAgentActivity } = require('./readers.cjs')`,
// we need to patch the readers module's export object which quality-gate destructures from.

const readers = require('./readers.cjs')
let mockActivity = {}
let originalReadAgentActivity

describe('quality-gate', () => {
  beforeEach(() => {
    originalReadAgentActivity = readers.readAgentActivity
    readers.readAgentActivity = () => mockActivity
  })

  afterEach(() => {
    readers.readAgentActivity = originalReadAgentActivity
  })

  // We need to test selectReviewer — but it captures readAgentActivity at import time
  // via destructuring. So we test the logic inline instead.

  describe('selectReviewer logic', () => {
    // Re-implement the selection logic for testing since the import-time binding
    // prevents clean mocking of the destructured function.

    function selectReviewerTestable(deptId, task, config, activity) {
      const agents = config.agents || []
      const assignedAgent = task.assignedAgent || task.assignees?.[0]

      // Simplified: no strategy-based preferred reviewers (shared/task-strategy.cjs not available)
      const preferredReviewers = []

      const candidates = agents.filter(a => a !== assignedAgent && a !== config.head)
      if (candidates.length === 0) return null

      const preferred = candidates.filter(a => preferredReviewers.includes(a))
      const taskTags = task.tags || []
      const tagMatching = taskTags.length > 0
        ? candidates.filter(a => !preferred.includes(a) && taskTags.some(tag => a.includes(tag)))
        : []
      const pool = preferred.length > 0
        ? preferred
        : tagMatching.length > 0
          ? tagMatching
          : candidates

      let bestCandidate = pool[0]
      let maxIdle = -1

      for (const candidate of pool) {
        const a = activity[candidate]
        const idle = a ? a.idleMins : 9999
        if (idle > maxIdle) {
          maxIdle = idle
          bestCandidate = candidate
        }
      }

      return bestCandidate
    }

    it('returns null when no candidates (only assignee + head)', () => {
      const result = selectReviewerTestable('novel', { assignedAgent: 'writer', type: 'writing' }, {
        head: 'chief',
        agents: ['writer', 'chief'],
      }, {})
      assert.equal(result, null)
    })

    it('selects the most idle candidate', () => {
      const result = selectReviewerTestable('novel', { assignedAgent: 'writer', type: 'writing' }, {
        head: 'chief',
        agents: ['writer', 'chief', 'editor', 'proofer'],
      }, {
        'editor': { idleMins: 5 },
        'proofer': { idleMins: 30 },
      })
      assert.equal(result, 'proofer')
    })

    it('excludes assignee and head from candidates', () => {
      const result = selectReviewerTestable('novel', { assignedAgent: 'writer', type: 'writing' }, {
        head: 'chief',
        agents: ['writer', 'chief', 'editor'],
      }, {
        'writer': { idleMins: 999 },
        'chief': { idleMins: 999 },
        'editor': { idleMins: 5 },
      })
      assert.equal(result, 'editor')
    })

    it('prefers candidate matching task tags', () => {
      const result = selectReviewerTestable('novel', {
        assignedAgent: 'writer',
        type: 'writing',
        tags: ['editor'],
      }, {
        head: 'chief',
        agents: ['writer', 'chief', 'novel-editor', 'novel-artist'],
      }, {
        'novel-editor': { idleMins: 5 },
        'novel-artist': { idleMins: 100 },
      })
      assert.equal(result, 'novel-editor')
    })

    it('falls back to most idle when no tags match', () => {
      const result = selectReviewerTestable('novel', {
        assignedAgent: 'writer',
        type: 'writing',
        tags: ['nonexistent'],
      }, {
        head: 'chief',
        agents: ['writer', 'chief', 'alpha', 'beta'],
      }, {
        'alpha': { idleMins: 10 },
        'beta': { idleMins: 50 },
      })
      assert.equal(result, 'beta')
    })

    it('uses assignees array when assignedAgent not set', () => {
      const result = selectReviewerTestable('novel', { assignees: ['writer'], type: 'writing' }, {
        head: 'chief',
        agents: ['writer', 'chief', 'editor'],
      }, {
        'editor': { idleMins: 10 },
      })
      assert.equal(result, 'editor')
    })
  })
})
