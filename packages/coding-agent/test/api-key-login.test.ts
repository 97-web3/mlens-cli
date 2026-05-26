import { describe, expect, test } from "vitest";
import { collectApiKeyLoginConfig } from "../src/core/api-key-login.ts";

describe("collectApiKeyLoginConfig", () => {
	test("prompts OpenAI logins for both API key and baseUrl", async () => {
		const prompts: Array<{ message: string; placeholder?: string }> = [];
		const responses = ["sk-openai", "https://proxy.example.com/v1"];

		const result = await collectApiKeyLoginConfig("openai", async (message, placeholder) => {
			prompts.push({ message, placeholder });
			return responses.shift() ?? "";
		});

		expect(prompts).toEqual([
			{ message: "Enter API key:", placeholder: undefined },
			{
				message: "Enter base URL (leave blank to use the official endpoint):",
				placeholder: "https://api.openai.com/v1",
			},
		]);
		expect(result).toEqual({
			apiKey: "sk-openai",
			baseUrl: "https://proxy.example.com/v1",
			baseUrlAction: "set",
		});
	});

	test("treats a blank Anthropic baseUrl as clearing the override", async () => {
		const prompts: Array<{ message: string; placeholder?: string }> = [];
		const responses = ["sk-ant", "   "];

		const result = await collectApiKeyLoginConfig("anthropic", async (message, placeholder) => {
			prompts.push({ message, placeholder });
			return responses.shift() ?? "";
		});

		expect(prompts).toEqual([
			{ message: "Enter API key:", placeholder: undefined },
			{
				message: "Enter base URL (leave blank to use the official endpoint):",
				placeholder: "https://api.anthropic.com",
			},
		]);
		expect(result).toEqual({
			apiKey: "sk-ant",
			baseUrlAction: "clear",
		});
	});

	test("does not prompt unsupported providers for a baseUrl", async () => {
		const prompts: Array<{ message: string; placeholder?: string }> = [];

		const result = await collectApiKeyLoginConfig("deepseek", async (message, placeholder) => {
			prompts.push({ message, placeholder });
			return "sk-deepseek";
		});

		expect(prompts).toEqual([{ message: "Enter API key:", placeholder: undefined }]);
		expect(result).toEqual({
			apiKey: "sk-deepseek",
			baseUrlAction: "skip",
		});
	});

	test("rejects empty API keys", async () => {
		await expect(collectApiKeyLoginConfig("openai", async () => "   ")).rejects.toThrow("API key cannot be empty.");
	});
});
