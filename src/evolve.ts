// hebbian — Evolve Engine (LLM-powered brain evolution)
//
// Reads recent episodes + current brain state, sends to an LLM,
// and applies proposed mutations (grow, fire, signal, prune, decay).
//
// Data flow:
//   readEpisodes() → scanBrain() → buildPrompt() → callGemini()
//     → parseActions() → validateActions() → executeActions()
//
// Currently supports Gemini only. Other providers (Groq, OpenAI,
// Anthropic, Ollama) planned for future expansion.

import { readEpisodes, logEpisode } from './episode';
import type { Episode } from './episode';
import { scanBrain } from './scanner';
import type { Brain } from './types';
import { REGIONS, REGION_PRIORITY } from './constants';
import { fireNeuron } from './fire';
import { growNeuron } from './grow';
import { signalNeuron } from './signal';
import { rollbackNeuron } from './rollback';
import { runDecay } from './decay';
import type { SignalType } from './constants';

// --- Types ---

export interface EvolveAction {
	type: 'grow' | 'fire' | 'signal' | 'prune' | 'decay';
	path: string;
	reason: string;
	signal?: string;
}

export interface EvolveResult {
	actions: EvolveAction[];
	executed: number;
	skipped: number;
	dryRun: boolean;
}

const MAX_ACTIONS = 10;
const PROTECTED_REGIONS = ['brainstem', 'limbic', 'sensors'];
const DEFAULT_MODEL = 'gemini-2.0-flash-lite';
const API_TIMEOUT = 30_000;
const RETRY_DELAY = 5_000;

// --- Main Entry ---

export async function runEvolve(brainRoot: string, dryRun: boolean): Promise<EvolveResult> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error('❌ GEMINI_API_KEY not set. Get one at https://aistudio.google.com/apikey');
		return { actions: [], executed: 0, skipped: 0, dryRun };
	}

	// 1. Gather context
	const episodes = readEpisodes(brainRoot);
	const brain = scanBrain(brainRoot);
	const summary = buildBrainSummary(brain);
	const prompt = buildPrompt(summary, episodes);

	// 2. Call LLM
	let rawActions: EvolveAction[];
	try {
		rawActions = await callGemini(prompt, apiKey);
	} catch (err) {
		const msg = (err as Error).message;
		console.log(`⏭️ evolve skipped: ${msg}`);
		logEpisode(brainRoot, 'evolve-error', '', msg);
		return { actions: [], executed: 0, skipped: 0, dryRun };
	}

	// 3. Validate
	const actions = validateActions(rawActions, brain);
	const skipped = rawActions.length - actions.length;

	if (actions.length === 0) {
		console.log('🧠 evolve: no valid actions proposed');
		return { actions: [], executed: 0, skipped, dryRun };
	}

	// 4. Execute (or dry-run)
	if (dryRun) {
		console.log(`🧠 evolve (dry-run): ${actions.length} action(s) proposed`);
		for (const action of actions) {
			console.log(`  ${actionIcon(action.type)} ${action.type} ${action.path} — ${action.reason}`);
		}
		return { actions, executed: 0, skipped, dryRun: true };
	}

	const executed = executeActions(brainRoot, actions);
	logEpisode(brainRoot, 'evolve', '', `${executed} action(s) executed, ${skipped} skipped`);
	console.log(`🧠 evolve: ${executed} action(s) executed, ${skipped} skipped`);

	return { actions, executed, skipped, dryRun: false };
}

// --- Brain Summary ---

