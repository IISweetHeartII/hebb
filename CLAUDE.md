<!-- HEBBIAN:START -->
<!-- Generated: 2026-04-01T01:21:23 -->
<!-- Axiom: Folder=Neuron | File=Trace | Path=Sentence -->
<!-- Active: 9/9 neurons | Total activation: 8 -->

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
| 🧠 cortex | 6 | 6 |
| 🎭 ego | 0 | 0 |
| 🎯 prefrontal | 0 | 0 |

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
