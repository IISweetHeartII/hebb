// hebbian — Public API

export * from './types';
export * from './constants';
export { scanBrain } from './scanner';
export { runSubsumption } from './subsumption';
export { tokenize, stem, jaccardSimilarity } from './similarity';
export { fireNeuron, getCurrentCounter } from './fire';
export { rollbackNeuron } from './rollback';
export { signalNeuron } from './signal';
export { growNeuron } from './grow';
export type { GrowResult } from './grow';
export { runDecay } from './decay';
export type { DecayResult } from './decay';
export { runDedup } from './dedup';
export type { DedupResult } from './dedup';
export { gitSnapshot } from './snapshot';
export { startWatch } from './watch';
export { initBrain } from './init';
export { emitBootstrap, emitIndex, emitRegionRules, emitToTarget, writeAllTiers, printDiag } from './emit';

// Phase 2: REST API + Inbox + Episode
export { startAPI, getLastActivity, getPendingReports, clearReports } from './api';
export type { ReportEntry } from './api';
export { logEpisode, readEpisodes } from './episode';
export type { Episode } from './episode';
export { processInbox, ensureInbox, appendCorrection } from './inbox';
export type { Correction, InboxResult } from './inbox';

// WS1: Claude Code Hooks + Digest
export { installHooks, uninstallHooks, checkHooks } from './hooks';
export type { HookStatus } from './hooks';
export { digestTranscript, extractCorrections, readHookInput, parseToolResults, detectToolFailure, detectRetryPatterns } from './digest';
export type { DigestResult, ExtractedCorrection, ToolFailure } from './digest';
export { resolveBrainRoot, resolveAgentBrain, resolveSharedBrain } from './constants';

// Phase 4: Candidate Staging + Evolve Engine
export { growCandidate, promoteCandidates, listCandidates, toCandidatePath, fromCandidatePath } from './candidates';
export type { CandidateInfo, PromoteResult } from './candidates';
export { runEvolve } from './evolve';
export type { EvolveAction, EvolveResult, EvolveMode } from './evolve';

// Phase 5: Outcome Tracking
export { captureSessionStart, detectOutcome, buildOutcomeSummary, classifyOutcome } from './outcome';
export type { SessionState, OutcomeResult } from './outcome';
export { contraNeuron } from './fire';
