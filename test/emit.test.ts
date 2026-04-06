import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain, plantBomb, neuron } from './fixtures/setup';
import { scanBrain } from '../src/scanner';
import { runSubsumption } from '../src/subsumption';
import { emitBootstrap, emitIndex, emitRegionRules, emitToTarget } from '../src/emit';
import { MARKER_START, MARKER_END, EMIT_TARGETS } from '../src/constants';

describe('emitBootstrap (Tier 1)', () => {
	it('includes start/end markers', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		expect(output).toContain(MARKER_START);
		expect(output).toContain(MARKER_END);
	});

	it('includes persona section from ego region', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		expect(output).toContain('Persona');
		expect(output).toContain('concise');
	});

	it('includes TOP 5 brainstem rules', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		expect(output).toContain('Core Directives TOP 5');
		expect(output).toContain('fallback');
	});

	it('includes subsumption cascade diagram', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		expect(output).toContain('Subsumption Cascade');
		expect(output).toContain('P0');
		expect(output).toContain('P6');
	});

	it('shows circuit breaker when bomb present', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'brainstem/禁fallback');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		expect(output).toContain('CIRCUIT BREAKER');
		expect(output).toContain('brainstem');
		expect(output).toContain('HALTED');
	});

	it('includes active regions table', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		expect(output).toContain('Active Regions');
		expect(output).toContain('| Region |');
	});
});

describe('emitIndex (Tier 2)', () => {
	it('includes top 10 neurons sorted by counter', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitIndex(result, brain);

		expect(output).toContain('Top 10');
		// First entry should have highest counter (103)
		const lines = output.split('\n');
		const tableLines = lines.filter((l: string) => l.startsWith('| 1 |'));
		expect(tableLines[0]).toContain('103');
	});

	it('includes per-region summary with links', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitIndex(result, brain);

		expect(output).toContain('_rules.md');
		expect(output).toContain('brainstem');
	});
});

describe('emitRegionRules (Tier 3)', () => {
	it('includes region header with icon and Korean name', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r: any) => r.name === 'cortex');
		const output = emitRegionRules(cortex);

		expect(output).toContain('cortex');
		expect(output).toContain('knowledge/skills');
	});

	it('includes strength prefixes', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r: any) => r.name === 'brainstem');
		const output = emitRegionRules(brainstem);

		// counter 103 → should have ABSOLUTE prefix
		expect(output).toContain('ABSOLUTE');
	});

	it('shows axon connections', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r: any) => r.name === 'brainstem');
		const output = emitRegionRules(brainstem);

		expect(output).toContain('Connections');
		expect(output).toContain('limbic');
	});

	it('shows metadata description when present', () => {
		const { root } = setupTestBrain();
		neuron(root, 'cortex/meta_test', 5, { description: 'do not use console.log for debugging' });
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r: any) => r.name === 'cortex');
		const output = emitRegionRules(cortex);

		expect(output).toContain('do not use console.log for debugging');
	});

	it('truncates long descriptions to 60 chars', () => {
		const { root } = setupTestBrain();
		const longDesc = 'A'.repeat(100);
		neuron(root, 'cortex/long_desc_test', 5, { description: longDesc });
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r: any) => r.name === 'cortex');
		const output = emitRegionRules(cortex);

		expect(output).toContain('A'.repeat(60));
		expect(output).not.toContain('A'.repeat(61));
	});
});

describe('emitToTarget', () => {
	it('writes CLAUDE.md for claude target', () => {
		const { root } = setupTestBrain();
		const outDir = mkdtempSync(join(tmpdir(), 'hebb-emit-'));
		process.chdir(outDir);

		emitToTarget(root, 'claude');
		expect(existsSync(join(outDir, 'CLAUDE.md'))).toBeTruthy();

		const content = readFileSync(join(outDir, 'CLAUDE.md'), 'utf8');
		expect(content).toContain(MARKER_START);
	});

	it('writes all 5 target files for "all"', () => {
		const { root } = setupTestBrain();
		const outDir = mkdtempSync(join(tmpdir(), 'hebb-emit-all-'));
		process.chdir(outDir);

		emitToTarget(root, 'all');
		for (const filePath of Object.values(EMIT_TARGETS)) {
			expect(existsSync(join(outDir, filePath as string))).toBeTruthy();
		}
	});

	it('preserves surrounding content with marker injection', () => {
		const { root } = setupTestBrain();
		const outDir = mkdtempSync(join(tmpdir(), 'hebb-inject-'));
		process.chdir(outDir);

		// Write existing file with markers
		const existing = `# My Project\n\nSome content before.\n\n${MARKER_START}\nold rules\n${MARKER_END}\n\nSome content after.\n`;
		writeFileSync(join(outDir, 'CLAUDE.md'), existing, 'utf8');

		emitToTarget(root, 'claude');
		const updated = readFileSync(join(outDir, 'CLAUDE.md'), 'utf8');

		expect(updated).toContain('My Project');
		expect(updated).toContain('Some content before');
		expect(updated).toContain('Some content after');
		expect(updated).toContain(MARKER_START);
		expect(updated).not.toContain('old rules');
	});

	it('throws for unknown target', () => {
		const { root } = setupTestBrain();
		expect(() => emitToTarget(root, 'unknown_target')).toThrow(/unknown target/i);
	});

	it('writes _index.md and _rules.md into brain', () => {
		const { root } = setupTestBrain();
		const outDir = mkdtempSync(join(tmpdir(), 'hebb-tiers-'));
		process.chdir(outDir);

		emitToTarget(root, 'claude');
		expect(existsSync(join(root, '_index.md'))).toBeTruthy();
		expect(existsSync(join(root, 'brainstem', '_rules.md'))).toBeTruthy();
		expect(existsSync(join(root, 'cortex', '_rules.md'))).toBeTruthy();
	});
});
