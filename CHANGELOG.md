# Changelog

## 0.1.0 (2026-03-31)

Initial release.

### Features
- **Brain Scanner** — walks filesystem, parses neurons/contra/dopamine/bomb/dormant
- **Subsumption Cascade** — 7-region priority engine with circuit breaker (bomb)
- **3-Tier Emit** — bootstrap (~500 tokens) / index / per-region rules
- **Multi-Target Output** — claude, cursor, gemini, copilot, generic, all
- **Marker Injection** — preserves surrounding content in existing files
- **Grow with Merge Detection** — Jaccard similarity prevents duplication
- **Fire / Rollback** — counter increment/decrement with min=1 boundary
- **Signal** — dopamine (reward), bomb (circuit breaker), memory (episodic)
- **Decay** — dormancy sweep for inactive neurons
- **Watch Mode** — auto-recompile on filesystem changes
- **Brain Init** — creates 7-region brain with starter neurons
- **CLI** — `npx hebb` with 12 commands
- **Governance Tests** — SCC 17/17 + MLA 15/15 = 100%

### Architecture
- Zero runtime dependencies (pure Node.js built-ins)
- Node.js >= 22.0.0
- Pure JavaScript + JSDoc types (no build step)
- 120 tests, ~850ms
