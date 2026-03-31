import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installHooks, uninstallHooks, checkHooks } from '../src/hooks';

function makeTempDir(): string {
	return mkdtempSync(join(tmpdir(), 'hebb-hooks-'));
}

function readSettings(projectRoot: string): Record<string, unknown> {
	const path = join(projectRoot, '.claude', 'settings.local.json');
	return JSON.parse(readFileSync(path, 'utf8'));
}

describe('hooks', () => {
	describe('installHooks', () => {
		it('creates .claude/settings.local.json when missing', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);

			expect(existsSync(join(dir, '.claude', 'settings.local.json'))).toBe(true);
		});

		it('creates .claude directory when missing', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);

			expect(existsSync(join(dir, '.claude'))).toBe(true);
		});

		it('writes SessionStart and Stop hooks', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, unknown[]>;
			expect(hooks.SessionStart).toBeDefined();
			expect(hooks.Stop).toBeDefined();
			expect(hooks.SessionStart).toHaveLength(1);
			expect(hooks.Stop).toHaveLength(1);
		});

		it('omits --brain flag for default brain path', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
			const emitCmd = hooks.SessionStart![0]!.hooks[0]!.command;
			expect(emitCmd).toBe('hebbian emit claude');
			expect(emitCmd).not.toContain('--brain');
		});

		it('bakes --brain flag for custom brain path', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'my-special-brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
			const emitCmd = hooks.SessionStart![0]!.hooks[0]!.command;
			expect(emitCmd).toContain('--brain');
			expect(emitCmd).toContain('my-special-brain');
		});

		it('merges with existing non-hebbian hooks', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			// Create existing settings with a user hook
			const claudeDir = join(dir, '.claude');
			mkdirSync(claudeDir, { recursive: true });
			writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify({
				hooks: {
					PreToolUse: [{
						matcher: 'Bash',
						hooks: [{ type: 'command', command: 'echo user-hook', timeout: 5 }],
					}],
				},
			}), 'utf8');

			installHooks(brainDir, dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, unknown[]>;
			// User hook preserved
			expect(hooks.PreToolUse).toHaveLength(1);
			// Hebbian hooks added
			expect(hooks.SessionStart).toHaveLength(1);
			expect(hooks.Stop).toHaveLength(1);
		});

		it('is idempotent (no duplicate on re-run)', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);
			installHooks(brainDir, dir);
			installHooks(brainDir, dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, unknown[]>;
			expect(hooks.SessionStart).toHaveLength(1);
			expect(hooks.Stop).toHaveLength(1);
		});

		it('includes [hebbian] statusMessage marker', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ statusMessage: string }> }>>;
			const msg = hooks.SessionStart![0]!.hooks[0]!.statusMessage;
			expect(msg).toContain('[hebbian]');
		});

		it('handles malformed existing settings.local.json', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });
			const claudeDir = join(dir, '.claude');
			mkdirSync(claudeDir, { recursive: true });
			writeFileSync(join(claudeDir, 'settings.local.json'), 'not valid json!!!', 'utf8');

			// Should not throw
			installHooks(brainDir, dir);

			const settings = readSettings(dir);
			expect(settings.hooks).toBeDefined();
		});
	});

	describe('uninstallHooks', () => {
		it('removes hebbian hooks', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);
			uninstallHooks(dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, unknown[]> | undefined;
			// Hooks object should be cleaned up
			expect(hooks).toBeUndefined();
		});

		it('preserves non-hebbian hooks', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			// Create settings with user hook + hebbian hooks
			const claudeDir = join(dir, '.claude');
			mkdirSync(claudeDir, { recursive: true });
			writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify({
				hooks: {
					PreToolUse: [{
						matcher: 'Bash',
						hooks: [{ type: 'command', command: 'echo user-hook' }],
					}],
				},
				someOtherSetting: true,
			}), 'utf8');

			installHooks(brainDir, dir);
			uninstallHooks(dir);

			const settings = readSettings(dir);
			const hooks = settings.hooks as Record<string, unknown[]>;
			expect(hooks.PreToolUse).toHaveLength(1);
			expect(settings.someOtherSetting).toBe(true);
		});

		it('handles missing settings.local.json gracefully', () => {
			const dir = makeTempDir();
			// Should not throw
			uninstallHooks(dir);
		});
	});

	describe('checkHooks', () => {
		it('reports not installed when no settings file', () => {
			const dir = makeTempDir();
			const status = checkHooks(dir);
			expect(status.installed).toBe(false);
			expect(status.events).toHaveLength(0);
		});

		it('reports installed with correct events', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);
			const status = checkHooks(dir);

			expect(status.installed).toBe(true);
			expect(status.events).toContain('SessionStart');
			expect(status.events).toContain('Stop');
		});

		it('reports not installed after uninstall', () => {
			const dir = makeTempDir();
			const brainDir = join(dir, 'brain');
			mkdirSync(brainDir, { recursive: true });

			installHooks(brainDir, dir);
			uninstallHooks(dir);
			const status = checkHooks(dir);

			expect(status.installed).toBe(false);
		});
	});
});
