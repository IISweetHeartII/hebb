// hebbian — Cron Management (launchd plist)
//
// Generates and installs macOS launchd plists for nightly pruning
// and feedback daemon. Zero runtime dependencies.

import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const PLIST_LABEL = 'com.hebbian.nightly-prune';
const FEEDBACK_PLIST_LABEL = 'com.hebbian.feedback';

function getLaunchAgentsDir(): string {
	return join(process.env.HOME || '~', 'Library', 'LaunchAgents');
}

function getPlistPath(label: string): string {
	return join(getLaunchAgentsDir(), `${label}.plist`);
}

function getNpxPath(): string {
	try {
		return execSync('which npx', { encoding: 'utf8' }).trim();
	} catch {
		return '/opt/homebrew/bin/npx';
	}
}

/**
 * Generate a launchd plist for nightly pruning.
 */
export function generatePrunePlist(brainRoot: string, hour = 2, minute = 0): string {
	const npx = getNpxPath();
	const apiKey = process.env.GEMINI_API_KEY || '';
	const home = process.env.HOME || '/Users/sweetheart';

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npx}</string>
    <string>hebbian</string>
    <string>evolve</string>
    <string>prune</string>
    <string>--brain</string>
    <string>${brainRoot}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>GEMINI_API_KEY</key>
    <string>${apiKey}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${home}/Library/Logs/hebbian-prune.log</string>
  <key>StandardErrorPath</key>
  <string>${home}/Library/Logs/hebbian-prune.log</string>
</dict>
</plist>`;
}

/**
 * Generate a launchd plist for the feedback daemon (runs every N minutes).
 */
export function generateFeedbackPlist(brainRoot: string, intervalMinutes = 15): string {
	const npx = getNpxPath();
	const home = process.env.HOME || '/Users/sweetheart';

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${FEEDBACK_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npx}</string>
    <string>hebbian</string>
    <string>feedback</string>
    <string>scan</string>
    <string>--brain</string>
    <string>${brainRoot}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartInterval</key>
  <integer>${intervalMinutes * 60}</integer>
  <key>StandardOutPath</key>
  <string>${home}/Library/Logs/hebbian-feedback.log</string>
  <key>StandardErrorPath</key>
  <string>${home}/Library/Logs/hebbian-feedback.log</string>
</dict>
</plist>`;
}

/**
 * Install the nightly pruning cron job.
 */
export function installCron(brainRoot: string, type: 'prune' | 'feedback' = 'prune'): void {
	const label = type === 'prune' ? PLIST_LABEL : FEEDBACK_PLIST_LABEL;
	const plistPath = getPlistPath(label);
	const plistContent = type === 'prune'
		? generatePrunePlist(brainRoot)
		: generateFeedbackPlist(brainRoot);

	// Unload if already installed
	try {
		execSync(`launchctl unload ${plistPath} 2>/dev/null`, { encoding: 'utf8' });
	} catch { /* not loaded */ }

	writeFileSync(plistPath, plistContent, 'utf8');
	execSync(`launchctl load ${plistPath}`, { encoding: 'utf8' });
	console.log(`✅ ${type} cron installed: ${plistPath}`);
}

/**
 * Uninstall the cron job.
 */
export function uninstallCron(type: 'prune' | 'feedback' = 'prune'): void {
	const label = type === 'prune' ? PLIST_LABEL : FEEDBACK_PLIST_LABEL;
	const plistPath = getPlistPath(label);

	if (!existsSync(plistPath)) {
		console.log(`⚠️ ${type} cron not installed`);
		return;
	}

	try {
		execSync(`launchctl unload ${plistPath}`, { encoding: 'utf8' });
	} catch { /* already unloaded */ }

	unlinkSync(plistPath);
	console.log(`🗑️ ${type} cron uninstalled`);
}

/**
 * Check cron status.
 */
export function checkCron(type: 'prune' | 'feedback' = 'prune'): { installed: boolean; path: string } {
	const label = type === 'prune' ? PLIST_LABEL : FEEDBACK_PLIST_LABEL;
	const plistPath = getPlistPath(label);
	return { installed: existsSync(plistPath), path: plistPath };
}
