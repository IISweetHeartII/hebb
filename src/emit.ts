// hebbian — 3-Tier Emit System + Multi-Target Output
//
// Tier 1: Bootstrap (~500 tokens) — auto-loaded by AI (CLAUDE.md, .cursorrules, etc.)
// Tier 2: _index.md — brain overview (AI reads at conversation start)
// Tier 3: {region}/_rules.md — per-region detail (AI reads on demand)
//
// Multi-target: claude, cursor, gemini, copilot, generic, all

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { scanBrain } from './scanner';
import { runSubsumption } from './subsumption';
import {
	REGIONS, REGION_ICONS, REGION_KO, EMIT_TARGETS,
	EMIT_THRESHOLD, SPOTLIGHT_DAYS, MARKER_START, MARKER_END,
} from './constants';
import type { RegionName } from './constants';
import type { Neuron, Region, Brain, SubsumptionResult } from './types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 1: Bootstrap (~500 tokens)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate Tier 1 bootstrap content.
 */
export function emitBootstrap(result: SubsumptionResult, brain: Brain): string {
	const lines: string[] = [];
	const now = new Date().toISOString().replace(/\.\d+Z$/, '');

	lines.push(MARKER_START);
	lines.push(`<!-- Generated: ${now} -->`);
	lines.push('<!-- Axiom: Folder=Neuron | File=Trace | Path=Sentence -->');
	lines.push(`<!-- Active: ${result.firedNeurons}/${result.totalNeurons} neurons | Total activation: ${result.totalCounter} -->`);
	lines.push('');

	// Circuit breaker
	if (result.bombSource) {
		lines.push(`## \u{1F6A8} CIRCUIT BREAKER: ${result.bombSource}`);
		lines.push('**ALL OPERATIONS HALTED. REPAIR REQUIRED.**');
		lines.push('');
		lines.push(MARKER_END);
		return lines.join('\n');
	}

	lines.push('## hebbian Active Rules');
	lines.push('');

	// Persona (ego region)
	lines.push(`### ${REGION_ICONS.ego} Persona`);
	for (const region of result.activeRegions) {
		if (region.name === 'ego') {
			const top = sortedActive(region.neurons, 10);
			for (const n of top) {
				lines.push(`- ${pathToSentence(n.path)}`);
			}
			break;
		}
	}
	lines.push('');

	// Subsumption cascade
	lines.push('### \u{1F517} Subsumption Cascade');
	lines.push('```');
	lines.push('brainstem \u2190\u2192 limbic \u2190\u2192 hippocampus \u2190\u2192 sensors \u2190\u2192 cortex \u2190\u2192 ego \u2190\u2192 prefrontal');
	lines.push('  (P0)         (P1)       (P2)          (P3)       (P4)     (P5)      (P6)');
	lines.push('```');
	lines.push('Lower P always overrides higher P. bomb = full stop.');
	lines.push('');

	// TOP 5 brainstem rules
	lines.push(`### ${REGION_ICONS.brainstem} Core Directives TOP 5`);
	for (const region of result.activeRegions) {
		if (region.name === 'brainstem') {
			const top = sortedActive(region.neurons, 5);
			top.forEach((n, i) => {
				lines.push(`${i + 1}. **${pathToSentence(n.path)}**`);
			});
			break;
		}
	}
	lines.push('');

	// Active regions summary
	lines.push('### Active Regions');
	lines.push('| Region | Neurons | Activation |');
	lines.push('|--------|---------|------------|');
	for (const region of result.activeRegions) {
		const active = region.neurons.filter((n) => !n.isDormant);
		const activation = active.reduce((sum, n) => sum + n.intensity, 0);
		const icon = REGION_ICONS[region.name as RegionName] || '';
		lines.push(`| ${icon} ${region.name} | ${active.length} | ${activation} |`);
	}
	lines.push('');
	lines.push(MARKER_END);

	return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 2: Index (_index.md)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate Tier 2 brain index content.
 */
export function emitIndex(result: SubsumptionResult, brain: Brain): string {
	const lines: string[] = [];
	lines.push('# hebbian Brain Index');
	lines.push('');
	lines.push(`> ${result.firedNeurons} active / ${result.totalNeurons} total neurons | activation: ${result.totalCounter}`);
	lines.push('');

	if (result.bombSource) {
		lines.push(`## \u{1F6A8} CIRCUIT BREAKER: ${result.bombSource}`);
		lines.push('');
		return lines.join('\n');
	}

	// Top 10 neurons by intensity (counter - contra + dopamine)
	const allNeurons = result.activeRegions.flatMap((r) =>
		r.neurons.filter((n) => !n.isDormant && n.counter >= EMIT_THRESHOLD),
	);
	allNeurons.sort((a, b) => b.intensity - a.intensity);

	lines.push('## Top 10 Active Neurons');
	lines.push('| # | Path | Counter | Strength |');
	lines.push('|---|------|---------|----------|');
	for (const n of allNeurons.slice(0, 10)) {
		const strength = n.counter >= 10 ? '\u{1F534}' : n.counter >= 5 ? '\u{1F7E1}' : '\u26AA';
		lines.push(`| ${allNeurons.indexOf(n) + 1} | ${n.path} | ${n.counter} | ${strength} |`);
	}
	lines.push('');

	// Spotlight: new neurons (< SPOTLIGHT_DAYS old, counter < EMIT_THRESHOLD)
	const cutoff = new Date(Date.now() - SPOTLIGHT_DAYS * 24 * 60 * 60 * 1000);
	const spotlightNeurons = result.activeRegions.flatMap((r) =>
		r.neurons.filter((n) => !n.isDormant && n.counter < EMIT_THRESHOLD && n.modTime > cutoff),
	);
	if (spotlightNeurons.length > 0) {
		lines.push('## Spotlight (Probation)');
		for (const n of spotlightNeurons) {
			lines.push(`- ${n.path} (${n.counter}) — new`);
		}
		lines.push('');
	}

	// Per-region summary
	lines.push('## Regions');
	lines.push('| Region | Active | Dormant | Activation | Rules |');
	lines.push('|--------|--------|---------|------------|-------|');
	for (const region of result.activeRegions) {
		const active = region.neurons.filter((n) => !n.isDormant);
		const dormant = region.neurons.filter((n) => n.isDormant);
		const activation = active.reduce((sum, n) => sum + n.intensity, 0);
		const icon = REGION_ICONS[region.name as RegionName] || '';
		lines.push(`| ${icon} ${region.name} | ${active.length} | ${dormant.length} | ${activation} | [_rules.md](${region.name}/_rules.md) |`);
	}
	lines.push('');

	return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIER 3: Per-region rules ({region}/_rules.md)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate Tier 3 per-region rules content.
 */
export function emitRegionRules(region: Region): string {
	const icon = REGION_ICONS[region.name as RegionName] || '';
	const ko = REGION_KO[region.name as RegionName] || '';
	const active = region.neurons.filter((n) => !n.isDormant);
	const dormant = region.neurons.filter((n) => n.isDormant);
	const activation = active.reduce((sum, n) => sum + n.intensity, 0);

	const lines: string[] = [];
	lines.push(`# ${icon} ${region.name} (${ko})`);
	lines.push(`> Active: ${active.length} | Dormant: ${dormant.length} | Activation: ${activation}`);
	lines.push('');

	// Axons
	if (region.axons.length > 0) {
		lines.push('## Connections');
		for (const axon of region.axons) {
			lines.push(`- \u2194 ${axon}`);
		}
		lines.push('');
	}

	// Neuron tree
	if (active.length > 0) {
		lines.push('## Rules');
		const sorted = [...active].sort((a, b) => b.intensity - a.intensity);
		for (const n of sorted) {
			const indent = '  '.repeat(Math.min(n.depth, 4));
			const prefix = strengthPrefix(n.counter);
			const signals: string[] = [];
			if (n.dopamine > 0) signals.push(`\u{1F7E2}+${n.dopamine}`);
			if (n.hasBomb) signals.push('\u{1F4A3}');
			if (n.hasMemory) signals.push('\u{1F4BE}');
			const signalStr = signals.length > 0 ? ` ${signals.join(' ')}` : '';
			lines.push(`${indent}- ${prefix}${pathToSentence(n.path)} (${n.counter})${signalStr}`);
		}
		lines.push('');
	}

	// Dormant section
	if (dormant.length > 0) {
		lines.push('## Dormant');
		for (const n of dormant) {
			lines.push(`- ~~${pathToSentence(n.path)} (${n.counter})~~`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MULTI-TARGET OUTPUT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Emit rules to a specific target or all targets.
 */
export function emitToTarget(brainRoot: string, target: string): void {
	const brain = scanBrain(brainRoot);
	const result = runSubsumption(brain);
	const content = emitBootstrap(result, brain);

	if (target === 'all') {
		for (const [name, filePath] of Object.entries(EMIT_TARGETS)) {
			writeTarget(filePath, content);
			console.log(`\u{1F4E4} emitted: ${name} → ${filePath}`);
		}
	} else if (EMIT_TARGETS[target]) {
		writeTarget(EMIT_TARGETS[target], content);
		console.log(`\u{1F4E4} emitted: ${target} → ${EMIT_TARGETS[target]}`);
	} else {
		throw new Error(`Unknown target: ${target}. Valid: ${Object.keys(EMIT_TARGETS).join(', ')}, all`);
	}

	// Always write tier 2 + tier 3 into the brain
	writeAllTiers(brainRoot, result, brain);
}

/**
 * Write all 3 tiers into the brain directory.
 */
export function writeAllTiers(brainRoot: string, result: SubsumptionResult, brain: Brain): void {
	// Tier 2: _index.md
	const indexContent = emitIndex(result, brain);
	writeFileSync(join(brainRoot, '_index.md'), indexContent, 'utf8');

	// Tier 3: per-region _rules.md
	for (const region of result.activeRegions) {
		if (existsSync(region.path)) {
			const rulesContent = emitRegionRules(region);
			writeFileSync(join(region.path, '_rules.md'), rulesContent, 'utf8');
		}
	}
}

/**
 * Write content to a target file, using marker-based injection if file already exists.
 */
function writeTarget(filePath: string, content: string): void {
	const dir = dirname(filePath);
	if (dir !== '.' && !existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	if (existsSync(filePath)) {
		const existing = readFileSync(filePath, 'utf8');
		const startIdx = existing.indexOf(MARKER_START);
		const endIdx = existing.indexOf(MARKER_END);

		if (startIdx !== -1 && endIdx !== -1) {
			// Replace between markers, preserve surrounding content
			const before = existing.slice(0, startIdx);
			const after = existing.slice(endIdx + MARKER_END.length);
			writeFileSync(filePath, before + content + after, 'utf8');
			return;
		}

		// No markers yet — prepend brain block, preserve existing content
		writeFileSync(filePath, content + '\n\n' + existing, 'utf8');
		return;
	}

	writeFileSync(filePath, content, 'utf8');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DIAGNOSTICS (for CLI `hebbian diag` / `hebbian stats`)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Print brain diagnostics to stdout.
 */
export function printDiag(brain: Brain, result: SubsumptionResult): void {
	console.log('');
	console.log(`\u{1F9E0} hebbian Brain Diagnostics`);
	console.log(`   Root: ${brain.root}`);
	console.log(`   Neurons: ${result.firedNeurons} active / ${result.totalNeurons} total`);
	console.log(`   Activation: ${result.totalCounter}`);
	if (result.bombSource) {
		console.log(`   \u{1F4A3} BOMB: ${result.bombSource} — cascade halted!`);
	}
	console.log('');

	for (const region of brain.regions) {
		const icon = REGION_ICONS[region.name as RegionName] || '';
		const active = region.neurons.filter((n) => !n.isDormant);
		const dormant = region.neurons.filter((n) => n.isDormant);
		const activation = active.reduce((sum, n) => sum + n.intensity, 0);
		const isBlocked = result.blockedRegions.some((r) => r.name === region.name);
		const status = region.hasBomb ? '\u{1F4A3} BOMB' : isBlocked ? '\u{1F6AB} BLOCKED' : '\u2705 ACTIVE';

		console.log(`   ${icon} ${region.name} [${status}]`);
		console.log(`      neurons: ${active.length} active, ${dormant.length} dormant | activation: ${activation}`);

		if (region.axons.length > 0) {
			console.log(`      axons: ${region.axons.join(', ')}`);
		}

		const top3 = sortedActive(region.neurons, 3);
		for (const n of top3) {
			const contraStr = n.contra > 0 ? ` contra:${n.contra}` : '';
			console.log(`      \u251C ${n.path} (counter:${n.counter}${contraStr} intensity:${n.intensity})`);
		}
	}
	console.log('');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Convert a neuron relative path to a human-readable sentence. */
function pathToSentence(path: string): string {
	return path.replace(/\//g, ' > ').replace(/_/g, ' ');
}

/** Sort non-dormant neurons by intensity (descending), take first N. */
function sortedActive(neurons: Neuron[], n: number): Neuron[] {
	return [...neurons]
		.filter((neuron) => !neuron.isDormant)
		.sort((a, b) => b.intensity - a.intensity)
		.slice(0, n);
}

/** Strength prefix based on counter value. */
function strengthPrefix(counter: number): string {
	if (counter >= 10) return '**[ABSOLUTE]** ';
	if (counter >= 5) return '**[MUST]** ';
	return '';
}
