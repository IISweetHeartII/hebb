# hebb Roadmap

> Phase 2+ implementation plan for full NeuronFS feature parity.
> Each phase is independently shippable as a minor version.

---

## Phase 1 — v0.1.0 (DONE)

Core brain mechanics. Zero dependencies. 135 tests, 97.8% line coverage.

- [x] Brain scanner (7-region filesystem walker)
- [x] Subsumption cascade (P0→P6 priority + bomb circuit breaker)
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

## Phase 2 — v0.2.0: REST API + Inbox Processing

**Goal:** Programmatic brain manipulation via HTTP. Enable external tools (n8n, webhooks, dashboards) to interact with hebb.

### 2.1 REST API (`lib/api.js`)

Port from: `NeuronFS/runtime/main.go` lines 2099-2434

```bash
hebb api [--port 9090] [--brain ./brain]
```

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Process health + brain stats |
| GET | `/api/brain` | Full brain state JSON |
| GET | `/api/read?region=cortex` | Read region rules (RAG retrieval + auto-fire top 3) |
| POST | `/api/grow` | `{"path":"cortex/..."}` |
| POST | `/api/fire` | `{"path":"cortex/..."}` |
| POST | `/api/signal` | `{"path":"...", "type":"dopamine"}` |
| POST | `/api/rollback` | `{"path":"cortex/..."}` |
| POST | `/api/decay` | `{"days":30}` |
| POST | `/api/dedup` | Batch merge similar neurons |
| POST | `/api/inject` | Force re-emit all tiers |
| POST | `/api/report` | `{"message":"...", "priority":"normal"}` |
| GET | `/api/reports` | List pending reports |

**Implementation notes:**
- Use `node:http` (zero dependencies)
- CORS: allow all origins
- Activity tracking: update `lastAPIActivity` on mutations
- JSON response for all endpoints
- Port `buildBrainJSONResponse()` and `buildHealthJSON()` from `dashboard.go` lines 132-190

**Data schemas (from dashboard.go):**

```js
// BrainJSON — GET /api/brain
{
  root: string,
  regions: [{
    name: string,          // "cortex"
    icon: string,          // "🧠"
    ko: string,            // "지식/기술"
    priority: number,      // 0-6
    hasBomb: boolean,
    neurons: [{
      name: string,
      path: string,
      counter: number,
      contra: number,
      dopamine: number,
      hasBomb: boolean,
      hasMemory: boolean,
      isDormant: boolean,
      depth: number,
      modTime: number       // unix ms
    }],
    axons: string[]
  }],
  bombSource: string,
  firedNeurons: number,
  totalNeurons: number,
  totalCounter: number
}
```

**Test plan:** `test/api.test.js` — HTTP request/response tests with `node:http` client

### 2.2 Inbox Processing (`lib/inbox.js`)

Port from: `NeuronFS/runtime/main.go` lines 1425-1544

**Purpose:** Parse `_inbox/corrections.jsonl`, auto-create/fire neurons from AI corrections.

**Entry format:**
```jsonl
{"ts":"...","type":"correction","text":"reason","path":"cortex/category/rule","counter_add":1,"author":"pm"}
```

**Logic:**
1. Read `_inbox/corrections.jsonl`
2. For each line: parse JSON → validate path → security check (no traversal)
3. Dopamine inflation filter: only PM/admin can award dopamine
4. If neuron exists → fire N times; else → grow + fire (N-1)
5. Clear inbox file after processing

**Test plan:** `test/inbox.test.js` — JSONL parsing, security checks, dopamine filter

### 2.3 Episode Logging (`lib/episode.js`)

Port from: `NeuronFS/runtime/main.go` lines 1300-1342

**Purpose:** Write events to `hippocampus/session_log/memoryN.neuron` (circular buffer, max 100).

**Used by:** grow, fire, signal, evolve, inbox processing

---

## Phase 3 — v0.3.0: MCP Server

**Goal:** Enable hebb as a Model Context Protocol tool server for Claude Code, Cursor, and any MCP-compatible client.

### 3.1 MCP Server (`lib/mcp.js`)

