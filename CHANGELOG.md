# Changelog

## 0.9.0 (2026-04-02)

Digest quality overhaul — Korean false positive reduction.

### Changed
- **Korean negation patterns** tightened: require imperative verb object (`X하면 안 돼`) instead of matching casual speech (`하지 않`)
- **Affirmation patterns** tightened: `always` alone no longer matches, requires `should always` or `항상 X해`
- **Multi-signal requirement**: Korean-heavy text (>30% hangul) with only 1 pattern category AND >100 chars is rejected — prevents long narrative messages from being classified as corrections
- **Narrative filter** (`isNarrativeKorean`): messages with 2+ storytelling markers (이유는, 예를 들면, 그래서, 왜냐하면, etc.) are skipped
- **Question filter** expanded: now catches `?!`, `..?!`, `..?` endings (Korean conversational)
- **XML system tag filter** expanded: catches `<tag>...</tag>` anywhere in message, not just at start

### Added
- 4 new tests (336 total): Korean narrative rejection, XML tag filtering, Korean question formats, genuine Korean correction detection

## 0.8.2 (2026-04-02)

CLI version now reads from package.json instead of hardcoded string.

## 0.8.1 (2026-04-02)

Fix digest dedup + soft failure detection for masked errors.

### Fixed
- **Incremental digest** — digest now tracks processed line count via `_meta` in audit log. Re-running digest on a growing transcript (e.g. Stop hook after session resume) correctly processes only new lines instead of skipping the entire session.
- **Soft failure detection** — tool failures masked by `|| true` (exit code 0, `is_error: false`) are now detected via conservative stdout/stderr pattern matching (`command not found`, `npm error`, `fatal:`). Tagged with `[soft]` prefix to distinguish from hard failures.

### Added
- 10 new tests (332 total): incremental digest scenarios, soft failure detection, false-positive guards

## 0.8.0 (2026-04-02)

Voyager foundations — skill library, cross-agent learning, autonomous feedback loop.

### Added
- **Skill Library** (`brain/skills/`) — Voyager-pattern executable skill storage outside the subsumption cascade. Skills skip candidate staging when proposed by evolve. `hebbian grow skills/pattern_name` directly creates skills.
- **Cross-agent learning propagation** — when a candidate neuron is promoted AND its episodes include `tool-failure` or `retry-pattern` types, it auto-propagates to `brain/shared/` so other agents learn from the failure.
- **Feedback daemon** (`hebbian feedback scan`) — scans shared brain for new neurons, propagates `WARN_shared_*` neurons to all agent brains. Watermark-based dedup prevents feedback loops. Run via cron every 15 minutes.
- **Cron management** (`hebbian cron install|uninstall|status`) — generates and installs macOS launchd plists for nightly pruning (02:00) and feedback scanning (every 15 min).
- `scanSkills()`, `propagateToShared()`, `runFeedback()`, `scanSharedBrain()`, `propagateToAgents()` exported from public API
- `Brain.skills?` optional field in Brain type

### Changed
- `growNeuron()` now accepts `skills/` as a valid path prefix
- `validateActions()` in evolve accepts `skills/` paths (skills skip candidate staging)
- `initBrain()` creates `skills/` directory with `_rules.md` template

## 0.7.1 (2026-04-02)

Test and documentation update for v0.6-0.7 features.

### Added
- 16 new tests (317 total): parseToolResults, detectToolFailure, detectRetryPatterns, resolveAgentBrain, resolveSharedBrain, path traversal blocking

### Changed
- README updated with tool failure detection, multi-brain, evolve prune documentation

## 0.7.0 (2026-04-02)

Voyager foundations — retry detection, pruning mode, multi-brain, auto-gitignore.

### Added
- **Retry pattern detection** — when the same error appears 3+ times in a session, logged as `retry-pattern` episode. Persistent problems surface automatically.
- **`evolve prune`** — new pruning mode for the evolve engine. Uses a cleanup-focused LLM prompt that only prunes/decays/bombs. Run nightly as the "청소부" to prevent memory bloat.
- **Multi-brain support** — `--agent <name>` flag routes all commands to `brain/agents/{name}/`. Individual brains for each agent, shared brain at `brain/shared/`.
- **Auto-gitignore** — `hebbian init` automatically adds the brain directory to `.gitignore`. Personal learning data never leaks into shared repos.
- `resolveAgentBrain()`, `resolveSharedBrain()` exported from public API

## 0.6.0 (2026-04-02)

The brain that learns from failure — no words needed.

### Added
- **Tool failure detection** — digest now scans tool_result blocks in Claude Code transcripts for `is_error: true` and exit codes. Failed bash commands, pre-commit hook errors, build failures are automatically logged as `tool-failure` episodes. Language-independent — a failed command is a failed command in any language.
- `parseToolResults()` and `detectToolFailure()` exported from public API
- `DigestResult.toolFailures` count field

### Changed
- `digestTranscript()` now runs two passes: user corrections (existing) + tool failures (new). Both feed into the episode log for evolve to analyze.

## 0.5.3 (2026-04-02)

Further false positive reduction in digest.

### Fixed
- **Korean `않` pattern too broad** — bare `/않/` matched any Korean text containing 않 (e.g., code explanations like "보장되진 않습니다"). Replaced with verb-specific forms `/하지\s*않/`, `/쓰지\s*않/`.
- **Bullet-list text filter** — messages starting with `•`, `·`, `▸`, `▶`, `-`, or `*` are now skipped. These indicate injected assistant output or formatted lists, not user corrections.
- Removed overly broad `/대신/` ("instead") Korean pattern that could match incidental usage.

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
