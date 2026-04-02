// hebbian — Cross-Agent Feedback Daemon
//
// Scans the shared brain for new neurons since last check,
// then propagates WARN neurons to all agent brains.
// Prevents feedback loops via WARN_shared_ prefix convention.

import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SHARED_DIR, AGENTS_DIR, REGIONS } from './constants';
import { growNeuron } from './grow';
import { logEpisode } from './episode';

const WATERMARK_FILE = '_feedback_watermark.json';
const WARN_PREFIX = 'WARN_shared_';

export interface SharedNeuronDelta {
	path: string;
	counter: number;
	modTime: Date;
}

export interface FeedbackResult {
	scanned: number;
	propagated: number;
	agents: string[];
}

/**
 * Scan shared brain for neurons created/modified after the watermark.
 */
export function scanSharedBrain(brainRoot: string): SharedNeuronDelta[] {
	const sharedRoot = join(brainRoot, SHARED_DIR);
	if (!existsSync(sharedRoot)) return [];

	const watermark = readWatermark(sharedRoot);
	const deltas: SharedNeuronDelta[] = [];

	for (const region of REGIONS) {
		const regionPath = join(sharedRoot, region);
		if (!existsSync(regionPath)) continue;

		walkForNeurons(regionPath, regionPath, (neuronDir, counter) => {
			const modTime = statSync(neuronDir).mtime;
			if (modTime.getTime() <= watermark) return;

			const name = neuronDir.split('/').pop() || '';
			// Skip WARN_shared_ neurons (created by feedback, not by promotion)
			if (name.startsWith(WARN_PREFIX)) return;

			const relPath = region + '/' + neuronDir.slice(regionPath.length + 1);
			deltas.push({ path: relPath, counter, modTime });
		});
	}

	return deltas;
}

/**
 * Propagate shared brain deltas to all agent brains as WARN neurons.
 */
export function propagateToAgents(brainRoot: string, deltas: SharedNeuronDelta[]): FeedbackResult {
	const agentsDir = join(brainRoot, AGENTS_DIR);
	if (!existsSync(agentsDir) || deltas.length === 0) {
		return { scanned: deltas.length, propagated: 0, agents: [] };
	}

	const agentNames = readdirSync(agentsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
		.map((e) => e.name);

	let propagated = 0;
	const touchedAgents = new Set<string>();

	for (const delta of deltas) {
		const neuronName = delta.path.split('/').pop() || '';
		const warnPath = delta.path.replace(/\/([^/]+)$/, `/${WARN_PREFIX}${neuronName}`);

		for (const agent of agentNames) {
			const agentBrain = join(agentsDir, agent);
			// Verify this is a brain (has at least one region dir)
			if (!existsSync(join(agentBrain, 'cortex')) && !existsSync(join(agentBrain, 'brainstem'))) continue;

			try {
				growNeuron(agentBrain, warnPath);
				logEpisode(agentBrain, 'feedback', warnPath, `shared learning: ${delta.path}`);
				propagated++;
				touchedAgents.add(agent);
			} catch {
				// best-effort
			}
		}
	}

	return { scanned: deltas.length, propagated, agents: [...touchedAgents] };
}

/**
 * Main entry: scan shared brain, propagate to agents, update watermark.
 */
export function runFeedback(brainRoot: string): FeedbackResult {
	const deltas = scanSharedBrain(brainRoot);

	if (deltas.length === 0) {
		console.log('📡 feedback: no new shared neurons');
		return { scanned: 0, propagated: 0, agents: [] };
	}

	const result = propagateToAgents(brainRoot, deltas);

	// Update watermark to latest delta time
	const latestTime = Math.max(...deltas.map((d) => d.modTime.getTime()));
	writeWatermark(join(brainRoot, SHARED_DIR), latestTime);

	console.log(`📡 feedback: ${result.scanned} shared neuron(s) → ${result.propagated} warning(s) to ${result.agents.join(', ')}`);
	return result;
}

// --- Watermark Management ---

function readWatermark(sharedRoot: string): number {
	const wmPath = join(sharedRoot, WATERMARK_FILE);
	if (!existsSync(wmPath)) return 0;
	try {
		const data = JSON.parse(readFileSync(wmPath, 'utf8'));
		return data.timestamp || 0;
	} catch {
		return 0;
	}
}

function writeWatermark(sharedRoot: string, timestamp: number): void {
	const wmPath = join(sharedRoot, WATERMARK_FILE);
	mkdirSync(sharedRoot, { recursive: true });
	writeFileSync(wmPath, JSON.stringify({ timestamp, ts: new Date(timestamp).toISOString() }), 'utf8');
}

// --- Neuron Walker ---

function walkForNeurons(dir: string, regionRoot: string, cb: (neuronDir: string, counter: number) => void): void {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}

	const neuronFiles = entries.filter((e) => e.isFile() && /^\d+\.neuron$/.test(e.name));
	if (neuronFiles.length > 0) {
		const counter = Math.max(...neuronFiles.map((f) => parseInt(f.name, 10)));
		cb(dir, counter);
		return;
	}

	for (const entry of entries) {
		if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
		if (entry.isDirectory()) {
			walkForNeurons(join(dir, entry.name), regionRoot, cb);
		}
	}
}
