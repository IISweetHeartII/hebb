# Changelog

## 0.5.2 (2026-04-02)

Same as 0.5.1 — fixes hardcoded VERSION constant in CLI (was still showing v0.5.0).

## 0.5.1 (2026-04-02)

Security hardening and self-learning correctness fixes.

### Fixed
- **Digest false positives** — system-injected XML tags (`<local-command-caveat>`, `<command-message>`, `<task-notification>`) and skill base directory messages were being misidentified as user corrections, creating garbage neurons. Now filtered.
- **GEMINI_API_KEY URL leak** — API key was appended as `?key=...` in the Gemini request URL, leaking it to proxies and HTTP logs. Moved to `x-goog-api-key` header.
- **Path traversal in LLM actions** — `validateActions()` checked region names but not `..` components. A prompt-injected action like `cortex/../../.bashrc` would pass. Now blocked in both `validateActions` and `growNeuron`.
- **Prompt injection via episode.detail** — episode detail strings were embedded verbatim in the Gemini prompt. Sanitized to single line, stripped of markdown header markers.
- **Prompt injection via outcome summary** — neuron paths in `buildOutcomeSummary` now have newlines and `#` stripped before embedding in the LLM prompt.

### Added
- **Evolve cooldown** — `hebbian evolve` enforces a 60-second cooldown between calls to prevent runaway API costs. Override with `EVOLVE_NO_COOLDOWN=1` or configure via `EVOLVE_COOLDOWN_SECONDS`.
- **REST API body size limit** — `POST` endpoints now reject requests over 1 MB to prevent OOM denial-of-service.

## 0.5.0 (2026-04-01)

The brain that learns from outcomes. Two major phases ship together: Immune System (Phase 4) and Feedback Loop (Phase 5).

### Added
- **Outcome tracking** — `hebbian session start/end` captures git state at session boundaries, detects reverts and acceptances automatically
- **Contra signals** — reverted sessions write inhibitory `N.contra` files to active neurons, weakening bad rules over time
- **Outcome-enriched evolve** — the LLM evolve engine now sees per-neuron outcome history (sessions, reverts, acceptances, contra ratio) and can act on real feedback
- **Candidate staging** — new neurons land in `_candidates/` with a probation period (counter >= 3 to graduate, 14-day decay)
- **LLM evolve engine** — `hebbian evolve` sends brain state + episodes to Gemini, proposes grow/fire/signal/prune/decay mutations
- **Global hooks** — `hebbian claude install --global` writes to `~/.claude/settings.json` for machine-wide brain integration
- **Session history** — `hebbian sessions` shows past session outcomes (like git log for your brain)
- **Doctor command** — `hebbian doctor` self-diagnostic for hooks, brain integrity, versions, npx path
- **Clean digest naming** — stop-word removal, snake_case normalization, MUST/WARN/DO/NO prefixes
- **301 tests** (was 277)

### Changed
- Emit now ranks neurons by **intensity** (counter - contra + dopamine) instead of raw counter
- `hebbian diag` shows contra and intensity breakdown per neuron
- Hooks chain `session start/end` for automatic outcome capture
- Digest and inbox route new neurons through candidate staging instead of direct grow

### Fixed
- Stable npx path resolution for hooks (survives node upgrades)
- First emit preserves existing CLAUDE.md content via marker-based prepend

## 0.2.0 (2026-03-31)

Full TypeScript rewrite.

### Breaking Changes
- Source moved from `lib/` to `src/` (TypeScript)
- Built output in `dist/` (compiled JS + declarations)
- Package now ships compiled JS, not source

### Improvements
- **TypeScript 6.0** — full type safety, exported type declarations
- **tsup** — fast ESM bundling, tree-shakable output
- **vitest** — faster test runner with native TS support
- **134 tests** passing (was 135 in JS, -1 from vitest loop handling)
- Strict mode: `noUncheckedIndexedAccess`, full `strict: true`

### Architecture
- Zero runtime dependencies (unchanged)
- Dev: typescript 6.0, tsup 8.5, vitest 4.1
- Node.js >= 22.0.0

## 0.1.0 (2026-03-31)

Initial release (JavaScript).

### Features
- Brain Scanner, Subsumption Cascade, 3-Tier Emit
- Multi-Target Output (claude/cursor/gemini/copilot/generic/all)
- Grow with Jaccard merge detection, Fire/Rollback, Signal, Decay
- Watch Mode, Brain Init, CLI (14 commands)
- Governance: SCC 100%, MLA 100%
