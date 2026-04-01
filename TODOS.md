# TODOS

## Multi-provider LLM support for evolve

Currently evolve only supports Gemini API. Add Groq, OpenAI, Anthropic, and Ollama (local).
Provider detection priority: OLLAMA (localhost, no key) > GROQ > OPENAI > ANTHROPIC > GEMINI.

**Priority:** Medium. Gemini works but limits user choice.
**Depends on:** Phase 4.1 (evolve engine exists)
**Source:** Eng review decision (2026-04-01)

## Digest false positive reduction

Current correction detection fires on loose markers like "instead", "avoid", "않" (Korean)
in normal conversation. Long informational messages get incorrectly flagged as corrections.

**What it would do:** Add minimum confidence scoring — require 2+ correction markers
in the same message, or minimum keyword density relative to message length.

**Priority:** Medium. Candidate staging (Phase 4.2) is the safety net, but it doesn't
exist yet. Until then, false positives create noise neurons.
**Depends on:** Nothing (independent improvement)
**Source:** Codex outside voice finding during eng review (2026-04-01)

## Mid-session re-emit hook

CLAUDE.md goes stale mid-session if the brain changes (via `grow`, `fire`, `inbox`).
The `SessionStart` hook only refreshes at session start.

**Fix:** Add a `PostToolUse` hook on `Edit|Write` that checks if the brain directory
was modified and re-emits CLAUDE.md. Or integrate with the existing `watch` command.

**Priority:** Low. Brain rarely changes mid-session in normal use.
**Depends on:** WS1 (hooks infrastructure)
**Source:** Codex outside voice finding during eng review (2026-03-31)

## Deferred: Supervisor + Heartbeat (was Phase 6)

Process management for long-running hebbian services (api, watch).
CLI-first approach doesn't need this for the core use case.

**What it would do:** Exponential backoff restart, circuit breaker, memory limits,
deadlock detection, heartbeat priority queue.

**Priority:** Low. Revisit if hebbian gets long-running daemon use cases.
**Source:** ROADMAP.md Phase 6, deferred during CEO review (2026-04-01)

## Deferred: Live Injection Hook (was Phase 5)

Intercept https.request/fetch to inject brain into all LLM API requests.
emit + IDE hooks already cover Claude/Cursor/Gemini/Copilot targets.

**Priority:** Low. Only needed if an IDE has no hook/config file support.
**Source:** ROADMAP.md Phase 5, deferred during CEO review (2026-04-01)

## Deferred: MCP Server (was Phase 3)

JSON-RPC 2.0 over stdio for MCP-compatible clients.
CLI hooks replace this entirely for Claude Code. Other MCP clients can use the REST API.

**Priority:** None. Revisit only if MCP becomes the dominant integration pattern.
**Source:** ROADMAP.md Phase 3, killed during design review (2026-03-31)

## Transcript-based test detection

Parse conversation transcript for test signals ('tests passed', 'FAIL', '✓ N tests')
to enrich outcome data beyond git-only detection.

**What it would do:** Add heuristic patterns to digest.ts that detect test outcomes
from the conversation text. Log as `test_pass` or `test_fail` outcome signals.

**Priority:** Medium. Git-only detection covers the strongest signals (revert/acceptance).
Transcript detection adds test_pass/test_fail but with false positive risk.
**Depends on:** Phase 5 (outcome tracking infrastructure exists)
**Source:** Eng review decision (2026-04-01)

## Outcome visualization command

`hebbian outcomes` showing per-neuron outcome history with contra ratio,
session counts, and trend indicators.

**What it would do:** Dedicated command for inspecting the feedback loop's effect
on individual neurons. Richer than `hebbian sessions` (which shows session-level data).

**Priority:** Low. `hebbian sessions` and `hebbian diag` cover the debugging need.
Full visualization is nice-to-have for power users.
**Depends on:** Phase 5 (outcome episodes exist)
**Source:** CEO review decision (2026-04-01)

## Contra visibility in emit output

Show contra information in the emitted CLAUDE.md content (not just diag/stats).
Would let the AI itself see which rules are losing trust.

**What it would do:** Add contra count or intensity breakdown to the neuron entries
in emitRegionRules() output. The AI sees `(counter:5 contra:2 intensity:3)` instead
of just `(5)`.

**Priority:** Low. Emit intensity ranking (Phase 5) already deprioritizes contra'd
neurons. Showing the breakdown is DX/transparency improvement.
**Depends on:** Phase 5 (contra writes exist)
**Source:** CEO review Codex finding #6 (2026-04-01)

## Deferred: Multi-brain composition

Global brain + per-project brain, with composition/override rules.
Needs design work: which brain wins on conflict? How to merge?

**Priority:** Medium. Natural extension of "Personal AI OS" vision.
**Source:** Design doc open question #3 (2026-03-31)

## Deferred: Idle loop (auto-evolve)

Autonomous evolve cycle on 5-min API inactivity.
Start with manual `hebbian evolve`, add auto later.

**Priority:** Medium. Depends on evolve engine stability.
**Source:** Design doc open question #1 (2026-03-31)
