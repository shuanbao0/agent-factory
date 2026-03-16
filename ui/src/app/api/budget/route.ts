import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { NextResponse } from 'next/server'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const BUDGET_FILE = join(PROJECT_ROOT, 'config', 'budget.json')

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateBudgetConfig } = require(join(PROJECT_ROOT, 'core', 'common', 'config-validator.cjs'))

export async function GET() {
  try {
    if (!existsSync(BUDGET_FILE)) {
      return NextResponse.json({
        company: { dailyTokenLimit: 5000000, monthlyTokenLimit: 100000000, alertThreshold: 0.8 },
        agentDailyLimit: 5,
        overBudgetAction: 'pause_and_notify',
      })
    }
    const data = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
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

    const config = {
      company: {
        dailyTokenLimit: Number(body.company.dailyTokenLimit) || 5000000,
        monthlyTokenLimit: Number(body.company.monthlyTokenLimit) || 100000000,
        alertThreshold: Math.min(1, Math.max(0, Number(body.company.alertThreshold) || 0.8)),
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
