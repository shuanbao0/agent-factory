import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

// GET: return plugin catalog + current config
export async function GET() {
  try {
    const catalog = core.common.pluginCatalog.getPluginCatalog()
    const config = core.repo.configRepo.getConfig()
    const pluginsConfig = (config as Record<string, unknown>).plugins as Record<string, unknown> || {}

    // Read .env to detect which env vars are configured
    const envVars = core.common.envManager.readEnv()
    // Collect all plugin-relevant env var names and check status
    const envStatus: Record<string, boolean> = {}
    for (const cat of catalog.categories) {
      for (const p of cat.plugins) {
        const pAny = p as Record<string, unknown>
        const vars = (pAny.envVars || []) as string[]
        for (const v of vars) {
          if (!(v in envStatus)) {
            envStatus[v] = !!(envVars[v] || process.env[v])
          }
        }
      }
    }

    return NextResponse.json({
      categories: catalog.categories,
      config: {
        slots: (pluginsConfig.slots as Record<string, unknown>) || {},
        entries: (pluginsConfig.entries as Record<string, unknown>) || {},
      },
      envStatus,
    })
  } catch (e: unknown) {
    core.common.logger.error('api-plugins', 'Failed to get plugin catalog', { error: String(e) })
    return NextResponse.json({ error: 'Failed to load plugins' }, { status: 500 })
  }
}

// PUT: update plugin config
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'toggle') {
      const { pluginId, enabled } = body
      if (!pluginId || typeof enabled !== 'boolean') {
        return NextResponse.json({ error: 'Missing pluginId or enabled' }, { status: 400 })
      }
      core.repo.configRepo.updateConfig((config: Record<string, unknown>) => {
        const plugins = (config.plugins || {}) as Record<string, unknown>
        const entries = (plugins.entries || {}) as Record<string, Record<string, unknown>>
        entries[pluginId] = { ...entries[pluginId], enabled }
        plugins.entries = entries
        config.plugins = plugins
        return config
      })
      core.common.pluginCatalog.invalidateCache()
      return NextResponse.json({ ok: true })
    }

    if (action === 'config') {
      const { pluginId, config: pluginConfig } = body
      if (!pluginId || !pluginConfig) {
        return NextResponse.json({ error: 'Missing pluginId or config' }, { status: 400 })
      }
      core.repo.configRepo.updateConfig((config: Record<string, unknown>) => {
        const plugins = (config.plugins || {}) as Record<string, unknown>
        const entries = (plugins.entries || {}) as Record<string, Record<string, unknown>>
        entries[pluginId] = { ...entries[pluginId], config: pluginConfig }
        plugins.entries = entries
        config.plugins = plugins
        return config
      })
      core.common.pluginCatalog.invalidateCache()
      return NextResponse.json({ ok: true })
    }

    if (action === 'slot') {
      const { slotKey, pluginId } = body
      if (!slotKey) {
        return NextResponse.json({ error: 'Missing slotKey' }, { status: 400 })
      }
      core.repo.configRepo.updateConfig((config: Record<string, unknown>) => {
        const plugins = (config.plugins || {}) as Record<string, unknown>
        const slots = (plugins.slots || {}) as Record<string, string | null>
        slots[slotKey] = pluginId || null
        plugins.slots = slots
        config.plugins = plugins
        return config
      })
      core.common.pluginCatalog.invalidateCache()
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: unknown) {
    core.common.logger.error('api-plugins', 'Failed to update plugin config', { error: String(e) })
    return NextResponse.json({ error: 'Failed to update plugin config' }, { status: 500 })
  }
}
