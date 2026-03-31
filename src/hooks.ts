// hebbian — Claude Code Hooks Integration
//
// Manages Claude Code hooks in .claude/settings.local.json.
// Uses [hebbian] statusMessage marker for ownership tracking.
//
// SessionStart hook: refreshes CLAUDE.md with latest brain state
// Stop hook: digests conversation transcript for corrections

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HOOK_MARKER } from './constants';

const SETTINGS_DIR = '.claude';
const SETTINGS_FILE = 'settings.local.json';

export interface HookStatus {
	installed: boolean;
	path: string;
	events: string[];
}

interface HookEntry {
	type: string;
	command: string;
	timeout?: number;
	statusMessage?: string;
}

interface HookGroup {
	matcher?: string;
	hooks: HookEntry[];
}

/**
 * Install hebbian hooks into .claude/settings.local.json.
 * Deep-merges with existing settings. Uses statusMessage marker for ownership.
 */
export function installHooks(brainRoot: string, projectRoot?: string): void {
	const root = projectRoot || process.cwd();
	const settingsDir = join(root, SETTINGS_DIR);
	const settingsPath = join(settingsDir, SETTINGS_FILE);

	// Determine if we need --brain flag
	const defaultBrain = resolve(root, 'brain');
	const resolvedBrain = resolve(brainRoot);
	const brainFlag = resolvedBrain === defaultBrain ? '' : ` --brain ${resolvedBrain}`;

	// Read existing settings or start fresh
	let settings: Record<string, unknown> = {};
	if (existsSync(settingsPath)) {
		try {
			settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
		} catch {
			console.log(`\u26A0\uFE0F  settings.local.json was malformed, overwriting`);
		}
	}

	// Ensure hooks object exists
	if (!settings.hooks || typeof settings.hooks !== 'object') {
		settings.hooks = {};
	}
	const hooks = settings.hooks as Record<string, HookGroup[]>;

	// Define hebbian hooks
	const hebbianHooks: Array<{ event: string; matcher?: string; entry: HookEntry }> = [
		{
			event: 'SessionStart',
			matcher: 'startup|resume',
			entry: {
				type: 'command',
				command: `hebbian emit claude${brainFlag}`,
				timeout: 10,
				statusMessage: `${HOOK_MARKER} refreshing brain`,
			},
		},
		{
			event: 'Stop',
			entry: {
				type: 'command',
				command: `hebbian digest${brainFlag}`,
				timeout: 30,
				statusMessage: `${HOOK_MARKER} digesting session`,
			},
		},
	];

	// Install each hook
	for (const { event, matcher, entry } of hebbianHooks) {
		if (!hooks[event]) {
			hooks[event] = [];
		}

		// Find existing hebbian group for this event
		const existingIdx = hooks[event]!.findIndex((group) =>
			group.hooks.some((h) => h.statusMessage?.startsWith(HOOK_MARKER)),
		);

		const group: HookGroup = {
			...(matcher ? { matcher } : {}),
			hooks: [entry],
		};

		if (existingIdx >= 0) {
			// Update existing entry
			hooks[event]![existingIdx] = group;
		} else {
			// Append new entry
			hooks[event]!.push(group);
		}
	}

	// Write back
	if (!existsSync(settingsDir)) {
		mkdirSync(settingsDir, { recursive: true });
	}
	writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

	console.log(`\u2705 hebbian hooks installed at ${settingsPath}`);
	console.log(`   SessionStart \u2192 hebbian emit claude${brainFlag}`);
	console.log(`   Stop \u2192 hebbian digest${brainFlag}`);
}

/**
 * Remove hebbian hooks from .claude/settings.local.json.
 * Preserves non-hebbian hooks and other settings.
 */
export function uninstallHooks(projectRoot?: string): void {
	const root = projectRoot || process.cwd();
	const settingsPath = join(root, SETTINGS_DIR, SETTINGS_FILE);

	if (!existsSync(settingsPath)) {
		console.log('No hooks installed (settings.local.json not found)');
		return;
	}

	let settings: Record<string, unknown>;
	try {
		settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
	} catch {
		console.log('settings.local.json is malformed, nothing to uninstall');
		return;
	}

	if (!settings.hooks || typeof settings.hooks !== 'object') {
		console.log('No hooks found in settings.local.json');
		return;
	}

	const hooks = settings.hooks as Record<string, HookGroup[]>;
	let removed = 0;

	for (const event of Object.keys(hooks)) {
		const before = hooks[event]!.length;
		hooks[event] = hooks[event]!.filter(
			(group) => !group.hooks.some((h) => h.statusMessage?.startsWith(HOOK_MARKER)),
		);
		removed += before - hooks[event]!.length;

		// Clean up empty event arrays
		if (hooks[event]!.length === 0) {
			delete hooks[event];
		}
	}

	// Clean up empty hooks object
	if (Object.keys(hooks).length === 0) {
		delete settings.hooks;
	}

	writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
	console.log(`\u2705 removed ${removed} hebbian hook(s) from ${settingsPath}`);
}

/**
 * Check if hebbian hooks are installed.
 */
export function checkHooks(projectRoot?: string): HookStatus {
	const root = projectRoot || process.cwd();
	const settingsPath = join(root, SETTINGS_DIR, SETTINGS_FILE);

	const status: HookStatus = {
		installed: false,
		path: settingsPath,
		events: [],
	};

	if (!existsSync(settingsPath)) {
		console.log(`\u274C hebbian hooks not installed (${settingsPath} not found)`);
		return status;
	}

	let settings: Record<string, unknown>;
	try {
		settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
	} catch {
		console.log(`\u274C settings.local.json is malformed`);
		return status;
	}

	if (!settings.hooks || typeof settings.hooks !== 'object') {
		console.log(`\u274C no hooks in ${settingsPath}`);
		return status;
	}

	const hooks = settings.hooks as Record<string, HookGroup[]>;

	for (const event of Object.keys(hooks)) {
		const hasHebbian = hooks[event]!.some((group) =>
			group.hooks.some((h) => h.statusMessage?.startsWith(HOOK_MARKER)),
		);
		if (hasHebbian) {
			status.events.push(event);
		}
	}

	status.installed = status.events.length > 0;

	if (status.installed) {
		console.log(`\u2705 hebbian hooks installed at ${settingsPath}`);
		for (const event of status.events) {
			console.log(`   ${event} \u2714`);
		}
	} else {
		console.log(`\u274C hebbian hooks not found in ${settingsPath}`);
	}

	return status;
}
