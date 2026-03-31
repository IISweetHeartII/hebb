import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dirname, '..', 'bin', 'hebb.js');

function run(args, opts = {}) {
	return execFileSync('node', [CLI, ...args], {
		encoding: 'utf8',
		timeout: 10000,
		...opts,
	});
}

describe('CLI', () => {
	it('--help shows usage', () => {
		const output = run(['--help']);
		assert.ok(output.includes('hebb'));
		assert.ok(output.includes('COMMANDS'));
		assert.ok(output.includes('init'));
		assert.ok(output.includes('emit'));
		assert.ok(output.includes('fire'));
		assert.ok(output.includes('grow'));
	});

	it('--version shows version', () => {
		const output = run(['--version']);
		assert.ok(output.includes('hebb v'));
	});

	it('no command shows help', () => {
		const output = run([]);
		assert.ok(output.includes('COMMANDS'));
	});

	it('unknown command exits with error', () => {
		assert.throws(() => run(['nonexistent']), (err) => {
			return err.status === 1;
		});
	});

	it('init creates 7 region directories', () => {
		const dir = mkdtempSync(join(tmpdir(), 'hebb-cli-init-'));
		const brainDir = join(dir, 'brain');
		run(['init', brainDir]);

		const regions = ['brainstem', 'limbic', 'hippocampus', 'sensors', 'cortex', 'ego', 'prefrontal'];
		for (const r of regions) {
			assert.ok(existsSync(join(brainDir, r)), `missing region: ${r}`);
			assert.ok(existsSync(join(brainDir, r, '_rules.md')), `missing _rules.md in ${r}`);
		}
	});

	it('grow creates a neuron', () => {
		const dir = mkdtempSync(join(tmpdir(), 'hebb-cli-grow-'));
		const brainDir = join(dir, 'brain');
		run(['init', brainDir]);

		const output = run(['grow', 'cortex/backend/禁raw_sql', '--brain', brainDir]);
		assert.ok(output.includes('grew'));
		assert.ok(existsSync(join(brainDir, 'cortex/backend/禁raw_sql', '1.neuron')));
	});

	it('fire increments counter', () => {
		const dir = mkdtempSync(join(tmpdir(), 'hebb-cli-fire-'));
		const brainDir = join(dir, 'brain');
		run(['init', brainDir]);
		run(['grow', 'cortex/test_rule', '--brain', brainDir]);

		const output = run(['fire', 'cortex/test_rule', '--brain', brainDir]);
		assert.ok(output.includes('fired'));
		assert.ok(existsSync(join(brainDir, 'cortex/test_rule', '2.neuron')));
	});

	it('emit claude creates CLAUDE.md', () => {
		const dir = mkdtempSync(join(tmpdir(), 'hebb-cli-emit-'));
		const brainDir = join(dir, 'brain');
		run(['init', brainDir]);

		run(['emit', 'claude', '--brain', brainDir], { cwd: dir });
		assert.ok(existsSync(join(dir, 'CLAUDE.md')));
	});

	it('diag shows brain diagnostics', () => {
		const dir = mkdtempSync(join(tmpdir(), 'hebb-cli-diag-'));
		const brainDir = join(dir, 'brain');
		run(['init', brainDir]);

		const output = run(['diag', '--brain', brainDir]);
		assert.ok(output.includes('Brain Diagnostics'));
		assert.ok(output.includes('brainstem'));
	});
});
