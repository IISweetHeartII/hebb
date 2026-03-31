// hebb — Brain Filesystem Scanner
//
// Walks the brain directory tree and builds a structured representation.
// Folders = neurons. Files = firing traces. Paths = sentences.
//
// Scan order follows subsumption priority (P0 brainstem → P6 prefrontal).
// Only recognizes the 7 canonical region names at the top level.

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { REGIONS, REGION_PRIORITY, MAX_DEPTH } from './constants.js';

/**
 * @typedef {object} Neuron
 * @property {string} name       - Folder name (leaf)
 * @property {string} path       - Relative path from region root
 * @property {string} fullPath   - Absolute path on disk
 * @property {number} counter    - Excitatory counter (from N.neuron)
 * @property {number} contra     - Inhibitory counter (from N.contra)
 * @property {number} dopamine   - Reward counter (from dopamineN.neuron)
 * @property {number} intensity  - Net activation: counter - contra + dopamine
 * @property {number} polarity   - Net / total, range -1.0 to +1.0
 * @property {boolean} hasBomb   - bomb.neuron exists (circuit breaker)
 * @property {boolean} hasMemory - memoryN.neuron exists
 * @property {boolean} isDormant - *.dormant file exists
 * @property {number} depth      - Depth within region
 * @property {Date} modTime      - Most recent .neuron file modification time
 */

/**
 * @typedef {object} Region
 * @property {string} name
 * @property {number} priority
 * @property {string} path       - Absolute path to region directory
 * @property {Neuron[]} neurons
 * @property {string[]} axons    - Cross-region connections
 * @property {boolean} hasBomb   - Any neuron in region has bomb
 */

/**
 * @typedef {object} Brain
 * @property {string} root
 * @property {Region[]} regions
 */

/**
 * Scan a brain directory and return all regions with their neurons.
 * @param {string} brainRoot - Absolute path to brain root directory
 * @returns {Brain}
 */
export function scanBrain(brainRoot) {
	/** @type {Region[]} */
	const regions = [];

	for (const regionName of REGIONS) {
		const regionPath = join(brainRoot, regionName);
		if (!existsSync(regionPath)) {
			regions.push({
				name: regionName,
				priority: REGION_PRIORITY[regionName],
				path: regionPath,
				neurons: [],
				axons: [],
				hasBomb: false,
			});
			continue;
		}

		const neurons = walkRegion(regionPath, regionPath, 0);
		const axons = readAxons(regionPath);
		const hasBomb = neurons.some((n) => n.hasBomb);

		regions.push({
			name: regionName,
			priority: REGION_PRIORITY[regionName],
			path: regionPath,
			neurons,
			axons,
			hasBomb,
		});
	}

	return { root: brainRoot, regions };
}

/**
 * Recursively walk a region directory and collect neurons.
 * A neuron is any directory that contains at least one trace file
 * (*.neuron, *.contra, *.dormant, bomb.neuron).
 *
 * @param {string} dir - Current directory to scan
 * @param {string} regionRoot - Root of the region (for relative paths)
 * @param {number} depth - Current recursion depth
 * @returns {Neuron[]}
 */
function walkRegion(dir, regionRoot, depth) {
	if (depth > MAX_DEPTH) return [];

	/** @type {Neuron[]} */
	const neurons = [];
	let entries;

	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	// Parse trace files in this directory
	let counter = 0;
	let contra = 0;
	let dopamine = 0;
	let hasBomb = false;
	let hasMemory = false;
	let isDormant = false;
	let modTime = new Date(0);
	let hasTraceFile = false;

	for (const entry of entries) {
		if (entry.name.startsWith('_')) continue;

		if (entry.isFile()) {
			const name = entry.name;

			// N.neuron — excitatory counter
			if (name.endsWith('.neuron') && !name.startsWith('dopamine') && !name.startsWith('memory') && name !== 'bomb.neuron') {
				const n = parseInt(name, 10);
				if (!isNaN(n) && n > counter) {
					counter = n;
					hasTraceFile = true;
					try {
						const st = statSync(join(dir, name));
						if (st.mtime > modTime) modTime = st.mtime;
					} catch {}
				}
			}

			// N.contra — inhibitory counter
			if (name.endsWith('.contra')) {
				const n = parseInt(name, 10);
				if (!isNaN(n) && n > contra) {
					contra = n;
					hasTraceFile = true;
				}
			}

			// dopamineN.neuron — reward signal
			if (name.startsWith('dopamine') && name.endsWith('.neuron')) {
				const n = parseInt(name.replace('dopamine', ''), 10);
				if (!isNaN(n) && n > dopamine) {
					dopamine = n;
					hasTraceFile = true;
				}
			}

			// bomb.neuron — circuit breaker
			if (name === 'bomb.neuron') {
				hasBomb = true;
				hasTraceFile = true;
			}

			// memoryN.neuron — memory signal
			if (name.startsWith('memory') && name.endsWith('.neuron')) {
				hasMemory = true;
				hasTraceFile = true;
			}

			// *.dormant — dormancy marker
			if (name.endsWith('.dormant')) {
				isDormant = true;
				hasTraceFile = true;
			}
		}
	}

	// If this directory has trace files, it's a neuron
	if (hasTraceFile) {
		const relPath = relative(regionRoot, dir) || '.';
		const folderName = dir.split(sep).pop() || '';
		const total = counter + contra + dopamine;
		const intensity = counter - contra + dopamine;
		const polarity = total > 0 ? intensity / total : 0;

		neurons.push({
			name: folderName,
			path: relPath,
			fullPath: dir,
			counter,
			contra,
			dopamine,
			intensity,
			polarity: Math.round(polarity * 100) / 100,
			hasBomb,
			hasMemory,
			isDormant,
			depth,
			modTime,
		});
	}

	// Recurse into subdirectories
	for (const entry of entries) {
		if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
		if (entry.isDirectory()) {
			const subNeurons = walkRegion(join(dir, entry.name), regionRoot, depth + 1);
			neurons.push(...subNeurons);
		}
	}

	return neurons;
}

/**
 * Read .axon file from a region directory.
 * @param {string} regionPath
 * @returns {string[]}
 */
function readAxons(regionPath) {
	const axonPath = join(regionPath, '.axon');
	if (!existsSync(axonPath)) return [];
	try {
		const content = readFileSync(axonPath, 'utf8').trim();
		return content.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
	} catch {
		return [];
	}
}
