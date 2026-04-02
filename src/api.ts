// hebbian — REST API Server
//
// Programmatic brain manipulation via HTTP. Zero dependencies (node:http).
// Enables external tools (n8n, webhooks, dashboards) to interact with hebbian.
//
// Port from: NeuronFS/runtime/main.go lines 2099-2434

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { scanBrain } from './scanner';
import { runSubsumption } from './subsumption';
import { fireNeuron } from './fire';
import { rollbackNeuron } from './rollback';
import { growNeuron } from './grow';
import { signalNeuron } from './signal';
import { runDecay } from './decay';
import { runDedup } from './dedup';
import { writeAllTiers } from './emit';
import { processInbox } from './inbox';
import { REGIONS, REGION_ICONS, REGION_KO, type SignalType } from './constants';
import type { RegionName } from './constants';

let lastAPIActivity = Date.now();

export interface ReportEntry {
	ts: string;
	message: string;
	priority: 'low' | 'normal' | 'high' | 'critical';
}

const pendingReports: ReportEntry[] = [];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON Response Builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildHealthJSON(brainRoot: string) {
	const brain = scanBrain(brainRoot);
	const result = runSubsumption(brain);
	return {
		status: 'ok',
		brain: brainRoot,
		neurons: result.totalNeurons,
		activeNeurons: result.firedNeurons,
		totalActivation: result.totalCounter,
		bombSource: result.bombSource || null,
		lastActivity: new Date(lastAPIActivity).toISOString(),
		uptime: process.uptime(),
	};
}

function buildBrainJSON(brainRoot: string) {
	const brain = scanBrain(brainRoot);
	const result = runSubsumption(brain);
	return {
		root: brain.root,
		regions: brain.regions.map((region) => ({
			name: region.name,
			icon: REGION_ICONS[region.name as RegionName] || '',
			ko: REGION_KO[region.name as RegionName] || '',
			priority: region.priority,
			hasBomb: region.hasBomb,
			neurons: region.neurons.map((n) => ({
				name: n.name,
				path: n.path,
				counter: n.counter,
				contra: n.contra,
				dopamine: n.dopamine,
				hasBomb: n.hasBomb,
				hasMemory: n.hasMemory,
				isDormant: n.isDormant,
				depth: n.depth,
				modTime: n.modTime.getTime(),
			})),
			axons: region.axons,
		})),
		bombSource: result.bombSource || null,
		firedNeurons: result.firedNeurons,
		totalNeurons: result.totalNeurons,
		totalCounter: result.totalCounter,
	};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTTP Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function json(res: ServerResponse, data: unknown, status = 200): void {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	});
	res.end(body);
}

