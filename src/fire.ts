// hebbian — Fire Neuron (increment counter)
//
// Firing = reinforcing a synaptic pathway.
// The counter file is renamed: N.neuron → (N+1).neuron

import { readdirSync, renameSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NeuronMeta } from './types';
import { checkAutoEvolve } from './config';

/**
 * Increment a neuron's counter by 1.
 * If the neuron doesn't exist, auto-grows it with counter=1.
 */
export function fireNeuron(brainRoot: string, neuronPath: string, meta?: NeuronMeta): number {
	const fullPath = join(brainRoot, neuronPath);

	// Auto-grow if neuron doesn't exist
	if (!existsSync(fullPath)) {
		mkdirSync(fullPath, { recursive: true });
		const content = meta ? JSON.stringify(meta) : '';
		writeFileSync(join(fullPath, '1.neuron'), content, 'utf8');
		console.log(`\u{1F331} grew + fired: ${neuronPath} (1)`);
		checkAutoEvolve(brainRoot);
		return 1;
	}

	// Find current counter
	const current = getCurrentCounter(fullPath);
	const newCounter = current + 1;

	// Rename: N.neuron → (N+1).neuron
	if (current > 0) {
		renameSync(join(fullPath, `${current}.neuron`), join(fullPath, `${newCounter}.neuron`));
	} else {
		writeFileSync(join(fullPath, `${newCounter}.neuron`), '', 'utf8');
	}

	console.log(`\u{1F525} fired: ${neuronPath} (${current} → ${newCounter})`);
	checkAutoEvolve(brainRoot);
	return newCounter;
}

/**
 * Increment a neuron's contra (inhibitory) counter by 1.
 * Creates 1.contra if none exists, renames N.contra → (N+1).contra otherwise.
 * If the neuron directory doesn't exist, returns 0 (don't auto-create).
 */
export function contraNeuron(brainRoot: string, neuronPath: string): number {
	const fullPath = join(brainRoot, neuronPath);

	if (!existsSync(fullPath)) {
		return 0;
	}

	const current = getCurrentContra(fullPath);
	const newContra = current + 1;

	if (current > 0) {
		renameSync(join(fullPath, `${current}.contra`), join(fullPath, `${newContra}.contra`));
	} else {
		writeFileSync(join(fullPath, `${newContra}.contra`), '', 'utf8');
	}

	return newContra;
}

/**
 * Get current contra value from the highest N.contra file.
 */
export function getCurrentContra(dir: string): number {
	let max = 0;
	try {
		for (const entry of readdirSync(dir)) {
			if (entry.endsWith('.contra')) {
				const n = parseInt(entry, 10);
				if (!isNaN(n) && n > max) max = n;
			}
		}
	} catch {}
	return max;
}

/**
 * Get current counter value from the highest N.neuron file.
 */
export function getCurrentCounter(dir: string): number {
	let max = 0;
	try {
		for (const entry of readdirSync(dir)) {
			if (entry.endsWith('.neuron') && !entry.startsWith('dopamine') && !entry.startsWith('memory') && entry !== 'bomb.neuron') {
				const n = parseInt(entry, 10);
				if (!isNaN(n) && n > max) max = n;
			}
		}
	} catch {}
	return max;
}
