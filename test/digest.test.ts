import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain } from './fixtures/setup';
import { digestTranscript, extractCorrections, readHookInput } from '../src/digest';

function makeTempDir(): string {
	return mkdtempSync(join(tmpdir(), 'hebb-digest-'));
}

/** Create a minimal JSONL transcript with the given user messages. */
function writeTranscript(dir: string, messages: string[], sessionId = 'test-session'): string {
	const path = join(dir, `${sessionId}.jsonl`);
	const lines: string[] = [];

	// File history snapshot (first line in real transcripts)
	lines.push(JSON.stringify({ type: 'file-history-snapshot', messageId: 'init' }));

	for (const msg of messages) {
		lines.push(JSON.stringify({
			type: 'user',
			message: { role: 'user', content: msg },
			uuid: `msg-${Math.random().toString(36).slice(2)}`,
			sessionId,
		}));
		// Add a dummy assistant response between user messages
		lines.push(JSON.stringify({
			type: 'assistant',
			message: { role: 'assistant', content: 'OK, I will do that.' },
		}));
	}

	writeFileSync(path, lines.join('\n'), 'utf8');
	return path;
}

/** Create a transcript with content block array format. */
function writeTranscriptWithBlocks(dir: string, blocks: Array<{ type: string; text?: string }>[]): string {
	const path = join(dir, 'block-session.jsonl');
	const lines: string[] = [];

	for (const content of blocks) {
		lines.push(JSON.stringify({
			type: 'user',
			message: { role: 'user', content },
			uuid: `msg-${Math.random().toString(36).slice(2)}`,
		}));
	}

	writeFileSync(path, lines.join('\n'), 'utf8');
	return path;
}

describe('readHookInput', () => {
	it('parses valid hook input with transcript_path', () => {
		const input = JSON.stringify({
			transcript_path: '/path/to/transcript.jsonl',
			session_id: 'abc123',
			cwd: '/some/dir',
		});
		const result = readHookInput(input);
		expect(result).not.toBeNull();
		expect(result!.transcriptPath).toBe('/path/to/transcript.jsonl');
		expect(result!.sessionId).toBe('abc123');
	});

	it('returns null for empty stdin', () => {
		expect(readHookInput('')).toBeNull();
		expect(readHookInput('  ')).toBeNull();
	});

	it('returns null for invalid JSON', () => {
		expect(readHookInput('not json')).toBeNull();
	});

	it('returns null when transcript_path is missing', () => {
		const input = JSON.stringify({ session_id: 'abc', cwd: '/dir' });
		expect(readHookInput(input)).toBeNull();
	});

	it('derives session_id from transcript filename when not provided', () => {
		const input = JSON.stringify({ transcript_path: '/path/to/my-session.jsonl' });
		const result = readHookInput(input);
		expect(result!.sessionId).toBe('my-session');
	});
});

