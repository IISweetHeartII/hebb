import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain } from './fixtures/setup';
import { learn } from '../src/learn';

function makeTempDir(): string {
	return mkdtempSync(join(tmpdir(), 'hebb-learn-'));
}

describe('learn', () => {
	describe('agent-classified mode (--prefix + --keywords)', () => {
		it('creates candidate with agent-provided classification', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: 'やめてください、console.logを使わないで',
				prefix: 'NO',
				keywords: ['console', 'log', 'debug'],
			});
			expect(result).not.toBeNull();
			expect(result!.path).toBe('cortex/NO_console_log_debug');
			expect(result!.prefix).toBe('NO');
			expect(result!.source).toBe('agent');

			// Verify candidate was created
			const candDir = join(root, 'cortex', '_candidates', 'NO_console_log_debug');
			expect(existsSync(candDir)).toBe(true);
		});

		it('handles all prefix types', () => {
			const { root } = setupTestBrain();
			for (const prefix of ['NO', 'DO', 'MUST', 'WARN']) {
				const result = learn(root, {
					text: `test ${prefix}`,
					prefix,
					keywords: ['test', 'keyword', prefix.toLowerCase()],
				});
				expect(result).not.toBeNull();
				expect(result!.prefix).toBe(prefix);
			}
		});

		it('normalizes invalid prefix to DO', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: 'do something',
				prefix: 'INVALID',
				keywords: ['something', 'here', 'now'],
			});
			expect(result).not.toBeNull();
			expect(result!.prefix).toBe('DO');
		});

		it('limits keywords to 3', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: 'test',
				prefix: 'NO',
				keywords: ['a', 'b', 'c', 'd', 'e'],
			});
			expect(result).not.toBeNull();
			expect(result!.keywords).toHaveLength(3);
		});

		it('works with any language keywords', () => {
			const { root } = setupTestBrain();

			// Japanese
			const jp = learn(root, {
				text: 'console.logはやめて',
				prefix: 'NO',
				keywords: ['console', 'log', 'デバッグ'],
			});
			expect(jp).not.toBeNull();
			expect(jp!.path).toBe('cortex/NO_console_log_デバッグ');

			// Chinese
			const zh = learn(root, {
				text: '不要用console.log',
				prefix: 'NO',
				keywords: ['console', 'log', '调试'],
			});
			expect(zh).not.toBeNull();
			expect(zh!.path).toBe('cortex/NO_console_log_调试');
		});

		it('preserves Cyrillic/Arabic/Devanagari keywords', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: 'не используй console.log',
				prefix: 'NO',
				keywords: ['не', 'используй', 'логи'],
			});
			expect(result).not.toBeNull();
			expect(result!.path).toBe('cortex/NO_не_используй_логи');
		});

		it('returns null when keywords are empty', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: 'test',
				prefix: 'NO',
				keywords: [],
			});
			expect(result).toBeNull();
		});
	});

	describe('regex fallback mode (no --prefix/--keywords)', () => {
		it('falls back to regex extraction for English', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: "don't use console.log for debugging in production",
			});
			expect(result).not.toBeNull();
			expect(result!.prefix).toBe('NO');
			expect(result!.source).toBe('regex');
		});

		it('returns null for non-correction text', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: 'Can you help me write a function?',
			});
			expect(result).toBeNull();
		});
	});

	describe('metadata', () => {
		it('writes metadata to candidate .neuron file', () => {
			const { root } = setupTestBrain();
			const result = learn(root, {
				text: 'stop using console.log for debugging',
				prefix: 'NO',
				keywords: ['console', 'log', 'debug'],
			});
			expect(result).not.toBeNull();

			const neuronFile = join(root, 'cortex', '_candidates', 'NO_console_log_debug', '1.neuron');
			expect(existsSync(neuronFile)).toBe(true);
			const content = readFileSync(neuronFile, 'utf8');
			const meta = JSON.parse(content);
			expect(meta.keywords).toEqual(['console', 'log', 'debug']);
			expect(meta.source).toBe('agent');
			expect(meta.description).toBe('stop using console.log for debugging');
			expect(meta.created).toBeDefined();
		});
	});

	describe('episode logging', () => {
		it('logs a learn episode', () => {
			const { root } = setupTestBrain();
			learn(root, {
				text: 'never commit API keys',
				prefix: 'NO',
				keywords: ['commit', 'api', 'keys'],
			});

			// Check episode was logged
			const episodes = readdirSync(join(root, 'hippocampus', 'session_log'));
			const hasLearn = episodes.some((f) => {
				if (!f.endsWith('.neuron')) return false;
				const { readFileSync } = require('node:fs') as typeof import('node:fs');
				const content = readFileSync(join(root, 'hippocampus', 'session_log', f), 'utf8');
				try { return JSON.parse(content).type === 'learn'; } catch { return false; }
			});
			expect(hasLearn).toBe(true);
		});
	});
});
