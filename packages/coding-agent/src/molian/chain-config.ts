import type { AuthStorage } from "../core/auth-storage.ts";
import type { ExtensionCommandContext, ExtensionContext, SessionStartEvent } from "../index.ts";

export type MolianConfigurableChain = "eth" | "bsc" | "tron";
export type MolianEvmChain = "eth" | "bsc";

export interface MolianEvmProviderConfig {
	baseUrl: string;
	apiKey: string;
}

export interface MolianTronProviderConfig {
	baseUrl: string;
	apiKey: string;
}

export interface MolianBtcProviderConfig {
	baseUrl: string;
}

export interface MolianChainConfigWizardOptions {
	chains?: MolianConfigurableChain[];
	allowSkip?: boolean;
}

export interface MolianChainConfigWizardResult {
	savedChains: MolianConfigurableChain[];
	skippedChains: MolianConfigurableChain[];
	cancelled: boolean;
}

const REQUIRED_CHAINS: MolianConfigurableChain[] = ["eth", "bsc", "tron"];
const DEFAULT_EVM_BASE_URLS: Record<MolianEvmChain, string> = {
	eth: "https://api.etherscan.io/api",
	bsc: "https://api.bscscan.com/api",
};
const DEFAULT_TRON_BASE_URL = "https://api.trongrid.io";
const DEFAULT_BTC_BASE_URL = "https://mempool.space/api";

export const MOLIAN_CHAIN_CONFIG_COMMAND = "chain-config";

function getChainAuthProviderId(chain: MolianConfigurableChain): string {
	return `molian-${chain}`;
}

function getChainInputLabel(chain: MolianConfigurableChain): string {
	return `${chain.toUpperCase()} API key`;
}

function saveChainApiKey(authStorage: AuthStorage, chain: MolianConfigurableChain, apiKey: string): void {
	authStorage.drainErrors();
	authStorage.set(getChainAuthProviderId(chain), { type: "api_key", key: apiKey });
	const errors = authStorage.drainErrors();
	if (errors.length > 0) {
		throw errors[0];
	}
}

function getAuthStorage(ctx: ExtensionContext | ExtensionCommandContext): AuthStorage {
	return ctx.modelRegistry.authStorage;
}

function getStoredChainApiKey(authStorage: AuthStorage, chain: MolianConfigurableChain): string | undefined {
	const credential = authStorage.get(getChainAuthProviderId(chain));
	if (credential?.type !== "api_key") {
		return undefined;
	}
	const trimmedKey = credential.key.trim();
	return trimmedKey ? trimmedKey : undefined;
}

export function getMissingRequiredMolianChains(authStorage: AuthStorage): MolianConfigurableChain[] {
	return REQUIRED_CHAINS.filter((chain) => !getStoredChainApiKey(authStorage, chain));
}

export function resolveMolianEvmProviderConfig(
	authStorage: AuthStorage,
	chain: MolianEvmChain,
): MolianEvmProviderConfig {
	return {
		baseUrl: DEFAULT_EVM_BASE_URLS[chain],
		apiKey: getStoredChainApiKey(authStorage, chain) ?? "",
	};
}

export function resolveMolianTronProviderConfig(authStorage: AuthStorage): MolianTronProviderConfig {
	return {
		baseUrl: DEFAULT_TRON_BASE_URL,
		apiKey: getStoredChainApiKey(authStorage, "tron") ?? "",
	};
}

export function resolveMolianBtcProviderConfig(): MolianBtcProviderConfig {
	return {
		baseUrl: DEFAULT_BTC_BASE_URL,
	};
}

export async function runMolianChainConfigWizard(
	ctx: ExtensionContext | ExtensionCommandContext,
	options: MolianChainConfigWizardOptions = {},
): Promise<MolianChainConfigWizardResult> {
	const authStorage = getAuthStorage(ctx);
	const chains = options.chains ?? REQUIRED_CHAINS;
	const savedChains: MolianConfigurableChain[] = [];
	const skippedChains: MolianConfigurableChain[] = [];

	for (const chain of chains) {
		const existing = authStorage.get(getChainAuthProviderId(chain));
		const placeholder =
			existing?.type === "api_key" ? "Leave blank to keep the current key" : "Leave blank to skip for now";
		const value = await ctx.ui.input(getChainInputLabel(chain), placeholder);
		if (value === undefined) {
			return { savedChains, skippedChains, cancelled: true };
		}

		const trimmedValue = value.trim();
		if (!trimmedValue) {
			if (!existing && options.allowSkip !== false) {
				skippedChains.push(chain);
			}
			continue;
		}

		saveChainApiKey(authStorage, chain, trimmedValue);
		savedChains.push(chain);
	}

	if (savedChains.length > 0 || skippedChains.length > 0) {
		if (skippedChains.length > 0) {
			const savedPrefix =
				savedChains.length > 0
					? `Saved chain API keys for: ${savedChains.join(", ")}. `
					: "No new chain API keys were saved. ";
			ctx.ui.notify(
				`${savedPrefix}Remaining unconfigured chains: ${skippedChains.join(", ")}. Use /${MOLIAN_CHAIN_CONFIG_COMMAND} to update later.`,
				"info",
			);
		} else {
			ctx.ui.notify(`Saved chain API keys for: ${savedChains.join(", ")}.`, "info");
		}
	}

	return {
		savedChains,
		skippedChains,
		cancelled: false,
	};
}

export async function maybePromptForMolianChainConfigOnStartup(
	ctx: ExtensionContext,
	event: SessionStartEvent,
): Promise<void> {
	if (event.reason !== "startup" || !ctx.hasUI) {
		return;
	}

	const missingChains = getMissingRequiredMolianChains(getAuthStorage(ctx));
	if (missingChains.length === 0) {
		return;
	}

	const shouldConfigure = await ctx.ui.confirm(
		"Configure chain APIs",
		`Configure API keys for ${missingChains.join(", ")} now? BTC uses the public mempool adapter by default.`,
	);
	if (!shouldConfigure) {
		ctx.ui.notify(
			`Chain API keys are still incomplete. Use /${MOLIAN_CHAIN_CONFIG_COMMAND} any time; startup will remind again until eth, bsc, and tron are configured.`,
			"warning",
		);
		return;
	}

	const result = await runMolianChainConfigWizard(ctx, {
		chains: missingChains,
		allowSkip: true,
	});
	if (result.cancelled) {
		ctx.ui.notify(
			`Chain setup was cancelled. Use /${MOLIAN_CHAIN_CONFIG_COMMAND} any time; startup will remind again until eth, bsc, and tron are configured.`,
			"warning",
		);
	}
}
