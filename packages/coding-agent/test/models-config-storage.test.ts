import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ModelsConfigStorage } from "../src/core/models-config-storage.ts";

describe("ModelsConfigStorage", () => {
	let tempDir: string;
	let modelsJsonPath: string;
	let storage: ModelsConfigStorage;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-test-models-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		modelsJsonPath = join(tempDir, "models.json");
		storage = new ModelsConfigStorage(modelsJsonPath);
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true });
		}
	});

	function readModelsJson(): unknown {
		return JSON.parse(readFileSync(modelsJsonPath, "utf-8"));
	}

	test("writes provider baseUrl to a missing models.json file", () => {
		const result = storage.setProviderBaseUrl("openai", "https://proxy.example.com/v1");

		expect(result).toEqual({
			action: "set",
			path: modelsJsonPath,
		});
		expect(readModelsJson()).toEqual({
			providers: {
				openai: {
					baseUrl: "https://proxy.example.com/v1",
				},
			},
		});
	});

	test("clears provider baseUrl and removes an otherwise empty provider entry", () => {
		writeFileSync(
			modelsJsonPath,
			JSON.stringify({
				providers: {
					openai: {
						baseUrl: "https://proxy.example.com/v1",
					},
				},
			}),
		);

		const result = storage.setProviderBaseUrl("openai");

		expect(result).toEqual({
			action: "cleared",
			path: modelsJsonPath,
		});
		expect(readModelsJson()).toEqual({
			providers: {},
		});
	});

	test("preserves unrelated provider fields and providers when updating baseUrl", () => {
		writeFileSync(
			modelsJsonPath,
			JSON.stringify({
				providers: {
					openai: {
						headers: {
							"x-tenant": "alpha",
						},
						modelOverrides: {
							"gpt-4.1": {
								maxTokens: 4096,
							},
						},
					},
					anthropic: {
						baseUrl: "https://anthropic-proxy.example.com",
					},
				},
			}),
		);

		const result = storage.setProviderBaseUrl("openai", "https://openai-proxy.example.com/v1");

		expect(result).toEqual({
			action: "set",
			path: modelsJsonPath,
		});
		expect(readModelsJson()).toEqual({
			providers: {
				openai: {
					baseUrl: "https://openai-proxy.example.com/v1",
					headers: {
						"x-tenant": "alpha",
					},
					modelOverrides: {
						"gpt-4.1": {
							maxTokens: 4096,
						},
					},
				},
				anthropic: {
					baseUrl: "https://anthropic-proxy.example.com",
				},
			},
		});
	});

	test("throws when an existing models.json file cannot be parsed", () => {
		writeFileSync(modelsJsonPath, "{ invalid json");

		expect(() => storage.setProviderBaseUrl("openai", "https://proxy.example.com/v1")).toThrow(
			/Failed to parse models\.json/,
		);
	});
});