describe('extractCorrections', () => {
	it('detects "don\'t X" pattern', () => {
		const corrections = extractCorrections([
			"don't use console.log for debugging, use the logger utility",
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.prefix).toBe('NO');
		expect(corrections[0]!.path).toMatch(/^cortex\/NO_/);
	});

	it('detects "no, X" pattern', () => {
		const corrections = extractCorrections([
			'no, that approach is wrong, avoid using raw SQL queries directly',
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.prefix).toBe('NO');
	});

	it('detects "stop X" pattern', () => {
		const corrections = extractCorrections([
			'stop adding unnecessary comments to the code please',
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.prefix).toBe('NO');
	});

	it('detects "never X" pattern', () => {
		const corrections = extractCorrections([
			'never commit secrets or API keys to the repository',
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.prefix).toBe('NO');
	});

	it('detects "always X" affirmation pattern', () => {
		const corrections = extractCorrections([
			'always use TypeScript strict mode for new projects',
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.prefix).toBe('DO');
		expect(corrections[0]!.path).toMatch(/^cortex\/DO_/);
	});

	it('detects Korean negation patterns', () => {
		const corrections = extractCorrections([
			'console.log 쓰지마, logger를 사용해',
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.prefix).toBe('NO');
	});

	it('ignores non-correction messages', () => {
		const corrections = extractCorrections([
			'Can you help me write a function that calculates the factorial?',
			'I need to implement a login form for the dashboard',
			'Thanks, that looks great!',
		]);
		expect(corrections).toHaveLength(0);
	});

	it('ignores short messages (< 15 chars)', () => {
		const corrections = extractCorrections([
			"don't do it",   // 11 chars
			'no way',        // 6 chars
		]);
		expect(corrections).toHaveLength(0);
	});

	it('ignores questions (ending with ?)', () => {
		const corrections = extractCorrections([
			"why don't you use a different approach for this problem?",
		]);
		expect(corrections).toHaveLength(0);
	});

	it('ignores commands (starting with / or !)', () => {
		const corrections = extractCorrections([
			'/help me understand this codebase better please',
			'!git status showing don\'t know what happened',
		]);
		expect(corrections).toHaveLength(0);
	});

	it('caps at 10 corrections per session', () => {
		const messages = Array.from({ length: 20 }, (_, i) =>
			`don't use pattern number ${i} in the codebase anymore please`,
		);
		const corrections = extractCorrections(messages);
		expect(corrections).toHaveLength(10);
	});

	it('generates NO_ prefix for negation corrections', () => {
		const corrections = extractCorrections([
			"don't use console.log anywhere in the production code",
		]);
		expect(corrections[0]!.path).toMatch(/^cortex\/NO_/);
	});

	it('generates DO_ prefix for affirmation corrections', () => {
		const corrections = extractCorrections([
			'you must always validate user input before processing',
		]);
		expect(corrections[0]!.path).toMatch(/^cortex\/DO_/);
	});

	it('extracts meaningful keywords from correction text', () => {
		const corrections = extractCorrections([
			"don't use console.log for debugging in the application",
		]);
		expect(corrections[0]!.keywords.length).toBeGreaterThan(0);
		// Should not contain stop words
		expect(corrections[0]!.keywords).not.toContain('the');
		expect(corrections[0]!.keywords).not.toContain('for');
	});
});

describe('digestTranscript', () => {
	it('extracts corrections from a transcript', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscript(dir, [
			'Help me write a test for the user service',
			"don't use console.log for logging, use the structured logger",
			'That looks good, thanks!',
		]);

		const result = digestTranscript(root, transcript);
		expect(result.corrections).toBe(1);
	});

	it('handles transcript with no corrections', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscript(dir, [
			'Help me refactor this function',
			'Looks good, thanks!',
		]);

		const result = digestTranscript(root, transcript);
		expect(result.corrections).toBe(0);
	});

	it('handles content block array format', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscriptWithBlocks(dir, [
			[{ type: 'text', text: "don't use any for TypeScript types, use proper generics" }],
		]);

		const result = digestTranscript(root, transcript, 'block-test');
		expect(result.corrections).toBe(1);
	});

	it('throws when transcript file is missing', () => {
		const { root } = setupTestBrain();
		expect(() => digestTranscript(root, '/nonexistent/path.jsonl')).toThrow('Transcript not found');
	});

	it('writes audit log to hippocampus/digest_log/', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscript(dir, [
			"never commit passwords or API keys to the repository",
		], 'audit-test');

		digestTranscript(root, transcript, 'audit-test');

		const logPath = join(root, 'hippocampus', 'digest_log', 'audit-test.jsonl');
		expect(existsSync(logPath)).toBe(true);
		const content = readFileSync(logPath, 'utf8');
		expect(content).toContain('NO_');
	});

	it('skips already-digested sessions (dedup)', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscript(dir, [
			"don't use eval() in production code ever",
		], 'dedup-test');

		const first = digestTranscript(root, transcript, 'dedup-test');
		const second = digestTranscript(root, transcript, 'dedup-test');

		expect(first.corrections).toBe(1);
		expect(second.corrections).toBe(0); // skipped
	});

	it('creates neurons via growNeuron', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscript(dir, [
			"don't hardcode database connection strings anywhere",
		], 'grow-test');

		digestTranscript(root, transcript, 'grow-test');

		// Should have created a neuron under cortex/
		const logPath = join(root, 'hippocampus', 'digest_log', 'grow-test.jsonl');
		const log = readFileSync(logPath, 'utf8');
		const entry = JSON.parse(log.trim().split('\n')[0]!);
		expect(entry.path).toMatch(/^cortex\//);
		expect(entry.applied).toBe(true);
	});

	it('writes empty audit log when no corrections found', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscript(dir, [
			'Can you help me build a REST API?',
		], 'empty-test');

		digestTranscript(root, transcript, 'empty-test');

		const logPath = join(root, 'hippocampus', 'digest_log', 'empty-test.jsonl');
		expect(existsSync(logPath)).toBe(true); // dedup marker
	});
});
