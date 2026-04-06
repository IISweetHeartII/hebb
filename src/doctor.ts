// hebbian — Self-Diagnostic Command
//
// "Why isn't it working?" — checks hooks, brain integrity, versions, npx path.
// Each check emits a ✅/⚠️/❌ line with an actionable fix if broken.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { REGIONS } from './constants';

export interface DoctorResult {
	passed: number;
	warnings: number;
	failed: number;
}

export async function runDoctor(brainRoot: string): Promise<DoctorResult> {
	let passed = 0, warnings = 0, failed = 0;

	const ok  = (msg: string) => { console.log(`  ✅ ${msg}`); passed++; };
	const warn = (msg: string, fix?: string) => {
		console.log(`  ⚠️  ${msg}`);
		if (fix) console.log(`     → ${fix}`);
		warnings++;
	};
	const fail = (msg: string, fix?: string) => {
		console.log(`  ❌ ${msg}`);
		if (fix) console.log(`     → ${fix}`);
		failed++;
	};

	console.log('\n🩺 hebbian doctor\n');

	// ── Node.js version ──────────────────────────────────────────────
	console.log('Node.js');
	const nodeVer = process.versions.node;
	const [major] = nodeVer.split('.').map(Number);
	if ((major ?? 0) >= 22) {
		ok(`Node.js ${nodeVer} (>= 22 required)`);
	} else {
		fail(`Node.js ${nodeVer} — need >= 22`, 'nvm install 22 && nvm use 22');
	}

	// ── npm / package version ──────────────────────────────────────────
	console.log('\nnpm package');
	try {
		const pkgPath = new URL('../package.json', import.meta.url).pathname;
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
		const local = pkg.version || 'unknown';

		let remote = '';
		try {
			const out = execSync('npm view hebbian version 2>/dev/null', { timeout: 5000 }).toString().trim();
			remote = out;
		} catch { /* network unavailable */ }

		if (remote && remote !== local) {
			warn(`hebbian ${local} installed, ${remote} available`, 'npm i -g hebbian@latest');
		} else {
			ok(`hebbian ${local}${remote ? ' (up to date)' : ''}`);
		}
	} catch {
		warn('Could not read package.json');
	}

	// ── Brain structure ────────────────────────────────────────────────
	console.log('\nbrain structure');
	if (!existsSync(brainRoot)) {
		fail(`Brain not found at ${brainRoot}`, 'hebbian init ./brain');
	} else {
		ok(`Brain root: ${brainRoot}`);
		for (const region of REGIONS) {
			const regionDir = join(brainRoot, region);
			if (existsSync(regionDir)) {
				ok(`Region: ${region}`);
			} else {
				warn(`Missing region: ${region}`, `mkdir -p ${regionDir}`);
			}
		}
	}

	// ── Claude Code hooks ──────────────────────────────────────────────
	console.log('\nClaude Code hooks');
	const localSettingsPath = join(process.cwd(), '.claude', 'settings.local.json');
	const globalSettingsPath = join(homedir(), '.claude', 'settings.json');

	// Check both local and global settings for hooks
	let hasStop = false;
	let hasStart = false;
	let hookSource = '';

	for (const settingsPath of [localSettingsPath, globalSettingsPath]) {
		if (!existsSync(settingsPath)) continue;
		try {
			const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
				hooks?: Record<string, unknown[]>;
			};
			const hooks = settings.hooks || {};

			// Traverse nested hook structure: hooks[event][].hooks[].command
			const findCommand = (event: string, keyword: string): boolean =>
				Object.entries(hooks).some(([ev, entries]) =>
					ev === event && Array.isArray(entries) && entries.some((entry: unknown) => {
						if (typeof entry !== 'object' || entry === null) return false;
						const e = entry as Record<string, unknown>;
						// Check direct command (flat format)
						if (typeof e.command === 'string' && (e.command as string).includes(keyword)) return true;
						// Check nested hooks[].command (Claude Code format)
						if (Array.isArray(e.hooks)) {
							return (e.hooks as unknown[]).some((h: unknown) =>
								typeof h === 'object' && h !== null &&
								typeof (h as Record<string, unknown>).command === 'string' &&
								((h as Record<string, unknown>).command as string).includes(keyword),
							);
						}
						return false;
					}),
				);

			if (!hasStop && findCommand('Stop', 'hebbian digest')) {
				hasStop = true;
				hookSource = settingsPath === globalSettingsPath ? 'global' : 'local';
			}
			if (!hasStart && findCommand('SessionStart', 'hebbian emit')) {
				hasStart = true;
				if (!hookSource) hookSource = settingsPath === globalSettingsPath ? 'global' : 'local';
			}
		} catch {
			warn(`Malformed ${settingsPath === globalSettingsPath ? '~/.claude/settings.json' : '.claude/settings.local.json'}`, 'Check JSON syntax');
		}
	}

	if (hasStop && hasStart) {
		ok(`SessionStart + Stop hooks installed (${hookSource})`);
	} else if (!hasStop && !hasStart) {
		warn('No hebbian hooks found (checked local + global)', 'hebbian claude install');
	} else {
		if (!hasStart) warn('SessionStart hook missing', 'hebbian claude install');
		if (!hasStop) warn('Stop hook missing', 'hebbian claude install');
	}

	// ── npx path resolution ────────────────────────────────────────────
	console.log('\nnpx resolution');
	try {
		const resolved = execSync('which npx', { timeout: 3000 }).toString().trim();
		ok(`npx: ${resolved}`);
	} catch {
		fail('npx not found in PATH', 'Install Node.js from https://nodejs.org');
	}

	// ── Brain candidates ───────────────────────────────────────────────
	console.log('\ncandidates');
	try {
		let total = 0;
		for (const region of REGIONS) {
			const candidateDir = join(brainRoot, region, '_candidates');
			if (existsSync(candidateDir)) {
				const entries = readdirSync(candidateDir, { withFileTypes: true });
				const count = entries.filter(e => e.isDirectory()).length;
				total += count;
			}
		}
		if (total === 0) {
			ok('No pending candidates');
		} else {
			warn(`${total} candidate(s) pending`, 'hebbian candidates   — to view');
		}
	} catch {
		warn('Could not scan candidates');
	}

	// ── Configuration ──────────────────────────────────────────────────
	console.log('\nconfiguration');
	try {
		const { readConfig } = await import('./config');
		const config = readConfig(brainRoot);
		if (config.autoEvolveThreshold > 0) {
			if (!process.env.GEMINI_API_KEY) {
				warn(`Auto-evolve enabled (threshold: ${config.autoEvolveThreshold}) but GEMINI_API_KEY not set`, 'export GEMINI_API_KEY=... or set threshold to 0');
			} else {
				ok(`Auto-evolve enabled (threshold: ${config.autoEvolveThreshold})`);
			}
		} else {
			ok('Auto-evolve disabled (threshold: 0)');
		}
	} catch {
		warn('Could not read .config.json');
	}

	// ── Summary ────────────────────────────────────────────────────────
	console.log(`\n${'─'.repeat(40)}`);
	console.log(`  passed: ${passed}  warnings: ${warnings}  failed: ${failed}`);
	if (failed > 0) {
		console.log('  Fix the ❌ issues above, then re-run `hebbian doctor`');
	} else if (warnings > 0) {
		console.log('  Looking mostly good! Review ⚠️  warnings above.');
	} else {
		console.log('  All checks passed. 🎉');
	}
	console.log('');

	return { passed, warnings, failed };
}
