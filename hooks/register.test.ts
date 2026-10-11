// Integration tests: run against the real engine with `claude plugin test .`
import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { COMPACT_INSTRUCTIONS, HANDOFF_ASK } from './register'

const MIN = 60_000

// The engine's world beneath the mod: one desktop surface, a prompt box, recorded toasts and status.
const world = (on: On, env: Record<string, string> = {}) => {
  const clock = mock.clock(on)
  mock.env(on, env)
  const seen = { toasts: [] as string[], status: undefined as string | undefined, box: '', compacts: [] as (string | undefined)[] }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('ui.status', ($, e) => { seen.status = e.text; return { value: undefined } })
  on('ui.toast', ($, e) => { seen.toasts.push(e.text); return { value: undefined } })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('prompt.read', () => ({ value: { text: seen.box, cursor: seen.box.length } }))
  on('prompt.fill', ($, e) => {
    seen.box = e.mode === 'replace' ? e.text : seen.box + e.text
    return { isFilled: true }
  })
  on('session.compact', ($, e) => {
    seen.compacts.push(e.instructions)
    return { skip: 'mocked' }
  })
  on('turn.step', async function* () {
    return {
      turnId: 't1', index: 0, answer: 'ok', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'claude-opus-5-5', input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000, output_tokens: 100 },
    }
  })
  return { clock, seen }
}

const start = async ($: any) => {
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) { /* drain */ }
}

test('1h window: status shows countdown, auto-compacts once in last 5m', async ($, on) => {
  const { clock, seen } = world(on)
  await start($)
  expect(seen.status).toContain('cache ● 1h')

  await clock.advance(50 * MIN)
  expect(seen.compacts).toEqual([])

  await clock.advance(6 * MIN)
  expect(seen.compacts).toEqual([COMPACT_INSTRUCTIONS])
  expect(seen.toasts).toEqual(['Auto-compact skipped: mocked'])
  expect(seen.box).toBe('')

  await clock.advance(3 * MIN)
  expect(seen.compacts.length).toBe(1)

  await clock.advance(2 * MIN)
  expect(seen.status).toContain('🔴 cache ○ cold')
})

test('5m window: auto-compacts in last minute', async ($, on) => {
  const { clock, seen } = world(on, { FORCE_PROMPT_CACHING_5M: '1' })
  await start($)
  await clock.advance(3 * MIN)
  expect(seen.compacts.length).toBe(0)
  await clock.advance(MIN + 30_000)
  expect(seen.compacts.length).toBe(1)
})

test('/handoff appends to a draft and never duplicates', async ($, on) => {
  const { seen } = world(on)
  await start($)
  seen.box = 'my draft'
  const run = () => $.command.run({
    command: 'handoff', args: '',
    origin: { kind: 'user' },
    presentation: { isFullscreen: false },
  } as never)
  const r = await run()
  expect(r.text).toContain('Handoff prompt drafted')
  expect(seen.box).toBe(`my draft\n${HANDOFF_ASK}`)
  await run()
  expect(seen.box).toBe(`my draft\n${HANDOFF_ASK}`)
})
