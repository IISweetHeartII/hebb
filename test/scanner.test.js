import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain, plantBomb, markDormant, addDopamine, addContra, addMemory } from './fixtures/setup.js';
import { scanBrain } from '../lib/scanner.js';
import { REGIONS } from '../lib/constants.js';

describe('scanBrain', () => {
	it('detects all 7 regions', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		assert.equal(brain.regions.length, 7);
		const names = brain.regions.map((r) => r.name);
		for (const region of REGIONS) {
			assert.ok(names.includes(region), `missing region: ${region}`);
		}
	});

	it('regions are sorted by priority P0→P6', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		for (let i = 0; i < brain.regions.length; i++) {
			assert.equal(brain.regions[i].priority, i);
		}
	});

	it('counts neurons per region', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const byName = Object.fromEntries(brain.regions.map((r) => [r.name, r]));

		assert.equal(byName.brainstem.neurons.length, 3);
		assert.equal(byName.limbic.neurons.length, 2);
		assert.equal(byName.hippocampus.neurons.length, 2);
		assert.equal(byName.sensors.neurons.length, 2);
		assert.equal(byName.cortex.neurons.length, 2);
		assert.equal(byName.ego.neurons.length, 2);
		assert.equal(byName.prefrontal.neurons.length, 2);
	});

	it('parses neuron counter from N.neuron filename', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r) => r.name === 'brainstem');
		const fallback = brainstem.neurons.find((n) => n.name === '禁fallback');
		assert.equal(fallback.counter, 103);
	});

	it('parses contra from N.contra filename', () => {
		const { root } = setupTestBrain();
		addContra(root, 'cortex/frontend/禁console_log', 5);
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r) => r.name === 'cortex');
		const n = cortex.neurons.find((n) => n.name === '禁console_log');
		assert.equal(n.contra, 5);
		assert.equal(n.intensity, 40 - 5 + 0);
	});

	it('parses dopamine from dopamineN.neuron', () => {
		const { root } = setupTestBrain();
		addDopamine(root, 'cortex/frontend/禁console_log', 3);
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r) => r.name === 'cortex');
		const n = cortex.neurons.find((n) => n.name === '禁console_log');
		assert.equal(n.dopamine, 3);
	});

	it('detects memory signal', () => {
		const { root } = setupTestBrain();
		addMemory(root, 'hippocampus/error_patterns', 2);
		const brain = scanBrain(root);
		const hippo = brain.regions.find((r) => r.name === 'hippocampus');
		const n = hippo.neurons.find((n) => n.name === 'error_patterns');
		assert.equal(n.hasMemory, true);
	});

	it('detects bomb.neuron', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'brainstem/禁fallback');
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r) => r.name === 'brainstem');
		assert.equal(brainstem.hasBomb, true);
		const n = brainstem.neurons.find((n) => n.name === '禁fallback');
		assert.equal(n.hasBomb, true);
	});

	it('detects dormant neurons', () => {
		const { root } = setupTestBrain();
		markDormant(root, 'cortex/frontend/禁console_log');
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r) => r.name === 'cortex');
		const n = cortex.neurons.find((n) => n.name === '禁console_log');
		assert.equal(n.isDormant, true);
	});

	it('computes polarity correctly', () => {
		const { root } = setupTestBrain();
		addContra(root, 'cortex/frontend/禁console_log', 10);
		addDopamine(root, 'cortex/frontend/禁console_log', 5);
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r) => r.name === 'cortex');
		const n = cortex.neurons.find((n) => n.name === '禁console_log');
		// counter=40, contra=10, dopamine=5 → intensity=35, total=55
		assert.equal(n.intensity, 35);
		assert.ok(n.polarity > 0.63 && n.polarity < 0.65);
	});

	it('reads .axon cross-region connections', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r) => r.name === 'brainstem');
		assert.ok(brainstem.axons.includes('limbic'));
		const limbic = brain.regions.find((r) => r.name === 'limbic');
		assert.ok(limbic.axons.includes('brainstem'));
	});

	it('handles empty brain gracefully', () => {
		const root = mkdtempSync(join(tmpdir(), 'hebb-empty-'));
		const brain = scanBrain(root);
		assert.equal(brain.regions.length, 7);
		for (const region of brain.regions) {
			assert.equal(region.neurons.length, 0);
		}
	});

	it('ignores directories starting with _ or .', () => {
		const { root } = setupTestBrain();
		mkdirSync(join(root, 'cortex', '_internal'), { recursive: true });
		writeFileSync(join(root, 'cortex', '_internal', '5.neuron'), '');
		mkdirSync(join(root, 'cortex', '.hidden'), { recursive: true });
		writeFileSync(join(root, 'cortex', '.hidden', '5.neuron'), '');

		const brain = scanBrain(root);
		const cortex = brain.regions.find((r) => r.name === 'cortex');
		const names = cortex.neurons.map((n) => n.name);
		assert.ok(!names.includes('_internal'));
		assert.ok(!names.includes('.hidden'));
	});

	it('ignores non-region top-level folders', () => {
		const { root } = setupTestBrain();
		mkdirSync(join(root, 'random_folder'), { recursive: true });
		writeFileSync(join(root, 'random_folder', '10.neuron'), '');

		const brain = scanBrain(root);
		assert.equal(brain.regions.length, 7);
		const names = brain.regions.map((r) => r.name);
		assert.ok(!names.includes('random_folder'));
	});

	it('tracks depth within region', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r) => r.name === 'cortex');
		const n = cortex.neurons.find((n) => n.name === '禁console_log');
		assert.equal(n.depth, 2);
		const m = cortex.neurons.find((n) => n.name === 'plan_then_execute');
		assert.equal(m.depth, 2);
	});
});
