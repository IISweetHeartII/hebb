# Contributing to hebbian

## Development Setup

```bash
git clone https://github.com/IISweetHeartII/hebbian.git
cd hebbian
npm install
npm test          # 364 tests, ~10s
npm run typecheck # TypeScript strict mode
```

## Project Structure

```
src/
  cli.ts          # CLI dispatch (24 commands)
  learn.ts        # Agent-driven learning
  digest.ts       # Transcript correction extraction
  emit.ts         # 3-tier emit (CLAUDE.md, .cursorrules, etc.)
  evolve.ts       # Optional Gemini-powered evolution
  candidates.ts   # Candidate staging (immune system)
  outcome.ts      # Session outcome tracking
  scanner.ts      # Brain filesystem walker
  fire.ts         # Counter increment/decrement
  grow.ts         # Neuron creation with Jaccard merge
  ...
test/
  *.test.ts       # vitest, mirrors src/ structure
```

## Key Principles

1. **Zero runtime dependencies.** Only Node.js built-ins. No exceptions.
2. **The agent IS the LLM.** Don't add external API calls for things the running agent can do.
3. **Filesystem is the database.** Folders are neurons, files are traces. `ls -R` is your query language.
4. **Agent-agnostic.** Works with Claude Code, Cursor, Copilot, Gemini, or any agent that reads a config file.
5. **Candidate staging.** New neurons are provisional. Three confirmations to graduate. False positives decay.

## Running Tests

```bash
npm test              # all tests
npx vitest run test/digest.test.ts  # single file
npm run typecheck     # type check only
```

## Making Changes

1. Write the code
2. Add tests (check existing tests for patterns)
3. Run `npm test` and `npm run typecheck`
4. Commit with a descriptive message

## Commit Style

```
feat: agent-driven learning — any language, any agent (v0.11.0)
fix: doctor hook detection for global settings
docs: update README architecture diagram
```

## Architecture Notes

- **Subsumption cascade**: P0 (brainstem) always overrides P6 (prefrontal). `bomb.neuron` halts everything.
- **Candidate staging**: `_candidates/` directories are invisible to scanner/emit. Graduate at counter >= 3.
- **Agent-driven learning**: `emit` injects Self-Learning + Self-Evolution instructions. The agent calls `hebbian learn` and `hebbian fire/rollback` during conversation.
- **Digest fallback**: EN+KR regex runs at session end as a safety net. Agent-driven learning is the primary path.
