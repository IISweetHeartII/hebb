// hebb — Constants & Configuration
//
// AXIOMS:
//   1. Folder = Neuron (name is meaning, depth is specificity)
//   2. File = Firing Trace (N.neuron = counter, dopamineN = reward, bomb = pain)
//   3. Path = Sentence (brain/cortex/quality/no_hardcoded → "cortex > quality > no_hardcoded")
//   4. Counter = Activation (higher = stronger/myelinated path)
//   5. AI writes back (counter increment = experience growth)

/** Ordered list of brain regions by subsumption priority (P0 → P6) */
export const REGIONS = [
	'brainstem',
	'limbic',
	'hippocampus',
	'sensors',
	'cortex',
	'ego',
	'prefrontal',
];

/** Region → priority index (lower = higher priority) */
export const REGION_PRIORITY = /** @type {Record<string, number>} */ ({
	brainstem: 0,
	limbic: 1,
	hippocampus: 2,
	sensors: 3,
	cortex: 4,
	ego: 5,
	prefrontal: 6,
});

/** Region display icons */
export const REGION_ICONS = /** @type {Record<string, string>} */ ({
	brainstem: '\u{1F6E1}\uFE0F',   // 🛡️
	limbic: '\u{1F493}',             // 💓
	hippocampus: '\u{1F4DD}',        // 📝
	sensors: '\u{1F441}\uFE0F',      // 👁️
	cortex: '\u{1F9E0}',             // 🧠
	ego: '\u{1F3AD}',                // 🎭
	prefrontal: '\u{1F3AF}',         // 🎯
});

/** Region Korean descriptions */
export const REGION_KO = /** @type {Record<string, string>} */ ({
	brainstem: '양심/본능',
	limbic: '감정 필터',
	hippocampus: '기록/기억',
	sensors: '환경 제약',
	cortex: '지식/기술',
	ego: '성향/톤',
	prefrontal: '목표/계획',
});

/** Minimum counter value for a neuron to appear in emitted output */
export const EMIT_THRESHOLD = 5;

/** Days a new neuron gets spotlight coverage regardless of counter */
export const SPOTLIGHT_DAYS = 7;

/** Jaccard similarity threshold for neuron merge detection */
export const JACCARD_THRESHOLD = 0.6;

/** Default number of days before marking a neuron dormant */
export const DECAY_DAYS = 30;

/** Maximum recursion depth when walking brain directories */
export const MAX_DEPTH = 6;

/** Emit target → file path mapping */
export const EMIT_TARGETS = /** @type {Record<string, string>} */ ({
	gemini: '.gemini/GEMINI.md',
	cursor: '.cursorrules',
	claude: 'CLAUDE.md',
	copilot: '.github/copilot-instructions.md',
	generic: '.neuronrc',
});

/** Valid signal types */
export const SIGNAL_TYPES = ['dopamine', 'bomb', 'memory'];

/** Emit markers for injection into existing files */
export const MARKER_START = '<!-- HEBB:START -->';
export const MARKER_END = '<!-- HEBB:END -->';
