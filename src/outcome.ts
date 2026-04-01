// hebbian — Outcome Tracking (Phase 5: Feedback Loop)
//
// Captures session state at start, detects outcomes at end,
// and writes contra signals on revert. Git + working tree detection.
//
// Data flow:
//   SessionStart hook → captureSessionStart() → session_state_{uuid}.json
//   Stop hook → detectOutcome() → log episode + write contra on revert
//   Evolve → buildOutcomeSummary() → per-neuron outcome aggregation
//
// Session state is keyed by UUID to handle concurrent/resumed sessions.
// Outcome detection compares both committed (HEAD) and uncommitted (working tree) changes.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SESSION_STATE_DIR, PROTECTED_REGIONS_CONTRA } from './constants';
import { scanBrain } from './scanner';
import { runSubsumption } from './subsumption';
import { contraNeuron } from './fire';
import { logEpisode, readEpisodes } from './episode';
import type { OutcomeType } from './constants';

// --- Types ---

export interface SessionState {
	ts: string;
	sha: string;
	status: string[];
	neurons: string[];
	uuid: string;
}

export interface OutcomeResult {
	outcome: OutcomeType;
	neuronsAffected: number;
	protectedSkipped: number;
	detail: string;
}

// --- Session Start ---

/**
 * Capture session state: git HEAD SHA, working tree status, active neurons.
 * Writes session_state_{uuid}.json to hippocampus/session_state/.
 * Returns null if not in a git repo.
 */
export function captureSessionStart(brainRoot: string): SessionState | null {
	// Get git HEAD SHA
	let sha: string;
	try {
		sha = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
	} catch {
		console.log('⏭️ session start: not a git repo, skipping');
		return null;
	}

	// Capture working tree status
	let status: string[];
	try {
		const raw = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
		status = raw ? raw.split('\n') : [];
	} catch {
		status = [];
	}

	// Get subsumption-filtered neurons (matches what emit selects)
	const brain = scanBrain(brainRoot);
	const result = runSubsumption(brain);
	const neurons: string[] = [];
	for (const region of result.activeRegions) {
		for (const neuron of region.neurons) {
			if (!neuron.isDormant && neuron.counter > 0) {
				neurons.push(`${region.name}/${neuron.path}`);
			}
		}
	}

	// Write session state with UUID key
	const uuid = randomUUID();
	const stateDir = join(brainRoot, SESSION_STATE_DIR);
	if (!existsSync(stateDir)) {
		mkdirSync(stateDir, { recursive: true });
	}

	const state: SessionState = { ts: new Date().toISOString(), sha, status, neurons, uuid };
	writeFileSync(join(stateDir, `state_${uuid}.json`), JSON.stringify(state), 'utf8');

	console.log(`📸 session start: SHA ${sha.slice(0, 7)}, ${neurons.length} active neurons`);
	return state;
}

// --- Session End / Outcome Detection ---

/**
 * Detect session outcome by comparing git state at start vs end.
 * Writes contra on revert, logs outcome episode.
 * Returns null if no session state or no changes detected.
 */
export function detectOutcome(brainRoot: string): OutcomeResult | null {
	// Find most recent session state file
	const state = readLatestSessionState(brainRoot);
	if (!state) {
		console.log('⏭️ session end: no session state found, skipping');
		return null;
	}

	// Get current git state
	let currentSha: string;
	try {
		currentSha = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
	} catch {
		console.log('⏭️ session end: not a git repo, skipping');
		cleanupSessionState(brainRoot, state.uuid);
		return null;
	}

	let currentStatus: string[];
	try {
		const raw = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
		currentStatus = raw ? filterHebbianPaths(raw.split('\n')) : [];
	} catch {
		currentStatus = [];
	}

	// Also filter start status for consistent comparison
	const filteredStartStatus = filterHebbianPaths(state.status);

	// Detect outcome using 5-case logic (filtered status excludes hebbian bookkeeping)
	const outcome = classifyOutcome(
		{ ...state, status: filteredStartStatus },
		currentSha,
		currentStatus,
	);

	if (!outcome) {
		console.log('📊 session end: no changes detected (no-op)');
		cleanupSessionState(brainRoot, state.uuid);
		return null;
	}

	// Log outcome episode
	const neurons = state.neurons;
	logEpisode(brainRoot, 'session-end', '', `outcome:${outcome}`, { outcome, neurons });

	let result: OutcomeResult;

	if (outcome === 'revert') {
		// Write contra on active neurons (skip protected regions)
		const { affected, skipped } = applyContra(brainRoot, neurons);
		result = {
			outcome: 'revert',
			neuronsAffected: affected,
			protectedSkipped: skipped,
			detail: `${affected} neurons contra'd (${skipped} protected skipped)`,
		};
		console.log(`📊 session end: revert — ${result.detail}`);
	} else {
		result = {
			outcome: 'acceptance',
			neuronsAffected: 0,
			protectedSkipped: 0,
			detail: 'changes accepted',
		};
		console.log('📊 session end: acceptance');
	}

	cleanupSessionState(brainRoot, state.uuid);
	return result;
}

// --- Outcome Classification ---

/**
 * Classify outcome based on git state comparison.
 *
 * Case 1: status unchanged + HEAD unchanged → no-op (null)
 * Case 2: new files/mods in status vs start → acceptance
 * Case 3: status items removed/restored vs start → possible revert
 * Case 4: HEAD moved, non-empty committed diff → acceptance
 * Case 5: HEAD moved, net-zero diff OR "revert" in git log → revert
 */
