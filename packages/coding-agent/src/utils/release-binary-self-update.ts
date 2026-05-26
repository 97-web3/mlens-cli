import { createWriteStream, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReleaseBinarySelfUpdateConfig } from "../config.ts";
import { spawnProcessSync } from "./child-process.ts";

const DOWNLOAD_TIMEOUT_MS = 120_000;

export interface ReleaseBinaryAssetInfo {
	platformTag: string;
	assetName: string;
	downloadUrl: string;
}

interface ReleaseBinaryRuntimeInfo {
	platform: NodeJS.Platform;
	arch: NodeJS.Architecture;
}

function getPlatformTag(runtime: ReleaseBinaryRuntimeInfo): string | undefined {
	if (runtime.platform !== "darwin" && runtime.platform !== "linux") {
		return undefined;
	}
	if (runtime.arch !== "arm64" && runtime.arch !== "x64") {
		return undefined;
	}
	return `${runtime.platform}-${runtime.arch}`;
}

function formatSpawnFailure(error: Error | undefined, stdout: string, stderr: string, status: number | null): string {
	if (error?.message) {
		return error.message;
	}
	if (stderr.trim()) {
		return stderr.trim();
	}
	if (stdout.trim()) {
		return stdout.trim();
	}
	return `exit status ${status ?? "unknown"}`;
}

async function downloadReleaseBinaryArchive(url: string, archivePath: string): Promise<void> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`Failed to download release archive: ${response.status}`);
	}
	if (!response.body) {
		throw new Error("Release archive download returned no body");
	}

	const archiveStream = createWriteStream(archivePath);
	await pipeline(Readable.fromWeb(response.body), archiveStream);
}

export function getReleaseBinaryAssetInfo(
	config: ReleaseBinarySelfUpdateConfig,
	runtime: ReleaseBinaryRuntimeInfo = {
		platform: process.platform,
		arch: process.arch,
	},
	version?: string,
): ReleaseBinaryAssetInfo | undefined {
	const platformTag = getPlatformTag(runtime);
	if (!platformTag) {
		return undefined;
	}

	const assetName = `${config.archivePrefix}-${platformTag}.tar.gz`;
	const downloadUrl = version
		? `https://github.com/${config.repo}/releases/download/${version}/${assetName}`
		: `https://github.com/${config.repo}/releases/latest/download/${assetName}`;
	return {
		platformTag,
		assetName,
		downloadUrl,
	};
}

export function extractReleaseBinaryArchive(archivePath: string, extractDir: string, assetName: string): void {
	mkdirSync(extractDir, { recursive: true });
	const result = spawnProcessSync("tar", ["xzf", archivePath, "-C", extractDir], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error || result.status !== 0) {
		throw new Error(
			`Failed to extract ${assetName}: ${formatSpawnFailure(result.error, result.stdout, result.stderr, result.status)}`,
		);
	}
}

export function stageReleaseBinaryInstall(
	config: ReleaseBinarySelfUpdateConfig,
	extractedRoot: string,
	stagingParentDir: string,
): string {
	const extractedInstallDir = join(extractedRoot, config.archivePrefix);
	const extractedBinaryPath = join(extractedInstallDir, config.binaryName);
	if (!existsSync(extractedInstallDir) || !existsSync(extractedBinaryPath)) {
		throw new Error(`Release archive is missing ${config.archivePrefix}/${config.binaryName}`);
	}

	const stagedInstallDir = join(
		stagingParentDir,
		`.${config.binaryName}-staged-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
	);
	renameSync(extractedInstallDir, stagedInstallDir);
	return stagedInstallDir;
}

export function replaceReleaseBinaryInstall(installDir: string, stagedInstallDir: string): void {
	const backupInstallDir = `${installDir}.backup-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	let movedExistingInstall = false;

	try {
		if (existsSync(installDir)) {
			renameSync(installDir, backupInstallDir);
			movedExistingInstall = true;
		}
		renameSync(stagedInstallDir, installDir);
		if (movedExistingInstall) {
			rmSync(backupInstallDir, { recursive: true, force: true });
		}
	} catch (error) {
		if (movedExistingInstall) {
			try {
				if (existsSync(installDir)) {
					rmSync(installDir, { recursive: true, force: true });
				}
				renameSync(backupInstallDir, installDir);
			} catch (rollbackError) {
				const originalMessage = error instanceof Error ? error.message : String(error);
				const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
				throw new Error(
					`Failed to replace release binary install: ${originalMessage}; rollback failed: ${rollbackMessage}`,
				);
			}
		}
		throw error;
	} finally {
		rmSync(stagedInstallDir, { recursive: true, force: true });
	}
}

export async function runReleaseBinarySelfUpdate(options: {
	config: ReleaseBinarySelfUpdateConfig;
	installDir: string;
	version?: string;
}): Promise<void> {
	const assetInfo = getReleaseBinaryAssetInfo(options.config, undefined, options.version);
	if (!assetInfo) {
		throw new Error(`Unsupported release-binary platform: ${process.platform}/${process.arch}`);
	}

	const installParentDir = dirname(options.installDir);
	const tempRoot = mkdtempSync(join(installParentDir, `.${options.config.binaryName}-update-`));
	const archivePath = join(tempRoot, assetInfo.assetName);
	const extractDir = join(tempRoot, "extracted");

	try {
		await downloadReleaseBinaryArchive(assetInfo.downloadUrl, archivePath);
		extractReleaseBinaryArchive(archivePath, extractDir, assetInfo.assetName);
		const stagedInstallDir = stageReleaseBinaryInstall(options.config, extractDir, installParentDir);
		replaceReleaseBinaryInstall(options.installDir, stagedInstallDir);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
}
