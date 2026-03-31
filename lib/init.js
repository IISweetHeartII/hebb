// hebb — Brain Initialization
//
// Creates a brain directory with 7 canonical regions and starter neurons.
// Each region gets a _rules.md explaining its purpose.

import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS, REGION_ICONS, REGION_KO } from './constants.js';

/** @type {Record<string, { description: string, starters: string[] }>} */
const REGION_TEMPLATES = {
	brainstem: {
		description: 'Absolute principles. Immutable. Read-only conscience.\nP0 — highest priority. bomb here halts EVERYTHING.',
		starters: ['禁fallback', '推execute_not_debate'],
	},
	limbic: {
		description: 'Emotional filters and somatic markers.\nP1 — automatic, influences downstream regions.',
		starters: [],
	},
	hippocampus: {
		description: 'Memory and episode recording.\nP2 — accumulated experience, session logs.',
		starters: [],
	},
	sensors: {
		description: 'Environment constraints and input validation.\nP3 — read-only, set by environment.',
		starters: [],
	},
	cortex: {
		description: 'Knowledge and skills. The largest region.\nP4 — learnable, grows with corrections.',
		starters: [],
	},
	ego: {
		description: 'Personality, tone, and communication style.\nP5 — set by user preference.',
		starters: [],
	},
	prefrontal: {
		description: 'Goals, projects, and planning.\nP6 — lowest priority, longest time horizon.',
		starters: [],
	},
};

/**
 * Initialize a new brain directory with 7 regions.
 * @param {string} brainPath - Absolute path to create the brain at
 */
export function initBrain(brainPath) {
	if (existsSync(brainPath)) {
		const entries = readdirSync(brainPath);
		if (entries.some((e) => REGIONS.includes(e))) {
			console.log(`\u{26A0}\uFE0F  Brain already exists at ${brainPath}`);
			return;
		}
	}

	mkdirSync(brainPath, { recursive: true });

	for (const regionName of REGIONS) {
		const regionDir = join(brainPath, regionName);
		mkdirSync(regionDir, { recursive: true });

		const template = REGION_TEMPLATES[regionName];
		const icon = REGION_ICONS[regionName];
		const ko = REGION_KO[regionName];

		// Write _rules.md template
		writeFileSync(
			join(regionDir, '_rules.md'),
			`# ${icon} ${regionName} (${ko})\n\n${template.description}\n`,
			'utf8',
		);

		// Create starter neurons
		for (const starter of template.starters) {
			const neuronDir = join(regionDir, starter);
			mkdirSync(neuronDir, { recursive: true });
			writeFileSync(join(neuronDir, '1.neuron'), '', 'utf8');
		}
	}

	// Create _agents inbox
	mkdirSync(join(brainPath, '_agents', 'global_inbox'), { recursive: true });

	console.log(`\u{1F9E0} Brain initialized at ${brainPath}`);
	console.log(`   7 regions created: ${REGIONS.join(', ')}`);
	console.log('');
	console.log('   Next steps:');
	console.log(`   hebb grow brainstem/禁your_rule --brain ${brainPath}`);
	console.log(`   hebb emit claude --brain ${brainPath}`);
}
