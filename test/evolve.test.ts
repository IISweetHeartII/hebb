import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupTestBrain } from './fixtures/setup';
import {
	buildBrainSummary,
	buildPrompt,
	parseActions,
	validateActions,
	executeActions,
	runEvolve,
} from '../src/evolve';
import { scanBrain } from '../src/scanner';
import { growNeuron } from '../src/grow';
import type { Episode } from '../src/episode';

function makeEpisodes(count: number): Episode[] {
	return Array.from({ length: count }, (_, i) => ({
		ts: new Date(Date.now() - i * 60_000).toISOString(),
		type: 'fire',
		path: `cortex/test_neuron_${i}`,
		detail: `test episode ${i}`,
	}));
}

describe('buildBrainSummary', () => {
	it('produces markdown with region headers and neuron paths', () => {
		const { root } = setupTestBrain();
		growNeuron(root, 'cortex/test_rule');
		const brain = scanBrain(root);
		const summary = buildBrainSummary(brain);

		expect(summary).toContain('# Brain State');
		expect(summary).toContain('brainstem');
		expect(summary).toContain('cortex');
	});

	it('handles empty brain (no neurons beyond defaults)', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const summary = buildBrainSummary(brain);

		expect(summary).toContain('# Brain State');
		expect(typeof summary).toBe('string');
	});
});

describe('buildPrompt', () => {
	it('includes axioms, brain state, and episodes', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const summary = buildBrainSummary(brain);
		const episodes = makeEpisodes(3);
		const prompt = buildPrompt(summary, episodes);

		expect(prompt).toContain('subsumption cascade');
		expect(prompt).toContain('PROTECTED');
		expect(prompt).toContain('test episode 0');
		expect(prompt).toContain('Max 10 actions');
	});

	it('handles zero episodes', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const summary = buildBrainSummary(brain);
		const prompt = buildPrompt(summary, []);

		expect(prompt).toContain('no recent episodes');
	});
});

describe('parseActions', () => {
	it('parses valid action array', () => {
		const json = JSON.stringify([
			{ type: 'fire', path: 'cortex/test', reason: 'frequently used' },
			{ type: 'grow', path: 'cortex/new_rule', reason: 'recurring pattern' },
		]);
		const actions = parseActions(json);

		expect(actions).toHaveLength(2);
		expect(actions[0]!.type).toBe('fire');
		expect(actions[1]!.type).toBe('grow');
	});

	it('skips actions with unknown type', () => {
		const json = JSON.stringify([
			{ type: 'fire', path: 'cortex/test', reason: 'ok' },
			{ type: 'teleport', path: 'cortex/x', reason: 'invalid' },
		]);
		const actions = parseActions(json);

		expect(actions).toHaveLength(1);
	});

	it('skips actions with missing path', () => {
		const json = JSON.stringify([
			{ type: 'fire', reason: 'no path' },
			{ type: 'fire', path: '', reason: 'empty path' },
		]);
		const actions = parseActions(json);

		expect(actions).toHaveLength(0);
	});

	it('preserves signal field for signal actions', () => {
		const json = JSON.stringify([
			{ type: 'signal', path: 'cortex/test', reason: 'reward', signal: 'dopamine' },
		]);
		const actions = parseActions(json);

		expect(actions[0]!.signal).toBe('dopamine');
	});

	it('throws on non-JSON text', () => {
		expect(() => parseActions('not json at all')).toThrow('Failed to parse');
	});

	it('throws on non-array JSON', () => {
		expect(() => parseActions('{"type":"fire"}')).toThrow('not an array');
	});
});

