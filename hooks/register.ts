import type { EngineInterface, Register } from 'claude-code'

// Estimated from main-thread response usage; the mod API has no prompt_cache object.
const TTL_SECONDS: Record<string, number> = { '5m': 300, '1h': 3600 }

export type CacheStats = {
  ttl: string
  lastAt: number | null
  read: number
  total: number
  misses: number
  prevPrefix: number
  recache: number
}

export const emptyStats = (ttl: string): CacheStats =>
  ({ ttl, lastAt: null, read: 0, total: 0, misses: 0, prevPrefix: 0, recache: 0 })

export const record = (s: CacheStats, u: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; output_tokens: number }, at: number): CacheStats => {
  const input = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const missed = s.prevPrefix > 0 && u.cache_read_input_tokens < s.prevPrefix * 0.95 &&
    s.prevPrefix - u.cache_read_input_tokens >= 2000
  return {
    ...s,
    lastAt: at,
    read: s.read + u.cache_read_input_tokens,
    total: s.total + input,
    misses: s.misses + (missed ? 1 : 0),
    prevPrefix: u.cache_read_input_tokens + u.cache_creation_input_tokens,
    recache: input + u.output_tokens,
  }
}

const ktok = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

export const format = (s: CacheStats, now: number): string | undefined => {
  if (s.lastAt === null) return undefined
  const ttl = TTL_SECONDS[s.ttl] ?? 3600
  const left = Math.round((s.lastAt + ttl * 1000 - now) / 1000)
  if (left <= 0) return `🔴 cache ○ cold · next message re-caches ~${ktok(s.recache)} tokens`
  const filled = Math.min(6, Math.ceil((left / ttl) * 6))
  const bar = '█'.repeat(filled) + '░'.repeat(6 - filled)
  const time = left >= 60 ? `${Math.floor(left / 60)}m left` : `${left}s left`
  const hit = s.total > 0 ? ` · hit ${Math.round((s.read / s.total) * 100)}%` : ''
  const dot = left / ttl < 0.2 ? '🟡' : '🟢'
  return `${dot} cache ● ${s.ttl} ${bar} ${time}${hit} · misses ${s.misses} (est.)`
}

// The terminal has the accurate statusLine script (~/.claude/statusline.sh); show this only in the app.
const show = async ($: EngineInterface, stats: CacheStats) => {
  const inApp = (await $.session.surfaces()).some((s: string) => s !== 'terminal')
  $.ui.status(inApp ? format(stats, await $.clock.now()) : undefined)
}

export const register: Register = on => {
  let stats = emptyStats('1h')
  let ticking = false

  on('session.start', async ($, e, next) => {
    const env = await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')
    const forced5m = await $.env.get('FORCE_PROMPT_CACHING_5M')
    stats = emptyStats(forced5m === '1' ? '5m' : env === '5m' || env === '1h' ? env : '1h')
    if (!ticking) {
      ticking = true
      $.clock.every(30_000, () => show($, stats))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId === undefined && r.usage) {
      stats = record(stats, r.usage, await $.clock.now())
      await show($, stats)
    }
    return r
  })
}
