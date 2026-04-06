// hebbian — Brain Filesystem Scanner
//
// Walks the brain directory tree and builds a structured representation.
// Folders = neurons. Files = firing traces. Paths = sentences.
//
// Scan order follows subsumption priority (P0 brainstem → P6 prefrontal).
// Only recognizes the 7 canonical region names at the top level.

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { REGIONS, REGION_PRIORITY, MAX_DEPTH, SKILLS_DIR } from './constants';
import type { Neuron, NeuronMeta, Region, Brain } from './types';

/**
 * Scan a brain directory and return all regions with their neurons.
 */
export function scanBrain(brainRoot: string): Brain {
	const regions: Region[] = [];

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
 */
function walkRegion(dir: string, regionRoot: string, depth: number): Neuron[] {
	if (depth > MAX_DEPTH) return [];

	const neurons: Neuron[] = [];
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
	let counterFileName = '';

	for (const entry of entries) {
		if (entry.name.startsWith('_')) continue;

		if (entry.isFile()) {
			const name = entry.name;

			// N.neuron — excitatory counter
			if (name.endsWith('.neuron') && !name.startsWith('dopamine') && !name.startsWith('memory') && name !== 'bomb.neuron') {
				const n = parseInt(name, 10);
				if (!isNaN(n) && n > counter) {
					counter = n;
					counterFileName = name;
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

		// Read metadata from the counter file (if it has content)
		let meta: NeuronMeta | null = null;
		if (counterFileName) {
			try {
				const content = readFileSync(join(dir, counterFileName), 'utf8').trim();
				if (content) meta = JSON.parse(content) as NeuronMeta;
			} catch { /* empty or malformed = null */ }
		}

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
			meta,
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
 * Scan skills directory — returns flat array of skill neurons.
 * Skills are NOT part of the subsumption cascade.
 */
export function scanSkills(brainRoot: string): Neuron[] {
	const skillsPath = join(brainRoot, SKILLS_DIR);
	if (!existsSync(skillsPath)) return [];
	return walkRegion(skillsPath, skillsPath, 0);
}

/**
 * Read .axon file from a region directory.
 */
function readAxons(regionPath: string): string[] {
	const axonPath = join(regionPath, '.axon');
	if (!existsSync(axonPath)) return [];
	try {
		const content = readFileSync(axonPath, 'utf8').trim();
		return content.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
	} catch {
		return [];
	}
}
