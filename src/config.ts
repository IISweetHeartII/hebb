// hebbian — Brain Configuration
//
// Persistent config stored in brain/.config.json.
// Fire counter stored in brain/.fire_count for auto-evolution tracking.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BrainConfig {
	autoEvolveThreshold: number;
}

const DEFAULTS: BrainConfig = {
	autoEvolveThreshold: 0,
};

const CONFIG_FILE = '.config.json';
const FIRE_COUNT_FILE = '.fire_count';

/**
 * Read brain config. Returns defaults if no config file exists.
 */
export function readConfig(brainRoot: string): BrainConfig {
	const p = join(brainRoot, CONFIG_FILE);
	try {
		const raw = readFileSync(p, 'utf8').trim();
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw);
		return { ...DEFAULTS, ...parsed };
	} catch {
		return { ...DEFAULTS };
	}
}

/**
 * Write brain config. Merges partial updates with existing config.
 */
export function writeConfig(brainRoot: string, partial: Partial<BrainConfig> | Record<string, unknown>): void {
	const current = readConfig(brainRoot);
	const merged = { ...current, ...partial };
	writeFileSync(join(brainRoot, CONFIG_FILE), JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

/**
 * Read the cumulative fire counter.
 */
export function readFireCount(brainRoot: string): number {
	const p = join(brainRoot, FIRE_COUNT_FILE);
	try {
		return parseInt(readFileSync(p, 'utf8').trim(), 10) || 0;
	} catch {
		return 0;
	}
}

/**
 * Increment the fire counter and return the new value.
 */
export function incrementFireCount(brainRoot: string): number {
	const current = readFireCount(brainRoot);
	const next = current + 1;
	writeFileSync(join(brainRoot, FIRE_COUNT_FILE), String(next), 'utf8');
	return next;
}

/**
 * Reset the fire counter to 0.
 */
export function resetFireCount(brainRoot: string): void {
	writeFileSync(join(brainRoot, FIRE_COUNT_FILE), '0', 'utf8');
}

/**
 * Check if auto-evolution should trigger. Increments fire count,
 * and if threshold is reached, resets counter and triggers evolve (fire-and-forget).
 */
export function checkAutoEvolve(brainRoot: string): void {
	const config = readConfig(brainRoot);
	if (config.autoEvolveThreshold <= 0) return;

	const count = incrementFireCount(brainRoot);
	if (count >= config.autoEvolveThreshold) {
		resetFireCount(brainRoot);
		// Dynamic import to avoid circular dependency (evolve.ts → fire.ts → config.ts)
		import('./evolve').then(({ runEvolve }) => {
			runEvolve(brainRoot, false).catch(() => {});
		}).catch(() => {});
	}
}