export function buildBrainSummary(brain: Brain): string {
	const lines: string[] = ['# Brain State\n'];

	for (const region of brain.regions) {
		const neurons = region.neurons;
		if (neurons.length === 0 && !region.hasBomb) continue;

		lines.push(`## ${region.name} (P${REGION_PRIORITY[region.name as keyof typeof REGION_PRIORITY]})`);
		if (region.hasBomb) lines.push('⚠️ BOMB active — region blocked');

		for (const neuron of neurons) {
			const flags: string[] = [];
			if (neuron.isDormant) flags.push('dormant');
			if (neuron.hasBomb) flags.push('bomb');
			if (neuron.hasMemory) flags.push('memory');
			if (neuron.dopamine > 0) flags.push(`dopamine:${neuron.dopamine}`);
			const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
			lines.push(`- ${neuron.path} (counter:${neuron.counter}, intensity:${neuron.intensity})${flagStr}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

// --- Prompt Construction ---

export function buildPrompt(summary: string, episodes: Episode[]): string {
	const episodeLines = episodes.length > 0
		? episodes.map((e) => `- [${e.ts}] ${e.type}: ${e.path} — ${e.detail}`).join('\n')
		: '(no recent episodes)';

	return `You are the evolve engine for a hebbian brain — a filesystem-based memory system for AI agents.

## Axioms
- Folder = Neuron, File = Firing Trace, Counter = Activation strength
- 7 regions in subsumption cascade: brainstem(P0) > limbic(P1) > hippocampus(P2) > sensors(P3) > cortex(P4) > ego(P5) > prefrontal(P6)
- Lower priority ALWAYS overrides higher priority
- PROTECTED regions (brainstem, limbic, sensors): NEVER propose mutations for these

## Current Brain
${summary}

## Recent Episodes (last ${episodes.length})
${episodeLines}

## Available Actions
- grow: Create a new neuron at the given path (region/name). Use for recurring patterns that deserve permanent memory.
- fire: Increment an existing neuron's counter. Use for strengthening well-confirmed rules.
- signal: Add dopamine (reward), bomb (block), or memory signal. Use sparingly.
- prune: Decrement a neuron's counter. Use for rules that aren't working or cause issues.
- decay: Mark inactive neurons as dormant. Use for stale rules with no recent activity.

## Constraints
- Max ${MAX_ACTIONS} actions per cycle
- PREFER fire over grow — strengthen existing neurons before creating new ones
- NEVER target brainstem, limbic, or sensors regions
- Each action needs a "reason" explaining why

## Task
Analyze the brain state and recent episodes. Propose actions to improve the brain.
Focus on: strengthening repeatedly-used rules, pruning ineffective ones, growing new neurons from repeated patterns.

Respond with a JSON array of actions:
[{"type":"fire","path":"cortex/NO_console_log","reason":"fired 3 times in recent sessions"}]`;
}

// --- Gemini API ---

export async function callGemini(prompt: string, apiKey: string): Promise<EvolveAction[]> {
	const model = process.env.EVOLVE_MODEL || DEFAULT_MODEL;
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

	const body = {
		contents: [{ parts: [{ text: prompt }] }],
		generationConfig: {
			responseMimeType: 'application/json',
			temperature: 0.2,
		},
	};

	let lastError: Error | null = null;

	// Retry once on failure
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, RETRY_DELAY));
		}

		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(API_TIMEOUT),
			});

			if (!res.ok) {
				lastError = new Error(`Gemini API ${res.status}: ${res.statusText}`);
				continue;
			}

			const data = await res.json() as {
				candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
				error?: { message?: string };
			};

			if (data.error) {
				lastError = new Error(`Gemini error: ${data.error.message || 'unknown'}`);
				continue;
			}

			const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
			if (!text) {
				lastError = new Error('Gemini returned empty response');
				continue;
			}

			return parseActions(text);
		} catch (err) {
			lastError = err as Error;
			continue;
		}
	}

	throw lastError || new Error('Gemini call failed');
}

// --- Action Parsing ---

export function parseActions(text: string): EvolveAction[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 100)}`);
	}

	if (!Array.isArray(parsed)) {
		throw new Error('LLM response is not an array');
	}

	const validTypes = new Set(['grow', 'fire', 'signal', 'prune', 'decay']);
	const actions: EvolveAction[] = [];

	for (const item of parsed) {
		if (!item || typeof item !== 'object') continue;
		const { type, path, reason, signal } = item as Record<string, unknown>;
		if (typeof type !== 'string' || !validTypes.has(type)) continue;
		if (typeof path !== 'string' || path.length === 0) continue;
		if (typeof reason !== 'string') continue;

		const action: EvolveAction = { type: type as EvolveAction['type'], path, reason };
		if (type === 'signal' && typeof signal === 'string') {
			action.signal = signal;
		}
		actions.push(action);
	}

	return actions;
}

// --- Action Validation ---

export function validateActions(actions: EvolveAction[], _brain: Brain): EvolveAction[] {
	return actions
		.filter((action) => {
			const region = action.path.split('/')[0];
			if (!region || PROTECTED_REGIONS.includes(region)) {
				console.log(`   🛡️ blocked: ${action.type} ${action.path} (protected region)`);
				return false;
			}
			if (!(REGIONS as readonly string[]).includes(region)) {
				console.log(`   ⚠️ skipped: ${action.type} ${action.path} (invalid region)`);
				return false;
			}
			if (action.type === 'signal' && action.signal && !['dopamine', 'bomb', 'memory'].includes(action.signal)) {
				console.log(`   ⚠️ skipped: signal ${action.path} (invalid signal type: ${action.signal})`);
				return false;
			}
			return true;
		})
		.slice(0, MAX_ACTIONS);
}

// --- Action Execution ---

export function executeActions(brainRoot: string, actions: EvolveAction[]): number {
	let executed = 0;

	for (const action of actions) {
		try {
			switch (action.type) {
				case 'fire':
					fireNeuron(brainRoot, action.path);
					break;
				case 'grow':
					growNeuron(brainRoot, action.path);
					break;
				case 'signal':
					signalNeuron(brainRoot, action.path, (action.signal || 'dopamine') as SignalType);
					break;
				case 'prune':
					rollbackNeuron(brainRoot, action.path);
					break;
				case 'decay':
					runDecay(brainRoot, 0); // immediate decay for specified path
					break;
			}
			console.log(`   ${actionIcon(action.type)} ${action.type} ${action.path}`);
			executed++;
		} catch (err) {
			console.log(`   ⚠️ failed: ${action.type} ${action.path} — ${(err as Error).message}`);
		}
	}

	return executed;
}

function actionIcon(type: string): string {
	switch (type) {
		case 'fire': return '🔥';
		case 'grow': return '🌱';
		case 'signal': return '⚡';
		case 'prune': return '✂️';
		case 'decay': return '💤';
		default: return '❓';
	}
}
