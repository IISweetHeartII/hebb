# hebbian Roadmap

> Self-evolving brain for AI agents. CLI-first, zero dependencies, filesystem-as-memory.
> Each phase is independently shippable as a minor version.
>
> Design doc: `~/.gstack/projects/IISweetHeartII-hebbian/pppp-main-design-20260331-223241.md`

---

## Phase 1 — v0.1.0: Core Brain (DONE)

Core brain mechanics. Zero dependencies. 135 tests, 97.8% line coverage.

- [x] Brain scanner (7-region filesystem walker)
- [x] Subsumption cascade (P0-P6 priority + bomb circuit breaker)
- [x] 3-tier emit (bootstrap/index/per-region rules)
- [x] Multi-target output (claude/cursor/gemini/copilot/generic/all)
- [x] Marker-based injection (preserves surrounding content)
- [x] Grow with Jaccard merge detection (synaptic consolidation)
- [x] Fire / Rollback (counter increment/decrement, min=1)
- [x] Signal (dopamine/bomb/memory)
- [x] Decay (dormancy sweep, configurable days)
- [x] Dedup (batch Jaccard merge)
- [x] Snapshot (git commit brain state)
- [x] Watch (fs.watch recursive + auto-recompile)
- [x] Init (7-region brain + starter neurons)
- [x] CLI (14 commands)
- [x] Governance tests (SCC 100%, MLA 100%)

---

## Phase 2 — v0.2.0: REST API + Inbox (DONE)

Programmatic brain manipulation via HTTP. External tools (n8n, webhooks, dashboards).

- [x] REST API — 12 endpoints (health, brain, read, grow, fire, signal, rollback, decay, dedup, inject, report, reports)
- [x] Inbox processing — parse `_inbox/corrections.jsonl`, auto-create/fire neurons
- [x] Episode logging — hippocampus/session_log circular buffer (max 100)

---

## Phase 3 — v0.3.x: Claude Code Integration (DONE)

CLI-first integration with Claude Code. No MCP — hooks do everything MCP would.

- [x] `hebbian claude install` — one command, hooks are set
- [x] `hebbian digest` — extract corrections from conversation transcript
- [x] SessionStart hook — emit brain to CLAUDE.md on every session
- [x] Stop hook — digest conversation for corrections on session end
- [x] Stable npx path resolution — survives node/hebbian upgrades
- [x] Marker-based prepend — first emit preserves existing CLAUDE.md content
- [x] Auto-update check — npm registry with cache (60min/720min TTL) + banner
- [x] `hebbian claude status` — hook health + version info

### Why not MCP?

MCP requires a separate server process, complex configuration, and doesn't add
capabilities over CLI hooks. `hebbian emit` injects brain rules at session start.
`hebbian digest` captures learning at session end. That's the whole loop.

---

## Phase 4 — v0.4.0: Immune System (NEXT)

The brain that evolves. LLM-powered evolution, candidate staging, and the "whoa" demo.

### 4.0 Digest Keyword Extraction Improvement

Current digest creates ugly neuron names (`NO_don't_console.log_debugging,_structur`).
Clean up keyword extraction to produce `NO_console_log` style names.

- [x] Stop-word removal (expanded set + correction-specific words)
- [x] Snake_case normalization (punctuation stripping, unstemmed tokens)
- [x] Max 3 keyword tokens per name
- [x] Prefix support (NO_, DO_, MUST_, WARN_) with priority ordering
- [x] Jaccard prefix-aware consolidation (strip prefix before comparison)

### 4.1 Evolve Engine (`src/evolve.ts`)

LLM-powered brain evolution. Port from NeuronFS evolve.go.

```bash
hebbian evolve [--dry-run] [--brain ./brain]
```

