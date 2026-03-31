# TODOS

## Mid-session re-emit hook

CLAUDE.md goes stale mid-session if the brain changes (via `grow`, `fire`, `inbox`).
The `SessionStart` hook only refreshes at session start.

**Fix:** Add a `PostToolUse` hook on `Edit|Write` that checks if the brain directory
was modified and re-emits CLAUDE.md. Or integrate with the existing `watch` command.

**Priority:** Low. Brain rarely changes mid-session in normal use.
**Depends on:** WS1 (hooks infrastructure)
**Source:** Codex outside voice finding during eng review (2026-03-31)
