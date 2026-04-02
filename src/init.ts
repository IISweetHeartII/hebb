// hebbian — Brain Initialization
//
// Creates a brain directory with 7 canonical regions and starter neurons.
// Each region gets a _rules.md explaining its purpose.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REGIONS, REGION_ICONS, REGION_KO } from './constants';
import type { RegionName } from './constants';

interface RegionTemplate {
	description: string;
	starters: string[];
}

const REGION_TEMPLATES: Record<RegionName, RegionTemplate> = {
	brainstem: {
		description: 'Absolute principles. Immutable. Read-only conscience.\nP0 — highest priority. bomb here halts EVERYTHING.',
		starters: ['NO_fallback', 'DO_execute_not_debate'],
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
 */
export function initBrain(brainPath: string): void {
	if (existsSync(brainPath)) {
		const entries = readdirSync(brainPath);
		if (entries.some((e) => (REGIONS as readonly string[]).includes(e))) {
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

	// Create skills directory (Voyager-pattern skill library, outside subsumption cascade)
	mkdirSync(join(brainPath, 'skills'), { recursive: true });
	writeFileSync(
		join(brainPath, 'skills', '_rules.md'),
		'# Skills Library\n\nExecutable patterns learned through experience.\nNot part of the subsumption cascade — retrieval only.\n',
		'utf8',
	);

	// Auto-add brain path to .gitignore if in a git repo
	autoGitignore(brainPath);

	console.log(`\u{1F9E0} Brain initialized at ${brainPath}`);
	console.log(`   7 regions created: ${REGIONS.join(', ')}`);
	console.log('');
	console.log('   Next steps:');
	console.log(`   hebbian grow brainstem/NO_your_rule --brain ${brainPath}`);
	console.log(`   hebbian emit claude --brain ${brainPath}`);
}

/**
 * Auto-add brain directory to .gitignore if in a git repo.
 * Prevents personal learning data from leaking into shared repos.
 */
function autoGitignore(brainPath: string): void {
	// Walk up from brainPath to find .git
	let dir = dirname(brainPath);
	for (let i = 0; i < 10; i++) {
		if (existsSync(join(dir, '.git'))) {
			const gitignorePath = join(dir, '.gitignore');
			const brainDirName = brainPath.replace(dir + '/', '') + '/';

			if (existsSync(gitignorePath)) {
				const content = readFileSync(gitignorePath, 'utf8');
				if (content.includes(brainDirName) || content.includes(brainDirName.replace(/\/$/, ''))) {
					return; // already ignored
				}
			}

			appendFileSync(gitignorePath, `\n# hebbian brain (personal learning data)\n${brainDirName}\n`, 'utf8');
			console.log(`   \u{1F4DD} Added ${brainDirName} to .gitignore`);
			return;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
}
