// hebbian — Candidate Neuron Staging
//
// New neurons from evolve/inbox/digest land in {region}/_candidates/{name}/
// instead of directly in the region. Candidates have a probation period:
//   - counter >= 3 → promote to parent region (graduate)
//   - not fired within 14 days → decay (remove)
//
// _candidates/ is already invisible to scan/emit/decay because the existing
// _ prefix convention filters it in scanner.ts and decay.ts.
//
// Directory layout example:
//   brain/cortex/_candidates/NO_console_log/1.neuron  ← counter=1
//   brain/cortex/NO_console_log/3.neuron              ← promoted (counter=3)

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { REGIONS, PROPAGATION_EPISODE_TYPES } from './constants';
import { growNeuron } from './grow';
import { fireNeuron } from './fire';
import { readEpisodes } from './episode';
import type { GrowResult } from './grow';
import type { NeuronMeta } from './types';

export const CANDIDATE_THRESHOLD = 3;
export const CANDIDATE_DECAY_DAYS = 14;
const CANDIDATE_SEGMENT = '_candidates';

export interface CandidateInfo {
	candidatePath: string;  // e.g. "cortex/_candidates/NO_console_log"
	targetPath: string;     // e.g. "cortex/NO_console_log"
	counter: number;
	daysInactive: number;
}

export interface PromoteResult {
	promoted: string[];
	decayed: string[];
}

// "cortex/NO_console_log" → "cortex/_candidates/NO_console_log"
export function toCandidatePath(neuronPath: string): string {
	const slash = neuronPath.indexOf('/');
	if (slash === -1) throw new Error(`Invalid neuron path (missing region): ${neuronPath}`);
	return `${neuronPath.slice(0, slash)}/${CANDIDATE_SEGMENT}/${neuronPath.slice(slash + 1)}`;
}

// "cortex/_candidates/NO_console_log" → "cortex/NO_console_log"
export function fromCandidatePath(candidatePath: string): string {
	return candidatePath.replace(`/${CANDIDATE_SEGMENT}/`, '/');
}

/**
 * Grow a candidate neuron. If the counter reaches threshold, promote to region.
 * Use instead of growNeuron() for evolve/inbox/digest flows.
 */
export function growCandidate(brainRoot: string, neuronPath: string, meta?: NeuronMeta): GrowResult & { promoted: boolean } {
	const candidatePath = toCandidatePath(neuronPath);
	const result = growNeuron(brainRoot, candidatePath, meta);

	if (result.counter >= CANDIDATE_THRESHOLD) {
		const ok = moveCandidate(brainRoot, candidatePath, neuronPath);
		if (ok) propagateToShared(brainRoot, neuronPath);
		return { ...result, path: ok ? neuronPath : result.path, promoted: ok };
	}

	console.log(`   🌱 candidate (${result.counter}/${CANDIDATE_THRESHOLD}): ${candidatePath}`);
	return { ...result, promoted: false };
}

/**
 * Move a candidate to its permanent location.
 * If target already exists, fires it instead and removes the candidate.
 */
function moveCandidate(brainRoot: string, candidatePath: string, targetPath: string): boolean {
	const src = join(brainRoot, candidatePath);
	if (!existsSync(src)) return false;

	const dst = join(brainRoot, targetPath);
	if (existsSync(dst)) {
		// Permanent neuron already exists — fire it, remove candidate
		fireNeuron(brainRoot, targetPath);
		rmSync(src, { recursive: true, force: true });
	} else {
		mkdirSync(dirname(dst), { recursive: true });
		renameSync(src, dst);
	}

	console.log(`🎓 promoted: ${candidatePath} → ${targetPath}`);
	return true;
}

/**
 * Scan all regions for candidates. Promote graduated ones, decay stale ones.
 * Call at start of `hebbian evolve` or via `hebbian candidates promote`.
 */
