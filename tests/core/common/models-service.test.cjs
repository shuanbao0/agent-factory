'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveEnvVar,
  resolveAuthMode,
  applyMutation,
  buildModelsListForApi,
  buildProvidersForApi,
  getAuthProfilesByProvider,
} = require('../../../core/common/models-service.cjs')

describe('resolveEnvVar', () => {
  it('resolves ${VAR} from envVars', () => {
    assert.equal(resolveEnvVar('${MY_KEY}', { MY_KEY: 'abc123' }), 'abc123')
  })

  it('returns empty for unset vars', () => {
    assert.equal(resolveEnvVar('${MISSING}', {}), '')
  })

  it('preserves literal text around vars', () => {
    assert.equal(resolveEnvVar('Bearer ${TOKEN}!', { TOKEN: 'xyz' }), 'Bearer xyz!')
  })
})

describe('resolveAuthMode', () => {
  it('returns setup-token when auth profile has token', () => {
    const result = resolveAuthMode('anthropic', { apiKey: '' }, {
      anthropic: { hasToken: true, type: 'token', tokenPreview: 'sk-ant...' },
    }, {})
    assert.equal(result.mode, 'setup-token')
  })

  it('returns oauth when profile type is oauth', () => {
    const result = resolveAuthMode('google', { apiKey: '' }, {
      google: { hasToken: true, type: 'oauth', tokenPreview: 'ya29...' },
    }, {})
    assert.equal(result.mode, 'oauth')
  })

  it('returns env-var when key resolves from env', () => {
    const result = resolveAuthMode('anthropic', { apiKey: '${ANTHROPIC_API_KEY}' }, {}, {
      ANTHROPIC_API_KEY: 'sk-ant-abc',
    })
    assert.equal(result.mode, 'env-var')
    assert.equal(result.detail, 'ANTHROPIC_API_KEY')
  })

  it('returns config when key is a literal value', () => {
    const result = resolveAuthMode('custom', { apiKey: 'sk-hardcoded' }, {}, {})
    assert.equal(result.mode, 'config')
  })

  it('returns none when no key available', () => {
    const result = resolveAuthMode('empty', { apiKey: '${NOPE}' }, {}, {})
    assert.equal(result.mode, 'none')
  })
})

describe('applyMutation', () => {
  it('setDefault updates config.default', () => {
    const config = { providers: {}, default: '' }
    const result = applyMutation(config, { action: 'setDefault', ref: 'anthropic/opus' })
    assert.equal(result.ok, true)
    assert.equal(config.default, 'anthropic/opus')
  })

  it('upsertProvider adds a new provider', () => {
    const config = { providers: {}, default: '' }
    applyMutation(config, {
      action: 'upsertProvider',
      provider: { name: 'openai', apiKey: 'sk-test', models: { gpt4: 'gpt-4' } },
    })
    assert.deepEqual(config.providers.openai, {
      apiKey: 'sk-test',
      models: { gpt4: 'gpt-4' },
    })
  })

  it('deleteProvider removes and resets default', () => {
    const config = {
      providers: {
        openai: { apiKey: 'x', models: { gpt4: 'gpt-4' } },
        anthropic: { apiKey: 'y', models: { opus: 'claude-opus' } },
      },
      default: 'openai/gpt4',
    }
    applyMutation(config, { action: 'deleteProvider', name: 'openai' })
    assert.equal(config.providers.openai, undefined)
    assert.equal(config.default, 'anthropic/opus')
  })

  it('addModel adds a model to existing provider', () => {
    const config = { providers: { anthropic: { apiKey: 'x', models: {} } }, default: '' }
    applyMutation(config, { action: 'addModel', provider: 'anthropic', alias: 'sonnet', modelId: 'claude-sonnet' })
    assert.equal(config.providers.anthropic.models.sonnet, 'claude-sonnet')
  })

  it('deleteModel removes a model', () => {
    const config = { providers: { anthropic: { apiKey: 'x', models: { opus: 'claude-opus' } } }, default: '' }
    applyMutation(config, { action: 'deleteModel', provider: 'anthropic', alias: 'opus' })
    assert.equal(config.providers.anthropic.models.opus, undefined)
  })

  it('returns error for unknown action', () => {
    const result = applyMutation({}, { action: 'boom' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })
})

describe('buildModelsListForApi', () => {
  it('builds flat model list', () => {
    const config = {
      providers: {
        anthropic: { apiKey: 'sk-test', models: { opus: 'claude-opus-4' } },
      },
      default: 'anthropic/opus',
    }
    const models = buildModelsListForApi(config, {})
    assert.equal(models.length, 1)
    assert.equal(models[0].ref, 'anthropic/opus')
    assert.equal(models[0].modelId, 'claude-opus-4')
    assert.equal(models[0].isDefault, true)
    assert.equal(models[0].hasApiKey, true)
  })
})

describe('buildProvidersForApi', () => {
  it('enriches providers with auth info', () => {
    const config = {
      providers: {
        anthropic: { apiKey: '${ANTHROPIC_API_KEY}', models: {} },
      },
    }
    const authProfiles = {}
    const envVars = { ANTHROPIC_API_KEY: 'sk-ant-abc' }
    const result = buildProvidersForApi(config, authProfiles, envVars)
    assert.equal(result.anthropic.hasApiKey, true)
    assert.equal(result.anthropic.authMode, 'env-var')
  })
})
