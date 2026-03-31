// Test fixture factory — mirrors NeuronFS Go setupTestBrain()
//
// Creates a temporary brain with 7 regions, 15+ neurons, and axon connections.
// Each test gets a fresh brain directory for isolation.

import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * Create a fully populated test brain in a temp directory.
 * @returns {{ root: string, cleanup: () => void }}
 */
export function setupTestBrain() {
	const root = mkdtempSync(join(tmpdir(), 'hebb-test-'));

	// ─── Region: brainstem (P0) ───
	neuron(root, 'brainstem/禁fallback', 103);
	neuron(root, 'brainstem/禁SSOT_duplicate', 100);
	neuron(root, 'brainstem/推execute_not_debate', 100);

	// ─── Region: limbic (P1) ───
	neuron(root, 'limbic/dopamine_reward', 50);
	neuron(root, 'limbic/frustration_detect', 30);

	// ─── Region: hippocampus (P2) ───
	neuron(root, 'hippocampus/error_patterns', 20);
	neuron(root, 'hippocampus/session_log', 15);

	// ─── Region: sensors (P3) ───
	neuron(root, 'sensors/environment/macos', 10);
	neuron(root, 'sensors/environment/zsh', 5);

	// ─── Region: cortex (P4) ───
	neuron(root, 'cortex/frontend/禁console_log', 40);
	neuron(root, 'cortex/methodology/plan_then_execute', 25);

	// ─── Region: ego (P5) ───
	neuron(root, 'ego/tone/concise', 60);
	neuron(root, 'ego/tone/data_driven', 45);

	// ─── Region: prefrontal (P6) ───
	neuron(root, 'prefrontal/project/hebb_release', 10);
	neuron(root, 'prefrontal/todo/write_tests', 8);

	// ─── Axon connections (brainstem ↔ limbic) ───
	const axonDir = join(root, 'brainstem');
	writeFileSync(join(axonDir, '.axon'), 'limbic', 'utf8');
	const axonDir2 = join(root, 'limbic');
	writeFileSync(join(axonDir2, '.axon'), 'brainstem', 'utf8');

	return { root };
}

/**
 * Create a single neuron (folder + counter file).
 * @param {string} root - Brain root directory
 * @param {string} path - Neuron path relative to root (e.g. "cortex/frontend/禁console_log")
 * @param {number} counter - Counter value for N.neuron file
 */
export function neuron(root, path, counter) {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${counter}.neuron`), '', 'utf8');
}

/**
 * Create a bomb in a neuron directory.
 * @param {string} root - Brain root directory
 * @param {string} path - Neuron path relative to root
 */
export function plantBomb(root, path) {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'bomb.neuron'), '', 'utf8');
}

/**
 * Remove a bomb from a neuron directory.
 * @param {string} root - Brain root directory
 * @param {string} path - Neuron path relative to root
 */
export function removeBomb(root, path) {
	const bombPath = join(root, path, 'bomb.neuron');
	try { unlinkSync(bombPath); } catch {}
}


/**
 * Create a dormant marker in a neuron directory.
 * @param {string} root - Brain root directory
 * @param {string} path - Neuron path relative to root
 */
export function markDormant(root, path) {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'decay.dormant'), `Dormant since ${new Date().toISOString()}`, 'utf8');
}

/**
 * Create a dopamine signal in a neuron directory.
 * @param {string} root - Brain root directory
 * @param {string} path - Neuron path relative to root
 * @param {number} [level=1] - Dopamine level
 */
export function addDopamine(root, path, level = 1) {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `dopamine${level}.neuron`), '', 'utf8');
}

/**
 * Create a contra (inhibitory) signal in a neuron directory.
 * @param {string} root - Brain root directory
 * @param {string} path - Neuron path relative to root
 * @param {number} counter - Contra counter value
 */
export function addContra(root, path, counter) {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${counter}.contra`), '', 'utf8');
}

/**
 * Create a memory signal in a neuron directory.
 * @param {string} root - Brain root directory
 * @param {string} path - Neuron path relative to root
 * @param {number} [level=1] - Memory level
 */
export function addMemory(root, path, level = 1) {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `memory${level}.neuron`), '', 'utf8');
}