export function promoteCandidates(brainRoot: string): PromoteResult {
	const promoted: string[] = [];
	const decayed: string[] = [];
	const decayMs = CANDIDATE_DECAY_DAYS * 24 * 60 * 60 * 1000;
	const now = Date.now();

	for (const region of REGIONS) {
		const candidateRoot = join(brainRoot, region, CANDIDATE_SEGMENT);
		walkNeuronDirs(candidateRoot, (neuronDir) => {
			const rel = relative(join(brainRoot, region), neuronDir);
			const candidatePath = `${region}/${rel}`;
			const targetPath = fromCandidatePath(candidatePath);
			const counter = readCounter(neuronDir);
			const mtime = statSync(neuronDir).mtimeMs;

			if (counter >= CANDIDATE_THRESHOLD) {
				moveCandidate(brainRoot, candidatePath, targetPath);
				propagateToShared(brainRoot, targetPath);
				promoted.push(targetPath);
			} else if (now - mtime > decayMs) {
				rmSync(neuronDir, { recursive: true, force: true });
				decayed.push(candidatePath);
				console.log(`💀 candidate decayed: ${candidatePath}`);
			}
		});
	}

	return { promoted, decayed };
}

/**
 * List all pending candidates with their counters and inactivity.
 */
export function listCandidates(brainRoot: string): CandidateInfo[] {
	const results: CandidateInfo[] = [];
	const now = Date.now();

	for (const region of REGIONS) {
		const candidateRoot = join(brainRoot, region, CANDIDATE_SEGMENT);
		walkNeuronDirs(candidateRoot, (neuronDir) => {
			const rel = relative(join(brainRoot, region), neuronDir);
			const candidatePath = `${region}/${rel}`;
			const targetPath = fromCandidatePath(candidatePath);
			const counter = readCounter(neuronDir);
			const mtime = statSync(neuronDir).mtimeMs;
			const daysInactive = Math.floor((now - mtime) / (24 * 60 * 60 * 1000));
			results.push({ candidatePath, targetPath, counter, daysInactive });
		});
	}

	return results;
}

// Walk a directory tree, calling callback for directories that contain .neuron files.
function walkNeuronDirs(dir: string, cb: (neuronDir: string) => void): void {
	if (!existsSync(dir)) return;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		const hasNeuron = entries.some((e) => e.isFile() && e.name.endsWith('.neuron'));
		if (hasNeuron) {
			cb(dir);
			return; // neuron dirs don't contain sub-neurons
		}
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.startsWith('.')) {
				walkNeuronDirs(join(dir, entry.name), cb);
			}
		}
	} catch { /* skip unreadable dirs */ }
}

// Read the highest N from N.neuron files in a directory.
function readCounter(dir: string): number {
	try {
		const files = readdirSync(dir).filter((f) => /^\d+\.neuron$/.test(f));
		if (files.length === 0) return 0;
		return Math.max(...files.map((f) => parseInt(f, 10)));
	} catch {
		return 0;
	}
}

/**
 * Propagate a promoted neuron to the shared brain (cross-agent learning).
 * Only propagates if:
 *   1. Brain is in multi-brain mode (path contains /agents/)
 *   2. Recent episodes for this neuron include tool-failure or retry-pattern
 * Best-effort: never throws.
 */
export function propagateToShared(brainRoot: string, targetPath: string): boolean {
	try {
		// Detect multi-brain root: brain/agents/cto → brain/
		const agentsIdx = brainRoot.indexOf('/agents/');
		if (agentsIdx === -1) return false; // not in multi-brain mode

		const multiBrainRoot = brainRoot.slice(0, agentsIdx);
		const sharedRoot = join(multiBrainRoot, 'shared');
		if (!existsSync(sharedRoot)) return false;

		// Check if this neuron's episodes include propagation-worthy types
		const episodes = readEpisodes(brainRoot);
		const neuronName = targetPath.split('/').pop() || '';
		const hasRelevantEpisode = episodes.some(
			(ep) => (PROPAGATION_EPISODE_TYPES as readonly string[]).includes(ep.type)
				&& (ep.path.includes(neuronName) || ep.detail.includes(neuronName)),
		);

		if (!hasRelevantEpisode) return false;

		// Propagate to shared brain
		growNeuron(sharedRoot, targetPath);
		console.log(`   📡 propagated to shared: ${targetPath}`);
		return true;
	} catch {
		return false; // best-effort
	}
}
