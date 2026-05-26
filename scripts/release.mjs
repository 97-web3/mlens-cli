#!/usr/bin/env node
/**
 * GitHub release script for mlens.
 *
 * Usage:
 *   node scripts/release.mjs <x.y.z>
 *   node scripts/release.mjs <vX.Y.Z>
 *
 * Steps:
 * 1. Check for uncommitted changes
 * 2. Set the lockstep workspace version
 * 3. Update CHANGELOG.md files: [Unreleased] -> [version] - date
 * 4. Generate the coding-agent npm-shrinkwrap.json
 * 5. Commit and tag the release commit
 * 6. Add new [Unreleased] sections to changelogs
 * 7. Commit the next-cycle changelog reset
 * 8. Push main and the release tag (GitHub Actions publishes binaries)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const rawTarget = process.argv[2];

if (!rawTarget) {
	console.error("Usage: node scripts/release.mjs <x.y.z|vX.Y.Z>");
	process.exit(1);
}

function normalizeReleaseVersion(target) {
	const normalized = target.startsWith("v") ? target.slice(1) : target;
	if (!/^\d+\.\d+\.\d+$/u.test(normalized)) {
		console.error(`Invalid release version "${target}". Use x.y.z or vX.Y.Z.`);
		process.exit(1);
	}
	return normalized;
}

function run(cmd, options = {}) {
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: options.silent ? "pipe" : "inherit", ...options });
	} catch {
		console.error(`Command failed: ${cmd}`);
		process.exit(1);
	}
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stageChangedFiles() {
	const output = run("git ls-files -m -o -d --exclude-standard", { silent: true });
	const paths = [...new Set((output || "").split("\n").map((line) => line.trim()).filter(Boolean))];
	if (paths.length === 0) {
		return;
	}

	run(`git add -- ${paths.map(shellQuote).join(" ")}`);
}

function getChangelogs() {
	const packagesDir = "packages";
	return readdirSync(packagesDir)
		.map((pkg) => join(packagesDir, pkg, "CHANGELOG.md"))
		.filter((path) => existsSync(path));
}

function updateChangelogsForRelease(version) {
	const date = new Date().toISOString().split("T")[0];
	for (const changelog of getChangelogs()) {
		const content = readFileSync(changelog, "utf-8");
		if (!content.includes("## [Unreleased]")) {
			console.log(`  Skipping ${changelog}: no [Unreleased] section`);
			continue;
		}

		const updated = content.replace("## [Unreleased]", `## [${version}] - ${date}`);
		writeFileSync(changelog, updated);
		console.log(`  Updated ${changelog}`);
	}
}

function addUnreleasedSection() {
	const unreleasedSection = "## [Unreleased]\n\n";
	for (const changelog of getChangelogs()) {
		const content = readFileSync(changelog, "utf-8");
		const updated = content.replace(/^(# Changelog\n\n)/u, `$1${unreleasedSection}`);
		writeFileSync(changelog, updated);
		console.log(`  Added [Unreleased] to ${changelog}`);
	}
}

function setWorkspaceVersion(version) {
	run(`npm version ${version} --workspaces --no-git-tag-version --allow-same-version`);
	run("node scripts/sync-versions.js");
	run("npm install --package-lock-only --ignore-scripts");
}

const version = normalizeReleaseVersion(rawTarget);

console.log("\n=== GitHub Release Script ===\n");

console.log("Checking for uncommitted changes...");
const status = run("git status --porcelain", { silent: true });
if (status && status.trim()) {
	console.error("Error: Uncommitted changes detected. Commit or revert them first.");
	console.error(status);
	process.exit(1);
}
console.log("  Working directory clean\n");

console.log(`Setting workspace version to ${version}...`);
setWorkspaceVersion(version);
console.log();

console.log("Updating CHANGELOG.md files...");
updateChangelogsForRelease(version);
console.log();

console.log("Generating coding-agent shrinkwrap...");
run("npm run shrinkwrap:coding-agent");
console.log();

console.log("Committing and tagging release...");
stageChangedFiles();
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
console.log();

console.log("Adding [Unreleased] sections for next cycle...");
addUnreleasedSection();
console.log();

console.log("Committing next-cycle changelog reset...");
stageChangedFiles();
run('git commit -m "Add [Unreleased] section for next cycle"');
console.log();

console.log("Pushing main and release tag...");
run("git push origin main");
run(`git push origin v${version}`);
console.log();

console.log(`=== Released v${version} ===`);
console.log("GitHub Actions will build the mlens binaries and publish the GitHub Release assets.");
