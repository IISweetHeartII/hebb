import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestBrain } from './fixtures/setup';
import { digestTranscript, extractCorrections, readHookInput, parseToolResults, detectToolFailure, detectSoftFailure, detectRetryPatterns } from '../src/digest';
import type { ToolFailure } from '../src/digest';

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

	it('detects "should always" affirmation pattern', () => {
		const corrections = extractCorrections([
			'you should always use TypeScript strict mode for new projects',
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

	it('ignores questions (ending with ?! or ..?!)', () => {
		const corrections = extractCorrections([
			'이게 뭐에요?!',
			'캐시는 두자.. 대신 배치만 다 없애버리자..?!',
			'어떻게 생각해..?!',
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

	it('ignores Korean narrative/explanatory messages', () => {
		const corrections = extractCorrections([
			// Long explanation with narrative markers — NOT a correction
			'이제 다른 문제를 해야할 거 같은데,,, 이유는 내가 지금 서버를 띄워두고, 그래서 팀원들이 접속하는 중인데, 거든 좀 불편하다고 하시네',
			// Story with multiple narrative markers
			'예를 들면 서버를 끄고 다시 켜고 하는 걸 스킬로 만들었어.. 그런데 좀비 프로세스가 남아있었던거야?! 왜냐하면 깔끔하게 안 지워져서',
		]);
		expect(corrections).toHaveLength(0);
	});

	it('ignores messages with XML system tags', () => {
		const corrections = extractCorrections([
			'<local-command-caveat>DO NOT respond to these messages</local-command-caveat>',
			'<command-message>ship</command-message>\n<command-name>/ship</command-name>\n<command-args>do not push</command-args>',
		]);
		expect(corrections).toHaveLength(0);
	});

	it('detects genuine Korean correction (short directive)', () => {
		const corrections = extractCorrections([
			'이거 푸시는 하면 안돼! 수정만 해!',
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.prefix).toBe('NO');
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

	it('generates MUST_ prefix for "must" corrections (priority over DO)', () => {
		const corrections = extractCorrections([
			'you must always validate user input before processing',
		]);
		expect(corrections[0]!.prefix).toBe('MUST');
		expect(corrections[0]!.path).toMatch(/^cortex\/MUST_/);
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

	// --- REGRESSION TESTS (Phase 4.0) ---

	it('REGRESSION: "don\'t use console.log" produces clean name', () => {
		const corrections = extractCorrections([
			"don't use console.log for debugging, always use the structured logger utility instead",
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.path).toBe('cortex/NO_console_log_debugging');
	});

	it('REGRESSION: "never commit API keys" produces clean name', () => {
		const corrections = extractCorrections([
			'never commit API keys or secrets to the repository',
		]);
		expect(corrections).toHaveLength(1);
		expect(corrections[0]!.path).toBe('cortex/NO_commit_api_keys');
	});

	// --- PUNCTUATION STRIPPING ---

	it('strips periods from keywords (console.log → console, log)', () => {
		const corrections = extractCorrections([
			"don't use console.log anywhere in production",
		]);
		expect(corrections[0]!.keywords).toContain('console');
		expect(corrections[0]!.keywords).toContain('log');
		expect(corrections[0]!.keywords).not.toContain('console.log');
	});

	it('strips commas from keywords', () => {
		const corrections = extractCorrections([
			"don't use var, let, or eval in the codebase",
		]);
		// "var" is 3 chars, passes length filter
		expect(corrections[0]!.keywords).toContain('var');
		expect(corrections[0]!.keywords).not.toContain('var,');
	});

	it('strips apostrophes — "don\'t" splits into "don" (stop word) and "t" (too short)', () => {
		const corrections = extractCorrections([
			"don't hardcode database connection strings",
		]);
		expect(corrections[0]!.keywords).not.toContain("don't");
		expect(corrections[0]!.keywords).not.toContain('don');
	});

	// --- STOP WORD FILTERING ---

	it('filters correction-specific stop words (never, always, instead, use)', () => {
		const corrections = extractCorrections([
			'never use eval instead of JSON.parse for untrusted data',
		]);
		expect(corrections[0]!.keywords).not.toContain('never');
		expect(corrections[0]!.keywords).not.toContain('use');
		expect(corrections[0]!.keywords).not.toContain('instead');
	});

	// --- TOKEN LIMIT ---

	it('limits to max 3 keyword tokens in path', () => {
		const corrections = extractCorrections([
			"don't use synchronous filesystem operations blocking event loop performance",
		]);
		const pathParts = corrections[0]!.path.replace('cortex/NO_', '').split('_');
		expect(pathParts.length).toBeLessThanOrEqual(3);
	});

	// --- MUST_ PREFIX ---

	it('detects MUST_ for "must" keyword', () => {
		const corrections = extractCorrections([
			'you must validate user input before database queries',
		]);
		expect(corrections[0]!.prefix).toBe('MUST');
		expect(corrections[0]!.path).toMatch(/^cortex\/MUST_/);
	});

	it('detects MUST_ for "required" keyword', () => {
		const corrections = extractCorrections([
			'error handling is required for all async operations',
		]);
		expect(corrections[0]!.prefix).toBe('MUST');
	});

	it('detects MUST_ for Korean 반드시', () => {
		const corrections = extractCorrections([
			'반드시 타입 검사를 해야 합니다',
		]);
		expect(corrections[0]!.prefix).toBe('MUST');
	});

	// --- WARN_ PREFIX ---

	it('detects WARN_ for "careful" keyword', () => {
		const corrections = extractCorrections([
			'be careful with database connection pooling limits',
		]);
		expect(corrections[0]!.prefix).toBe('WARN');
		expect(corrections[0]!.path).toMatch(/^cortex\/WARN_/);
	});

	it('detects WARN_ for "watch out" keyword', () => {
		const corrections = extractCorrections([
			'watch out for race conditions in concurrent handlers',
		]);
		expect(corrections[0]!.prefix).toBe('WARN');
	});

	it('detects WARN_ for Korean 주의', () => {
		const corrections = extractCorrections([
			'주의: 이 API는 rate limiting이 있습니다',
		]);
		expect(corrections[0]!.prefix).toBe('WARN');
	});

	// --- PRIORITY ---

	it('NO takes priority over MUST (negation wins)', () => {
		const corrections = extractCorrections([
			"don't ignore required validation checks ever",
		]);
		expect(corrections[0]!.prefix).toBe('NO');
	});

	it('MUST takes priority over WARN', () => {
		const corrections = extractCorrections([
			'you must be careful with authentication tokens always',
		]);
		expect(corrections[0]!.prefix).toBe('MUST');
	});

	// --- NO STEMMING ---

	it('does not stem keywords (readable names)', () => {
		const corrections = extractCorrections([
			"don't use debugging statements in production code",
		]);
		expect(corrections[0]!.keywords).toContain('debugging');
		expect(corrections[0]!.keywords).not.toContain('debugg');
		expect(corrections[0]!.keywords).toContain('production');
		expect(corrections[0]!.keywords).not.toContain('produc');
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
		const logLines = log.trim().split('\n');
		// First line is _meta, correction entries follow
		const meta = JSON.parse(logLines[0]!);
		expect(meta._meta).toBe(true);
		const entry = JSON.parse(logLines[1]!);
		expect(entry.path).toMatch(/^cortex\//);
		expect(entry.applied).toBe(true);
	});

	it('writes audit log with _meta even when no corrections found', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeTranscript(dir, [
			'Can you help me build a REST API?',
		], 'empty-test');

		digestTranscript(root, transcript, 'empty-test');

		const logPath = join(root, 'hippocampus', 'digest_log', 'empty-test.jsonl');
		expect(existsSync(logPath)).toBe(true);
		const meta = JSON.parse(readFileSync(logPath, 'utf8').split('\n')[0]!);
		expect(meta._meta).toBe(true);
		expect(typeof meta.lineCount).toBe('number');
	});

	it('detects tool failures from is_error tool_result blocks', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeToolFailureTranscript(dir, [
			{ exitCode: 1, error: 'npm test failed\nError: test suite broken' },
			{ exitCode: 127, error: 'command not found: foo' },
		], 'tool-fail-test');

		const result = digestTranscript(root, transcript, 'tool-fail-test');
		expect(result.toolFailures).toBe(2);
	});

	it('logs tool failures as episodes even without user corrections', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const transcript = writeToolFailureTranscript(dir, [
			{ exitCode: 1, error: 'build failed' },
		], 'tool-episode-test');

		digestTranscript(root, transcript, 'tool-episode-test');

		// Check episode was logged
		const { readdirSync: lsDir } = require('node:fs') as typeof import('node:fs');
		const episodes = lsDir(join(root, 'hippocampus', 'session_log'));
		const hasToolFailure = episodes.some((f: string) => {
			if (!f.endsWith('.neuron')) return false;
			const content = readFileSync(join(root, 'hippocampus', 'session_log', f), 'utf8');
			try { return JSON.parse(content).type === 'tool-failure'; } catch { return false; }
		});
		expect(hasToolFailure).toBe(true);
	});
});

// --- Tool Failure Detection Tests ---

/** Helper: create a transcript with tool_result error blocks */
function writeToolFailureTranscript(
	dir: string,
	failures: Array<{ exitCode: number; error: string }>,
	sessionId = 'tool-test',
): string {
	const path = join(dir, `${sessionId}.jsonl`);
	const lines: string[] = [];

	for (const f of failures) {
		lines.push(JSON.stringify({
			type: 'user',
			message: {
				role: 'user',
				content: [{
					type: 'tool_result',
					tool_use_id: `toolu_${Math.random().toString(36).slice(2)}`,
					is_error: true,
					content: `Exit code ${f.exitCode}\n${f.error}`,
				}],
			},
			toolUseResult: `Error: Exit code ${f.exitCode}\n${f.error}`,
			uuid: `msg-${Math.random().toString(36).slice(2)}`,
		}));
	}

	writeFileSync(path, lines.join('\n'), 'utf8');
	return path;
}

describe('parseToolResults', () => {
	it('extracts failures from tool_result blocks with is_error', () => {
		const dir = makeTempDir();
		const path = writeToolFailureTranscript(dir, [
			{ exitCode: 1, error: 'pre-commit hook failed' },
			{ exitCode: 127, error: 'command not found' },
		]);

		const failures = parseToolResults(path);
		expect(failures).toHaveLength(2);
		expect(failures[0]!.exitCode).toBe(1);
		expect(failures[1]!.exitCode).toBe(127);
	});

	it('ignores successful tool_results (no is_error)', () => {
		const dir = makeTempDir();
		const path = join(dir, 'success.jsonl');
		writeFileSync(path, JSON.stringify({
			type: 'user',
			message: {
				role: 'user',
				content: [{
					type: 'tool_result',
					tool_use_id: 'toolu_ok',
					is_error: false,
					content: 'Success',
				}],
			},
			uuid: 'msg-ok',
		}), 'utf8');

		const failures = parseToolResults(path);
		expect(failures).toHaveLength(0);
	});

	it('caps at MAX_FAILURES_PER_SESSION', () => {
		const dir = makeTempDir();
		const many = Array.from({ length: 30 }, (_, i) => ({ exitCode: 1, error: `err ${i}` }));
		const path = writeToolFailureTranscript(dir, many);

		const failures = parseToolResults(path);
		expect(failures.length).toBeLessThanOrEqual(20);
	});
});

describe('detectToolFailure', () => {
	it('extracts exit code from "Exit code N" format', () => {
		const result = detectToolFailure(
			{ content: 'Exit code 127\ncommand not found: foo', is_error: true },
		);
		expect(result).not.toBeNull();
		expect(result!.exitCode).toBe(127);
	});

	it('returns null for non-error blocks', () => {
		const result = detectToolFailure(
			{ content: 'all good', is_error: false },
		);
		expect(result).toBeNull();
	});

	it('handles content block array format', () => {
		const result = detectToolFailure(
			{ content: [{ type: 'text', text: 'Exit code 1\nbuild failed' }], is_error: true },
		);
		expect(result).not.toBeNull();
		expect(result!.exitCode).toBe(1);
	});

	it('defaults exit code to 1 when not parseable', () => {
		const result = detectToolFailure(
			{ content: 'Some error without exit code marker', is_error: true },
		);
		expect(result).not.toBeNull();
		expect(result!.exitCode).toBe(1);
	});
});

describe('detectRetryPatterns', () => {
	it('detects same error 3+ times as retry pattern', () => {
		const failures: ToolFailure[] = [
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
		];
		const retries = detectRetryPatterns(failures);
		expect(retries).toHaveLength(1);
		expect(retries[0]!.toolName).toContain('retry x3');
	});

	it('does not flag less than 3 occurrences', () => {
		const failures: ToolFailure[] = [
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
		];
		const retries = detectRetryPatterns(failures);
		expect(retries).toHaveLength(0);
	});

	it('tracks different errors separately', () => {
		const failures: ToolFailure[] = [
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
			{ toolName: 'npm install', exitCode: 1, errorText: 'ERR' },
			{ toolName: 'git push', exitCode: 1, errorText: 'ERR' },
			{ toolName: 'git push', exitCode: 1, errorText: 'ERR' },
		];
		const retries = detectRetryPatterns(failures);
		expect(retries).toHaveLength(1); // only npm install (3x), not git push (2x)
	});
});

// --- Incremental Digest Tests ---

/** Append lines to a JSONL file */
function appendToTranscript(path: string, lines: string[]): void {
	const existing = readFileSync(path, 'utf8');
	writeFileSync(path, existing + (existing.endsWith('\n') ? '' : '\n') + lines.join('\n') + '\n', 'utf8');
}

describe('incremental digest', () => {
	it('picks up new tool failures added after first digest', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();

		// First: transcript with no failures
		const transcript = writeTranscript(dir, ['Can you help me?'], 'incr-test');

		// First digest — creates audit log with lineCount
		const r1 = digestTranscript(root, transcript, 'incr-test');
		expect(r1.toolFailures).toBe(0);

		// Verify audit log was created
		const logPath = join(root, 'hippocampus', 'digest_log', 'incr-test.jsonl');
		expect(existsSync(logPath)).toBe(true);

		// Now append tool failures to the transcript (session continued)
		appendToTranscript(transcript, [
			JSON.stringify({
				type: 'user',
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 'toolu_fail1', is_error: true, content: 'Exit code 127\ncommand not found: foobar' }],
				},
				uuid: 'msg-fail1',
			}),
		]);

		// Second digest — should process only the new lines
		const r2 = digestTranscript(root, transcript, 'incr-test');
		expect(r2.toolFailures).toBe(1);
	});

	it('skips when transcript has not grown (true dedup)', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();

		const transcript = writeToolFailureTranscript(dir, [
			{ exitCode: 1, error: 'build failed' },
		], 'dedup-test');

		const r1 = digestTranscript(root, transcript, 'dedup-test');
		expect(r1.toolFailures).toBe(1);

		// Second run — same transcript, no new lines
		const r2 = digestTranscript(root, transcript, 'dedup-test');
		expect(r2.toolFailures).toBe(0);
	});

	it('picks up new corrections added after first digest', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();

		const transcript = writeTranscript(dir, ['Can you help me?'], 'corr-incr');
		digestTranscript(root, transcript, 'corr-incr');

		// Append a correction
		appendToTranscript(transcript, [
			JSON.stringify({
				type: 'user',
				message: { role: 'user', content: "don't use console.log for debugging" },
				uuid: 'msg-corr1',
			}),
		]);

		const r2 = digestTranscript(root, transcript, 'corr-incr');
		expect(r2.corrections).toBe(1);
	});

	it('handles multiple incremental digests correctly', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();

		const transcript = writeTranscript(dir, ['hello'], 'multi-incr');
		digestTranscript(root, transcript, 'multi-incr');

		// Append first failure
		appendToTranscript(transcript, [
			JSON.stringify({
				type: 'user',
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 'toolu_a', is_error: true, content: 'Exit code 1\nerror A' }],
				},
				uuid: 'msg-a',
			}),
		]);
		const r2 = digestTranscript(root, transcript, 'multi-incr');
		expect(r2.toolFailures).toBe(1);

		// Append second failure
		appendToTranscript(transcript, [
			JSON.stringify({
				type: 'user',
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 'toolu_b', is_error: true, content: 'Exit code 2\nerror B' }],
				},
				uuid: 'msg-b',
			}),
		]);
		const r3 = digestTranscript(root, transcript, 'multi-incr');
		expect(r3.toolFailures).toBe(1); // only the new one
	});

	it('preserves backward compat with legacy audit logs (no _meta)', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();

		const transcript = writeTranscript(dir, ['hello'], 'legacy-test');

		// Simulate a legacy audit log (empty file, no _meta)
		const logDir = join(root, 'hippocampus', 'digest_log');
		mkdirSync(logDir, { recursive: true });
		writeFileSync(join(logDir, 'legacy-test.jsonl'), '', 'utf8');

		// Should skip (legacy dedup)
		const result = digestTranscript(root, transcript, 'legacy-test');
		expect(result.corrections).toBe(0);
		expect(result.toolFailures).toBe(0);
	});
});