function error(res: ServerResponse, message: string, status = 400): void {
	json(res, { error: message }, status);
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB

async function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		req.on('data', (chunk: Buffer) => {
			total += chunk.length;
			if (total > MAX_BODY_BYTES) {
				reject(new Error('Request body too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

async function parseJSON(req: IncomingMessage): Promise<Record<string, unknown>> {
	const body = await readBody(req);
	if (!body.trim()) return {};
	return JSON.parse(body) as Record<string, unknown>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Route Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleRequest(
	req: IncomingMessage,
	res: ServerResponse,
	brainRoot: string,
): Promise<void> {
	const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
	const path = url.pathname;
	const method = req.method || 'GET';

	// CORS preflight
	if (method === 'OPTIONS') {
		json(res, null, 204);
		return;
	}

	// Track activity on mutations
	const isMutation = method === 'POST';
	if (isMutation) lastAPIActivity = Date.now();

	try {
		// GET endpoints
		if (method === 'GET') {
			switch (path) {
				case '/api/health':
					json(res, buildHealthJSON(brainRoot));
					return;
				case '/api/brain':
					json(res, buildBrainJSON(brainRoot));
					return;
				case '/api/read': {
					const region = url.searchParams.get('region');
					if (!region || !(REGIONS as readonly string[]).includes(region)) {
						error(res, `Invalid region. Valid: ${REGIONS.join(', ')}`);
						return;
					}
					const brain = scanBrain(brainRoot);
					const result = runSubsumption(brain);
					const regionData = result.activeRegions.find((r) => r.name === region);
					if (!regionData) {
						error(res, `Region "${region}" is blocked or empty`);
						return;
					}
					// Auto-fire top 3 for RAG retrieval
					const top3 = [...regionData.neurons]
						.filter((n) => !n.isDormant)
						.sort((a, b) => b.counter - a.counter)
						.slice(0, 3);
					for (const n of top3) {
						fireNeuron(brainRoot, `${region}/${n.path}`);
					}
					json(res, {
						region: region,
						neurons: regionData.neurons,
						fired: top3.map((n) => n.path),
					});
					return;
				}
				case '/api/reports':
					json(res, { reports: pendingReports });
					return;
				default:
					error(res, 'Not found', 404);
					return;
			}
		}

		// POST endpoints
		if (method === 'POST') {
			const body = await parseJSON(req);

			switch (path) {
				case '/api/grow': {
					const neuronPath = body.path as string;
					if (!neuronPath) { error(res, 'Missing "path"'); return; }
					const result = growNeuron(brainRoot, neuronPath);
					json(res, result);
					return;
				}
				case '/api/fire': {
					const neuronPath = body.path as string;
					if (!neuronPath) { error(res, 'Missing "path"'); return; }
					const counter = fireNeuron(brainRoot, neuronPath);
					json(res, { path: neuronPath, counter });
					return;
				}
				case '/api/signal': {
					const neuronPath = body.path as string;
					const signalType = body.type as string;
					if (!neuronPath || !signalType) { error(res, 'Missing "path" or "type"'); return; }
					signalNeuron(brainRoot, neuronPath, signalType as SignalType);
					json(res, { path: neuronPath, type: signalType });
					return;
				}
				case '/api/rollback': {
					const neuronPath = body.path as string;
					if (!neuronPath) { error(res, 'Missing "path"'); return; }
					const counter = rollbackNeuron(brainRoot, neuronPath);
					json(res, { path: neuronPath, counter });
					return;
				}
				case '/api/decay': {
					const days = typeof body.days === 'number' ? body.days : 30;
					const result = runDecay(brainRoot, days);
					json(res, result);
					return;
				}
				case '/api/dedup': {
					const result = runDedup(brainRoot);
					json(res, result);
					return;
				}
				case '/api/inject': {
					const brain = scanBrain(brainRoot);
					const result = runSubsumption(brain);
					writeAllTiers(brainRoot, result, brain);
					json(res, { injected: true });
					return;
				}
				case '/api/inbox': {
					const result = processInbox(brainRoot);
					json(res, result);
					return;
				}
				case '/api/report': {
					const message = body.message as string;
					const priority = (body.priority as string) || 'normal';
					if (!message) { error(res, 'Missing "message"'); return; }
					const entry: ReportEntry = {
						ts: new Date().toISOString(),
						message,
						priority: priority as ReportEntry['priority'],
					};
					pendingReports.push(entry);
					json(res, entry);
					return;
				}
				default:
					error(res, 'Not found', 404);
					return;
			}
		}

		error(res, 'Method not allowed', 405);
	} catch (err) {
		error(res, (err as Error).message, 500);
	}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Server
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Start the hebbian REST API server.
 */
export function startAPI(brainRoot: string, port = 9090): ReturnType<typeof createServer> {
	const server = createServer((req, res) => {
		handleRequest(req, res, brainRoot).catch((err) => {
			error(res, (err as Error).message, 500);
		});
	});

	server.listen(port, () => {
		console.log(`🧠 hebbian API listening on http://localhost:${port}`);
		console.log(`   Brain: ${brainRoot}`);
		console.log('');
		console.log('   Endpoints:');
		console.log('   GET  /api/health          Process health + brain stats');
		console.log('   GET  /api/brain           Full brain state JSON');
		console.log('   GET  /api/read?region=X   Read region (auto-fires top 3)');
		console.log('   GET  /api/reports         List pending reports');
		console.log('   POST /api/grow            {"path":"cortex/..."}');
		console.log('   POST /api/fire            {"path":"cortex/..."}');
		console.log('   POST /api/signal          {"path":"...","type":"dopamine"}');
		console.log('   POST /api/rollback        {"path":"cortex/..."}');
		console.log('   POST /api/decay           {"days":30}');
		console.log('   POST /api/dedup           Batch merge similar neurons');
		console.log('   POST /api/inject          Force re-emit all tiers');
		console.log('   POST /api/inbox           Process corrections inbox');
		console.log('   POST /api/report          {"message":"...","priority":"normal"}');
	});

	return server;
}

/**
 * Get the last API activity timestamp.
 */
export function getLastActivity(): number {
	return lastAPIActivity;
}

/**
 * Get pending reports (for external access).
 */
export function getPendingReports(): ReportEntry[] {
	return pendingReports;
}

/**
 * Clear pending reports.
 */
export function clearReports(): void {
	pendingReports.length = 0;
}
