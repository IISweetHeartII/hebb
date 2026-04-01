// hebbian — Outcome Tracking Tests (Phase 5)
//
// Tests captureSessionStart, detectOutcome, contraNeuron, buildOutcomeSummary,
// and classifyOutcome. Git-dependent tests use a real git repo in tmp dir.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setupTestBrain, neuron, addContra } from './fixtures/setup';
import { contraNeuron, getCurrentContra } from '../src/fire';
import { captureSessionStart, detectOutcome, buildOutcomeSummary, classifyOutcome } from '../src/outcome';
import { logEpisode, readEpisodes } from '../src/episode';
import type { SessionState } from '../src/outcome';

// --- Helpers ---

function setupGitBrain(): { root: string } {
	const { root } = setupTestBrain();
	execSync('git init', { cwd: root, stdio: 'pipe' });
	execSync('git config user.email "test@test.com"', { cwd: root, stdio: 'pipe' });
	execSync('git config user.name "Test"', { cwd: root, stdio: 'pipe' });
	execSync('git add -A && git commit -m "initial"', { cwd: root, stdio: 'pipe' });
	return { root };
}

function writeSessionState(root: string, state: SessionState): void {
	const stateDir = join(root, 'hippocampus/session_state');
	mkdirSync(stateDir, { recursive: true });
	writeFileSync(join(stateDir, `state_${state.uuid}.json`), JSON.stringify(state), 'utf8');
}

// --- contraNeuron ---

describe('contraNeuron', () => {
	let root: string;
	beforeEach(() => { root = setupTestBrain().root; });
	afterEach(() => { rmSync(root, { recursive: true, force: true }); });

	it('creates 1.contra on first contra', () => {
		const result = contraNeuron(root, 'cortex/frontend/禁console_log');
		expect(result).toBe(1);
		expect(existsSync(join(root, 'cortex/frontend/禁console_log/1.contra'))).toBe(true);
	});

	it('increments existing contra (1 → 2)', () => {
		addContra(root, 'cortex/frontend/禁console_log', 1);
		const result = contraNeuron(root, 'cortex/frontend/禁console_log');
		expect(result).toBe(2);
		expect(existsSync(join(root, 'cortex/frontend/禁console_log/2.contra'))).toBe(true);
		expect(existsSync(join(root, 'cortex/frontend/禁console_log/1.contra'))).toBe(false);
	});

	it('returns 0 for non-existent neuron dir', () => {
		const result = contraNeuron(root, 'cortex/does_not_exist');
		expect(result).toBe(0);
	});

	it('getCurrentContra reads highest N.contra', () => {
		addContra(root, 'ego/tone/concise', 3);
		expect(getCurrentContra(join(root, 'ego/tone/concise'))).toBe(3);
	});
});

// --- classifyOutcome (pure function, no git needed) ---

describe('classifyOutcome', () => {
	const baseState: SessionState = {
		ts: new Date().toISOString(),
		sha: 'abc1234',
		status: [],
		neurons: [],
		uuid: 'test-uuid',
	};

	it('returns null when status unchanged and HEAD unchanged (Case 1: no-op)', () => {
		const result = classifyOutcome(baseState, 'abc1234', []);
		expect(result).toBeNull();
	});

	it('returns acceptance when new files in status (Case 2: uncommitted work)', () => {
		const result = classifyOutcome(baseState, 'abc1234', ['M src/app.ts']);
		expect(result).toBe('acceptance');
	});

	it('returns revert when status items removed (Case 3: uncommitted undo)', () => {
		const stateWithFiles = { ...baseState, status: ['M src/app.ts', '?? new-file.ts'] };
		const result = classifyOutcome(stateWithFiles, 'abc1234', []);
		expect(result).toBe('revert');
	});

	it('returns acceptance when HEAD moved AND new uncommitted items exist', () => {
		const stateWithFiles = { ...baseState, status: ['M existing.ts'] };
		// HEAD moved AND new items in status → acceptance (uncommitted work trumps commit state)
		const result = classifyOutcome(stateWithFiles, 'def5678', ['M existing.ts', '?? brand-new.ts']);
		expect(result).toBe('acceptance');
	});

	it('returns null when HEAD moved but git commands fail (force push case)', () => {
		// sha doesn't exist in any real repo, execSync will fail
		const result = classifyOutcome(baseState, 'zzz9999', []);
		expect(result).toBeNull();
	});
});

