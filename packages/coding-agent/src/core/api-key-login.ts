export type ApiKeyLoginConfig = {
	apiKey: string;
	baseUrlAction: "skip" | "set" | "clear";
	baseUrl?: string;
};

type PromptFn = (message: string, placeholder?: string) => Promise<string>;

const API_KEY_BASE_URL_PLACEHOLDERS: Record<string, string> = {
	anthropic: "https://api.anthropic.com",
	openai: "https://api.openai.com/v1",
};

export function shouldPromptForProviderBaseUrl(providerId: string): boolean {
	return providerId in API_KEY_BASE_URL_PLACEHOLDERS;
}

export async function collectApiKeyLoginConfig(providerId: string, prompt: PromptFn): Promise<ApiKeyLoginConfig> {
	const apiKey = (await prompt("Enter API key:")).trim();
	if (!apiKey) {
		throw new Error("API key cannot be empty.");
	}

	if (!shouldPromptForProviderBaseUrl(providerId)) {
		return {
			apiKey,
			baseUrlAction: "skip",
		};
	}

	const baseUrl = (
		await prompt(
			"Enter base URL (leave blank to use the official endpoint):",
			API_KEY_BASE_URL_PLACEHOLDERS[providerId],
		)
	).trim();

	if (!baseUrl) {
		return {
			apiKey,
			baseUrlAction: "clear",
		};
	}

	return {
		apiKey,
		baseUrl,
		baseUrlAction: "set",
	};
}
