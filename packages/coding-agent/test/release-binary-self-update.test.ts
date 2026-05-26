import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { ReleaseBinarySelfUpdateConfig } from "../src/config.ts";
import {
	extractReleaseBinaryArchive,
	getReleaseBinaryAssetInfo,
	replaceReleaseBinaryInstall,
	stageReleaseBinaryInstall,
} from "../src/utils/release-binary-self-update.ts";

const MLENS_RELEASE_CONFIG: ReleaseBinarySelfUpdateConfig = {
	repo: "97-web3/mlens-cli",
	binaryName: "mlens",
	archivePrefix: "mlens",
};

let tempDir: string | undefined;

afterEach(() => {
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

function createTempDir(): string {
	tempDir = mkdtempSync(join(tmpdir(), "mlens-release-self-update-"));
	return tempDir;
}

function createReleaseArchive(rootDir: string, binaryContent: string): string {
	const sourceDir = join(rootDir, "source");
	const releaseRoot = join(sourceDir, "mlens");
	mkdirSync(releaseRoot, { recursive: true });
	writeFileSync(join(releaseRoot, "mlens"), binaryContent);
	chmodSync(join(releaseRoot, "mlens"), 0o755);
	writeFileSync(join(releaseRoot, "README.md"), "updated");

	const archivePath = join(rootDir, "mlens-release.tar.gz");
	const result = spawnSync("tar", ["czf", archivePath, "-C", sourceDir, "mlens"], { stdio: "pipe" });
	if (result.status !== 0) {
		throw new Error(result.stderr.toString() || `tar exited with code ${result.status ?? "unknown"}`);
	}
	return archivePath;
}

describe("release binary self update helpers", () => {
	test("maps supported macOS and Linux platforms to mlens release assets", () => {
		expect(getReleaseBinaryAssetInfo(MLENS_RELEASE_CONFIG, { platform: "darwin", arch: "arm64" })).toEqual(
			expect.objectContaining({
				platformTag: "darwin-arm64",
				assetName: "mlens-darwin-arm64.tar.gz",
			}),
		);
		expect(getReleaseBinaryAssetInfo(MLENS_RELEASE_CONFIG, { platform: "darwin", arch: "x64" })).toEqual(
			expect.objectContaining({
				platformTag: "darwin-x64",
				assetName: "mlens-darwin-x64.tar.gz",
			}),
		);
		expect(getReleaseBinaryAssetInfo(MLENS_RELEASE_CONFIG, { platform: "linux", arch: "arm64" })).toEqual(
			expect.objectContaining({
				platformTag: "linux-arm64",
				assetName: "mlens-linux-arm64.tar.gz",
			}),
		);
		expect(getReleaseBinaryAssetInfo(MLENS_RELEASE_CONFIG, { platform: "linux", arch: "x64" })).toEqual(
			expect.objectContaining({
				platformTag: "linux-x64",
				assetName: "mlens-linux-x64.tar.gz",
			}),
		);
	});

	test("rejects unsupported release-binary platforms", () => {
		expect(getReleaseBinaryAssetInfo(MLENS_RELEASE_CONFIG, { platform: "win32", arch: "x64" })).toBeUndefined();
		expect(getReleaseBinaryAssetInfo(MLENS_RELEASE_CONFIG, { platform: "linux", arch: "ppc64" })).toBeUndefined();
	});

	test("extracts an archive and stages the release directory for install", () => {
		const rootDir = createTempDir();
		const archivePath = createReleaseArchive(rootDir, "new-binary");
		const extractDir = join(rootDir, "extracted");
		mkdirSync(extractDir, { recursive: true });

		extractReleaseBinaryArchive(archivePath, extractDir, "mlens-linux-x64.tar.gz");
		const stagedInstallDir = stageReleaseBinaryInstall(MLENS_RELEASE_CONFIG, extractDir, rootDir);

		expect(readFileSync(join(stagedInstallDir, "mlens"), "utf-8")).toBe("new-binary");
		expect(existsSync(join(extractDir, "mlens"))).toBe(false);
	});

	test("replaces the installed release directory with the staged one", () => {
		const rootDir = createTempDir();
		const installDir = join(rootDir, ".mlens");
		const stagedInstallDir = join(rootDir, ".mlens.staged");
		mkdirSync(installDir, { recursive: true });
		mkdirSync(stagedInstallDir, { recursive: true });
		writeFileSync(join(installDir, "mlens"), "old-binary");
		writeFileSync(join(stagedInstallDir, "mlens"), "new-binary");

		replaceReleaseBinaryInstall(installDir, stagedInstallDir);

		expect(readFileSync(join(installDir, "mlens"), "utf-8")).toBe("new-binary");
		expect(existsSync(stagedInstallDir)).toBe(false);
	});

	test("rolls back to the original install when replacing the staged directory fails", () => {
		const rootDir = createTempDir();
		const installDir = join(rootDir, ".mlens");
		const missingStageDir = join(rootDir, ".mlens.staged");
		mkdirSync(installDir, { recursive: true });
		writeFileSync(join(installDir, "mlens"), "old-binary");

		expect(() => replaceReleaseBinaryInstall(installDir, missingStageDir)).toThrow();
		expect(readFileSync(join(installDir, "mlens"), "utf-8")).toBe("old-binary");
	});
});
