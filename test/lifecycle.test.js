import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain, neuron } from './fixtures/setup.js';
import { fireNeuron, getCurrentCounter } from '../lib/fire.js';
import { rollbackNeuron } from '../lib/rollback.js';
import { signalNeuron } from '../lib/signal.js';
import { growNeuron } from '../lib/grow.js';
import { runDecay } from '../lib/decay.js';

describe('fireNeuron', () => {
	it('increments counter from 40 to 41', () => {
		const { root } = setupTestBrain();
		const result = fireNeuron(root, 'cortex/frontend/禁console_log');
		assert.equal(result, 41);
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', '41.neuron')));
		assert.ok(!existsSync(join(root, 'cortex/frontend/禁console_log', '40.neuron')));
	});

	it('auto-grows if neuron does not exist', () => {
		const { root } = setupTestBrain();
		const result = fireNeuron(root, 'cortex/new_rule');
		assert.equal(result, 1);
		assert.ok(existsSync(join(root, 'cortex/new_rule', '1.neuron')));
	});
});

describe('rollbackNeuron', () => {
	it('decrements counter from 40 to 39', () => {
		const { root } = setupTestBrain();
		const result = rollbackNeuron(root, 'cortex/frontend/禁console_log');
		assert.equal(result, 39);
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', '39.neuron')));
	});

	it('throws at minimum counter (1)', () => {
		const root = mkdtempSync(join(tmpdir(), 'hebb-rb-'));
		neuron(root, 'cortex/test_rule', 1);
		assert.throws(() => rollbackNeuron(root, 'cortex/test_rule'), /minimum/i);
	});

	it('throws for nonexistent neuron', () => {
		const { root } = setupTestBrain();
		assert.throws(() => rollbackNeuron(root, 'cortex/nonexistent'), /not found/i);
	});
});

describe('signalNeuron', () => {
	it('creates bomb.neuron', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'bomb');
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'bomb.neuron')));
	});

	it('creates dopamineN.neuron', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'dopamine');
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'dopamine1.neuron')));
	});

	it('creates memoryN.neuron', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'memory');
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'memory1.neuron')));
	});

	it('increments signal level on repeated signals', () => {
		const { root } = setupTestBrain();
		signalNeuron(root, 'cortex/frontend/禁console_log', 'dopamine');
		signalNeuron(root, 'cortex/frontend/禁console_log', 'dopamine');
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'dopamine1.neuron')));
		assert.ok(existsSync(join(root, 'cortex/frontend/禁console_log', 'dopamine2.neuron')));
	});

	it('throws for invalid signal type', () => {
		const { root } = setupTestBrain();
		assert.throws(
			() => signalNeuron(root, 'cortex/frontend/禁console_log', 'invalid'),
			/invalid signal type/i,
		);
	});

	it('throws for nonexistent neuron', () => {
		const { root } = setupTestBrain();
		assert.throws(
			() => signalNeuron(root, 'cortex/nonexistent', 'dopamine'),
			/not found/i,
		);
	});
});

describe('growNeuron', () => {
	it('creates folder + 1.neuron', () => {
		const { root } = setupTestBrain();
		const result = growNeuron(root, 'cortex/backend/禁raw_sql');
		assert.equal(result.action, 'grew');
		assert.equal(result.counter, 1);
		assert.ok(existsSync(join(root, 'cortex/backend/禁raw_sql', '1.neuron')));
	});

	it('fires existing neuron if already exists', () => {
		const { root } = setupTestBrain();
		const result = growNeuron(root, 'cortex/frontend/禁console_log');
		assert.equal(result.action, 'fired');
		assert.equal(result.counter, 41);
	});

	it('consolidates similar neurons (Jaccard >= 0.6)', () => {
		const { root } = setupTestBrain();
		// "data_driven_approach" vs existing "data_driven" → jaccard=0.67
		const result = growNeuron(root, 'ego/tone/data_driven_approach');
		assert.equal(result.action, 'fired');
		assert.ok(result.path.includes('data_driven'));
	});

	it('throws for invalid region', () => {
		const { root } = setupTestBrain();
		assert.throws(() => growNeuron(root, 'invalid_region/test'), /invalid region/i);
	});
});

describe('runDecay', () => {
	it('marks old neurons as dormant', () => {
		const root = mkdtempSync(join(tmpdir(), 'hebb-decay-'));
		// Create neuron with old modification time (60 days ago)
		const neuronDir = join(root, 'cortex', 'old_rule');
		mkdirSync(neuronDir, { recursive: true });
		const neuronFile = join(neuronDir, '5.neuron');
		writeFileSync(neuronFile, '');
		const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		utimesSync(neuronFile, oldTime, oldTime);

		const { scanned, decayed } = runDecay(root, 30);
		assert.equal(scanned, 1);
		assert.equal(decayed, 1);
		assert.ok(existsSync(join(neuronDir, 'decay.dormant')));
	});

	it('skips already dormant neurons', () => {
		const root = mkdtempSync(join(tmpdir(), 'hebb-decay2-'));
		const neuronDir = join(root, 'cortex', 'old_rule');
		mkdirSync(neuronDir, { recursive: true });
		const neuronFile = join(neuronDir, '5.neuron');
		writeFileSync(neuronFile, '');
		writeFileSync(join(neuronDir, 'decay.dormant'), 'already dormant');
		const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		utimesSync(neuronFile, oldTime, oldTime);

		const { decayed } = runDecay(root, 30);
		assert.equal(decayed, 0);
	});

	it('keeps recently active neurons alive', () => {
		const { root } = setupTestBrain();
		// All neurons were just created (mtime = now)
		const { decayed } = runDecay(root, 30);
		assert.equal(decayed, 0);
	});
});
