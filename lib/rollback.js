// hebb — Rollback Neuron (decrement counter)
//
// Undo a firing. Counter cannot go below 1 (minimum activation).

import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentCounter } from './fire.js';

/**
 * Decrement a neuron's counter by 1. Minimum counter is 1.
 *
 * @param {string} brainRoot - Absolute path to brain root
 * @param {string} neuronPath - Relative path
 * @returns {number} New counter value
 * @throws {Error} If counter is already at minimum (1) or neuron doesn't exist
 */
export function rollbackNeuron(brainRoot, neuronPath) {
	const fullPath = join(brainRoot, neuronPath);
	const current = getCurrentCounter(fullPath);

	if (current === 0) {
		throw new Error(`Neuron not found: ${neuronPath}`);
	}

	if (current <= 1) {
		throw new Error(`Counter already at minimum (1): ${neuronPath}`);
	}

	const newCounter = current - 1;
	renameSync(join(fullPath, `${current}.neuron`), join(fullPath, `${newCounter}.neuron`));

	console.log(`\u{23EA} rollback: ${neuronPath} (${current} → ${newCounter})`);
	return newCounter;
}
