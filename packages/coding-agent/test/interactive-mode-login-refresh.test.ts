import { beforeAll, describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("InteractiveMode.completeProviderAuthentication", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("rebinds the current model when login updates the active provider", async () => {
		const refreshedModel = {
			provider: "openai",
			id: "gpt-5.4",
		};
		const previousModel = {
			provider: "openai",
			id: "gpt-5.4",
		};
		const setModel = vi.fn().mockResolvedValue(undefined);
		const showStatus = vi.fn();
		const showError = vi.fn();

		const fakeThis: any = {
			session: {
				modelRegistry: {
					refresh: vi.fn(),
					getAvailable: vi.fn(() => [refreshedModel]),
					find: vi.fn(() => refreshedModel),
				},
				setModel,
			},
			updateAvailableProviderCount: vi.fn().mockResolvedValue(undefined),
			footer: { invalidate: vi.fn() },
			updateEditorBorderColor: vi.fn(),
			showStatus,
			showError,
			maybeWarnAboutAnthropicSubscriptionAuth: vi.fn(),
			checkDaxnutsEasterEgg: vi.fn(),
		};

		await (InteractiveMode as any).prototype.completeProviderAuthentication.call(
			fakeThis,
			"openai",
			"OpenAI",
			"api_key",
			previousModel,
			"Credentials saved to /tmp/auth.json; endpoint override saved to /tmp/models.json",
		);

		expect(fakeThis.session.modelRegistry.refresh).toHaveBeenCalledTimes(1);
		expect(fakeThis.session.modelRegistry.find).toHaveBeenCalledWith("openai", "gpt-5.4");
		expect(setModel).toHaveBeenCalledWith(refreshedModel);
		expect(showStatus).toHaveBeenCalledWith(
			"Saved API key for OpenAI. Selected gpt-5.4. Credentials saved to /tmp/auth.json; endpoint override saved to /tmp/models.json",
		);
		expect(showError).not.toHaveBeenCalled();
	});
});
