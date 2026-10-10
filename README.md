# cache-status

A Claude Code mod that shows how much of the prompt-cache window is left, right in the
desktop app's status area.

```
🟢 cache ● 1h ██████ 59m left · hit 89% · misses 0 (est.)
```

## What it shows

- **Countdown bar**: six blocks for the remaining cache TTL (5m or 1h). Turns 🟡 under 20%.
- **Time left** until the cache goes cold.
- **Hit rate**: share of input tokens served from cache this session.
- **Misses**: turns where the cached prefix shrank unexpectedly (≥5% and ≥2k tokens).
- **Cold**: `🔴 cache ○ cold · next message re-caches ~Nk tokens` once the TTL has passed.

All values are **estimates** from main-thread response usage; the mod API exposes no
`prompt_cache` object. Subagent turns are ignored.

## Handoff prompt

When the window nears expiry (last 5m of `1h`, last 1m of `5m`) the mod toasts once and
appends a handoff request to your input box. Nothing is sent: press Enter to have Claude
write a paste-ready prompt for a fresh session while the cache is still warm.
Run `/handoff` to draft it any time.

## TTL detection

Defaults to `1h`. Uses `5m` when `FORCE_PROMPT_CACHING_5M=1` or
`CLAUDE_CODE_PROMPT_CACHE_TTL=5m`.

## Surfaces

Only renders in the desktop app. In the terminal it stays hidden, because a `statusLine`
script there can read the exact `prompt_cache` data.

## Layout

```
.claude-plugin/plugin.json   plugin manifest
hooks/hooks.json             registers the module
hooks/register.ts            the mod (hooks on session.start and turn.step, refresh every 30s)
hooks/register.test.ts       integration tests on the real engine (mocked clock)
```

## Test

```bash
claude plugin test .
```

Runs the mod inside the Claude Code engine (needs `claude` ≥ 2.1.293) with a mocked
clock: countdown, cold state, handoff timing for both TTLs, and `/handoff`.
