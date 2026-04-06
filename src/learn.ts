// hebbian — Agent-Driven Learning
//
// Called by the AI agent during conversation to register corrections in real-time.
// The agent (Claude/GPT/Gemini/etc.) detects corrections in any language and
// provides structured data. No regex needed — the agent IS the language model.
//
// Usage:
//   hebbian learn "correction text" [--prefix NO|DO|MUST|WARN] [--keywords "k1,k2,k3"]
//
// When --prefix and --keywords are provided, the agent's classification is used directly.
// When omitted, falls back to regex-based extraction (EN+KR only).

import { growCandidate } from './candidates';
import { logEpisode } from './episode';
import { extractCorrections as extractCorrectionsSync } from './digest';
import { checkAutoEvolve } from './config';
import type { NeuronMeta } from './types';

const VALID_PREFIXES = new Set(['NO', 'DO', 'MUST', 'WARN']);

export interface LearnOptions {
	text: string;
	prefix?: string;
	keywords?: string[];
}

export interface LearnResult {
	path: string;
	prefix: string;
	keywords: string[];
	source: 'agent' | 'regex';
}

/**
 * Register a correction from the agent. If prefix+keywords are provided,
 * uses them directly (agent-classified). Otherwise falls back to regex extraction.
 */
export function learn(brainRoot: string, opts: LearnOptions): LearnResult | null {
	let prefix: string;
	let keywords: string[];
	let source: 'agent' | 'regex';

	if (opts.prefix && opts.keywords && opts.keywords.length > 0) {
		// Agent-classified: trust the LLM's judgment
		prefix = opts.prefix.toUpperCase();
		if (!VALID_PREFIXES.has(prefix)) {
			prefix = 'DO'; // safe default
		}
		keywords = opts.keywords.slice(0, 3).map((k) => k.toLowerCase().replace(/[\s\/\\\.,:;!?'"<>{}()\[\]]/g, ''));
		source = 'agent';
	} else {
		// Fallback: regex extraction (EN+KR only)
		// Uses extractCorrections synchronously — imported at top level
		const corrections = extractCorrectionsSync([opts.text]);
		if (corrections.length === 0) return null;
		const c = corrections[0]!;
		prefix = c.prefix;
		keywords = c.keywords;
		source = 'regex';
	}

	if (keywords.length === 0) return null;

	const pathSegment = `${prefix}_${keywords.slice(0, 3).join('_')}`;
	const path = `cortex/${pathSegment}`;

	const meta: NeuronMeta = {
		keywords,
		source,
		created: new Date().toISOString(),
		description: opts.text.slice(0, 200),
	};
	growCandidate(brainRoot, path, meta);
	logEpisode(brainRoot, 'learn', path, opts.text);
	checkAutoEvolve(brainRoot);

	return { path, prefix, keywords, source };
}
