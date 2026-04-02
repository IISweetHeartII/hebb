// hebbian — Conversation Digest (Correction Extraction)
//
// Parses Claude Code conversation transcripts (JSONL) and extracts
// user corrections via pattern matching. Writes corrections to inbox,
// auto-processes them, and logs an audit trail.
//
// Correction detection is deliberately heuristic — WS3 candidate staging
// is the quality safety net for false positives.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { MAX_CORRECTIONS_PER_SESSION, MIN_CORRECTION_LENGTH, DIGEST_LOG_DIR } from './constants';
import { growCandidate } from './candidates';
import { logEpisode } from './episode';
// tokenize() not used here — digest uses its own unstemmed split for readable names.
// tokenize() with stemming is for Jaccard similarity in grow.ts.

export interface DigestResult {
	corrections: number;
	skipped: number;
	toolFailures: number;
	transcriptPath: string;
	sessionId: string;
}

export interface ExtractedCorrection {
	text: string;
	path: string;
	prefix: 'NO' | 'DO' | 'MUST' | 'WARN';
	keywords: string[];
}

interface TranscriptLine {
	type?: string;
	message?: {
		role?: string;
		content?: string | Array<{ type: string; text?: string; tool_use_id?: string; is_error?: boolean }>;
	};
	toolUseResult?: {
		stdout?: string;
		stderr?: string;
		status?: string;
	};
	sessionId?: string;
	uuid?: string;
}

export interface ToolFailure {
	toolName: string;
	exitCode: number;
	errorText: string;
}

// Negation patterns — user is telling the AI NOT to do something
const NEGATION_PATTERNS = [
	/\bdon[''\u2019]?t\b/i,
	/\bdo not\b/i,
	/\bstop\s+\w+ing\b/i,
	/\bnever\b/i,
	/\binstead\b/i,
	/^no[,.\s!]/i,
	/\bdon[''\u2019]?t\s+use\b/i,
	/\bavoid\b/i,
	// Korean negation — specific verb forms only to avoid matching incidental 않/대신 in explanations
	/하지\s*마/,
	/안\s*돼/,
	/쓰지\s*마/,
	/[가-힣]+지\s*마/,
	/하지\s*않/,  // "do not" specifically
	/쓰지\s*않/,  // "do not use" specifically
];

// Affirmation patterns — user is telling the AI TO do something
const AFFIRMATION_PATTERNS = [
	/\balways\b/i,
	/\bshould\s+always\b/i,
	/\buse\s+\w+\s+instead\b/i,
	// Korean affirmation
	/항상/,
];

// Must patterns — strong imperative ("you must X", "X is required")
const MUST_PATTERNS = [
	/\bmust\b/i,
	/\brequired\b/i,
	// Korean
	/반드시/,
];

// Warn patterns — cautionary ("be careful with X", "watch out for X")
const WARN_PATTERNS = [
	/\bcareful\b/i,
	/\bwatch\s+out\b/i,
	/\bwarning\b/i,
	// Korean
	/주의/,
];

/**
 * Parse hook input from stdin to extract transcript path and session ID.
 */
