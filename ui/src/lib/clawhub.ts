/**
 * ClawHub CLI wrapper — search, explore, install, inspect, list, update skills.
 *
 * Uses the `clawhub` CLI binary. All operations are run against the project's
 * skills directory (agent-factory/skills/).
 *
 * All CLI calls use async execFile (non-blocking).
 */
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'

const execFile = promisify(execFileCb)

const PROJECT_ROOT = resolve(process.cwd(), '..')
const SKILLS_DIR = resolve(PROJECT_ROOT, 'skills')
const CLAWHUB_BIN = resolve(PROJECT_ROOT, 'node_modules', '.bin', 'clawhub')

async function run(args: string[], timeoutMs = 30000): Promise<string> {
  const { stdout } = await execFile(
    CLAWHUB_BIN,
    [...args, '--workdir', PROJECT_ROOT, '--dir', 'skills', '--no-input'],
    {
      timeout: timeoutMs,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
    },
  )
  return stdout.trim()
}

// ── Search ───────────────────────────────────────────────────────
export interface SearchResult {
  slug: string
  version: string
  name: string
  score: number
}

export async function search(query: string, limit = 20): Promise<SearchResult[]> {
  const raw = await run(['search', query, '--limit', String(limit)])
  return parseSearchResults(raw)
}

// ── Explore (latest updated) ─────────────────────────────────────
export interface ExploreResult {
  slug: string
  version: string
  name: string
  updatedAt: string
  summary?: string
  downloads?: number
  stars?: number
}

export async function explore(limit = 20): Promise<ExploreResult[]> {
  const raw = await run(['explore', '--limit', String(limit)])
  // Format: "slug  vX.Y.Z  time-ago  Description..."
  const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('-'))
  return lines.map(line => {
    const match = line.match(/^(\S+)\s+v([\d.]+)\s+(.+?)\s{2,}(.*)$/)
    if (!match) return null
    return {
      slug: match[1],
      version: match[2],
      updatedAt: match[3].trim(),
      name: match[4].trim(),
    }
  }).filter(Boolean) as ExploreResult[]
}

export async function exploreJson(limit = 20): Promise<ExploreResult[]> {
  try {
    const raw = await run(['explore', '--limit', String(limit), '--json'], 60000)
    const data = JSON.parse(raw)
    const items = Array.isArray(data) ? data : (data.items || data.skills || data.results || [])
    return items.map((item: Record<string, unknown>) => {
      const stats = item.stats as Record<string, number> | undefined
      const latestVer = item.latestVersion as Record<string, unknown> | undefined
      return {
        slug: (item.slug || item.name || '') as string,
        version: (latestVer?.version || item.version || '') as string,
        name: (item.displayName || item.name || item.slug || '') as string,
        updatedAt: typeof item.updatedAt === 'number'
          ? new Date(item.updatedAt).toLocaleDateString()
          : (item.updatedAt || '') as string,
        summary: (item.summary || item.description || '') as string,
        downloads: stats?.downloads,
        stars: stats?.stars,
      }
    })
  } catch {
    // Fallback to text-based explore if --json is not supported
    return explore(limit)
  }
}

// ── Inspect (skill details) ──────────────────────────────────────
export interface SkillDetail {
  slug: string
  name: string
  summary: string
  owner: string
  version: string
  createdAt: string
  updatedAt: string
  tags: string
}

export async function inspect(slug: string): Promise<SkillDetail | null> {
  try {
    const raw = await run(['inspect', slug])
    const lines = raw.split('\n')

    // First line: "slug  Name"
    const header = lines[0]?.match(/^(\S+)\s+(.+)$/)
    const detail: SkillDetail = {
      slug: header?.[1] || slug,
      name: header?.[2] || slug,
      summary: '',
      owner: '',
      version: '',
      createdAt: '',
      updatedAt: '',
      tags: '',
    }

    for (const line of lines) {
      if (line.startsWith('Summary:')) detail.summary = line.slice(8).trim()
      if (line.startsWith('Owner:')) detail.owner = line.slice(6).trim()
      if (line.startsWith('Latest:')) detail.version = line.slice(7).trim()
      if (line.startsWith('Created:')) detail.createdAt = line.slice(8).trim()
      if (line.startsWith('Updated:')) detail.updatedAt = line.slice(8).trim()
      if (line.startsWith('Tags:')) detail.tags = line.slice(5).trim()
    }

    return detail
  } catch {
    return null
  }
}

// ── List installed ───────────────────────────────────────────────
export interface InstalledSkill {
  slug: string
  version: string
  status: string
}

export async function listInstalled(): Promise<InstalledSkill[]> {
  try {
    const raw = await run(['list'])
    if (raw.includes('No installed skills')) return []
    // Parse list output
    const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('-'))
    return lines.map(line => {
      const match = line.match(/^(\S+)\s+v?([\d.]+)\s*(.*)$/)
      if (!match) return null
      return { slug: match[1], version: match[2], status: match[3]?.trim() || 'installed' }
    }).filter(Boolean) as InstalledSkill[]
  } catch {
    return []
  }
}

// ── Install ──────────────────────────────────────────────────────
export async function install(slug: string, version?: string): Promise<{ ok: boolean; output: string }> {
  try {
    const args = ['install', slug]
    if (version) args.push('--version', version)
    args.push('--force')
    const output = await run(args, 60000)
    return { ok: true, output }
  } catch (e: any) {
    return { ok: false, output: e.message || 'Install failed' }
  }
}

// ── Update ───────────────────────────────────────────────────────
export async function update(slug?: string): Promise<{ ok: boolean; output: string }> {
  try {
    const args = ['update', slug || '--all', '--force']
    const output = await run(args, 60000)
    return { ok: true, output }
  } catch (e: any) {
    return { ok: false, output: e.message || 'Update failed' }
  }
}

// ── Uninstall (rm -rf skills/slug) ───────────────────────────────
export function uninstall(slug: string): { ok: boolean } {
  try {
    const { rmSync, existsSync } = require('fs')
    const skillDir = resolve(SKILLS_DIR, slug)
    if (!skillDir.startsWith(SKILLS_DIR)) return { ok: false } // path traversal guard
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true })
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// ── Parse helpers ────────────────────────────────────────────────
function parseSearchResults(raw: string): SearchResult[] {
  // Format may be "slug  Name  (score)" or "slug vX.Y.Z  Name  (score)"
  const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('-'))
  return lines.map(line => {
    const match = line.match(/^(\S+)\s+(?:v([\d.]+)\s+)?(.+?)\s+\(([\d.]+)\)$/)
    if (!match) return null
    return {
      slug: match[1],
      version: match[2] || '',
      name: match[3].trim(),
      score: parseFloat(match[4]),
    }
  }).filter(Boolean) as SearchResult[]
}
