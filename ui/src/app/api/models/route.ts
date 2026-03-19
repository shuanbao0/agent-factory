import { NextRequest, NextResponse } from 'next/server'
import { restartGateway, getStatus } from '@/lib/gateway-manager'
import { PROVIDERS } from '@/lib/providers'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  api?: string
  models: Record<string, string>
}

interface ModelsConfig {
  providers: Record<string, ProviderConfig>
  default: string
}

function readModels(): ModelsConfig {
  return core.repo.modelsRepo.readModels() as ModelsConfig
}

async function writeModelsAndSync(config: ModelsConfig) {
  core.repo.modelsRepo.writeModels(config as unknown as Record<string, unknown>)
  core.common.modelsService.syncOpenClawConfig(config, PROVIDERS)
  try {
    const status = await getStatus()
    if (status.status === 'running') {
      await restartGateway()
    }
  } catch {
    // Non-fatal: gateway restart failure shouldn't block the config write
  }
}

/** Read .env file to check which env vars are set */
function readEnvFile(): Record<string, string> {
  try {
    return core.common.envManager.readEnv()
  } catch (err) { logError('models-api/read-env-file', err); return {} }
}

export async function GET() {
  const config = readModels()
  const authProfiles = core.common.modelsService.getAuthProfilesByProvider()
  const envVars = { ...readEnvFile(), ...process.env as Record<string, string> }

  const models = core.common.modelsService.buildModelsListForApi(config, envVars)
  const providers = core.common.modelsService.buildProvidersForApi(config, authProfiles, envVars)

  return NextResponse.json({
    providers,
    models,
    default: config.default,
    orphanAuthProfiles: Object.fromEntries(
      Object.entries(authProfiles)
        .filter(([provider]) => !config.providers[provider])
        .map(([provider, info]) => [provider, {
          profileId: info.profileId,
          type: info.type,
          hasToken: info.hasToken,
          tokenPreview: info.tokenPreview,
        }])
    ),
  })
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const config = readModels()

    const result = core.common.modelsService.applyMutation(config, body)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    await writeModelsAndSync(config)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