- [x] Collect episodes from hippocampus session log (last 100)
- [x] Build markdown summary of current brain state
- [x] Build zero-shot prompt with axioms + brain + episodes
- [x] Call LLM (Gemini) with structured JSON response
- [x] Parse actions: grow, fire, signal, prune, decay (max 10 per cycle)
- [x] Validate: block brainstem/limbic/sensors, schema check
- [x] Execute or dry-run mode
- [x] Graceful failure: skip cycle on API error, log to episode

Environment: `GEMINI_API_KEY` (required), `EVOLVE_MODEL` (optional override)

### 4.2 Candidate Neuron Staging

New neurons from evolve/inbox/digest land in `{region}/_candidates/` with probation:

- [ ] Created with counter=1
- [ ] Graduate at counter >= 3 (move to parent region)
- [ ] Auto-decay if not fired within 14 days
- [ ] `_candidates/` already invisible to scan/emit/decay (existing `_` prefix convention)

### 4.3 `hebbian doctor`

Self-diagnostic command for DX. "Why isn't it working?"

```bash
hebbian doctor [--brain ./brain]
```

- [ ] Hook installation status (settings.local.json exists? commands valid?)
- [ ] npx path resolution check
- [ ] Brain integrity (regions exist? neurons parseable?)
- [ ] npm version vs installed version
- [ ] Node.js version check (>= 22)
- [ ] Actionable fix suggestions for each issue

### 4.4 README + Demo (parallel with 4.1)

The "whoa in 2 minutes" README. Ships alongside evolve.

- [ ] 30-second install to first brain
- [ ] The demo: correct Claude -> hebbian learns -> next session is different
- [ ] Architecture diagram (text-based)
- [ ] Comparison table vs Mem0/MemOS
- [ ] Starter brain templates (TypeScript strict mode, Python best practices)

### 4.5 Version Bump + Promotion

- [ ] Bump to v0.4.0
- [ ] npm publish
- [ ] GitHub release with changelog

---

## Phase 5 — v0.5.0: Feedback Loop

Outcome tracking enriches the evolve engine with real signals.

### 5.1 Outcome Tracking

Enrich episode logging with outcome signals:

- [ ] `test_pass` / `test_fail` — did tests pass after AI changes?
- [ ] `revert` — did user undo AI's work? (git diff comparison)
- [ ] `correction` — did user explicitly correct AI?
- [ ] `acceptance` — did user accept without changes?
- [ ] Attribution: signals apply to all neurons injected at SessionStart
- [ ] Protected regions: brainstem/limbic/sensors signals logged but not acted on

### 5.2 Evolve Engine Integration

- [ ] Evolve uses outcome signals (not just fire count) for decision-making
- [ ] Neurons in high-revert sessions accumulate contra signals
- [ ] Candidate graduation considers outcome signals

---

## Deferred (TODOS.md)

Items considered and explicitly deferred:

| Item | Reason |
|------|--------|
| MCP Server | CLI hooks do everything MCP would, without the complexity |
| Live Injection Hook | emit + IDE hooks cover all targets |
| Supervisor + Heartbeat | CLI-first approach doesn't need process management |
| Multi-brain composition | Post-MVP, needs design work |
| Idle loop (auto-evolve) | Start manual, add auto later |
| Mid-session re-emit | Low priority, brain rarely changes mid-session |

---

## Source Reference

Features ported from [NeuronFS](https://github.com/rhino-acoustic/NeuronFS) (Go, MIT license).

| Phase | NeuronFS Source | Lines |
|-------|----------------|-------|
| 4.1 (Evolve) | `runtime/evolve.go` | 87-514 |
| 5.1 (Outcomes) | `runtime/main.go` | 1725-1808 |

---

## Version Timeline

| Version | Content | Status |
|---------|---------|--------|
| v0.1.0 | Core CLI | DONE |
| v0.2.0 | REST API + Inbox | DONE |
| v0.3.x | Claude Code Integration | DONE (current: v0.3.2) |
| v0.4.0 | Immune System (evolve + candidates + README) | NEXT |
| v0.5.0 | Feedback Loop (outcome tracking) | planned |
