import { describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../../src/core/auth-storage.ts";
import type { ExtensionContext, SessionStartEvent } from "../../src/index.ts";
import {
	getMissingRequiredMolianChains,
	maybePromptForMolianChainConfigOnStartup,
	runMolianChainConfigWizard,
} from "../../src/molian/chain-config.ts";

function createStartupContext(
	authStorage: AuthStorage,
	overrides?: {
		confirm?: ReturnType<typeof vi.fn>;
		input?: ReturnType<typeof vi.fn>;
		notify?: ReturnType<typeof vi.fn>;
		hasUI?: boolean;
	},
): ExtensionContext {
	const confirm = overrides?.confirm ?? vi.fn().mockResolvedValue(true);
	const input = overrides?.input ?? vi.fn().mockResolvedValue(undefined);
	const notify = overrides?.notify ?? vi.fn();

	return {
		ui: {
			confirm,
			input,
			notify,
		},
		hasUI: overrides?.hasUI ?? true,
		modelRegistry: { authStorage },
	} as unknown as ExtensionContext;
}

function createStartupEvent(reason: SessionStartEvent["reason"] = "startup"): SessionStartEvent {
	return {
		type: "session_start",
		reason,
	};
}

describe("molian chain config", () => {
	it("reports missing required chain keys", () => {
		const authStorage = AuthStorage.inMemory();

		expect(getMissingRequiredMolianChains(authStorage)).toEqual(["eth", "bsc", "tron"]);
	});

	it("persists entered chain keys and leaves skipped chains unset", async () => {
		const authStorage = AuthStorage.inMemory();
		const notify = vi.fn();
		const input = vi
			.fn()
			.mockResolvedValueOnce("eth-key")
			.mockResolvedValueOnce("")
			.mockResolvedValueOnce("tron-key");
		const ctx = createStartupContext(authStorage, { input, notify });

		const result = await runMolianChainConfigWizard(ctx, {
			chains: ["eth", "bsc", "tron"],
			allowSkip: true,
		});

		expect(result.savedChains).toEqual(["eth", "tron"]);
		expect(result.skippedChains).toEqual(["bsc"]);
		expect(authStorage.get("molian-eth")).toEqual({ type: "api_key", key: "eth-key" });
		expect(authStorage.get("molian-bsc")).toBeUndefined();
		expect(authStorage.get("molian-tron")).toEqual({ type: "api_key", key: "tron-key" });
		expect(notify).toHaveBeenCalledWith(
			"Saved chain API keys for: eth, tron. Remaining unconfigured chains: bsc. Use /chain-config to update later.",
			"info",
		);
	});

	it("lets the user skip startup onboarding and keeps reminding later", async () => {
		const authStorage = AuthStorage.inMemory();
		const confirm = vi.fn().mockResolvedValue(false);
		const input = vi.fn();
		const notify = vi.fn();
		const ctx = createStartupContext(authStorage, { confirm, input, notify });

		await maybePromptForMolianChainConfigOnStartup(ctx, createStartupEvent("startup"));

		expect(confirm).toHaveBeenCalledTimes(1);
		expect(input).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			"Chain API keys are still incomplete. Use /chain-config any time; startup will remind again until eth, bsc, and tron are configured.",
			"warning",
		);
	});

	it("does not prompt on non-startup session reasons", async () => {
		const authStorage = AuthStorage.inMemory();
		const confirm = vi.fn();
		const notify = vi.fn();
		const ctx = createStartupContext(authStorage, { confirm, notify });

		await maybePromptForMolianChainConfigOnStartup(ctx, createStartupEvent("resume"));

		expect(confirm).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
	});
});
