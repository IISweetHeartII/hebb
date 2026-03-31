import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain, plantBomb } from './fixtures/setup.js';
import { scanBrain } from '../lib/scanner.js';
import { runSubsumption } from '../lib/subsumption.js';
import { emitBootstrap, emitIndex, emitRegionRules, emitToTarget } from '../lib/emit.js';
import { MARKER_START, MARKER_END, EMIT_TARGETS } from '../lib/constants.js';

describe('emitBootstrap (Tier 1)', () => {
	it('includes start/end markers', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		assert.ok(output.includes(MARKER_START));
		assert.ok(output.includes(MARKER_END));
	});

	it('includes persona section from ego region', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		assert.ok(output.includes('Persona'));
		assert.ok(output.includes('concise'));
	});

	it('includes TOP 5 brainstem rules', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		assert.ok(output.includes('Core Directives TOP 5'));
		assert.ok(output.includes('fallback'));
	});

	it('includes subsumption cascade diagram', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		assert.ok(output.includes('Subsumption Cascade'));
		assert.ok(output.includes('P0'));
		assert.ok(output.includes('P6'));
	});

	it('shows circuit breaker when bomb present', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'brainstem/禁fallback');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		assert.ok(output.includes('CIRCUIT BREAKER'));
		assert.ok(output.includes('brainstem'));
		assert.ok(output.includes('HALTED'));
	});

	it('includes active regions table', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitBootstrap(result, brain);

		assert.ok(output.includes('Active Regions'));
		assert.ok(output.includes('| Region |'));
	});
});

describe('emitIndex (Tier 2)', () => {
	it('includes top 10 neurons sorted by counter', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitIndex(result, brain);

		assert.ok(output.includes('Top 10'));
		// First entry should have highest counter (103)
		const lines = output.split('\n');
		const tableLines = lines.filter((l) => l.startsWith('| 1 |'));
		assert.ok(tableLines[0].includes('103'));
	});

	it('includes per-region summary with links', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		const output = emitIndex(result, brain);

		assert.ok(output.includes('_rules.md'));
		assert.ok(output.includes('brainstem'));
	});
});

describe('emitRegionRules (Tier 3)', () => {
	it('includes region header with icon and Korean name', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r) => r.name === 'cortex');
		const output = emitRegionRules(cortex);

		assert.ok(output.includes('cortex'));
		assert.ok(output.includes('지식/기술'));
	});

	it('includes strength prefixes', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r) => r.name === 'brainstem');
		const output = emitRegionRules(brainstem);

		// counter 103 → should have 절대 prefix
		assert.ok(output.includes('절대'));
	});

	it('shows axon connections', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r) => r.name === 'brainstem');
		const output = emitRegionRules(brainstem);

		assert.ok(output.includes('Connections'));
		assert.ok(output.includes('limbic'));
	});
});

describe('emitToTarget', () => {
	it('writes CLAUDE.md for claude target', () => {
		const { root } = setupTestBrain();
		const outDir = mkdtempSync(join(tmpdir(), 'hebb-emit-'));
		process.chdir(outDir);

		emitToTarget(root, 'claude');
		assert.ok(existsSync(join(outDir, 'CLAUDE.md')));

		const content = readFileSync(join(outDir, 'CLAUDE.md'), 'utf8');
		assert.ok(content.includes(MARKER_START));
	});

	it('writes all 5 target files for "all"', () => {
		const { root } = setupTestBrain();
		const outDir = mkdtempSync(join(tmpdir(), 'hebb-emit-all-'));
		process.chdir(outDir);

		emitToTarget(root, 'all');
		for (const filePath of Object.values(EMIT_TARGETS)) {
			assert.ok(existsSync(join(outDir, filePath)), `missing: ${filePath}`);
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

		assert.ok(updated.includes('My Project'));
		assert.ok(updated.includes('Some content before'));
		assert.ok(updated.includes('Some content after'));
		assert.ok(updated.includes(MARKER_START));
		assert.ok(!updated.includes('old rules'));
	});

	it('throws for unknown target', () => {
		const { root } = setupTestBrain();
		assert.throws(() => emitToTarget(root, 'unknown_target'), /unknown target/i);
	});

	it('writes _index.md and _rules.md into brain', () => {
		const { root } = setupTestBrain();
		const outDir = mkdtempSync(join(tmpdir(), 'hebb-tiers-'));
		process.chdir(outDir);

		emitToTarget(root, 'claude');
		assert.ok(existsSync(join(root, '_index.md')));
		assert.ok(existsSync(join(root, 'brainstem', '_rules.md')));
		assert.ok(existsSync(join(root, 'cortex', '_rules.md')));
	});
});
