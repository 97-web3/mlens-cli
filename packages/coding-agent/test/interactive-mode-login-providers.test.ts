import { describe, expect, test } from "vitest";
import type { AuthSelectorProvider } from "../src/modes/interactive/components/oauth-selector.ts";
import { filterLoginProviderOptionsForApp } from "../src/modes/interactive/interactive-mode.ts";

describe("filterLoginProviderOptionsForApp", () => {
	test("keeps only openai API-key providers for mlens", () => {
		const options: AuthSelectorProvider[] = [
			{ id: "anthropic", name: "Anthropic", authType: "api_key" },
			{ id: "deepseek", name: "DeepSeek", authType: "api_key" },
			{ id: "openai", name: "OpenAI", authType: "api_key" },
			{ id: "github-copilot", name: "GitHub Copilot", authType: "oauth" },
		];

		expect(filterLoginProviderOptionsForApp(options, "mlens")).toEqual([
			{ id: "openai", name: "OpenAI", authType: "api_key" },
			{ id: "github-copilot", name: "GitHub Copilot", authType: "oauth" },
		]);
	});

	test("does not filter providers for the main pi app", () => {
		const options: AuthSelectorProvider[] = [
			{ id: "anthropic", name: "Anthropic", authType: "api_key" },
			{ id: "openai", name: "OpenAI", authType: "api_key" },
		];

		expect(filterLoginProviderOptionsForApp(options, "pi")).toEqual(options);
	});
});