// --- Soft Failure Detection Tests (is_error: false but real errors) ---

/** Helper: create a transcript with is_error:false tool results */
function writeSoftFailureTranscript(
	dir: string,
	outputs: Array<{ content: string; stderr?: string }>,
	sessionId = 'soft-test',
): string {
	const path = join(dir, `${sessionId}.jsonl`);
	const lines: string[] = [];

	for (const o of outputs) {
		lines.push(JSON.stringify({
			type: 'user',
			message: {
				role: 'user',
				content: [{
					type: 'tool_result',
					tool_use_id: `toolu_${Math.random().toString(36).slice(2)}`,
					is_error: false,
					content: o.content,
				}],
			},
			toolUseResult: {
				stdout: o.content,
				stderr: o.stderr || '',
				interrupted: false,
			},
			uuid: `msg-${Math.random().toString(36).slice(2)}`,
		}));
	}

	writeFileSync(path, lines.join('\n'), 'utf8');
	return path;
}

describe('detectSoftFailure', () => {
	it('detects "command not found" with is_error:false (|| true)', () => {
		const result = detectSoftFailure(
			{ content: '(eval):2: command not found: this_command_does_not_exist_12345', is_error: false },
		);
		expect(result).not.toBeNull();
		expect(result!.toolName).toContain('[soft]');
		expect(result!.toolName).toContain('command not found');
		expect(result!.exitCode).toBe(0);
	});

	it('detects "npm error" with is_error:false', () => {
		const result = detectSoftFailure(
			{ content: 'npm error Missing script: "nonexistent_script"\nnpm error\nnpm error To see a list of scripts, run:', is_error: false },
		);
		expect(result).not.toBeNull();
		expect(result!.toolName).toContain('npm error');
	});

	it('detects "fatal:" git errors', () => {
		const result = detectSoftFailure(
			{ content: 'fatal: not a git repository', is_error: false },
		);
		expect(result).not.toBeNull();
		expect(result!.toolName).toContain('fatal');
	});

	it('ignores normal success output', () => {
		const result = detectSoftFailure(
			{ content: 'Build succeeded\n3 files compiled', is_error: false },
		);
		expect(result).toBeNull();
	});

	it('ignores npm warn (not npm error)', () => {
		const result = detectSoftFailure(
			{ content: 'npm warn publish npm auto-corrected some errors in your package.json', is_error: false },
		);
		expect(result).toBeNull();
	});

	it('ignores JSON API error responses', () => {
		const result = detectSoftFailure(
			{ content: '{"error": "API route not found"}\n{"status": 404}', is_error: false },
		);
		expect(result).toBeNull();
	});

	it('detects errors in stderr via toolUseResult', () => {
		const result = detectSoftFailure(
			{ content: '', is_error: false },
			{ stdout: '', stderr: 'fatal: remote origin already exists.' },
		);
		expect(result).not.toBeNull();
		expect(result!.toolName).toContain('fatal');
	});
});

