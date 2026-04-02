// hebbian — Folder-as-Neuron Brain for Any AI Agent
//
// "Neurons that fire together, wire together." — Donald Hebb (1949)
//
// USAGE:
//   hebbian init <path>                     Create brain with 7 regions
//   hebbian emit <target> [--brain <path>]  Compile rules (claude/cursor/gemini/copilot/generic/all)
//   hebbian fire <neuron-path>              Increment neuron counter
//   hebbian grow <neuron-path>              Create neuron (with merge detection)
//   hebbian rollback <neuron-path>          Decrement counter (min=1)
//   hebbian signal <type> <neuron-path>     Add dopamine/bomb/memory signal
//   hebbian decay [--days N]                Mark inactive neurons dormant (default 30 days)
//   hebbian watch [--brain <path>]          Watch for changes + auto-recompile
//   hebbian claude install|uninstall|status Manage Claude Code hooks
//   hebbian digest [--transcript <path>]    Extract corrections from conversation
//   hebbian diag                            Print brain diagnostics
//   hebbian stats                           Print brain statistics

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import type { SignalType } from './constants';
import { resolveBrainRoot } from './constants';

// Read version from package.json — try both source and dist-relative paths
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const VERSION: string = (() => {
	for (const rel of ['../package.json', '../../package.json']) {
		try { return _require(rel).version; } catch { /* next */ }
	}
	return '0.0.0';
})();

const HELP = `
hebbian v${VERSION} — Folder-as-neuron brain for any AI agent.

  "Neurons that fire together, wire together." — Donald Hebb (1949)

USAGE:
  hebbian <command> [options]

COMMANDS:
  init <path>                     Create brain with 7 regions
  emit <target> [--brain <path>]  Compile rules (claude/cursor/gemini/copilot/generic/all)
  fire <neuron-path>              Increment neuron counter (+1)
  grow <neuron-path>              Create neuron (with merge detection)
  rollback <neuron-path>          Decrement neuron counter (min=1)
  signal <type> <neuron-path>     Add signal (dopamine/bomb/memory)
  decay [--days N]                Mark inactive neurons dormant (default 30)
  dedup                           Batch merge similar neurons (Jaccard >= 0.6)
  snapshot                        Git commit current brain state
  watch                           Watch for changes + auto-recompile
  api [--port N]                  Start REST API server (default 9090)
  inbox                           Process corrections inbox
  claude install|uninstall|status Manage Claude Code hooks
  digest [--transcript <path>]    Extract corrections from conversation
  candidates [promote]            List candidates or promote graduated ones
  evolve [--dry-run]              LLM-powered brain evolution (Gemini)
  evolve prune [--dry-run]        Pruning mode — remove stale/redundant neurons
  session start|end               Capture/detect session outcomes
  sessions                        Show session outcome history
  doctor                          Self-diagnostic (hooks, brain, versions)
  diag                            Print brain diagnostics
  stats                           Print brain statistics

OPTIONS:
  --brain <path>   Brain directory (default: $HEBBIAN_BRAIN or ./brain)
  --help, -h       Show this help
  --version, -v    Show version

EXAMPLES:
  hebbian init ./my-brain
  hebbian grow cortex/frontend/NO_console_log --brain ./my-brain
  hebbian fire cortex/frontend/NO_console_log --brain ./my-brain
  hebbian emit claude --brain ./my-brain
  hebbian emit all
  GEMINI_API_KEY=... hebbian evolve --dry-run
`.trim();

/** Read all data from stdin (non-blocking, returns empty string if no data). */
function readStdin(): Promise<string> {
	return new Promise((resolve) => {
		if (process.stdin.isTTY) {
			resolve('');
			return;
		}
		const chunks: Buffer[] = [];
		process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
		process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		process.stdin.on('error', () => resolve(''));
		// Timeout after 1s to avoid hanging
		setTimeout(() => {
			process.stdin.destroy();
			resolve(Buffer.concat(chunks).toString('utf8'));
		}, 1000);
	});
}

