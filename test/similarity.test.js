import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, stem, jaccardSimilarity } from '../lib/similarity.js';

describe('tokenize', () => {
	it('splits on underscores', () => {
		assert.deepEqual(tokenize('no_hardcoded_values'), ['no', 'hardcod', 'valu']);
	});

	it('splits camelCase', () => {
		assert.deepEqual(tokenize('noHardcodedValues'), ['no', 'hardcod', 'valu']);
	});

	it('drops single-char tokens', () => {
		const tokens = tokenize('a_big_test');
		assert.ok(!tokens.includes('a'));
	});

	it('lowercases everything', () => {
		const tokens = tokenize('HELLO_WORLD');
		assert.ok(tokens.every((t) => t === t.toLowerCase()));
	});

	it('handles hanja prefixes', () => {
		const tokens = tokenize('禁console_log');
		assert.ok(tokens.includes('禁console'));
	});
});

describe('stem', () => {
	it('removes -ing', () => {
		assert.equal(stem('running'), 'runn');
	});

	it('removes -tion', () => {
		assert.equal(stem('execution'), 'execu');
	});

	it('removes -ness', () => {
		assert.equal(stem('darkness'), 'dark');
	});

	it('preserves short words', () => {
		assert.equal(stem('go'), 'go');
		assert.equal(stem('do'), 'do');
	});

	it('preserves words where suffix removal would leave < 3 chars', () => {
		assert.equal(stem('sing'), 'sing');
	});
});

describe('jaccardSimilarity', () => {
	it('identical sets → 1.0', () => {
		assert.equal(jaccardSimilarity(['a', 'b'], ['a', 'b']), 1.0);
	});

	it('disjoint sets → 0.0', () => {
		assert.equal(jaccardSimilarity(['a', 'b'], ['c', 'd']), 0.0);
	});

	it('partial overlap', () => {
		// {a,b,c} ∩ {b,c,d} = {b,c} → 2/4 = 0.5
		assert.equal(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd']), 0.5);
	});

	it('both empty → 1.0', () => {
		assert.equal(jaccardSimilarity([], []), 1.0);
	});

	it('one empty → 0.0', () => {
		assert.equal(jaccardSimilarity(['a'], []), 0.0);
		assert.equal(jaccardSimilarity([], ['a']), 0.0);
	});

	it('high similarity detects similar neuron names', () => {
		const a = tokenize('data_driven_approach');
		const b = tokenize('data_driven');
		// "data","driv","approach" vs "data","driv" → 2/3 = 0.67
		assert.ok(jaccardSimilarity(a, b) >= 0.6);
	});

	it('low similarity for different concepts', () => {
		const a = tokenize('禁console_log');
		const b = tokenize('推plan_then_execute');
		assert.ok(jaccardSimilarity(a, b) < 0.3);
	});
});
