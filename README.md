<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/Runtime_Deps-0-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/Tests-364-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/MIT-green?style=flat-square" />
</p>

<p align="center"><a href="CHANGELOG.md">Changelog</a> · <a href="CONTRIBUTING.md">Contributing</a></p>

# hebbian

### *Folder-as-neuron brain for any AI agent. Self-evolving.*

> "Neurons that fire together, wire together." — Donald Hebb (1949)

---

## The 2-minute demo

```bash
# 1. Install and init a brain
npm install -g hebbian
hebbian init ./brain
hebbian claude install       # attach to Claude Code (hooks)

# 2. Start a Claude Code session
claude
```

During the session, correct the agent in **any language**:

```
you: don't use console.log, always use the logger utility
you: console.log 쓰지마, logger 써
you: やめて、console.logを使わないで
```

The agent detects the correction and runs `hebbian learn` automatically:

```bash
# 📝 learned: cortex/NO_console_log (agent)

hebbian candidates
#   █░░  1/3  cortex/NO_console_log  (0d idle)

# 3. After 2 more clean sessions, it graduates automatically:
#   🎓 promoted: cortex/NO_console_log → permanent neuron

# 4. Next session — the agent sees the rule and follows it
```

**That's it.** One correction → candidate. Three clean sessions → permanent. **No API keys needed.**

---

## TL;DR

**`mkdir` replaces system prompts.** Folders are neurons. Paths are sentences. Counter files are synaptic weights.

```bash
npx hebbian init ./brain
npx hebbian grow brainstem/NO_fallback --brain ./brain
npx hebbian emit claude --brain ./brain    # → CLAUDE.md (with Self-Learning instructions)
```

| Before | hebbian |
|--------|------|
| 1000-line prompts, manually edited | `mkdir` one folder |
| Vector DB $70/mo | **$0** (folders = DB) |
| Switch AI → full migration | `cp -r brain/` — 1 second |
| Rule violation → wishful thinking | `bomb.neuron` → **cascade halt** |
| Rules accumulate forever | Candidates decay if not confirmed |
| English-only learning | **Any language** — the agent IS the LLM |
| Separate LLM for evolution | **Zero external API** — agent self-evolves |

---

## How It Works

### Architecture

```
Any AI agent session (Claude Code / Cursor / Copilot / OpenClaw / ...)
        │
  SessionStart hook                          Stop hook
        │                                        │
   hebbian decay (auto-cleanup)              hebbian digest (EN+KR fallback)
   hebbian emit (inject brain)               hebbian session end (git diff)
        │                                        │
   Agent config ←── brain                   corrections → _candidates/
        │                                              │
   ┌─ Active Rules                          agent-evaluator:
   ├─ Provisional Rules                     clean session → fire (+1)
   ├─ Recent Memory (last 5 episodes)       3 fires → permanent neuron
   ├─ Self-Learning instruction
   └─ Self-Evolution instruction
        │
  During conversation:
   ├─ User corrects agent → agent calls hebbian learn (any language)
   └─ Agent reviews rules → agent calls fire/rollback (self-evolution)

   No API keys. The running agent IS the learner AND the evaluator.
```

**Key insight:** The agent that's already running is an LLM. It understands corrections in any language. It can evaluate whether rules are working. No separate Gemini/OpenAI call needed.

### Candidate Staging (immune system)

New neurons don't go straight into the brain. They land in `_candidates/` first:

```
brain/cortex/_candidates/NO_console_log/1.neuron   ← 1st correction
brain/cortex/_candidates/NO_console_log/2.neuron   ← 2nd correction
brain/cortex/_candidates/NO_console_log/3.neuron   ← promoted!
brain/cortex/NO_console_log/3.neuron               ← permanent
```

- Counter >= 3 → graduates to permanent region
- Each clean session (no corrections) auto-fires all candidates (+1)
- 14 days without a fire → decays (removed)
- This prevents hallucinations and one-off corrections from permanently changing behavior

### 7-Region Subsumption Architecture

```
P0: brainstem    → Absolute laws (immutable, read-only)
P1: limbic       → Emotion filters
P2: hippocampus  → Memory, session restore
P3: sensors      → Environment constraints
P4: cortex       → Knowledge, skills (largest region)
P5: ego          → Tone, personality
P6: prefrontal   → Goals, projects

Rule: Lower P always suppresses higher P.
bomb.neuron in any region → cascade halt.
```

### File Types

| File | Meaning | Biology |
|------|---------|---------|
| `N.neuron` | Excitatory counter (strength) | Synaptic weight |
| `N.contra` | Inhibitory counter | Inhibitory synapse |
| `dopamineN.neuron` | Reward signal | Dopamine |
| `bomb.neuron` | Circuit breaker | Pain response |
| `memoryN.neuron` | Episode recording | Long-term memory |
| `*.dormant` | Inactive marker | Sleep pruning |
| `.config.json` | Brain configuration | Settings |
| `.fire_count` | Fire counter | Auto-evolve trigger |

