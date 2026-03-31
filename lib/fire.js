// hebb — Fire Neuron (increment counter)
//
// Firing = reinforcing a synaptic pathway.
// The counter file is renamed: N.neuron → (N+1).neuron

import { readdirSync, renameSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Increment a neuron's counter by 1.
 * If the neuron doesn't exist, auto-grows it with counter=1.
 *
 * @param {string} brainRoot - Absolute path to brain root
 * @param {string} neuronPath - Relative path (e.g. "cortex/frontend/禁console_log")
 * @returns {number} New counter value
 */
export function fireNeuron(brainRoot, neuronPath) {
	const fullPath = join(brainRoot, neuronPath);

	// Auto-grow if neuron doesn't exist
	if (!existsSync(fullPath)) {
		mkdirSync(fullPath, { recursive: true });
		writeFileSync(join(fullPath, '1.neuron'), '', 'utf8');
		console.log(`\u{1F331} grew + fired: ${neuronPath} (1)`);
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
	return newCounter;
}

/**
 * Get current counter value from the highest N.neuron file.
 * @param {string} dir
 * @returns {number}
 */
export function getCurrentCounter(dir) {
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
