import type { ExtensionAPI, ExtensionFactory } from "../index.ts";
import {
	MOLIAN_CHAIN_CONFIG_COMMAND,
	maybePromptForMolianChainConfigOnStartup,
	runMolianChainConfigWizard,
} from "./chain-config.ts";
import { handleAnalyzeCommand } from "./commands/analyze.ts";
import { handleMolianReportCommand } from "./commands/report.ts";
import { createGetAddressRiskSignalsTool } from "./tools/get-address-risk-signals.ts";
import { createGetBtcAddressOverviewTool } from "./tools/get-btc-address-overview.ts";
import { createGetEvmAddressOverviewTool } from "./tools/get-evm-address-overview.ts";
import { createGetSolAddressOverviewTool } from "./tools/get-sol-address-overview.ts";
import { createGetTronAddressOverviewTool } from "./tools/get-tron-address-overview.ts";
import { createResolveChainTool } from "./tools/resolve-chain.ts";

function molianExtension(pi: ExtensionAPI): void {
	pi.registerCommand("analyze", {
		description: "Analyze a public blockchain address: /analyze <address> [chain]",
		handler: async (args, ctx) => {
			await handleAnalyzeCommand(pi, args, ctx);
		},
	});

	pi.registerCommand("report", {
		description: "Generate an HTML asset-proof report: /report <address> <chain> [output.html]",
		handler: async (args, ctx) => {
			await handleMolianReportCommand(args, ctx);
		},
	});

	pi.registerCommand(MOLIAN_CHAIN_CONFIG_COMMAND, {
		description: "Configure Molian chain API keys for ETH, BSC, and TRON.",
		handler: async (_args, ctx) => {
			await runMolianChainConfigWizard(ctx, { allowSkip: true });
		},
	});

	pi.on("session_start", async (event, ctx) => {
		pi.registerTool(createResolveChainTool());
		pi.registerTool(createGetEvmAddressOverviewTool());
		pi.registerTool(createGetBtcAddressOverviewTool());
		pi.registerTool(createGetTronAddressOverviewTool());
		pi.registerTool(createGetSolAddressOverviewTool());
		pi.registerTool(createGetAddressRiskSignalsTool());

		await maybePromptForMolianChainConfigOnStartup(ctx, event);
	});
}

export function createMolianExtensionFactory(): ExtensionFactory {
	return molianExtension;
}
