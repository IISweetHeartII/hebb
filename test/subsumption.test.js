import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestBrain, plantBomb, removeBomb, markDormant } from './fixtures/setup.js';
import { scanBrain } from '../lib/scanner.js';
import { runSubsumption } from '../lib/subsumption.js';

describe('runSubsumption', () => {
	it('all regions active when no bomb', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.activeRegions.length, 7);
		assert.equal(result.blockedRegions.length, 0);
		assert.equal(result.bombSource, '');
	});

	it('P0 (brainstem) bomb blocks ALL regions', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'brainstem/禁fallback');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.bombSource, 'brainstem');
		assert.equal(result.activeRegions.length, 0);
		assert.equal(result.blockedRegions.length, 7);
	});

	it('P1 (limbic) bomb → only brainstem active', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'limbic/dopamine_reward');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.bombSource, 'limbic');
		assert.equal(result.activeRegions.length, 1);
		assert.equal(result.activeRegions[0].name, 'brainstem');
		assert.equal(result.blockedRegions.length, 6);
	});

	it('P3 (sensors) bomb → P0-P2 active, P3-P6 blocked', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'sensors/environment/macos');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.bombSource, 'sensors');
		assert.equal(result.activeRegions.length, 3);
		const activeNames = result.activeRegions.map((r) => r.name);
		assert.deepEqual(activeNames, ['brainstem', 'limbic', 'hippocampus']);
		assert.equal(result.blockedRegions.length, 4);
	});

	it('P4 (cortex) bomb → P0-P3 active', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'cortex/frontend/禁console_log');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.bombSource, 'cortex');
		assert.equal(result.activeRegions.length, 4);
		const activeNames = result.activeRegions.map((r) => r.name);
		assert.deepEqual(activeNames, ['brainstem', 'limbic', 'hippocampus', 'sensors']);
	});

	it('P5 (ego) bomb → P0-P4 active', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'ego/tone/concise');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.bombSource, 'ego');
		assert.equal(result.activeRegions.length, 5);
	});

	it('P6 (prefrontal) bomb → P0-P5 active', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'prefrontal/project/hebb_release');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.bombSource, 'prefrontal');
		assert.equal(result.activeRegions.length, 6);
	});

	it('counts firedNeurons (non-dormant only)', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		// 15 total neurons, all non-dormant
		assert.equal(result.firedNeurons, 15);
		assert.equal(result.totalNeurons, 15);
	});

	it('excludes dormant neurons from firedNeurons and totalCounter', () => {
		const { root } = setupTestBrain();
		markDormant(root, 'cortex/frontend/禁console_log');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		assert.equal(result.firedNeurons, 14); // 15 - 1 dormant
		assert.equal(result.totalNeurons, 15); // total count unchanged
	});

	it('sums totalCounter from active non-dormant neurons', () => {
		const { root } = setupTestBrain();
		const brain = scanBrain(root);
		const result = runSubsumption(brain);

		// Sum all counters: 103+100+100+50+30+20+15+10+5+40+25+60+45+10+8 = 621
		assert.equal(result.totalCounter, 621);
	});

	it('bomb removed → full recovery', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'brainstem/禁fallback');

		// Verify bomb blocks
		let brain = scanBrain(root);
		let result = runSubsumption(brain);
		assert.equal(result.bombSource, 'brainstem');
		assert.equal(result.activeRegions.length, 0);

		// Remove bomb
		removeBomb(root, 'brainstem/禁fallback');
		brain = scanBrain(root);
		result = runSubsumption(brain);
		assert.equal(result.bombSource, '');
		assert.equal(result.activeRegions.length, 7);
	});

	it('identifies correct bombSource', () => {
		const { root } = setupTestBrain();
		plantBomb(root, 'hippocampus/error_patterns');
		const brain = scanBrain(root);
		const result = runSubsumption(brain);
		assert.equal(result.bombSource, 'hippocampus');
	});
});
