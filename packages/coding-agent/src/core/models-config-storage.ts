import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { getModelsPath } from "../config.ts";
import { normalizePath } from "../utils/paths.ts";
import { type ModelsConfig, parseModelsConfigContent, validateModelsConfigSemantics } from "./model-registry.ts";

type LockResult<T> = {
	result: T;
	next?: string;
};

export type ProviderBaseUrlUpdateResult = {
	action: "set" | "cleared" | "unchanged";
	path: string;
};

export class ModelsConfigStorage {
	private modelsPath: string;

	constructor(modelsPath: string = getModelsPath()) {
		this.modelsPath = normalizePath(modelsPath);
	}

	private acquireLockSyncWithRetry(path: string): () => void {
		const maxAttempts = 10;
		const delayMs = 20;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return lockfile.lockSync(path, { realpath: false });
			} catch (error) {
				const code =
					typeof error === "object" && error !== null && "code" in error
						? String((error as { code?: unknown }).code)
						: undefined;
				if (code !== "ELOCKED" || attempt === maxAttempts) {
					throw error;
				}
				lastError = error;
				const start = Date.now();
				while (Date.now() - start < delayMs) {
					// Sleep synchronously to avoid forcing async callers.
				}
			}
		}

		throw (lastError as Error) ?? new Error("Failed to acquire models.json lock");
	}

	private withLock<T>(fn: (current: string | undefined) => LockResult<T>): T {
		const dir = dirname(this.modelsPath);
		const fileExists = existsSync(this.modelsPath);
		let release: (() => void) | undefined;

		try {
			if (fileExists) {
				release = this.acquireLockSyncWithRetry(this.modelsPath);
			}

			const current = fileExists ? readFileSync(this.modelsPath, "utf-8") : undefined;
			const { result, next } = fn(current);

			if (next !== undefined) {
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}
				if (!release) {
					release = this.acquireLockSyncWithRetry(this.modelsPath);
				}
				writeFileSync(this.modelsPath, next, "utf-8");
			}

			return result;
		} finally {
			release?.();
		}
	}

	private parseConfig(content: string | undefined): ModelsConfig {
		if (!content) {
			return { providers: {} };
		}

		const parsed = parseModelsConfigContent(content, this.modelsPath);
		if (!parsed.ok) {
			throw new Error(parsed.error);
		}

		validateModelsConfigSemantics(parsed.config);
		return parsed.config;
	}

	setProviderBaseUrl(provider: string, baseUrl?: string): ProviderBaseUrlUpdateResult {
		return this.withLock<ProviderBaseUrlUpdateResult>((current) => {
			const config = this.parseConfig(current);
			const providers = { ...config.providers };
			const normalizedBaseUrl = baseUrl?.trim();
			const currentProvider = providers[provider];

			if (normalizedBaseUrl) {
				providers[provider] = {
					...(currentProvider ?? {}),
					baseUrl: normalizedBaseUrl,
				};

				const nextConfig: ModelsConfig = { ...config, providers };
				validateModelsConfigSemantics(nextConfig);
				return {
					result: { action: "set", path: this.modelsPath },
					next: JSON.stringify(nextConfig, null, 2),
				};
			}

			if (!currentProvider?.baseUrl) {
				return {
					result: { action: "unchanged", path: this.modelsPath },
				};
			}

			const nextProvider = { ...currentProvider };
			delete nextProvider.baseUrl;

			if (Object.keys(nextProvider).length === 0) {
				delete providers[provider];
			} else {
				providers[provider] = nextProvider;
			}

			const nextConfig: ModelsConfig = { ...config, providers };
			validateModelsConfigSemantics(nextConfig);
			return {
				result: { action: "cleared", path: this.modelsPath },
				next: JSON.stringify(nextConfig, null, 2),
			};
		});
	}
}