Port from: `NeuronFS/runtime/mcp_server.go` lines 32-544

```bash
hebb mcp [--brain ./brain]
```

**Protocol:** JSON-RPC 2.0 over stdio

**10 Tools to implement:**

| # | Tool | Input | Handler |
|---|------|-------|---------|
| 1 | `read_region` | `{region: enum}` | Read _rules.md + auto-fire top 3 |
| 2 | `read_brain` | — | Full brain state JSON |
| 3 | `grow` | `{path: string}` | growNeuron() with merge detection |
| 4 | `fire` | `{path: string}` | fireNeuron() |
| 5 | `signal` | `{path, type: enum}` | signalNeuron() |
| 6 | `correct` | `{path, text}` | Grow or fire based on existence |
| 7 | `evolve` | `{dry_run: bool}` | Trigger LLM evolution (Phase 4) |
| 8 | `report` | `{message, priority}` | Queue report to inbox |
| 9 | `pending_reports` | `{done: bool}` | List/clear pending reports |
| 10 | `heartbeat_ack` | `{result: string}` | ACK heartbeat injection |

**Implementation notes:**
- Use `@modelcontextprotocol/sdk` (or implement minimal JSON-RPC 2.0 stdio parser — ~100 lines)
- Redirect console output to stderr to keep stdio clean for JSON-RPC

**Test plan:** `test/mcp.test.js` — tool registration, input validation, JSON-RPC message format

### 3.2 Claude Code Integration

```jsonc
// ~/.claude/settings.json
{
  "mcpServers": {
    "hebb": {
      "command": "npx",
      "args": ["hebb", "mcp", "--brain", "/path/to/brain"]
    }
  }
}
```

---

## Phase 4 — v0.4.0: LLM Evolution (Evolve)

**Goal:** Autonomous brain evolution powered by LLM (Groq, OpenAI, or any compatible API).

### 4.1 Evolve Engine (`lib/evolve.js`)

Port from: `NeuronFS/runtime/evolve.go` lines 87-514

```bash
hebb evolve [--dry-run] [--brain ./brain]
```

**Pipeline:**
1. `collectEpisodes()` — Read hippocampus session logs (last 100)
2. `buildBrainSummary()` — Markdown snapshot of current brain state
3. `buildEvolvePrompt()` — Zero-shot prompt with axioms + brain + episodes
4. `callLLM()` — HTTP POST to Groq/OpenAI API
5. Parse JSON response: `{summary, insights, actions[]}`
6. Validate actions:
   - Max 10 per cycle
   - Prefer fire > grow (consolidation over duplication)
   - Block: brainstem (P0), limbic (P1), sensors/brand modifications
   - Valid types: grow, fire, signal, prune, decay
7. Execute or dry-run

**LLM Request (from evolve.go lines 390-402):**
```js
{
  model: "llama-3.3-70b-versatile",
  messages: [
    { role: "system", content: "Korean persona as 백혈구..." },
    { role: "user", content: buildEvolvePrompt() }
  ],
  temperature: 0.3,
  max_tokens: 4096,
  response_format: { type: "json_object" }
}
```

**Environment:** `GROQ_API_KEY` or `OPENAI_API_KEY`

**Test plan:** `test/evolve.test.js` — prompt building, action validation, mock LLM response

### 4.2 Idle Loop (`lib/idle.js`)

Port from: `NeuronFS/runtime/main.go` lines 1725-1808

**Autonomous cycle on 5-min API inactivity:**
1. Evolve (if API key available)
2. Auto-decay (30+ days inactive)
3. Dedup (Jaccard merge)
4. Git snapshot
5. Cooldown: 30 min before next cycle

---

## Phase 5 — v0.5.0: Live Injection Hook

**Goal:** Inject brain rules into every LLM API request from AI IDEs, without requiring MCP.

### 5.1 Injection Hook (`lib/hook.cjs`)

Port from: `NeuronFS/runtime/v4-hook.cjs` (299 lines)

```bash
export HEBB_BRAIN="$HOME/hebb/brain"
export NODE_OPTIONS="--require $(npx -y hebb hook-path)"
# Then start any Node.js-based AI IDE
```

