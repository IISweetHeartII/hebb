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
import { growNeuron } from './grow';
import { logEpisode } from './episode';
import { tokenize } from './similarity';

export interface DigestResult {
	corrections: number;
	skipped: number;
	transcriptPath: string;
	sessionId: string;
}

export interface ExtractedCorrection {
	text: string;
	path: string;
	prefix: 'NO' | 'DO';
	keywords: string[];
}

interface TranscriptLine {
	type?: string;
	message?: {
		role?: string;
		content?: string | Array<{ type: string; text?: string }>;
	};
	sessionId?: string;
	uuid?: string;
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
	// Korean negation
	/하지\s*마/,
	/안\s*돼/,
	/대신/,
	/쓰지\s*마/,
	/않/,
];

// Affirmation patterns — user is telling the AI TO do something
const AFFIRMATION_PATTERNS = [
	/\balways\b/i,
	/\bmust\b/i,
	/\bshould\s+always\b/i,
	/\buse\s+\w+\s+instead\b/i,
	// Korean affirmation
	/항상/,
	/반드시/,
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
		return { corrections: 0, skipped: 0, transcriptPath, sessionId: resolvedSessionId };
	}

	// Parse transcript
	const messages = parseTranscript(transcriptPath);

	// Extract corrections
	const corrections = extractCorrections(messages);

	if (corrections.length === 0) {
		console.log(`\uD83D\uDCDD digest: no corrections found in session ${resolvedSessionId}`);
		// Write empty audit log to mark as digested
		writeAuditLog(brainRoot, resolvedSessionId, []);
		return { corrections: 0, skipped: messages.length, transcriptPath, sessionId: resolvedSessionId };
	}

	// Apply corrections via growNeuron (handles Jaccard dedup internally)
	let applied = 0;
	const auditEntries: Array<{ correction: ExtractedCorrection; applied: boolean }> = [];

	for (const correction of corrections) {
		try {
			growNeuron(brainRoot, correction.path);
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
 */
function detectCorrection(text: string): ExtractedCorrection | null {
	const isNegation = NEGATION_PATTERNS.some((p) => p.test(text));
	const isAffirmation = AFFIRMATION_PATTERNS.some((p) => p.test(text));

	if (!isNegation && !isAffirmation) return null;

	const prefix = isNegation ? 'NO' : 'DO';
	const keywords = extractKeywords(text);

	if (keywords.length === 0) return null;

	// Build neuron path: cortex/{PREFIX}_{keyword1}_{keyword2}
	const pathSegment = `${prefix}_${keywords.slice(0, 4).join('_')}`;
	const path = `cortex/${pathSegment}`;

	return { text, path, prefix, keywords };
}

/**
 * Extract meaningful keywords from correction text.
 * Filters out common stop words and correction-specific words.
 */
function extractKeywords(text: string): string[] {
	const STOP_WORDS = new Set([
		'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
		'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
		'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
		'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
		'into', 'through', 'during', 'before', 'after', 'above', 'below',
		'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
		'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
		'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
		'too', 'very', 'just', 'because', 'until', 'while', 'that', 'this',
		'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'us', 'you',
		'your', 'he', 'she', 'they', 'them', 'what', 'which', 'who', 'whom',
		// Correction-specific stop words
		'don', 'dont', 'stop', 'never', 'always', 'instead', 'use', 'avoid',
		'please', 'must', 'should', 'like', 'want', 'think',
	]);

	const tokens = tokenize(text);
	return tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 2);
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