// --- captureSessionStart (needs git repo) ---

describe('captureSessionStart', () => {
	let root: string;
	let origCwd: string;

	beforeEach(() => {
		origCwd = process.cwd();
		root = setupGitBrain().root;
		process.chdir(root);
	});

	afterEach(() => {
		process.chdir(origCwd);
		rmSync(root, { recursive: true, force: true });
	});

	it('captures SHA and neuron list', () => {
		const state = captureSessionStart(root);
		expect(state).not.toBeNull();
		expect(state!.sha).toMatch(/^[a-f0-9]{40}$/);
		expect(state!.neurons.length).toBeGreaterThan(0);
		expect(state!.uuid).toBeTruthy();

		// Session state file should exist
		const stateDir = join(root, 'hippocampus/session_state');
		const files = readdirSync(stateDir);
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^state_.*\.json$/);
	});

	it('handles empty brain', () => {
		// Create a minimal brain with empty regions
		const emptyRoot = join(root, '_empty_brain');
		for (const region of ['brainstem', 'limbic', 'hippocampus', 'sensors', 'cortex', 'ego', 'prefrontal']) {
			mkdirSync(join(emptyRoot, region), { recursive: true });
		}
		const state = captureSessionStart(emptyRoot);
		expect(state).not.toBeNull();
		expect(state!.neurons).toEqual([]);
	});

	it('overwrites stale session state', () => {
		captureSessionStart(root);
		const state2 = captureSessionStart(root);
		expect(state2).not.toBeNull();

		const stateDir = join(root, 'hippocampus/session_state');
		const files = readdirSync(stateDir);
		// Two files (keyed by UUID)
		expect(files.length).toBe(2);
	});
});

// --- detectOutcome (needs git repo) ---

describe('detectOutcome', () => {
	let root: string;
	let origCwd: string;

	beforeEach(() => {
		origCwd = process.cwd();
		root = setupGitBrain().root;
		process.chdir(root);
	});

	afterEach(() => {
		process.chdir(origCwd);
		rmSync(root, { recursive: true, force: true });
	});

	it('skips when no session state exists', () => {
		const result = detectOutcome(root);
		expect(result).toBeNull();
	});

	it('skips malformed session state', () => {
		const stateDir = join(root, 'hippocampus/session_state');
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(join(stateDir, 'state_bad.json'), 'not json', 'utf8');
		const result = detectOutcome(root);
		expect(result).toBeNull();
	});

	it('detects acceptance on new committed changes', () => {
		// Capture session start
		const state = captureSessionStart(root);
		expect(state).not.toBeNull();

		// Make a change and commit (only the specific file, not session state)
		writeFileSync(join(root, 'newfile.txt'), 'hello', 'utf8');
		execSync('git add newfile.txt && git commit -m "add file"', { cwd: root, stdio: 'pipe' });

		const result = detectOutcome(root);
		expect(result).not.toBeNull();
		expect(result!.outcome).toBe('acceptance');
	});

	it('detects acceptance on uncommitted changes', () => {
		const state = captureSessionStart(root);
		expect(state).not.toBeNull();

		// Make uncommitted change (outside brain dir so it shows in git status)
		writeFileSync(join(root, 'uncommitted.txt'), 'hello', 'utf8');

		const result = detectOutcome(root);
		expect(result).not.toBeNull();
		expect(result!.outcome).toBe('acceptance');
	});

	it('detects revert on net-zero diff', () => {
		const state = captureSessionStart(root);
		expect(state).not.toBeNull();

		// Make a commit with specific file, then revert it
		writeFileSync(join(root, 'temp.txt'), 'hello', 'utf8');
		execSync('git add temp.txt && git commit -m "temp"', { cwd: root, stdio: 'pipe' });
		execSync('git revert HEAD --no-edit', { cwd: root, stdio: 'pipe' });

		const result = detectOutcome(root);
		expect(result).not.toBeNull();
		expect(result!.outcome).toBe('revert');
	});

	it('contras active neurons on revert (skips protected regions)', () => {
		const state = captureSessionStart(root);
		expect(state).not.toBeNull();
		const activeNeurons = state!.neurons;
		const protectedCount = activeNeurons.filter((n) =>
			['brainstem', 'limbic', 'sensors'].includes(n.split('/')[0] || ''),
		).length;

		// Revert (add only specific file)
		writeFileSync(join(root, 'temp.txt'), 'hello', 'utf8');
		execSync('git add temp.txt && git commit -m "temp"', { cwd: root, stdio: 'pipe' });
		execSync('git revert HEAD --no-edit', { cwd: root, stdio: 'pipe' });

		const result = detectOutcome(root);
		expect(result).not.toBeNull();
		expect(result!.outcome).toBe('revert');
		expect(result!.protectedSkipped).toBe(protectedCount);
		expect(result!.neuronsAffected).toBeGreaterThan(0);
	});

	it('cleans up session state after detection', () => {
		captureSessionStart(root);

		// Make a change to trigger acceptance
		writeFileSync(join(root, 'change.txt'), 'hello', 'utf8');
		detectOutcome(root);

		const stateDir = join(root, 'hippocampus/session_state');
		const remaining = existsSync(stateDir) ? readdirSync(stateDir).filter((f) => f.endsWith('.json')) : [];
		expect(remaining.length).toBe(0);
	});

	it('returns null when SHA unchanged and no working tree changes (no-op)', () => {
		captureSessionStart(root);
		// No changes at all
		const result = detectOutcome(root);
		expect(result).toBeNull();
	});
});

