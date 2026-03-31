// hebb — Signal Neuron (dopamine / bomb / memory)
//
// Signals are additional trace files placed in a neuron directory:
//   dopamineN.neuron — reward signal (positive reinforcement)
//   bomb.neuron      — circuit breaker (halts downstream regions)
//   memoryN.neuron   — memory marker (episodic recording)

import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SIGNAL_TYPES } from './constants.js';

/**
 * Add a signal to a neuron.
 *
 * @param {string} brainRoot - Absolute path to brain root
 * @param {string} neuronPath - Relative path
 * @param {string} signalType - One of: dopamine, bomb, memory
 * @throws {Error} If signal type is invalid or neuron doesn't exist
 */
export function signalNeuron(brainRoot, neuronPath, signalType) {
	if (!SIGNAL_TYPES.includes(signalType)) {
		throw new Error(`Invalid signal type: ${signalType}. Valid: ${SIGNAL_TYPES.join(', ')}`);
	}

	const fullPath = join(brainRoot, neuronPath);
	if (!existsSync(fullPath)) {
		throw new Error(`Neuron not found: ${neuronPath}`);
	}

	switch (signalType) {
		case 'bomb': {
			writeFileSync(join(fullPath, 'bomb.neuron'), '', 'utf8');
			console.log(`\u{1F4A3} bomb planted: ${neuronPath}`);
			break;
		}
		case 'dopamine': {
			const level = getNextSignalLevel(fullPath, 'dopamine');
			writeFileSync(join(fullPath, `dopamine${level}.neuron`), '', 'utf8');
			console.log(`\u{1F7E2} dopamine +${level}: ${neuronPath}`);
			break;
		}
		case 'memory': {
			const level = getNextSignalLevel(fullPath, 'memory');
			writeFileSync(join(fullPath, `memory${level}.neuron`), '', 'utf8');
			console.log(`\u{1F4BE} memory +${level}: ${neuronPath}`);
			break;
		}
	}
}

/**
 * Get the next signal level (current max + 1).
 * @param {string} dir
 * @param {string} prefix - "dopamine" or "memory"
 * @returns {number}
 */
function getNextSignalLevel(dir, prefix) {
	let max = 0;
	try {
		for (const entry of readdirSync(dir)) {
			if (entry.startsWith(prefix) && entry.endsWith('.neuron')) {
				const n = parseInt(entry.replace(prefix, ''), 10);
				if (!isNaN(n) && n > max) max = n;
			}
		}
	} catch {}
	return max + 1;
}