---

## Agent-Driven Learning (v0.11.0+)

The running agent detects corrections and learns in real-time. Works with **any agent framework** that can run shell commands.

### How it works

1. `hebbian emit` injects **Self-Learning instructions** into the agent's config file
2. When the user corrects the agent, the agent calls `hebbian learn`
3. The correction becomes a candidate neuron (counter starts at 1)
4. After 3 clean sessions, it graduates to a permanent rule

```bash
# The agent calls this automatically when it detects a correction:
hebbian learn "don't use console.log" --prefix NO --keywords "console,log,debug" --brain ./brain

# Works in any language — the agent understands:
hebbian learn "console.log 쓰지마" --prefix NO --keywords "console,log" --brain ./brain
hebbian learn "не используй console.log" --prefix NO --keywords "console,log" --brain ./brain
```

### Neuron Metadata (v0.12.0+)

`.neuron` files store JSON metadata alongside the counter:

```json
{"keywords":["console","log"],"source":"agent","created":"2026-04-06T00:00:00Z","description":"Don't use console.log for debugging"}
```

- `keywords` — search terms for dedup/consolidation
- `source` — who created it (`agent`, `regex`, `evolve`, `manual`)
- `description` — human-readable rule text, shown in Tier 3 emit output
- Backward compatible: empty files (pre-0.12) are read as `meta: null`

### Auto-Evolution (v0.12.0+)

Configure automatic evolution after N fires/learns:

```bash
hebbian config auto-evolve-threshold 25   # trigger evolve every 25 fires
hebbian config auto-evolve-threshold 0    # disable (default)
```

Requires `GEMINI_API_KEY`. If unset, the trigger silently skips. Run `hebbian doctor` to validate.

### Self-Evolution (v0.11.1+)

The agent also evolves the brain without external APIs:

- **Recent Memory** — emit shows the last 5 episodes so the agent has cross-session context
- **Self-Evolution** — the agent reviews Active Rules and fires/rollbacks based on its own judgment
- **Automatic decay** — stale neurons (30 days inactive) are cleaned up on every session start

No Gemini. No OpenAI. The agent that's already running does everything.

---

## Agent Integration

### Claude Code

```bash
hebbian claude install       # one command
hebbian claude status        # check hooks
hebbian doctor               # full diagnostic
```

This adds hooks to `.claude/settings.local.json`:

| Hook | Commands | When |
|------|----------|------|
| `SessionStart` | `decay → emit → session start` | Cleanup, inject brain, capture git state |
| `Stop` | `digest → session end` | Extract corrections, detect outcomes |

### Other Agents

hebbian works with any agent that reads a config file:

| Agent | Command | Config File |
|-------|---------|-------------|
| Cursor | `hebbian emit cursor` | `.cursorrules` |
| GitHub Copilot | `hebbian emit copilot` | `.github/copilot-instructions.md` |
| Gemini | `hebbian emit gemini` | `.gemini/GEMINI.md` |
| Any agent | `hebbian emit generic` | `.neuronrc` |

The emitted file includes Self-Learning and Self-Evolution instructions that any LLM agent can follow.

---

## Tool Failure Detection (v0.6.0+)

hebbian automatically learns from failed commands — no explicit correction needed:

```bash
# During a session, a bash command fails (exit code ≠ 0)
# → hebbian digest auto-logs it as a tool-failure episode
# Soft detection: even || true masked errors are caught (command not found, npm error, fatal:)

hebbian sessions   # see tool-failure episodes in the log
```

Retry patterns (same error 3+ times) are flagged separately as `retry-pattern` episodes.

---

## Multi-Brain (v0.7.0+)

Per-agent brains for multi-agent setups:

```bash
# Individual brain for each agent
hebbian grow cortex/SOME_RULE --agent cto --brain ./brain
hebbian grow cortex/OTHER_RULE --agent coo --brain ./brain

# Results in:
# brain/agents/cto/cortex/SOME_RULE/
# brain/agents/coo/cortex/OTHER_RULE/

# Shared brain (cross-cutting knowledge)
# brain/shared/cortex/...
```

---

## LLM Evolution (optional power feature)

> **You don't need this.** Agent-driven learning (v0.11.0+) handles corrections, evolution, and cleanup without any external API. This is for power users who want batch brain analysis via Gemini.

```bash
GEMINI_API_KEY=... hebbian evolve --dry-run --brain ./brain
GEMINI_API_KEY=... hebbian evolve prune --dry-run --brain ./brain
```