**Mechanism:**
- Intercept `https.request()` and `globalThis.fetch()`
- Detect LLM API hostnames: `generativelanguage.googleapis.com`, `api.anthropic.com`, `api.openai.com`
- Scan brain for promoted neurons (counter >= 5)
- Append `[hebb Live Context]` block to system prompt
- Cache rules for 30 seconds (re-scan on TTL expiry)
- Optionally dump transcripts to `_agents/global_inbox/transcript_latest.jsonl`

**Growth Protocol injection:**
```
When user corrects a mistake, append to _inbox/corrections.jsonl:
{"type":"correction","path":"cortex/[category]/[rule_name]","text":"reason","counter_add":1}
```

**Note:** This must be CommonJS (`.cjs`) because `--require` doesn't support ESM.

### 5.2 Claude Code Hooks Integration

```jsonc
// ~/.claude/settings.json
{
  "hooks": {
    "PreToolUse": [{
      "command": "npx hebb emit claude --brain $HEBB_BRAIN"
    }]
  }
}
```

---

## Phase 6 — v0.6.0: Supervisor + Heartbeat

**Goal:** Process management for long-running hebb services.

### 6.1 Supervisor (`lib/supervisor.js`)

Port from: `NeuronFS/runtime/supervisor.go` (430 lines)

```bash
hebb supervisor [--brain ./brain]
```

**Manages:**
- `hebb api` (HTTP server)
- `hebb watch` (filesystem watcher)
- Custom child processes (configurable)

**Features:**
- Exponential backoff restart: `delay = min(1s * 2^n, 5min)`
- Circuit breaker: 10+ rapid crashes → 60s cooldown + alert
- Memory limit: 500MB threshold → kill + restart
- Deadlock detection: ping `/api/health` every 60s
- Lock files: PM can disable individual processes

### 6.2 Heartbeat Loop (`lib/heartbeat.js`)

Port from: `NeuronFS/runtime/main.go` lines 1934-2093

**Priority queue:**
1. P0: Memory Observer — read transcripts, find un-neuronized decisions
2. P1: Pending reports — process user reports
3. P2: Health check — verify supervisor/logs freshness
4. P3: Todo fallback — execute pending prefrontal tasks

---

## Source Reference

All features are ported from [NeuronFS](https://github.com/rhino-acoustic/NeuronFS) (Go, MIT license).

**Key source files for each phase:**

| Phase | NeuronFS Source | Lines | Complexity |
|-------|----------------|-------|------------|
| 2 (API) | `runtime/main.go` | 2099-2434 | Medium |
| 2 (Inbox) | `runtime/main.go` | 1425-1544 | Medium |
| 2 (Episode) | `runtime/main.go` | 1300-1342 | Simple |
| 3 (MCP) | `runtime/mcp_server.go` | 32-544 | Medium |
| 4 (Evolve) | `runtime/evolve.go` | 87-514 | Complex |
| 4 (Idle) | `runtime/main.go` | 1725-1808 | Medium |
| 5 (Hook) | `runtime/v4-hook.cjs` | 1-299 | Complex |
| 6 (Supervisor) | `runtime/supervisor.go` | 69-390 | Complex |
| 6 (Heartbeat) | `runtime/main.go` | 1934-2093 | Complex |

**When implementing each phase:**
1. Read the referenced NeuronFS source file + line range
2. Understand the Go data structures and algorithm
3. Port to JS using hebb's existing patterns (JSDoc types, node:fs, etc.)
4. Write tests first (TDD), then implement
5. Ensure zero new runtime dependencies

---

## Version Timeline

| Version | Content | Dependency |
|---------|---------|------------|
| v0.1.0 | Core CLI (DONE) | — |
| v0.2.0 | REST API + Inbox | v0.1.0 |
| v0.3.0 | MCP Server | v0.2.0 (uses API handlers) |
| v0.4.0 | LLM Evolve | v0.2.0 (needs episodes + inbox) |
| v0.5.0 | Live Hook | v0.1.0 (standalone) |
| v0.6.0 | Supervisor | v0.2.0 (manages api + watch) |