// --- buildOutcomeSummary ---

describe('buildOutcomeSummary', () => {
	let root: string;
	afterEach(() => { rmSync(root, { recursive: true, force: true }); });

	it('returns empty string when no outcome episodes exist', () => {
		root = setupTestBrain().root;
		const summary = buildOutcomeSummary(root);
		expect(summary).toBe('');
	});

	it('aggregates mixed outcomes per neuron', () => {
		root = setupTestBrain().root;
		const neurons = ['cortex/frontend/禁console_log', 'ego/tone/concise'];

		// Log some outcome episodes
		logEpisode(root, 'session-end', '', 'outcome:acceptance', { outcome: 'acceptance', neurons });
		logEpisode(root, 'session-end', '', 'outcome:acceptance', { outcome: 'acceptance', neurons });
		logEpisode(root, 'session-end', '', 'outcome:revert', { outcome: 'revert', neurons });

		const summary = buildOutcomeSummary(root);
		expect(summary).toContain('## Outcome Signals');
		expect(summary).toContain('cortex/frontend/禁console_log');
		expect(summary).toContain('sessions=3');
		expect(summary).toContain('reverts=1');
		expect(summary).toContain('acceptances=2');
		expect(summary).toContain('contra_ratio=0.33');
	});
});

// --- Episode type extension ---

describe('Episode outcome field', () => {
	let root: string;
	afterEach(() => { rmSync(root, { recursive: true, force: true }); });

	it('round-trips outcome and neurons fields', () => {
		root = setupTestBrain().root;
		const neurons = ['cortex/test_neuron'];
		logEpisode(root, 'session-end', '', 'test', { outcome: 'revert', neurons });

		const episodes = readEpisodes(root);
		const latest = episodes[episodes.length - 1];
		expect(latest.outcome).toBe('revert');
		expect(latest.neurons).toEqual(neurons);
	});

	it('backward compatible — old episodes without outcome field work', () => {
		root = setupTestBrain().root;
		logEpisode(root, 'test', 'path', 'detail');

		const episodes = readEpisodes(root);
		const latest = episodes[episodes.length - 1];
		expect(latest.outcome).toBeUndefined();
		expect(latest.neurons).toBeUndefined();
	});
});