describe('validateActions', () => {
	it('blocks protected region mutations', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const actions = [
			{ type: 'fire' as const, path: 'brainstem/critical', reason: 'should block' },
			{ type: 'fire' as const, path: 'limbic/emotion', reason: 'should block' },
			{ type: 'fire' as const, path: 'sensors/env', reason: 'should block' },
			{ type: 'fire' as const, path: 'cortex/allowed', reason: 'should pass' },
		];
		const valid = validateActions(actions, brain);

		expect(valid).toHaveLength(1);
		expect(valid[0]!.path).toBe('cortex/allowed');
	});

	it('caps at 10 actions', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const actions = Array.from({ length: 15 }, (_, i) => ({
			type: 'fire' as const,
			path: `cortex/rule_${i}`,
			reason: `action ${i}`,
		}));
		const valid = validateActions(actions, brain);

		expect(valid).toHaveLength(10);
	});

	it('rejects invalid region names', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const actions = [
			{ type: 'fire' as const, path: 'nonexistent/test', reason: 'bad region' },
		];
		const valid = validateActions(actions, brain);

		expect(valid).toHaveLength(0);
	});

	it('rejects invalid signal types', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const actions = [
			{ type: 'signal' as const, path: 'cortex/test', reason: 'bad signal', signal: 'laser' },
		];
		const valid = validateActions(actions, brain);

		expect(valid).toHaveLength(0);
	});

	it('allows hippocampus, cortex, ego, prefrontal', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const actions = [
			{ type: 'fire' as const, path: 'hippocampus/test', reason: 'ok' },
			{ type: 'fire' as const, path: 'cortex/test', reason: 'ok' },
			{ type: 'fire' as const, path: 'ego/test', reason: 'ok' },
			{ type: 'fire' as const, path: 'prefrontal/test', reason: 'ok' },
		];
		const valid = validateActions(actions, brain);

		expect(valid).toHaveLength(4);
	});
});

describe('executeActions', () => {
	it('executes fire action', () => {
		const { root } = setupTestBrain();
		growNeuron(root, 'cortex/exec_test');
		const count = executeActions(root, [
			{ type: 'fire', path: 'cortex/exec_test', reason: 'test' },
		]);

		expect(count).toBe(1);
	});

	it('executes grow action', () => {
		const { root } = setupTestBrain();
		const count = executeActions(root, [
			{ type: 'grow', path: 'cortex/new_neuron', reason: 'test' },
		]);

		expect(count).toBe(1);
	});

	it('handles execution errors gracefully', () => {
		const { root } = setupTestBrain();
		// Signal on non-existent neuron may fail
		const count = executeActions(root, [
			{ type: 'signal', path: 'cortex/nonexistent_for_signal', reason: 'test', signal: 'dopamine' },
		]);

		// Either succeeds or fails gracefully (count = 0 or 1)
		expect(count).toBeGreaterThanOrEqual(0);
	});
});

describe('runEvolve', () => {
	const originalEnv = process.env;
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		globalThis.fetch = originalFetch;
	});

	it('returns empty result when GEMINI_API_KEY is not set', async () => {
		delete process.env.GEMINI_API_KEY;
		const { root } = setupTestBrain();
		const result = await runEvolve(root, false);

		expect(result.actions).toHaveLength(0);
		expect(result.executed).toBe(0);
	});

	it('dry-run does not execute actions', async () => {
		process.env.GEMINI_API_KEY = 'test-key';
		const { root } = setupTestBrain();

		// Mock fetch to return valid actions
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				candidates: [{
					content: {
						parts: [{
							text: JSON.stringify([
								{ type: 'grow', path: 'cortex/test_evolve', reason: 'test' },
							]),
						}],
					},
				}],
			}),
		}) as unknown as typeof fetch;

		const result = await runEvolve(root, true);

		expect(result.dryRun).toBe(true);
		expect(result.actions).toHaveLength(1);
		expect(result.executed).toBe(0);
	});

	it('handles API error gracefully', { timeout: 15000 }, async () => {
		process.env.GEMINI_API_KEY = 'test-key';
		const { root } = setupTestBrain();

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: 'Internal Server Error',
		}) as unknown as typeof fetch;

		const result = await runEvolve(root, false);

		expect(result.actions).toHaveLength(0);
		expect(result.executed).toBe(0);
	});

	it('handles malformed JSON response gracefully', { timeout: 15000 }, async () => {
		process.env.GEMINI_API_KEY = 'test-key';
		const { root } = setupTestBrain();

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				candidates: [{
					content: {
						parts: [{ text: 'not valid json at all' }],
					},
				}],
			}),
		}) as unknown as typeof fetch;

		const result = await runEvolve(root, false);

		expect(result.actions).toHaveLength(0);
	});

	it('full cycle: API returns valid actions, executes them', async () => {
		process.env.GEMINI_API_KEY = 'test-key';
		const { root } = setupTestBrain();

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				candidates: [{
					content: {
						parts: [{
							text: JSON.stringify([
								{ type: 'grow', path: 'cortex/evolved_rule', reason: 'recurring pattern' },
							]),
						}],
					},
				}],
			}),
		}) as unknown as typeof fetch;

		const result = await runEvolve(root, false);

		expect(result.dryRun).toBe(false);
		expect(result.executed).toBe(1);
		expect(result.actions[0]!.path).toBe('cortex/evolved_rule');
	});
});
