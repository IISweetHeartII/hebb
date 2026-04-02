// hebbian — Constants & Configuration
//
// AXIOMS:
//   1. Folder = Neuron (name is meaning, depth is specificity)
//   2. File = Firing Trace (N.neuron = counter, dopamineN = reward, bomb = pain)
//   3. Path = Sentence (brain/cortex/quality/no_hardcoded → "cortex > quality > no_hardcoded")
//   4. Counter = Activation (higher = stronger/myelinated path)
//   5. AI writes back (counter increment = experience growth)

export const REGIONS = [
	'brainstem',
	'limbic',
	'hippocampus',
	'sensors',
	'cortex',
	'ego',
	'prefrontal',
] as const;

export type RegionName = (typeof REGIONS)[number];

export const REGION_PRIORITY: Record<RegionName, number> = {
	brainstem: 0,
	limbic: 1,
	hippocampus: 2,
	sensors: 3,
	cortex: 4,
	ego: 5,
	prefrontal: 6,
};

export const REGION_ICONS: Record<RegionName, string> = {
	brainstem: '🛡️',
	limbic: '💓',
	hippocampus: '📝',
	sensors: '👁️',
	cortex: '🧠',
	ego: '🎭',
	prefrontal: '🎯',
};

export const REGION_KO: Record<RegionName, string> = {
	brainstem: '양심/본능',
	limbic: '감정 필터',
	hippocampus: '기록/기억',
	sensors: '환경 제약',
	cortex: '지식/기술',
	ego: '성향/톤',
	prefrontal: '목표/계획',
};

export const EMIT_THRESHOLD = 5;
export const SPOTLIGHT_DAYS = 7;
export const JACCARD_THRESHOLD = 0.6;
export const DECAY_DAYS = 30;
export const MAX_DEPTH = 6;

export const EMIT_TARGETS: Record<string, string> = {
	gemini: '.gemini/GEMINI.md',
	cursor: '.cursorrules',
	claude: 'CLAUDE.md',
	copilot: '.github/copilot-instructions.md',
	generic: '.neuronrc',
};

export const SIGNAL_TYPES = ['dopamine', 'bomb', 'memory'] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const MARKER_START = '<!-- HEBBIAN:START -->';
export const MARKER_END = '<!-- HEBBIAN:END -->';

// Hook ownership marker — used to identify hebbian-managed hooks in settings.local.json
export const HOOK_MARKER = '[hebbian]';

// Digest constants
export const MAX_CORRECTIONS_PER_SESSION = 10;
export const MIN_CORRECTION_LENGTH = 15;
export const DIGEST_LOG_DIR = 'hippocampus/digest_log';

// Phase 5: Outcome tracking
export const OUTCOME_TYPES = ['revert', 'acceptance'] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];
export const SESSION_STATE_DIR = 'hippocampus/session_state';
export const PROTECTED_REGIONS_CONTRA = ['brainstem', 'limbic', 'sensors'];

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/** Resolve brain root path from flag, env var, or defaults */
export function resolveBrainRoot(brainFlag?: string): string {
	if (brainFlag) return resolve(brainFlag);
	if (process.env.HEBBIAN_BRAIN) return resolve(process.env.HEBBIAN_BRAIN);
	if (existsSync(resolve('./brain'))) return resolve('./brain');
	return resolve(process.env.HOME || '~', 'hebbian', 'brain');
}

/** Resolve agent-specific brain path within a multi-brain setup */
export function resolveAgentBrain(brainRoot: string, agentName: string): string {
	return resolve(brainRoot, 'agents', agentName);
}

/** Resolve shared brain path within a multi-brain setup */
export function resolveSharedBrain(brainRoot: string): string {
	return resolve(brainRoot, 'shared');
}

export const AGENTS_DIR = 'agents';
export const SHARED_DIR = 'shared';
export const SKILLS_DIR = 'skills';
export const PROPAGATION_EPISODE_TYPES = ['tool-failure', 'retry-pattern'] as const;