async function main(argv: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args: argv,
		options: {
			brain: { type: 'string', short: 'b' },
			days: { type: 'string', short: 'd' },
			port: { type: 'string', short: 'p' },
			transcript: { type: 'string', short: 't' },
			'dry-run': { type: 'boolean' },
			global: { type: 'boolean', short: 'g' },
			agent: { type: 'string', short: 'a' },
			help: { type: 'boolean', short: 'h' },
			version: { type: 'boolean', short: 'v' },
		},
		allowPositionals: true,
		strict: false,
	});

	if (values.version) {
		console.log(`hebbian v${VERSION}`);
		return;
	}

	const command = positionals[0];

	if (values.help || !command) {
		console.log(HELP);
		return;
	}

	let brainRoot = resolveBrainRoot(values.brain as string | undefined);

	// Multi-brain: --agent routes to brain/agents/{name}/
	const agentName = values.agent as string | undefined;
	if (agentName) {
		const { resolveAgentBrain } = await import('./constants');
		brainRoot = resolveAgentBrain(brainRoot, agentName);
	}

	switch (command) {
		case 'init': {
			const target = positionals[1];
			if (!target) {
				console.error('Usage: hebbian init <path>');
				process.exit(1);
			}
			const { initBrain } = await import('./init');
			await initBrain(resolve(target));
			break;
		}
		case 'emit': {
			const target = positionals[1];
			if (!target) {
				console.error('Usage: hebbian emit <target> (claude/cursor/gemini/copilot/generic/all)');
				process.exit(1);
			}
			const { emitToTarget } = await import('./emit');
			await emitToTarget(brainRoot, target);
			// Non-blocking update check — show banner if upgrade available
			const { checkForUpdates, formatUpdateBanner } = await import('./update-check');
			checkForUpdates(VERSION).then((status) => {
				const banner = formatUpdateBanner(status);
				if (banner) console.error(banner);
			}).catch(() => {});
			break;
		}
		case 'fire': {
			const neuronPath = positionals[1];
			if (!neuronPath) {
				console.error('Usage: hebbian fire <neuron-path>');
				process.exit(1);
			}
			const { fireNeuron } = await import('./fire');
			await fireNeuron(brainRoot, neuronPath);
			break;
		}
		case 'grow': {
			const neuronPath = positionals[1];
			if (!neuronPath) {
				console.error('Usage: hebbian grow <neuron-path>');
				process.exit(1);
			}
			const { growNeuron } = await import('./grow');
			await growNeuron(brainRoot, neuronPath);
			break;
		}
		case 'rollback': {
			const neuronPath = positionals[1];
			if (!neuronPath) {
				console.error('Usage: hebbian rollback <neuron-path>');
				process.exit(1);
			}
			const { rollbackNeuron } = await import('./rollback');
			await rollbackNeuron(brainRoot, neuronPath);
			break;
		}
		case 'signal': {
			const signalType = positionals[1];
			const neuronPath = positionals[2];
			if (!signalType || !neuronPath) {
				console.error('Usage: hebbian signal <type> <neuron-path>  (type: dopamine/bomb/memory)');
				process.exit(1);
			}
			const { signalNeuron } = await import('./signal');
			await signalNeuron(brainRoot, neuronPath, signalType as SignalType);
			break;
		}
		case 'decay': {
			const days = values.days ? parseInt(values.days as string, 10) : 30;
			const { runDecay } = await import('./decay');
			await runDecay(brainRoot, days);
			break;
		}
		case 'dedup': {
			const { runDedup } = await import('./dedup');
			runDedup(brainRoot);
			break;
		}
		case 'snapshot': {
			const { gitSnapshot } = await import('./snapshot');
			gitSnapshot(brainRoot);
			break;
		}
		case 'watch': {
			const { startWatch } = await import('./watch');
			await startWatch(brainRoot);
			break;
		}
		case 'api': {
			const port = values.port ? parseInt(values.port as string, 10) : 9090;
			const { startAPI } = await import('./api');
			startAPI(brainRoot, port);
			// Keep process alive — server handles shutdown
			await new Promise(() => {});
			break;
		}
		case 'inbox': {
			const { processInbox } = await import('./inbox');
			processInbox(brainRoot);
			break;
		}
		case 'claude': {
			const sub = positionals[1];
			const isGlobal = values.global === true;
			const { installHooks, uninstallHooks, checkHooks } = await import('./hooks');
			switch (sub) {
				case 'install': {
					// Global: require --brain flag or HEBBIAN_BRAIN env
					// Local: default to ./brain in project root
					const installBrain = values.brain
						? resolve(values.brain as string)
						: isGlobal
							? (process.env.HEBBIAN_BRAIN ? resolve(process.env.HEBBIAN_BRAIN) : '')
							: resolve('./brain');
					if (isGlobal && !installBrain) {
						console.error('❌ --global requires --brain <path> or HEBBIAN_BRAIN env var');
						process.exit(1);
					}
					installHooks(installBrain, undefined, isGlobal);
					break;
				}
				case 'uninstall':
					uninstallHooks(undefined, isGlobal);
					break;
				case 'status': {
					checkHooks(undefined, isGlobal);
					console.log(`   version: v${VERSION}`);
					const { checkForUpdates: checkUpdates, formatUpdateBanner: formatBanner } = await import('./update-check');
					const updateStatus = await checkUpdates(VERSION);
					const updateBanner = formatBanner(updateStatus);
					if (updateBanner) console.error(updateBanner);
					break;
				}
				default:
					console.error('Usage: hebbian claude <install|uninstall|status> [--global]');
					process.exit(1);
			}
			break;
		}
		case 'digest': {
			const transcriptFlag = values.transcript as string | undefined;
			const { digestTranscript, readHookInput } = await import('./digest');
			if (transcriptFlag) {
				digestTranscript(brainRoot, resolve(transcriptFlag));
			} else {
				// Read stdin for hook input
				const stdin = await readStdin();
				const hookInput = readHookInput(stdin);
				if (hookInput) {
					digestTranscript(brainRoot, hookInput.transcriptPath, hookInput.sessionId);
				} else {
					console.error('Usage: hebbian digest --transcript <path>');
					console.error('  Or pipe hook input via stdin (Claude Code Stop hook)');
					process.exit(1);
				}
			}
			break;
		}
		case 'candidates': {
			const subCmd = positionals[1];
			const { listCandidates, promoteCandidates } = await import('./candidates');
			if (subCmd === 'promote') {
				const result = promoteCandidates(brainRoot);
				console.log(`🎓 promoted: ${result.promoted.length}, decayed: ${result.decayed.length}`);
			} else {
				const candidates = listCandidates(brainRoot);
				if (candidates.length === 0) {
					console.log('No pending candidates');
				} else {
					console.log(`Candidates (promote at counter=${3}):`);
					for (const c of candidates) {
						const bar = '█'.repeat(c.counter) + '░'.repeat(Math.max(0, 3 - c.counter));
						console.log(`  ${bar} ${c.counter}/3  ${c.targetPath}  (${c.daysInactive}d idle)`);
					}
				}
			}
			break;
		}
		case 'evolve': {
			const dryRun = values['dry-run'] === true;
			const modeArg = positionals[1] === 'prune' ? 'prune' as const : 'default' as const;
			const { runEvolve } = await import('./evolve');
			await runEvolve(brainRoot, dryRun, modeArg);
			break;
		}
		case 'session': {
			const sub = positionals[1];
			const { captureSessionStart, detectOutcome } = await import('./outcome');
			switch (sub) {
				case 'start':
					captureSessionStart(brainRoot);
					break;
				case 'end':
					detectOutcome(brainRoot);
					break;
				default:
					console.error('Usage: hebbian session <start|end>');
					process.exit(1);
			}
			break;
		}
		case 'sessions': {
			const { readEpisodes } = await import('./episode');
			const episodes = readEpisodes(brainRoot).filter((e) => e.outcome);
			if (episodes.length === 0) {
				console.log('No session outcomes recorded yet');
			} else {
				console.log('Session Outcomes:');
				for (const ep of episodes.reverse()) {
					const icon = ep.outcome === 'revert' ? '🔄' : '✅';
					const neurons = ep.neurons ? `${ep.neurons.length} neurons` : '';
					console.log(`  ${icon} ${ep.ts.slice(0, 19)} ${ep.outcome} ${neurons}`);
				}
				console.log(`\nTotal: ${episodes.length} sessions`);
			}
			break;
		}
		case 'doctor': {
			const { runDoctor } = await import('./doctor');
			await runDoctor(brainRoot);
			break;
		}
		case 'cron': {
			const sub = positionals[1];
			const { installCron, uninstallCron, checkCron } = await import('./cron');
			switch (sub) {
				case 'install':
					installCron(brainRoot, 'prune');
					break;
				case 'uninstall':
					uninstallCron('prune');
					break;
				case 'status': {
					const status = checkCron('prune');
					console.log(`Pruning cron: ${status.installed ? '✅ installed' : '❌ not installed'}`);
					if (status.installed) console.log(`   ${status.path}`);
					const fbStatus = checkCron('feedback');
					console.log(`Feedback cron: ${fbStatus.installed ? '✅ installed' : '❌ not installed'}`);
					if (fbStatus.installed) console.log(`   ${fbStatus.path}`);
					break;
				}
				default:
					console.error('Usage: hebbian cron <install|uninstall|status>');
					process.exit(1);
			}
			break;
		}
		case 'feedback': {
			const sub = positionals[1];
			const { runFeedback } = await import('./feedback');
			switch (sub) {
				case 'scan':
					runFeedback(brainRoot);
					break;
				default:
					console.error('Usage: hebbian feedback <scan>');
					process.exit(1);
			}
			break;
		}
		case 'diag':
		case 'stats': {
			const { scanBrain } = await import('./scanner');
			const { runSubsumption } = await import('./subsumption');
			const brain = scanBrain(brainRoot);
			const result = runSubsumption(brain);
			const { printDiag } = await import('./emit');
			printDiag(brain, result);
			break;
		}
		default:
			console.error(`Unknown command: ${command}`);
			console.log(HELP);
			process.exit(1);
	}
}

main(process.argv.slice(2)).catch((err: Error) => {
	console.error(err.message);
	process.exit(1);
});