export function readHookInput(stdin: string): { transcriptPath: string; sessionId: string } | null {
	if (!stdin.trim()) return null;
	try {
		const input = JSON.parse(stdin);
		if (input.transcript_path) {
			const sessionId = input.session_id || basename(input.transcript_path, '.jsonl');
			return { transcriptPath: input.transcript_path, sessionId };
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Digest a conversation transcript and extract corrections.
 * Auto-processes inbox and writes audit log.
 */
export function digestTranscript(brainRoot: string, transcriptPath: string, sessionId?: string): DigestResult {
	if (!existsSync(transcriptPath)) {
		throw new Error(`Transcript not found: ${transcriptPath}`);
	}

	const resolvedSessionId = sessionId || basename(transcriptPath, '.jsonl');

	// Dedup check: skip if already digested
	const logDir = join(brainRoot, DIGEST_LOG_DIR);
	const logPath = join(logDir, `${resolvedSessionId}.jsonl`);
	if (existsSync(logPath)) {
		console.log(`\u23ED already digested session ${resolvedSessionId}, skip`);
		return { corrections: 0, skipped: 0, toolFailures: 0, transcriptPath, sessionId: resolvedSessionId };
	}

	// Parse transcript — user messages for corrections
	const messages = parseTranscript(transcriptPath);

	// Parse tool results — detect failures (language-independent self-learning)
	const toolFailures = parseToolResults(transcriptPath);
	for (const failure of toolFailures) {
		logEpisode(brainRoot, 'tool-failure', failure.toolName, failure.errorText);
	}

	// Detect retry patterns — same error 3+ times = persistent problem
	const retries = detectRetryPatterns(toolFailures);
	for (const retry of retries) {
		logEpisode(brainRoot, 'retry-pattern', retry.toolName, retry.errorText);
	}

	const totalSignals = toolFailures.length + retries.length;
	if (totalSignals > 0) {
		console.log(`🔧 digest: ${toolFailures.length} tool failure(s), ${retries.length} retry pattern(s) logged`);
	}

	// Extract corrections
	const corrections = extractCorrections(messages);

	if (corrections.length === 0 && toolFailures.length === 0) {
		console.log(`\uD83D\uDCDD digest: no corrections found in session ${resolvedSessionId}`);
		// Write empty audit log to mark as digested
		writeAuditLog(brainRoot, resolvedSessionId, []);
		return { corrections: 0, skipped: messages.length, toolFailures: toolFailures.length, transcriptPath, sessionId: resolvedSessionId };
	}

	if (corrections.length === 0) {
		// Tool failures logged but no user corrections — still mark as digested
		writeAuditLog(brainRoot, resolvedSessionId, []);
		return { corrections: 0, skipped: messages.length, toolFailures: toolFailures.length, transcriptPath, sessionId: resolvedSessionId };
	}

	// Apply corrections via candidate staging — counter >= 3 auto-promotes
	let applied = 0;
	const auditEntries: Array<{ correction: ExtractedCorrection; applied: boolean }> = [];

	for (const correction of corrections) {
		try {
			growCandidate(brainRoot, correction.path);
			logEpisode(brainRoot, 'digest', correction.path, correction.text);
			auditEntries.push({ correction, applied: true });
			applied++;
		} catch (err) {
			console.log(`   \u26A0\uFE0F failed to apply: ${correction.path} — ${(err as Error).message}`);
			auditEntries.push({ correction, applied: false });
		}
	}

	// Write audit log
	writeAuditLog(brainRoot, resolvedSessionId, auditEntries);

	console.log(`\uD83D\uDCDD digest: ${applied} correction(s) from session ${resolvedSessionId}`);
	return {
		corrections: applied,
		skipped: messages.length - corrections.length,
		toolFailures: toolFailures.length,
		transcriptPath,
		sessionId: resolvedSessionId,
	};
}

/**
 * Parse a Claude Code conversation JSONL transcript.
 * Returns user message texts only.
 */
function parseTranscript(transcriptPath: string): string[] {
	const content = readFileSync(transcriptPath, 'utf8');
	const lines = content.split('\n').filter(Boolean);
	const messages: string[] = [];

	for (const line of lines) {
		let entry: TranscriptLine;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		// Only process user messages
		if (entry.type !== 'user') continue;
		if (!entry.message || entry.message.role !== 'user') continue;

		const text = extractText(entry.message.content);
		if (text) messages.push(text);
	}

	return messages;
}

/**
 * Extract text from message content (handles string or content block array).
 */
function extractText(content: string | Array<{ type: string; text?: string }> | undefined): string | null {
	if (!content) return null;
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		const texts = content
			.filter((block) => block.type === 'text' && block.text)
			.map((block) => block.text!);
		return texts.length > 0 ? texts.join('\n') : null;
	}
	return null;
}

// --- Tool Failure Detection (language-independent self-learning) ---

const MAX_FAILURES_PER_SESSION = 20;

/**
 * Parse tool_result blocks from a Claude Code transcript.
 * Returns detected failures (exit code ≠ 0, is_error = true).
 */
export function parseToolResults(transcriptPath: string): ToolFailure[] {
	const content = readFileSync(transcriptPath, 'utf8');
	const lines = content.split('\n').filter(Boolean);
	const failures: ToolFailure[] = [];

	for (const line of lines) {
		if (failures.length >= MAX_FAILURES_PER_SESSION) break;

		let entry: TranscriptLine;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		if (entry.type !== 'user') continue;
		if (!entry.message || !Array.isArray(entry.message.content)) continue;

		for (const block of entry.message.content) {
			if (block.type !== 'tool_result') continue;
			if (!block.is_error) continue;

			const failure = detectToolFailure(block, entry.toolUseResult);
			if (failure) failures.push(failure);
		}
	}

	return failures;
}

/**
 * Detect retry patterns — same error appearing 3+ times in a session.
 * Returns deduplicated failures with retry count.
 */
export function detectRetryPatterns(failures: ToolFailure[]): ToolFailure[] {
	const counts = new Map<string, { failure: ToolFailure; count: number }>();

	for (const f of failures) {
		// Key by first meaningful line of error (strips "Exit code N")
		const key = f.toolName.toLowerCase().trim();
		const existing = counts.get(key);
		if (existing) {
			existing.count++;
		} else {
			counts.set(key, { failure: f, count: 1 });
		}
	}

	return [...counts.values()]
		.filter((entry) => entry.count >= 3)
		.map((entry) => ({
			...entry.failure,
			toolName: `[retry x${entry.count}] ${entry.failure.toolName}`,
		}));
}

/**
 * Detect a tool failure from a tool_result block.
 * Returns failure info if exit code ≠ 0, null otherwise.
 */
export function detectToolFailure(
	block: { content?: string | Array<{ type: string; text?: string }>; is_error?: boolean },
	toolUseResult?: TranscriptLine['toolUseResult'],
): ToolFailure | null {
	if (!block.is_error) return null;

	// Extract error text from block content
	let errorText = '';
	if (typeof block.content === 'string') {
		errorText = block.content;
	} else if (Array.isArray(block.content)) {
		errorText = block.content
			.filter((b) => b.type === 'text' && b.text)
			.map((b) => b.text!)
			.join('\n');
	}

	// Also check toolUseResult string format
	if (!errorText && typeof toolUseResult === 'string') {
		errorText = toolUseResult as string;
	}

	if (!errorText) return null;

	// Parse exit code from "Exit code N\n..." format
	const exitMatch = errorText.match(/^Exit code (\d+)/);
	const exitCode = exitMatch ? parseInt(exitMatch[1]!, 10) : 1;

	// Extract a short tool name from the error (first meaningful line)
	const firstLine = errorText.split('\n').find((l) => l.trim() && !l.startsWith('Exit code')) || 'unknown';
	const toolName = firstLine.trim().slice(0, 80);

	return { toolName, exitCode, errorText: errorText.slice(0, 500) };
}

/**
 * Extract corrections from user messages using pattern matching.
 * Returns up to MAX_CORRECTIONS_PER_SESSION corrections.
 */
export function extractCorrections(messages: string[]): ExtractedCorrection[] {
	const corrections: ExtractedCorrection[] = [];

	for (const text of messages) {
		if (corrections.length >= MAX_CORRECTIONS_PER_SESSION) break;

		// Skip short messages
		if (text.length < MIN_CORRECTION_LENGTH) continue;

		// Skip commands (start with / or !)
		if (/^[\/!]/.test(text.trim())) continue;

		// Skip questions (end with ?)
		if (text.trim().endsWith('?')) continue;

		// Skip system-injected XML tags (Claude Code injects these into user turns)
		// e.g. <local-command-caveat>, <command-message>, <task-notification>
		if (/^<[a-zA-Z]/.test(text.trim())) continue;

		// Skip skill base directory injections
		if (/^Base directory for this skill:/i.test(text.trim())) continue;

		// Skip bullet-list formatted text (likely assistant output injected into user turn)
		if (/^[•·▸▶\-\*]\s/.test(text.trim())) continue;

		// Check for correction patterns
		const correction = detectCorrection(text);
		if (correction) {
			corrections.push(correction);
		}
	}

	return corrections;
}

/**
 * Detect if a message is a correction and extract structured data.
 * Priority: NO > MUST > WARN > DO
 */
function detectCorrection(text: string): ExtractedCorrection | null {
	const isNegation = NEGATION_PATTERNS.some((p) => p.test(text));
	const isMust = MUST_PATTERNS.some((p) => p.test(text));
	const isWarn = WARN_PATTERNS.some((p) => p.test(text));
	const isAffirmation = AFFIRMATION_PATTERNS.some((p) => p.test(text));

	if (!isNegation && !isMust && !isWarn && !isAffirmation) return null;

	let prefix: 'NO' | 'MUST' | 'WARN' | 'DO';
	if (isNegation) prefix = 'NO';
	else if (isMust) prefix = 'MUST';
	else if (isWarn) prefix = 'WARN';
	else prefix = 'DO';

	const keywords = extractKeywords(text);

	if (keywords.length === 0) return null;

	// Build neuron path: cortex/{PREFIX}_{keyword1}_{keyword2}_{keyword3}
	const pathSegment = `${prefix}_${keywords.slice(0, 3).join('_')}`;
	const path = `cortex/${pathSegment}`;

	return { text, path, prefix, keywords };
}

/**
 * Extract meaningful keywords from correction text.
 * Uses its own tokenization WITHOUT stemming for readable neuron names.
 * (tokenize() in similarity.ts stems words, which is good for Jaccard
 * matching but produces ugly names like "consol" instead of "console".)
 */
function extractKeywords(text: string): string[] {
	const STOP_WORDS = new Set([
		// English stop words
		'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
		'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
		'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
		'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
		'into', 'through', 'during', 'before', 'after', 'above', 'below',
		'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
		'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
		'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
		'too', 'very', 'just', 'because', 'until', 'while', 'that', 'this',
		'these', 'those', 'it', 'its', 'me', 'my', 'we', 'us', 'you',
		'your', 'he', 'she', 'they', 'them', 'what', 'which', 'who', 'whom',
		// Correction-specific stop words
		'don', 'dont', 'stop', 'never', 'always', 'instead', 'use', 'avoid',
		'please', 'must', 'should', 'like', 'want', 'think', 'way', 'make',
		'sure', 'keep', 'try', 'let', 'get', 'put', 'set', 'new', 'also',
		'using', 'used', 'when', 'where', 'how', 'why', 'here', 'there',
		'careful', 'warning', 'watch', 'out', 'required',
	]);

	return text
		.replace(/([a-z])([A-Z])/g, '$1 $2')                                    // camelCase → words
		.replace(/[^a-zA-Z0-9\u3000-\u9FFF\uAC00-\uD7AF]+/g, ' ')              // punctuation → space
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Write audit log for digest session.
 */
function writeAuditLog(
	brainRoot: string,
	sessionId: string,
	entries: Array<{ correction: ExtractedCorrection; applied: boolean }>,
): void {
	const logDir = join(brainRoot, DIGEST_LOG_DIR);
	if (!existsSync(logDir)) {
		mkdirSync(logDir, { recursive: true });
	}

	const logPath = join(logDir, `${sessionId}.jsonl`);
	const lines = entries.map((e) =>
		JSON.stringify({
			ts: new Date().toISOString(),
			path: e.correction.path,
			text: e.correction.text,
			prefix: e.correction.prefix,
			keywords: e.correction.keywords,
			applied: e.applied,
		}),
	);

	// Even if no entries, write empty file as dedup marker
	writeFileSync(logPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
}
