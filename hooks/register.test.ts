import { describe, expect, test } from 'bun:test'
import { emptyStats, format, record } from './register'

const u = (read: number, write: number) =>
  ({ input_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: 100 })

describe('cache-status', () => {
  test('nothing before first response', () => {
    expect(format(emptyStats('1h'), 0)).toBeUndefined()
  })
  test('warm, expiring, cold', () => {
    let s = record(emptyStats('1h'), u(0, 80000), 0)
    s = record(s, u(80000, 2000), 1000)
    expect(format(s, 1000 + 22 * 60_000)).toContain('🟢 cache ● 1h ████░░ 38m left')
    expect(format(s, 1000 + 54 * 60_000)).toContain('🟡')
    expect(format(s, 1000 + 61 * 60_000)).toBe('🔴 cache ○ cold · next message re-caches ~82k tokens')
  })
  test('counts a miss', () => {
    let s = record(emptyStats('5m'), u(0, 50000), 0)
    s = record(s, u(0, 52000), 1000)
    expect(s.misses).toBe(1)
  })
})
