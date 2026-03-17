import { writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { NextResponse } from 'next/server'
import core from '@/lib/core-bridge'
import { DEFAULT_BUDGET } from '@entity/observe'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const BUDGET_FILE = join(PROJECT_ROOT, 'config', 'budget.json')

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateBudgetConfig } = require(join(PROJECT_ROOT, 'core', 'common', 'config-validator.cjs'))

export async function GET() {
  try {
    const data = core.observe.loadCompanyBudget() as Record<string, unknown>
    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json({
        ...DEFAULT_BUDGET,
        agentDailyLimit: 5,
      })
    }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()

    // Validate with config-validator
    const validation = validateBudgetConfig(body)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join('; ') }, { status: 400 })
    }

    const defaults = DEFAULT_BUDGET.company
    const config = {
      company: {
        dailyTokenLimit: Number(body.company.dailyTokenLimit) || defaults.dailyTokenLimit,
        monthlyTokenLimit: Number(body.company.monthlyTokenLimit) || defaults.monthlyTokenLimit,
        alertThreshold: Math.min(1, Math.max(0, Number(body.company.alertThreshold) || defaults.alertThreshold)),
      },
      agentDailyLimit: Number(body.agentDailyLimit) || 5,
      overBudgetAction: body.overBudgetAction || 'pause_and_notify',
    }

    writeFileSync(BUDGET_FILE, JSON.stringify(config, null, 2) + '\n')
    return NextResponse.json({ ok: true, config })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
