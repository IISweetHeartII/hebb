import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setupTestBrain, neuron } from './fixtures/setup';
import { readConfig, writeConfig, readFireCount, incrementFireCount, resetFireCount, checkAutoEvolve } from '../src/config';
import { scanBrain } from '../src/scanner';
import { fireNeuron } from '../src/fire';

function tmpBrain(): string {
	return setupTestBrain().root;
}

describe('readConfig', () => {
	it('returns defaults when no config file exists', () => {
		const root = tmpBrain();
		const config = readConfig(root);
		expect(config.autoEvolveThreshold).toBe(0);
	});

	it('reads written config', () => {
		const root = tmpBrain();
		writeFileSync(join(root, '.config.json'), JSON.stringify({ autoEvolveThreshold: 25 }), 'utf8');
		const config = readConfig(root);
		expect(config.autoEvolveThreshold).toBe(25);
	});

	it('merges with defaults for missing fields', () => {
		const root = tmpBrain();
		writeFileSync(join(root, '.config.json'), '{}', 'utf8');
		const config = readConfig(root);
		expect(config.autoEvolveThreshold).toBe(0);
	});
});

describe('writeConfig', () => {
	it('creates .config.json', () => {
		const root = tmpBrain();
		writeConfig(root, { autoEvolveThreshold: 10 });
		expect(existsSync(join(root, '.config.json'))).toBe(true);
		const raw = readFileSync(join(root, '.config.json'), 'utf8');
		const parsed = JSON.parse(raw);
		expect(parsed.autoEvolveThreshold).toBe(10);
	});

	it('merges partial updates', () => {
		const root = tmpBrain();
		writeConfig(root, { autoEvolveThreshold: 5 });
		writeConfig(root, { autoEvolveThreshold: 15 });
		const config = readConfig(root);
		expect(config.autoEvolveThreshold).toBe(15);
	});
});

describe('fire counter', () => {
	it('readFireCount returns 0 when no file', () => {
		const root = tmpBrain();
		expect(readFireCount(root)).toBe(0);
	});

	it('incrementFireCount creates and increments', () => {
		const root = tmpBrain();
		expect(incrementFireCount(root)).toBe(1);
		expect(incrementFireCount(root)).toBe(2);
		expect(incrementFireCount(root)).toBe(3);
		expect(readFireCount(root)).toBe(3);
	});

	it('resetFireCount sets to 0', () => {
		const root = tmpBrain();
		incrementFireCount(root);
		incrementFireCount(root);
		resetFireCount(root);
		expect(readFireCount(root)).toBe(0);
	});
});

describe('checkAutoEvolve', () => {
	it('does nothing when threshold is 0', () => {
		const root = tmpBrain();
		checkAutoEvolve(root);
		// fire count should still increment
		expect(readFireCount(root)).toBe(0);
	});

	it('does nothing when count < threshold', () => {
		const root = tmpBrain();
		writeConfig(root, { autoEvolveThreshold: 5 });
		checkAutoEvolve(root);
		checkAutoEvolve(root);
		expect(readFireCount(root)).toBe(2);
	});

	it('resets counter when threshold reached', () => {
		const root = tmpBrain();
		writeConfig(root, { autoEvolveThreshold: 3 });
		checkAutoEvolve(root);
		checkAutoEvolve(root);
		checkAutoEvolve(root); // hits 3 — should reset
		expect(readFireCount(root)).toBe(0);
	});
});

describe('neuron metadata', () => {
	it('scanner reads metadata from .neuron file content', () => {
		const root = tmpBrain();
		const meta = { keywords: ['test'], source: 'agent', description: 'test neuron' };
		neuron(root, 'cortex/test_neuron', 1, meta);
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r: any) => r.name === 'cortex');
		const n = cortex!.neurons.find((n: any) => n.name === 'test_neuron');
		expect(n!.meta).toEqual(meta);
	});

	it('scanner returns meta: null for empty .neuron files', () => {
		const root = tmpBrain();
		const brain = scanBrain(root);
		const brainstem = brain.regions.find((r: any) => r.name === 'brainstem');
		const n = brainstem!.neurons[0];
		expect(n!.meta).toBeNull();
	});

	it('scanner handles malformed JSON gracefully', () => {
		const root = tmpBrain();
		neuron(root, 'cortex/bad_json', 1);
		writeFileSync(join(root, 'cortex/bad_json/1.neuron'), 'not json{{{', 'utf8');
		const brain = scanBrain(root);
		const cortex = brain.regions.find((r: any) => r.name === 'cortex');
		const n = cortex!.neurons.find((n: any) => n.name === 'bad_json');
		expect(n!.meta).toBeNull();
	});

	it('fireNeuron preserves metadata on rename', () => {
		const root = tmpBrain();
		const meta = { keywords: ['fire', 'test'], source: 'manual' };
		neuron(root, 'cortex/fire_meta_test', 1, meta);

		fireNeuron(root, 'cortex/fire_meta_test');

		// After fire: 1.neuron → 2.neuron, content should be preserved
		const content = readFileSync(join(root, 'cortex/fire_meta_test/2.neuron'), 'utf8');
		expect(JSON.parse(content)).toEqual(meta);
	});
});