describe('soft failures in parseToolResults', () => {
	it('catches command-not-found with || true in transcript', () => {
		const dir = makeTempDir();
		const path = writeSoftFailureTranscript(dir, [
			{ content: '(eval):2: command not found: this_command_does_not_exist_12345\n---\nnpm error Missing script: "nonexistent_script"' },
		]);

		const failures = parseToolResults(path);
		expect(failures.length).toBeGreaterThanOrEqual(1);
		expect(failures.some(f => f.toolName.includes('command not found'))).toBe(true);
	});

	it('does not flag normal output as soft failure', () => {
		const dir = makeTempDir();
		const path = writeSoftFailureTranscript(dir, [
			{ content: 'total 1160\n-rw-r--r-- 1 user staff 507 file.txt' },
			{ content: 'Build succeeded! 0 errors, 2 warnings.' },
		]);

		const failures = parseToolResults(path);
		expect(failures).toHaveLength(0);
	});

	it('integrates soft failures into digestTranscript', () => {
		const { root } = setupTestBrain();
		const dir = makeTempDir();
		const path = writeSoftFailureTranscript(dir, [
			{ content: '(eval):1: command not found: foobar' },
		], 'soft-digest');

		const result = digestTranscript(root, path, 'soft-digest');
		expect(result.toolFailures).toBe(1);
	});
});
