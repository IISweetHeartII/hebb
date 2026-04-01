<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js" />
  <img src="https://img.shields.io/badge/Runtime_Deps-0-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/Tests-277-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/MIT-green?style=flat-square" />
</p>

<p align="center"><a href="README.ko.md">한국어</a> · <a href="CHANGELOG.md">Changelog</a></p>

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

During the session, correct Claude once:

```
you: don't use console.log, always use the logger utility
```

```bash
# 3. End the session (hooks auto-run hebbian digest)
# Check what hebbian learned:
hebbian candidates
#   ░░█  1/3  cortex/NO_console_log  (0d idle)

# 4. After 2 more corrections, it graduates:
#   🎓 promoted: cortex/_candidates/NO_console_log → cortex/NO_console_log

# 5. Next session — Claude sees the rule in CLAUDE.md:
#   ❌ NO console.log → use logger utility
```

**That's it.** One correction, hebbian learns. Three confirmations, it becomes permanent.

---

## TL;DR

**`mkdir` replaces system prompts.** Folders are neurons. Paths are sentences. Counter files are synaptic weights.

```bash
npx hebbian init ./brain
npx hebbian grow brainstem/禁fallback --brain ./brain
npx hebbian emit claude --brain ./brain    # → CLAUDE.md
npx hebbian evolve --dry-run               # → LLM proposes brain mutations
```

| Before | hebbian |
|--------|------|
| 1000-line prompts, manually edited | `mkdir` one folder |
| Vector DB $70/mo | **$0** (folders = DB) |
| Switch AI → full migration | `cp -r brain/` — 1 second |
| Rule violation → wishful thinking | `bomb.neuron` → **cascade halt** |
| Rules accumulate forever | Candidates decay if not confirmed |

---

## How It Works

### Architecture

```
Claude Code session
        │
  SessionStart hook        Stop hook
        │                      │
   hebbian emit           hebbian digest
        │                      │
   CLAUDE.md ←── brain ──→ _candidates/
                    │              │
              hebbian evolve   3 confirmations
                    │              │
              LLM proposes    permanent neuron
              grow/fire/prune
```

### Candidate Staging (immune system)

New neurons don't go straight into the brain. They land in `_candidates/` first:

```
brain/cortex/_candidates/NO_console_log/1.neuron   ← 1st correction
brain/cortex/_candidates/NO_console_log/2.neuron   ← 2nd correction
brain/cortex/_candidates/NO_console_log/3.neuron   ← promoted!
brain/cortex/NO_console_log/3.neuron               ← permanent
```

- Counter >= 3 → graduates to permanent region
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

---

## Claude Code Integration

One command to set up:

```bash
hebbian claude install
```

This adds two hooks to `.claude/settings.local.json`:

| Hook | Command | When |
|------|---------|------|
| `SessionStart` | `hebbian emit claude` | Injects brain into CLAUDE.md |
| `Stop` | `hebbian digest` | Extracts corrections from conversation |

Check status anytime:

```bash
hebbian claude status
hebbian doctor       # full diagnostic
```

---

## LLM Evolution

```bash
GEMINI_API_KEY=... hebbian evolve --dry-run --brain ./brain
```

The evolve engine reads the last 100 episodes + current brain state, sends it to Gemini, and proposes up to 10 mutations per cycle. Protected regions (brainstem/limbic/sensors) are blocked.

Actions it can take: `grow` (new neuron), `fire` (strengthen), `signal` (dopamine/bomb), `prune` (weaken), `decay` (mark dormant).

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

# Candidates
hebbian candidates                      # List pending candidates
hebbian candidates promote              # Promote graduated, decay stale

# Emit / compile
hebbian emit <target> [--brain <path>]  # claude/cursor/gemini/copilot/generic/all

# Claude Code
hebbian claude install|uninstall|status
hebbian digest [--transcript <path>]

# Evolution
GEMINI_API_KEY=... hebbian evolve [--dry-run]
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
| Self-learning | ❌ manual | ✅ vector DB | ✅ filesystem |
| Infrastructure | $0 | $$$ | **$0** |
| Switch AI | Manual migration | Full re-setup | **`cp -r brain/`** |
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

277 tests pass in ~10s:

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
