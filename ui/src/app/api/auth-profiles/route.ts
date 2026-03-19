import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

// GET: return auth profiles (masked tokens)
export async function GET() {
  const profiles = core.repo.authProfilesRepo.readProfiles()
  if (!profiles) {
    return NextResponse.json({ exists: false, profiles: {} })
  }

  const masked: Record<string, { provider: string; hasToken: boolean; tokenPreview: string }> = {}
  for (const [id, profile] of Object.entries(profiles.profiles)) {
    const token = profile.token || ''
    masked[id] = {
      provider: profile.provider,
      hasToken: !!token,
      tokenPreview: token ? `${token.slice(0, 12)}...${token.slice(-4)}` : '',
    }
  }

  return NextResponse.json({ exists: true, profiles: masked, lastGood: profiles.lastGood })
}

// PUT: save a setup-token
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { provider, token, profileId } = body as { provider: string; token: string; profileId?: string }

    if (!provider || !token) {
      return NextResponse.json({ error: 'provider and token are required' }, { status: 400 })
    }

    const id = profileId || `${provider}:default`
    const profiles = core.repo.authProfilesRepo.readProfiles() || { version: 1, profiles: {}, lastGood: {}, usageStats: {} }

    profiles.profiles[id] = {
      type: 'token',
      provider,
      token,
    }
    profiles.lastGood[provider] = id
    if (!profiles.usageStats[id]) {
      profiles.usageStats[id] = { lastUsed: 0, errorCount: 0 }
    }

    core.repo.authProfilesRepo.writeProfiles(profiles)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE: remove a profile
export async function DELETE(req: NextRequest) {
  try {
    const { profileId } = await req.json()
    const profiles = core.repo.authProfilesRepo.readProfiles()
    if (!profiles || !profileId) {
      return NextResponse.json({ ok: true })
    }

    const profile = profiles.profiles[profileId]
    if (profile) {
      delete profiles.profiles[profileId]
      delete profiles.usageStats[profileId]
      if (profiles.lastGood[profile.provider] === profileId) {
        delete profiles.lastGood[profile.provider]
      }
    }

    core.repo.authProfilesRepo.writeProfiles(profiles)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
