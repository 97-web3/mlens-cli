import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV_AGENT_DIR, PACKAGE_NAME, VERSION } from "../src/config.ts";
import { main } from "../src/main.ts";

describe("package commands", () => {
	let tempDir: string;
	let agentDir: string;
	let projectDir: string;
	let packageDir: string;
	let originalCwd: string;
	let originalAgentDir: string | undefined;
	let originalAppProfile: string | undefined;
	let originalPiPackageDir: string | undefined;
	let originalArgv1: string | undefined;
	let originalExitCode: typeof process.exitCode;
	let originalExecPath: string;

	function getNewerPatchVersion(): string {
		const [major = "0", minor = "0", patch = "0"] = VERSION.split(".");
		return `${major}.${minor}.${Number.parseInt(patch, 10) + 1}`;
	}

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-package-commands-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		projectDir = join(tempDir, "project");
		packageDir = join(tempDir, "local-package");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(packageDir, { recursive: true });

		originalCwd = process.cwd();
		originalAgentDir = process.env[ENV_AGENT_DIR];
		originalAppProfile = process.env.PI_APP_PROFILE;
		originalPiPackageDir = process.env.PI_PACKAGE_DIR;
		originalArgv1 = process.argv[1];
		originalExitCode = process.exitCode;
		originalExecPath = process.execPath;
		process.exitCode = undefined;
		process.env[ENV_AGENT_DIR] = agentDir;
		process.chdir(projectDir);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		process.chdir(originalCwd);
		process.exitCode = originalExitCode;
		if (originalAgentDir === undefined) {
			delete process.env[ENV_AGENT_DIR];
		} else {
			process.env[ENV_AGENT_DIR] = originalAgentDir;
		}
		if (originalAppProfile === undefined) {
			delete process.env.PI_APP_PROFILE;
		} else {
			process.env.PI_APP_PROFILE = originalAppProfile;
		}
		if (originalPiPackageDir === undefined) {
			delete process.env.PI_PACKAGE_DIR;
		} else {
			process.env.PI_PACKAGE_DIR = originalPiPackageDir;
		}
		if (originalArgv1 === undefined) {
			process.argv.splice(1, 1);
		} else {
			process.argv[1] = originalArgv1;
		}
		Object.defineProperty(process, "execPath", { value: originalExecPath, configurable: true });
		rmSync(tempDir, { recursive: true, force: true });
	});

	function isSupportedReleaseBinaryPlatform(): boolean {
		if (process.platform !== "darwin" && process.platform !== "linux") {
			return false;
		}
		return process.arch === "arm64" || process.arch === "x64";
	}

	function getCurrentMlensAssetName(): string {
		if (!isSupportedReleaseBinaryPlatform()) {
			throw new Error(`Unsupported test platform: ${process.platform}/${process.arch}`);
		}
		return `mlens-${process.platform}-${process.arch}.tar.gz`;
	}

	function createMlensReleaseArchive(rootDir: string, binaryContent: string): Buffer {
		const sourceDir = join(rootDir, `archive-src-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const releaseRoot = join(sourceDir, "mlens");
		mkdirSync(releaseRoot, { recursive: true });
		writeFileSync(join(releaseRoot, "mlens"), binaryContent);
		chmodSync(join(releaseRoot, "mlens"), 0o755);
		writeFileSync(join(releaseRoot, "README.md"), "updated");

		const archivePath = join(rootDir, getCurrentMlensAssetName());
		const result = spawnSync("tar", ["czf", archivePath, "-C", sourceDir, "mlens"], { stdio: "pipe" });
		if (result.status !== 0) {
			throw new Error(result.stderr.toString() || `tar exited with code ${result.status ?? "unknown"}`);
		}
		return readFileSync(archivePath);
	}

	async function importMlensMain(): Promise<typeof main> {
		vi.resetModules();
		process.env.PI_APP_PROFILE = "mlens";
		const module = await import("../src/main.ts");
		return module.main;
	}

	it("should persist global relative local package paths relative to settings.json", async () => {
		const relativePkgDir = join(projectDir, "packages", "local-package");
		mkdirSync(relativePkgDir, { recursive: true });

		await main(["install", "./packages/local-package"]);

		const settingsPath = join(agentDir, "settings.json");
		const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { packages?: string[] };
		expect(settings.packages?.length).toBe(1);
		const stored = settings.packages?.[0] ?? "";
		const resolvedFromSettings = realpathSync(join(agentDir, stored));
		expect(resolvedFromSettings).toBe(realpathSync(relativePkgDir));
	});

	it("should remove local packages using a path with a trailing slash", async () => {
		await main(["install", `${packageDir}/`]);

		const settingsPath = join(agentDir, "settings.json");
		const installedSettings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { packages?: string[] };
		expect(installedSettings.packages?.length).toBe(1);

		await main(["remove", `${packageDir}/`]);

		const removedSettings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { packages?: string[] };
		expect(removedSettings.packages ?? []).toHaveLength(0);
	});

	it("shows install subcommand help", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(main(["install", "--help"])).resolves.toBeUndefined();

			const stdout = logSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stdout).toContain("Usage:");
			expect(stdout).toContain("pi install <source> [-l]");
			expect(errorSpy).not.toHaveBeenCalled();
			expect(process.exitCode).toBeUndefined();
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("shows a friendly error for unknown install options", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(main(["install", "--unknown"])).resolves.toBeUndefined();

			const stderr = errorSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stderr).toContain('Unknown option --unknown for "install".');
			expect(stderr).toContain('Use "pi --help" or "pi install <source> [-l]".');
			expect(process.exitCode).toBe(1);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("shows a friendly error for missing install source", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(main(["install"])).resolves.toBeUndefined();

			const stderr = errorSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stderr).toContain("Missing install source.");
			expect(stderr).toContain("Usage: pi install <source> [-l]");
			expect(stderr).not.toContain("at ");
			expect(process.exitCode).toBe(1);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("uses global npmCommand and current package name for forced self updates without checking the api", async () => {
		const globalPrefix = join(tempDir, "global-prefix");
		const projectPrefix = join(tempDir, "project-prefix");
		const selfPackageDir = join(globalPrefix, "lib", "node_modules", "@earendil-works", "pi-coding-agent");
		const fakeNpmPath = join(tempDir, "fake-npm.cjs");
		const recordPath = join(tempDir, "self-update.json");
		mkdirSync(selfPackageDir, { recursive: true });
		mkdirSync(join(projectDir, ".pi"), { recursive: true });
		writeFileSync(
			fakeNpmPath,
			`const fs=require("node:fs"),path=require("node:path"),args=process.argv.slice(2),prefix=args[args.indexOf("--prefix")+1];
if(args.includes("root")) console.log(path.join(prefix,"lib","node_modules"));
else fs.writeFileSync(${JSON.stringify(recordPath)},JSON.stringify(args));
`,
		);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({ npmCommand: [originalExecPath, fakeNpmPath, "--prefix", globalPrefix] }, null, 2),
		);
		writeFileSync(
			join(projectDir, ".pi", "settings.json"),
			JSON.stringify({ npmCommand: [originalExecPath, fakeNpmPath, "--prefix", projectPrefix] }, null, 2),
		);
		process.env.PI_PACKAGE_DIR = selfPackageDir;
		Object.defineProperty(process, "execPath", {
			value: join(selfPackageDir, "dist", "cli.js"),
			configurable: true,
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(main(["update", "--self", "--force"])).resolves.toBeUndefined();

			expect(process.exitCode).toBeUndefined();
			expect(errorSpy).not.toHaveBeenCalled();
			expect(fetchMock).not.toHaveBeenCalled();
			const recordedArgs = JSON.parse(readFileSync(recordPath, "utf-8")) as string[];
			expect(recordedArgs).toContain(globalPrefix);
			expect(recordedArgs).toContain(PACKAGE_NAME);
			expect(recordedArgs).not.toContain(projectPrefix);
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("uses the current package name when the update check omits packageName", async () => {
		const globalPrefix = join(tempDir, "global-prefix");
		const selfPackageDir = join(globalPrefix, "lib", "node_modules", "@mariozechner", "pi-coding-agent");
		const fakeNpmPath = join(tempDir, "fake-npm.cjs");
		const recordPath = join(tempDir, "self-update.json");
		mkdirSync(selfPackageDir, { recursive: true });
		writeFileSync(
			fakeNpmPath,
			`const fs=require("node:fs"),path=require("node:path"),args=process.argv.slice(2),prefix=args[args.indexOf("--prefix")+1];
if(args.includes("root")) console.log(path.join(prefix,"lib","node_modules"));
else fs.writeFileSync(${JSON.stringify(recordPath)},JSON.stringify(args));
`,
		);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({ npmCommand: [originalExecPath, fakeNpmPath, "--prefix", globalPrefix] }, null, 2),
		);
		process.env.PI_PACKAGE_DIR = selfPackageDir;
		Object.defineProperty(process, "execPath", {
			value: join(selfPackageDir, "dist", "cli.js"),
			configurable: true,
		});
		const fetchMock = vi.fn(async () => Response.json({ version: getNewerPatchVersion() }));
		vi.stubGlobal("fetch", fetchMock);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(main(["update", "--self"])).resolves.toBeUndefined();

			expect(process.exitCode).toBeUndefined();
			expect(errorSpy).not.toHaveBeenCalled();
			expect(fetchMock).toHaveBeenCalledOnce();
			const recordedArgs = JSON.parse(readFileSync(recordPath, "utf-8")) as string[];
			expect(recordedArgs).toContain(PACKAGE_NAME);
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("installs the active package name from the update check during self-update", async () => {
		const globalPrefix = join(tempDir, "global-prefix");
		const selfPackageDir = join(globalPrefix, "lib", "node_modules", "@mariozechner", "pi-coding-agent");
		const fakeNpmPath = join(tempDir, "fake-npm.cjs");
		const recordPath = join(tempDir, "self-update.json");
		mkdirSync(selfPackageDir, { recursive: true });
		writeFileSync(
			fakeNpmPath,
			`const fs=require("node:fs"),path=require("node:path"),args=process.argv.slice(2),prefix=args[args.indexOf("--prefix")+1];
if(args.includes("root")) console.log(path.join(prefix,"lib","node_modules"));
else {
	const records=fs.existsSync(${JSON.stringify(recordPath)})?JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)},"utf-8")):[];
	records.push(args);
	fs.writeFileSync(${JSON.stringify(recordPath)},JSON.stringify(records));
}
`,
		);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({ npmCommand: [originalExecPath, fakeNpmPath, "--prefix", globalPrefix] }, null, 2),
		);
		process.env.PI_PACKAGE_DIR = selfPackageDir;
		Object.defineProperty(process, "execPath", {
			value: join(selfPackageDir, "dist", "cli.js"),
			configurable: true,
		});
		const activePackageName = PACKAGE_NAME === "@new-scope/pi" ? "@newer-scope/pi" : "@new-scope/pi";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ packageName: activePackageName, version: "0.73.0" })),
		);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(main(["update", "--self"])).resolves.toBeUndefined();

			expect(process.exitCode).toBeUndefined();
			expect(errorSpy).not.toHaveBeenCalled();
			const recordedCalls = JSON.parse(readFileSync(recordPath, "utf-8")) as string[][];
			expect(recordedCalls).toEqual([
				expect.arrayContaining(["uninstall", "-g", PACKAGE_NAME]),
				expect.arrayContaining(["install", "-g", activePackageName]),
			]);
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("fails self-update when renamed npm package installation fails", async () => {
		const globalPrefix = join(tempDir, "global-prefix");
		const selfPackageDir = join(globalPrefix, "lib", "node_modules", "@mariozechner", "pi-coding-agent");
		const fakeNpmPath = join(tempDir, "fake-npm-fail.cjs");
		const recordPath = join(tempDir, "self-update-fail.json");
		mkdirSync(selfPackageDir, { recursive: true });
		writeFileSync(
			fakeNpmPath,
			`const fs=require("node:fs"),path=require("node:path"),args=process.argv.slice(2),prefix=args[args.indexOf("--prefix")+1];
