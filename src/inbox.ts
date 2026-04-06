// hebbian — Inbox Processing
//
// Parses _inbox/corrections.jsonl and auto-creates/fires neurons from
// AI corrections. Security checks prevent path traversal. Only PM/admin
// roles can award dopamine (inflation filter).
//
// Port from: NeuronFS/runtime/main.go lines 1425-1544

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from './constants';
import { growCandidate } from './candidates';
import { fireNeuron } from './fire';
import { signalNeuron } from './signal';
import { logEpisode } from './episode';
import type { NeuronMeta } from './types';

const INBOX_DIR = '_inbox';
const CORRECTIONS_FILE = 'corrections.jsonl';
const DOPAMINE_ALLOWED_ROLES = ['pm', 'admin', 'lead'];

export interface Correction {
	ts: string;
	type: 'correction';
	text: string;
	path: string;
	counter_add: number;
	author: string;
	dopamine?: number;
}

export interface InboxResult {
	processed: number;
	skipped: number;
	errors: string[];
}

/**
 * Process the inbox corrections file.
 * Each line is a JSON object describing a correction to apply.
 */
export function processInbox(brainRoot: string): InboxResult {
	const inboxPath = join(brainRoot, INBOX_DIR, CORRECTIONS_FILE);

	if (!existsSync(inboxPath)) {
		return { processed: 0, skipped: 0, errors: [] };
	}

	const content = readFileSync(inboxPath, 'utf8').trim();
	if (!content) {
		return { processed: 0, skipped: 0, errors: [] };
	}

	const lines = content.split('\n').filter(Boolean);
	let processed = 0;
	let skipped = 0;
	const errors: string[] = [];

	for (const line of lines) {
		let correction: Correction;
		try {
			correction = JSON.parse(line) as Correction;
		} catch {
			errors.push(`Malformed JSON: ${line.slice(0, 80)}`);
			skipped++;
			continue;
		}

		// Validate required fields
		if (!correction.path || !correction.type) {
			errors.push(`Missing path or type: ${line.slice(0, 80)}`);
			skipped++;
			continue;
		}

		// Security: path traversal check
		if (!isPathSafe(correction.path)) {
			errors.push(`Path traversal blocked: ${correction.path}`);
			skipped++;
			continue;
		}

		// Security: validate region
		const region = correction.path.split('/')[0];
		if (!region || !(REGIONS as readonly string[]).includes(region)) {
			errors.push(`Invalid region in path: ${correction.path}`);
			skipped++;
			continue;
		}

		try {
			applyCorrection(brainRoot, correction);
			processed++;
		} catch (err) {
			errors.push(`Failed to apply ${correction.path}: ${(err as Error).message}`);
			skipped++;
		}
	}

	// Clear the inbox file after processing
	writeFileSync(inboxPath, '', 'utf8');

	console.log(`📥 inbox: processed ${processed}, skipped ${skipped}`);
	if (errors.length > 0) {
		for (const err of errors) {
			console.log(`   ⚠️  ${err}`);
		}
	}

	return { processed, skipped, errors };
}

/**
 * Apply a single correction entry.
 */
function applyCorrection(brainRoot: string, correction: Correction): void {
	const neuronPath = correction.path;
	const fullPath = join(brainRoot, neuronPath);
	const counterAdd = Math.max(1, correction.counter_add || 1);

	if (existsSync(fullPath)) {
		// Neuron exists — fire N times
		for (let i = 0; i < counterAdd; i++) {
			fireNeuron(brainRoot, neuronPath);
		}
	} else {
		// Neuron doesn't exist — grow via candidate staging
		const meta: NeuronMeta = {
			source: 'manual',
			created: new Date().toISOString(),
			description: correction.text.slice(0, 200),
		};
		const candResult = growCandidate(brainRoot, neuronPath, meta);
		// Only fire additional times if already promoted to permanent
		if (candResult.promoted) {
			for (let i = 1; i < counterAdd; i++) {
				fireNeuron(brainRoot, neuronPath);
			}
		}
	}

	// Dopamine inflation filter: only allowed roles can award dopamine
	if (correction.dopamine && correction.dopamine > 0) {
		const author = (correction.author || '').toLowerCase();
		if (DOPAMINE_ALLOWED_ROLES.includes(author)) {
			signalNeuron(brainRoot, neuronPath, 'dopamine');
		}
	}

	logEpisode(brainRoot, 'inbox', neuronPath, correction.text || '');
}

/**
 * Security: check path for traversal attacks.
 */
function isPathSafe(path: string): boolean {
	if (path.includes('..')) return false;
	if (path.startsWith('/')) return false;
	if (path.includes('\\')) return false;
	// Block null bytes
	if (path.includes('\0')) return false;
	return true;
}

/**
 * Ensure the inbox directory and corrections file exist.
 */
export function ensureInbox(brainRoot: string): string {
	const inboxDir = join(brainRoot, INBOX_DIR);
	if (!existsSync(inboxDir)) {
		mkdirSync(inboxDir, { recursive: true });
	}
	const filePath = join(inboxDir, CORRECTIONS_FILE);
	if (!existsSync(filePath)) {
		writeFileSync(filePath, '', 'utf8');
	}
	return filePath;
}

/**
 * Append a correction entry to the inbox.
 */
export function appendCorrection(brainRoot: string, correction: Correction): void {
	const filePath = ensureInbox(brainRoot);
	const line = JSON.stringify(correction) + '\n';
	const existing = readFileSync(filePath, 'utf8');
	writeFileSync(filePath, existing + line, 'utf8');
}
