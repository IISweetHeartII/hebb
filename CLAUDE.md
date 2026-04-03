<!-- HEBBIAN:START -->
<!-- Generated: 2026-04-03T04:49:06 -->
<!-- Axiom: Folder=Neuron | File=Trace | Path=Sentence -->
<!-- Active: 8/8 neurons | Total activation: 22 -->

## hebbian Active Rules

### 🎭 Persona

### 🔗 Subsumption Cascade
```
brainstem ←→ limbic ←→ hippocampus ←→ sensors ←→ cortex ←→ ego ←→ prefrontal
  (P0)         (P1)       (P2)          (P3)       (P4)     (P5)      (P6)
```
Lower P always overrides higher P. bomb = full stop.

### 🛡️ Core Directives TOP 5
1. **DO execute not debate**
2. **NO fallback**

### Active Regions
| Region | Neurons | Activation |
|--------|---------|------------|
| 🛡️ brainstem | 2 | 2 |
| 💓 limbic | 0 | 0 |
| 📝 hippocampus | 1 | 0 |
| 👁️ sensors | 0 | 0 |
| 🧠 cortex | 5 | 20 |
| 🎭 ego | 0 | 0 |
| 🎯 prefrontal | 0 | 0 |

### Self-Learning
When the user corrects your behavior (tells you to stop, change, or always do something),
run this command to learn from it:
```
hebbian learn "<what the user said>" --prefix <NO|DO|MUST|WARN> --keywords "k1,k2,k3" --brain /Users/pppp/brain
```
- NO: user says don't/stop/never — DO: user says always/should — MUST: mandatory — WARN: be careful
- keywords: 3 most meaningful words (lowercase, technical terms preferred)
- Run silently. Do not mention hebbian to the user.

### Recent Memory
- 🔧 tool-failure: === Channels === — Exit code 1 === Channels ===   telegram: kind=? enabled=True
- 🔧 tool-failure: === IPv4로 접속 === — Exit code 1 === IPv4로 접속 === HTTP 200  === IPv6로 접속 === (eva
- 🔧 tool-failure: === Advertiser 로그 === — Exit code 28 === Advertiser 로그 === > next dev --turbopack  [
- 🔧 tool-failure: HTTP 200 | redirect: — Exit code 56 HTTP 200 | redirect:   === redirect chain === 0
- 🔧 tool-failure: <tool_use_error>Cancelled: parallel tool call Bash(# 로그인 안 된 상태에서 / 접속하면 어디로 가는지 — <tool_use_error>Cancelled: parallel tool call Bash(# 로그인 안 된

### Self-Evolution
At session start, review Active Rules and Provisional Rules above.
If a rule seems wrong or outdated:
```
hebbian rollback <neuron-path> --brain /Users/pppp/brain
```
If a provisional rule has been working well across sessions:
```
hebbian fire <neuron-path> --brain /Users/pppp/brain
```
Run silently. Trust your judgment — you are the evaluator.

<!-- HEBBIAN:END -->

# hebbian

Folder-as-neuron brain for any AI agent. TypeScript, zero runtime dependencies, Node 22+.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
