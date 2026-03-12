import { NextRequest, NextResponse } from 'next/server'
import { execFile as execFileCb, exec as execCb } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFileCb)
const execAsync = promisify(execCb)

/**
 * POST /api/skills/install-bin — install a binary dependency via brew
 * Body: { bin: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { bin } = await req.json() as { bin: string }

    if (!bin || !/^[a-zA-Z0-9_@\/-]+$/.test(bin)) {
      return NextResponse.json({ error: 'Invalid binary name' }, { status: 400 })
    }

    // Check if brew is available
    try {
      await execFileAsync('which', ['brew'], { timeout: 5000 })
    } catch {
      return NextResponse.json({ ok: false, output: 'Homebrew is not installed. Visit https://brew.sh to install it.' }, { status: 400 })
    }

    const { stdout } = await execAsync(`brew install ${bin} 2>&1`, {
      encoding: 'utf-8',
      timeout: 120000,
      env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
    })

    return NextResponse.json({ ok: true, output: stdout.trim() })
  } catch (e: any) {
    const output = e.stderr || e.stdout || e.message || 'Install failed'
    return NextResponse.json({ ok: false, output: String(output) }, { status: 500 })
  }
}