export function classifyOutcome(
	state: SessionState,
	currentSha: string,
	currentStatus: string[],
): OutcomeType | null {
	const headMoved = state.sha !== currentSha;
	const startStatusSet = new Set(state.status);
	const endStatusSet = new Set(currentStatus);

	// Check for working tree changes
	const newItems = currentStatus.filter((s) => !startStatusSet.has(s));
	const removedItems = state.status.filter((s) => !endStatusSet.has(s));

	if (!headMoved) {
		// HEAD unchanged — check working tree only
		if (newItems.length === 0 && removedItems.length === 0) {
			return null; // Case 1: no-op
		}
		if (newItems.length > 0) {
			return 'acceptance'; // Case 2: new uncommitted work
		}
		if (removedItems.length > 0) {
			return 'revert'; // Case 3: uncommitted work was undone
		}
		return null;
	}

	// HEAD moved — check working tree first, then committed changes
	// If there are new uncommitted items alongside commits, that's still acceptance
	if (newItems.length > 0) {
		return 'acceptance'; // Case 2b: commits + new uncommitted work
	}

	try {
		const diffStat = execSync(
			`git diff ${state.sha}..${currentSha} --stat`,
			{ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
		).trim();

		const logOutput = execSync(
			`git log --oneline ${state.sha}..${currentSha}`,
			{ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
		).trim();

		// Case 5: "revert" in commit messages
		if (/\brevert\b/i.test(logOutput)) {
			return 'revert';
		}

		// Case 5: net-zero diff (commits exist but cancel out)
		if (!diffStat) {
			return 'revert';
		}

		// Case 4: non-empty diff
		return 'acceptance';
	} catch {
		// git commands failed (SHA might not exist after force push)
		return null;
	}
}

// --- Contra Application ---

function applyContra(brainRoot: string, neurons: string[]): { affected: number; skipped: number } {
	let affected = 0;
	let skipped = 0;

	for (const neuronPath of neurons) {
		const region = neuronPath.split('/')[0] || '';
		if (PROTECTED_REGIONS_CONTRA.includes(region)) {
			skipped++;
			continue;
		}

		const result = contraNeuron(brainRoot, neuronPath);
		if (result > 0) {
			affected++;
		}
	}

	return { affected, skipped };
}

// --- Outcome Summary for Evolve ---

/**
 * Build per-neuron outcome summary from episode history.
 * Returns markdown section for the evolve prompt, or empty string if no data.
 */
export function buildOutcomeSummary(brainRoot: string): string {
	const episodes = readEpisodes(brainRoot);
	const outcomeEpisodes = episodes.filter((e) => e.outcome && e.neurons);

	if (outcomeEpisodes.length === 0) return '';

	// Aggregate per-neuron
	const stats = new Map<string, { sessions: number; reverts: number; acceptances: number }>();

	for (const ep of outcomeEpisodes) {
		for (const neuron of ep.neurons!) {
			const existing = stats.get(neuron) || { sessions: 0, reverts: 0, acceptances: 0 };
			existing.sessions++;
			if (ep.outcome === 'revert') existing.reverts++;
			if (ep.outcome === 'acceptance') existing.acceptances++;
			stats.set(neuron, existing);
		}
	}

	// Format
	const lines: string[] = ['## Outcome Signals (from session history)\n'];
	lines.push('Neurons with high contra_ratio (>0.5) are consistently present in reverted sessions. Consider pruning or modifying them.\n');

	const sorted = [...stats.entries()].sort((a, b) => {
		const ratioA = a[1].sessions > 0 ? a[1].reverts / a[1].sessions : 0;
		const ratioB = b[1].sessions > 0 ? b[1].reverts / b[1].sessions : 0;
		return ratioB - ratioA;
	});

	for (const [neuron, s] of sorted) {
		const ratio = s.sessions > 0 ? (s.reverts / s.sessions).toFixed(2) : '0.00';
		const trend = parseFloat(ratio) > 0.5 ? '← act on this' : parseFloat(ratio) > 0.3 ? '← watch' : '';
		lines.push(`- ${neuron}: sessions=${s.sessions} reverts=${s.reverts} acceptances=${s.acceptances} contra_ratio=${ratio} ${trend}`);
	}

	lines.push('');
	return lines.join('\n');
}

// --- Session State Helpers ---

function readLatestSessionState(brainRoot: string): SessionState | null {
	const stateDir = join(brainRoot, SESSION_STATE_DIR);
	if (!existsSync(stateDir)) return null;

	let latest: { path: string; mtime: number } | null = null;
	try {
		for (const entry of readdirSync(stateDir)) {
			if (!entry.startsWith('state_') || !entry.endsWith('.json')) continue;
			const fullPath = join(stateDir, entry);
			const mtime = statSync(fullPath).mtimeMs;
			if (!latest || mtime > latest.mtime) {
				latest = { path: fullPath, mtime };
			}
		}
	} catch {
		return null;
	}

	if (!latest) return null;

	try {
		return JSON.parse(readFileSync(latest.path, 'utf8')) as SessionState;
	} catch {
		return null;
	}
}

/**
 * Filter out hebbian's own bookkeeping paths from git status lines.
 * Prevents session state files, digest logs, and episode logs from
 * being counted as "changes" in outcome detection.
 */
function filterHebbianPaths(statusLines: string[]): string[] {
	const hebbianPatterns = ['hippocampus/session_state', 'hippocampus/session_log', 'hippocampus/digest_log', '_inbox/'];
	return statusLines.filter((line) =>
		!hebbianPatterns.some((p) => line.includes(p)),
	);
}

function cleanupSessionState(brainRoot: string, uuid: string): void {
	const stateDir = join(brainRoot, SESSION_STATE_DIR);
	const filePath = join(stateDir, `state_${uuid}.json`);
	try {
		if (existsSync(filePath)) rmSync(filePath);
	} catch { /* best effort */ }
}