if(args.includes("root")) {
	console.log(path.join(prefix,"lib","node_modules"));
	process.exit(0);
}
const records=fs.existsSync(${JSON.stringify(recordPath)})?JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)},"utf-8")):[];
records.push(args);
fs.writeFileSync(${JSON.stringify(recordPath)},JSON.stringify(records));
if(args.includes("install")) process.exit(23);
`,
		);
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({ npmCommand: [originalExecPath, fakeNpmPath, "--prefix", globalPrefix] }, null, 2),
		);
		process.env.PI_PACKAGE_DIR = selfPackageDir;
		Object.defineProperty(process, "execPath", {
			value: join(selfPackageDir, "dist", "cli.js"),
			configurable: true,
		});
		const activePackageName = PACKAGE_NAME === "@new-scope/pi" ? "@newer-scope/pi" : "@new-scope/pi";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ packageName: activePackageName, version: "0.73.0" })),
		);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			await expect(main(["update", "--self"])).resolves.toBeUndefined();

			expect(process.exitCode).toBe(1);
			const stdout = logSpy.mock.calls.map(([message]) => String(message)).join("\n");
			const stderr = errorSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stdout).not.toContain(`Updated pi`);
			expect(stderr).toContain("exited with code 23");
			const recordedCalls = JSON.parse(readFileSync(recordPath, "utf-8")) as string[][];
			expect(recordedCalls).toEqual([
				expect.arrayContaining(["uninstall", "-g", PACKAGE_NAME]),
				expect.arrayContaining(["install", "-g", activePackageName]),
			]);
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("suggests the configured source when update input omits the npm prefix", async () => {
		const settingsPath = join(agentDir, "settings.json");
		writeFileSync(settingsPath, JSON.stringify({ packages: ["npm:pi-formatter"] }, null, 2));

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await expect(main(["update", "pi-formatter"])).resolves.toBeUndefined();

			const stderr = errorSpy.mock.calls.map(([message]) => String(message)).join("\n");
			const stdout = logSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stderr).toContain("Did you mean npm:pi-formatter?");
			expect(stdout).not.toContain("Updated pi-formatter");
			expect(process.exitCode).toBe(1);

			const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { packages?: string[] };
			expect(settings.packages).toContain("npm:pi-formatter");
		} finally {
			errorSpy.mockRestore();
			logSpy.mockRestore();
		}
	});

	it("self-updates mlens release binaries on supported platforms", async () => {
		if (!isSupportedReleaseBinaryPlatform()) {
			return;
		}

		const installDir = join(tempDir, "mlens-install");
		const archiveBuffer = createMlensReleaseArchive(tempDir, "new-binary");
		const expectedArchiveUrl = `https://github.com/97-web3/mlens-cli/releases/download/v0.1.3/${getCurrentMlensAssetName()}`;
		mkdirSync(installDir, { recursive: true });
		writeFileSync(join(installDir, "mlens"), "old-binary");
		chmodSync(join(installDir, "mlens"), 0o755);

		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url === "https://api.github.com/repos/97-web3/mlens-cli/releases/latest") {
				return Response.json({ tag_name: "v0.1.3" });
			}
			if (url === expectedArchiveUrl) {
				return new Response(archiveBuffer, { status: 200 });
			}
			throw new Error(`Unexpected fetch url: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const mlensMain = await importMlensMain();
			process.env.PI_PACKAGE_DIR = installDir;
			process.argv[1] = "/$bunfs/root/mlens";
			Object.defineProperty(process, "execPath", {
				value: join(installDir, "mlens"),
				configurable: true,
			});

			await expect(mlensMain(["update", "--self"])).resolves.toBeUndefined();

			expect(process.exitCode).toBeUndefined();
			expect(errorSpy).not.toHaveBeenCalled();
			expect(readFileSync(join(installDir, "mlens"), "utf-8")).toBe("new-binary");
			const stdout = logSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stdout).toContain("Updated mlens");
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("forces mlens release-binary reinstalls via the latest download url", async () => {
		if (!isSupportedReleaseBinaryPlatform()) {
			return;
		}

		const installDir = join(tempDir, "mlens-force-install");
		const archiveBuffer = createMlensReleaseArchive(tempDir, "forced-binary");
		const expectedArchiveUrl = `https://github.com/97-web3/mlens-cli/releases/latest/download/${getCurrentMlensAssetName()}`;
		mkdirSync(installDir, { recursive: true });
		writeFileSync(join(installDir, "mlens"), "old-binary");
		chmodSync(join(installDir, "mlens"), 0o755);

		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url === expectedArchiveUrl) {
				return new Response(archiveBuffer, { status: 200 });
			}
			throw new Error(`Unexpected fetch url: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const mlensMain = await importMlensMain();
			process.env.PI_PACKAGE_DIR = installDir;
			process.argv[1] = "/$bunfs/root/mlens";
			Object.defineProperty(process, "execPath", {
				value: join(installDir, "mlens"),
				configurable: true,
			});

			await expect(mlensMain(["update", "--self", "--force"])).resolves.toBeUndefined();

			expect(process.exitCode).toBeUndefined();
			expect(errorSpy).not.toHaveBeenCalled();
			expect(fetchMock).toHaveBeenCalledOnce();
			expect(readFileSync(join(installDir, "mlens"), "utf-8")).toBe("forced-binary");
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("falls back to manual mlens updates when the release-binary install is not writable", async () => {
		if (!isSupportedReleaseBinaryPlatform()) {
			return;
		}

		const installDir = join(tempDir, "mlens-readonly-install");
		mkdirSync(installDir, { recursive: true });
		writeFileSync(join(installDir, "mlens"), "old-binary");
		chmodSync(join(installDir, "mlens"), 0o755);
		chmodSync(installDir, 0o500);

		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url === "https://api.github.com/repos/97-web3/mlens-cli/releases/latest") {
				return Response.json({ tag_name: "v0.1.3" });
			}
			throw new Error(`Unexpected fetch url: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const mlensMain = await importMlensMain();
			process.env.PI_PACKAGE_DIR = installDir;
			process.argv[1] = "/$bunfs/root/mlens";
			Object.defineProperty(process, "execPath", {
				value: join(installDir, "mlens"),
				configurable: true,
			});

			await expect(mlensMain(["update", "--self"])).resolves.toBeUndefined();

			expect(process.exitCode).toBe(1);
			const stdout = logSpy.mock.calls.map(([message]) => String(message)).join("\n");
			const stderr = errorSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stdout).not.toContain("Updated mlens");
			expect(stderr).toContain("mlens cannot self-update this installation.");
			expect(stderr).toContain(
				"Re-run: curl -fsSL https://raw.githubusercontent.com/97-web3/mlens-cli/main/install.sh | bash",
			);
			expect(stderr).toContain(`Location of mlens executable: ${join(installDir, "mlens")}`);
			expect(stderr).not.toContain("/$bunfs/root/mlens");
		} finally {
			chmodSync(installDir, 0o700);
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("updates packages before updating the mlens release binary by default", async () => {
		if (!isSupportedReleaseBinaryPlatform()) {
			return;
		}

		const installDir = join(tempDir, "mlens-default-update-install");
		const archiveBuffer = createMlensReleaseArchive(tempDir, "new-default-binary");
		const expectedArchiveUrl = `https://github.com/97-web3/mlens-cli/releases/download/v0.1.3/${getCurrentMlensAssetName()}`;
		mkdirSync(installDir, { recursive: true });
		writeFileSync(join(installDir, "mlens"), "old-binary");
		chmodSync(join(installDir, "mlens"), 0o755);

		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url === "https://api.github.com/repos/97-web3/mlens-cli/releases/latest") {
				return Response.json({ tag_name: "v0.1.3" });
			}
			if (url === expectedArchiveUrl) {
				return new Response(archiveBuffer, { status: 200 });
			}
			throw new Error(`Unexpected fetch url: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const mlensMain = await importMlensMain();
			process.env.PI_PACKAGE_DIR = installDir;
			process.argv[1] = "/$bunfs/root/mlens";
			Object.defineProperty(process, "execPath", {
				value: join(installDir, "mlens"),
				configurable: true,
			});

			await expect(mlensMain(["update"])).resolves.toBeUndefined();

			expect(process.exitCode).toBeUndefined();
			expect(errorSpy).not.toHaveBeenCalled();
			const stdout = logSpy.mock.calls.map(([message]) => String(message)).join("\n");
			expect(stdout.indexOf("Updated packages")).toBeGreaterThanOrEqual(0);
			expect(stdout.indexOf("Updated mlens")).toBeGreaterThan(stdout.indexOf("Updated packages"));
		} finally {
			logSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});
});
