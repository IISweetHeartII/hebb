// hebb — Decay (dormancy sweep)
//
// Neurons that haven't been touched in N days are marked dormant.
// Dormancy = *.dormant file in the neuron directory.
// Dormant neurons are excluded from emission and activation counts.
//
// "Most neurons die. Only the repeatedly fired ones survive." — Natural selection on OS.

import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS, MAX_DEPTH } from './constants.js';

/**
 * Sweep the brain and mark inactive neurons as dormant.
 *
 * @param {string} brainRoot - Absolute path to brain root
 * @param {number} days - Number of days of inactivity before dormancy
 * @returns {{ scanned: number, decayed: number }}
 */
export function runDecay(brainRoot, days) {
	const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
	let scanned = 0;
	let decayed = 0;

	for (const regionName of REGIONS) {
		const regionPath = join(brainRoot, regionName);
		if (!existsSync(regionPath)) continue;
		const result = decayWalk(regionPath, threshold, 0);
		scanned += result.scanned;
		decayed += result.decayed;
	}

	console.log(`\u{1F4A4} decay: scanned ${scanned} neurons, decayed ${decayed} (>${days} days inactive)`);
	return { scanned, decayed };
}

/**
 * @param {string} dir
 * @param {number} threshold - Timestamp threshold
 * @param {number} depth
 * @returns {{ scanned: number, decayed: number }}
 */
function decayWalk(dir, threshold, depth) {
	if (depth > MAX_DEPTH) return { scanned: 0, decayed: 0 };

	let scanned = 0;
	let decayed = 0;
	let entries;

	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return { scanned: 0, decayed: 0 };
	}

	// Check if this directory is a neuron (has .neuron files)
	let hasNeuronFile = false;
	let isDormant = false;
	let latestMod = 0;

	for (const entry of entries) {
		if (entry.isFile()) {
			if (entry.name.endsWith('.neuron')) {
				hasNeuronFile = true;
				try {
					const st = statSync(join(dir, entry.name));
					if (st.mtimeMs > latestMod) latestMod = st.mtimeMs;
				} catch {}
			}
			if (entry.name.endsWith('.dormant')) {
				isDormant = true;
			}
		}
	}

	if (hasNeuronFile) {
		scanned++;
		if (!isDormant && latestMod < threshold) {
			const age = Math.floor((Date.now() - latestMod) / (24 * 60 * 60 * 1000));
			writeFileSync(
				join(dir, 'decay.dormant'),
				`Dormant since ${new Date().toISOString()} (${age} days inactive)`,
				'utf8',
			);
			decayed++;
		}
	}

	// Recurse
	for (const entry of entries) {
		if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
		if (entry.isDirectory()) {
			const sub = decayWalk(join(dir, entry.name), threshold, depth + 1);
			scanned += sub.scanned;
			decayed += sub.decayed;
		}
	}

	return { scanned, decayed };
}