Reads the last 100 episodes + brain state, sends to Gemini, proposes up to 10 mutations per cycle. Protected regions (brainstem/limbic/sensors) are blocked.

---

## CLI Reference

```bash
# Brain management
hebbian init <path>                     # Create brain with 7 regions
hebbian doctor                          # Self-diagnostic (hooks, versions, brain)
hebbian diag                            # Brain diagnostics
hebbian stats                           # Brain statistics

# Neuron operations
hebbian grow <neuron-path>              # Create neuron (merge detection via Jaccard)
hebbian fire <neuron-path>              # Increment counter (+1)
hebbian rollback <neuron-path>          # Decrement counter (min=1)
hebbian signal <type> <neuron-path>     # Add signal (dopamine/bomb/memory)
hebbian decay [--days N]                # Mark inactive neurons dormant
hebbian dedup                           # Batch merge similar neurons

# Agent-driven learning (any language, any agent)
hebbian learn "<text>" --prefix NO --keywords "k1,k2,k3"

# Candidates
hebbian candidates                      # List pending candidates
hebbian candidates promote              # Promote graduated, decay stale

# Emit / compile
hebbian emit <target> [--brain <path>]  # claude/cursor/gemini/copilot/generic/all

# Agent integration
hebbian claude install|uninstall|status # Claude Code hooks
hebbian digest [--transcript <path>]    # Transcript correction extraction (fallback)

# Session tracking
hebbian session start|end               # Capture/detect session outcomes
hebbian sessions                        # Show session outcome history

# Configuration
hebbian config                          # Show all config
hebbian config auto-evolve-threshold 25 # Set auto-evolve threshold

# Evolution (optional power feature — learning works without this)
GEMINI_API_KEY=... hebbian evolve [--dry-run]
GEMINI_API_KEY=... hebbian evolve prune [--dry-run]

# Multi-brain (per-agent)
hebbian grow cortex/RULE --agent cto     # Routes to brain/agents/cto/
hebbian emit claude --agent coo          # Emits from brain/agents/coo/
```

### Emit Targets

| Target | Output File |
|--------|-------------|
| `claude` | `CLAUDE.md` |
| `cursor` | `.cursorrules` |
| `gemini` | `.gemini/GEMINI.md` |
| `copilot` | `.github/copilot-instructions.md` |
| `generic` | `.neuronrc` |
| `all` | All of the above |

---

## Compared to

| Feature | .cursorrules / CLAUDE.md | Mem0 / MemOS | hebbian |
|---------|--------------------------|-------------|------|
| Self-learning | ❌ manual | ✅ vector DB | ✅ agent-driven (any language, no API key) |
| Self-evolution | ❌ | ❌ | ✅ agent reviews & evolves its own rules |
| Multi-language | N/A | English-centric | **Any** — agent IS the LLM |
| Agent-agnostic | One AI only | API lock-in | **Any agent** (Claude/Cursor/Copilot/custom) |
| Infrastructure | $0 | $$$ | **$0** |
| Switch AI | Manual migration | Full re-setup | **`cp -r brain/`** — 1 second |
| Immutable guardrails | None | None | **brainstem + bomb** |
| False-positive protection | None | None | **candidate staging** |
| Audit trail | Text file | DB logs | **`ls -R` = full history** |
| Runtime deps | N/A | Many | **0** |
| Offline | ✅ | ❌ | **✅** |

---

## Starter Brain Templates

```bash
# TypeScript strict mode brain
hebbian init ./brain
hebbian grow brainstem/NO_any_type
hebbian grow brainstem/NO_implicit_returns
hebbian grow cortex/DO_strict_mode
hebbian grow cortex/DO_explicit_types

# Python best practices
hebbian grow brainstem/NO_bare_except
hebbian grow brainstem/NO_mutable_defaults
hebbian grow cortex/DO_type_hints
hebbian grow cortex/DO_dataclasses
```

---

## Zero Runtime Dependencies

Written in **TypeScript 6.0**, built with tsup, tested with vitest.

- `node:fs` — filesystem operations
- `node:path` — path handling
- `node:util` — CLI argument parsing
- `node:http` — REST API
- `node:https` / `fetch()` — LLM API calls (Node 22 built-in)

**Runtime dependencies: 0.**

---

## Governance

364 tests pass in ~10s:

- **SCC** (Subsumption Cascade Correctness): 100%
- **MLA** (Memory Lifecycle Accuracy): 100%
- Candidates, Evolve, Digest, Hooks, Scanner, Similarity...

```bash
npm test
```

---

## Inspired By

[NeuronFS](https://github.com/rhino-acoustic/NeuronFS) — the original Go implementation that proved folders can be neurons. hebbian is a TypeScript reimagination, designed for the npm ecosystem and zero-dependency operation.

---

## License

MIT
