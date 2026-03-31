// hebb — Governance Benchmark Tests
//
// Two axes:
//   SCC (Subsumption Cascade Correctness) — 20 scenarios
//   MLA (Memory Lifecycle Accuracy) — 15 scenarios
//
// Pass criteria: SCC >= 95%, MLA >= 90%

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain, neuron, plantBomb, removeBomb, markDormant, addDopamine } from './fixtures/setup.js';
import { scanBrain } from '../lib/scanner.js';
import { runSubsumption } from '../lib/subsumption.js';
import { fireNeuron } from '../lib/fire.js';
import { rollbackNeuron } from '../lib/rollback.js';
import { growNeuron } from '../lib/grow.js';
import { signalNeuron } from '../lib/signal.js';
import { runDecay } from '../lib/decay.js';
import { REGIONS } from '../lib/constants.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCC: Subsumption Cascade Correctness (20 scenarios)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('SCC: Subsumption Cascade Correctness', () => {
	// S-01: No bomb → all 7 active
	it('S-01: no bomb → all 7 regions active', () => {
		const { root } = setupTestBrain();
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.activeRegions.length, 7);
		assert.equal(result.bombSource, '');
	});

	// S-02 through S-08: bomb in each region
	for (let i = 0; i < REGIONS.length; i++) {
		const region = REGIONS[i];
		it(`S-0${i + 2}: bomb in ${region} → ${i} active regions`, () => {
			const { root } = setupTestBrain();
			// Plant bomb in a neuron in this region
			const brain = scanBrain(root);
			const r = brain.regions.find((r) => r.name === region);
			if (r.neurons.length > 0) {
				plantBomb(root, `${region}/${r.neurons[0].path}`);
			} else {
				plantBomb(root, `${region}/bomb_test`);
				neuron(root, `${region}/bomb_test`, 1);
			}
			const result = runSubsumption(scanBrain(root));
			assert.equal(result.bombSource, region);
			assert.equal(result.activeRegions.length, i);
		});
	}

	// S-09: bomb source identification
	it('S-09: bombSource correctly identifies the bombing region', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'hippocampus/error_patterns');
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.bombSource, 'hippocampus');
	});

	// S-10: P0 bomb → firedNeurons = 0
	it('S-10: P0 bomb → firedNeurons = 0', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'brainstem/禁fallback');
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.firedNeurons, 0);
	});

	// S-11: bomb removed → full recovery
	it('S-11: bomb removed → full recovery', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'cortex/frontend/禁console_log');
		let result = runSubsumption(scanBrain(root));
		assert.equal(result.bombSource, 'cortex');

		removeBomb(root, 'cortex/frontend/禁console_log');
		result = runSubsumption(scanBrain(root));
		assert.equal(result.bombSource, '');
		assert.equal(result.activeRegions.length, 7);
	});

	// S-12: dormant neurons excluded from firedNeurons
	it('S-12: dormant neurons excluded from fired count', () => {
		const { root } = setupTestBrain();
		markDormant(root, 'ego/tone/concise');
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.firedNeurons, 14);
	});

	// S-13: dormant does NOT affect totalNeurons
	it('S-13: dormant does not change totalNeurons', () => {
		const { root } = setupTestBrain();
		markDormant(root, 'ego/tone/concise');
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.totalNeurons, 15);
	});

	// S-14: empty brain → 0 active neurons, 7 active regions
	it('S-14: empty brain → 0 neurons, 7 regions', () => {
		const root = mkdtempSync(join(tmpdir(), 'hebb-scc14-'));
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.activeRegions.length, 7);
		assert.equal(result.firedNeurons, 0);
	});

	// S-15: lower P (brainstem) suppresses higher P (prefrontal)
	it('S-15: subsumption order is P0→P6', () => {
		const { root } = setupTestBrain();
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.activeRegions[0].name, 'brainstem');
		assert.equal(result.activeRegions[6].name, 'prefrontal');
	});

	// S-16: totalCounter sums only active non-dormant
	it('S-16: totalCounter sums active non-dormant only', () => {
		const { root } = setupTestBrain();
		markDormant(root, 'cortex/frontend/禁console_log'); // counter=40
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.totalCounter, 621 - 40);
	});

	// S-17: bomb in P2 → P0, P1 active
	it('S-17: bomb in hippocampus → brainstem + limbic active', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'hippocampus/error_patterns');
		const result = runSubsumption(scanBrain(root));
		const active = result.activeRegions.map((r) => r.name);
		assert.deepEqual(active, ['brainstem', 'limbic']);
	});
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MLA: Memory Lifecycle Accuracy (15 scenarios)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('MLA: Memory Lifecycle Accuracy', () => {
	// M-01: fire increments counter
	it('M-01: fire increments counter (40 → 41)', () => {
		const { root } = setupTestBrain();
		const result = fireNeuron(root, 'cortex/frontend/禁console_log');
		assert.equal(result, 41);
	});

	// M-02: rollback decrements counter
	it('M-02: rollback decrements counter (40 → 39)', () => {
		const { root } = setupTestBrain();
		const result = rollbackNeuron(root, 'cortex/frontend/禁console_log');
		assert.equal(result, 39);
	});

	// M-03: rollback minimum boundary (counter=1)
	it('M-03: rollback enforces minimum counter=1', () => {
		const root = mkdtempSync(join(tmpdir(), 'hebb-mla3-'));
		neuron(root, 'cortex/test', 1);
		assert.throws(() => rollbackNeuron(root, 'cortex/test'), /minimum/i);
	});

	// M-04: grow creates counter=1
	it('M-04: grow creates neuron with counter=1', () => {
		const { root } = setupTestBrain();
		const result = growNeuron(root, 'cortex/new_concept');
		assert.equal(result.counter, 1);
		assert.equal(result.action, 'grew');
	});

	// M-05: invalid region rejected
	it('M-05: invalid region rejected', () => {
		const { root } = setupTestBrain();
		assert.throws(() => growNeuron(root, 'invalid_region/test'), /invalid region/i);
	});

	// M-06: dopamine signal
	it('M-06: dopamine signal creates dopamine1.neuron', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'dopamine');
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'dopamine1.neuron')));
	});

	// M-07: bomb signal
	it('M-07: bomb signal creates bomb.neuron', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'bomb');
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'bomb.neuron')));
	});

	// M-08: memory signal
	it('M-08: memory signal creates memory1.neuron', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'memory');
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'memory1.neuron')));
	});

	// M-09: bomb triggers cascade
	it('M-09: bomb signal triggers subsumption cascade', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'bomb');
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.bombSource, 'cortex');
	});

	// M-10: unknown signal rejected
	it('M-10: unknown signal type rejected', () => {
		const { root } = setupTestBrain();
		assert.throws(
			() => signalNeuron(root, 'cortex/frontend/禁console_log', 'invalid'),
			/invalid signal/i,
		);
	});

	// M-11: dormant neuron excluded from firedNeurons
	it('M-11: dormant neuron excluded from fired count', () => {
		const { root } = setupTestBrain();
		markDormant(root, 'cortex/frontend/禁console_log');
		const result = runSubsumption(scanBrain(root));
		assert.equal(result.firedNeurons, 14);
	});

	// M-12: synaptic merge (Jaccard >= 0.6)
	it('M-12: similar neuron consolidated via Jaccard merge', () => {
		const { root } = setupTestBrain();
		const result = growNeuron(root, 'ego/tone/data_driven_approach');
		assert.equal(result.action, 'fired');
	});

	// M-13: deduplication no-crash (grow existing)
	it('M-13: growing existing neuron fires instead', () => {
		const { root } = setupTestBrain();
		const result = growNeuron(root, 'cortex/frontend/禁console_log');
		assert.equal(result.action, 'fired');
		assert.equal(result.counter, 41);
	});

	// M-14: decay marks dormant
	it('M-14: decay marks inactive neurons dormant', () => {
		const root = mkdtempSync(join(tmpdir(), 'hebb-mla14-'));
		const neuronDir = join(root, 'cortex', 'old_rule');
		mkdirSync(neuronDir, { recursive: true });
		const file = join(neuronDir, '5.neuron');
		writeFileSync(file, '');
		const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		utimesSync(file, oldTime, oldTime);

		const { decayed } = runDecay(root, 30);
		assert.equal(decayed, 1);
		assert.ok(existsSync(join(neuronDir, 'decay.dormant')));
	});

	// M-15: fire auto-grows nonexistent neuron
	it('M-15: fire auto-grows nonexistent neuron', () => {
		const { root } = setupTestBrain();
		const result = fireNeuron(root, 'cortex/brand_new_rule');
		assert.equal(result, 1);
		assert.ok(existsSync(join(root, 'cortex/brand_new_rule', '1.neuron')));
	});
});
