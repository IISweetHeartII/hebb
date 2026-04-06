// Test fixture factory — mirrors NeuronFS Go setupTestBrain()
//
// Creates a temporary brain with 7 regions, 15+ neurons, and axon connections.
// Each test gets a fresh brain directory for isolation.

import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { NeuronMeta } from '../../src/types';

/**
 * Create a fully populated test brain in a temp directory.
 */
export function setupTestBrain(): { root: string } {
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
	neuron(root, 'prefrontal/project/hebbian_release', 10);
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
 */
export function neuron(root: string, path: string, counter: number, meta?: NeuronMeta): void {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	const content = meta ? JSON.stringify(meta) : '';
	writeFileSync(join(dir, `${counter}.neuron`), content, 'utf8');
}

/**
 * Create a bomb in a neuron directory.
 */
export function plantBomb(root: string, path: string): void {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'bomb.neuron'), '', 'utf8');
}

/**
 * Remove a bomb from a neuron directory.
 */
export function removeBomb(root: string, path: string): void {
	const bombPath = join(root, path, 'bomb.neuron');
	try { unlinkSync(bombPath); } catch {}
}


/**
 * Create a dormant marker in a neuron directory.
 */
export function markDormant(root: string, path: string): void {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'decay.dormant'), `Dormant since ${new Date().toISOString()}`, 'utf8');
}

/**
 * Create a dopamine signal in a neuron directory.
 */
export function addDopamine(root: string, path: string, level: number = 1): void {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `dopamine${level}.neuron`), '', 'utf8');
}

/**
 * Create a contra (inhibitory) signal in a neuron directory.
 */
export function addContra(root: string, path: string, counter: number): void {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${counter}.contra`), '', 'utf8');
}

/**
 * Create a memory signal in a neuron directory.
 */
export function addMemory(root: string, path: string, level: number = 1): void {
	const dir = join(root, path);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `memory${level}.neuron`), '', 'utf8');
}
