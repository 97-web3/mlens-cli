import type { ExtensionAPI, ExtensionFactory } from "../index.ts";
import { handleAnalyzeCommand } from "./commands/analyze.ts";
import { createGetAddressRiskSignalsTool } from "./tools/get-address-risk-signals.ts";
import { createGetBtcAddressOverviewTool } from "./tools/get-btc-address-overview.ts";
import { createGetEvmAddressOverviewTool } from "./tools/get-evm-address-overview.ts";
import { createGetSolAddressOverviewTool } from "./tools/get-sol-address-overview.ts";
import { createResolveChainTool } from "./tools/resolve-chain.ts";

function molianExtension(pi: ExtensionAPI): void {
	pi.registerCommand("analyze", {
		description: "Analyze a public blockchain address: /analyze <address> [chain]",
		handler: async (args, ctx) => {
			await handleAnalyzeCommand(pi, args, ctx);
		},
	});

	pi.on("session_start", () => {
		pi.registerTool(createResolveChainTool());
		pi.registerTool(createGetEvmAddressOverviewTool());
		pi.registerTool(createGetBtcAddressOverviewTool());
		pi.registerTool(createGetSolAddressOverviewTool());
		pi.registerTool(createGetAddressRiskSignalsTool());
	});
}

export function createMolianExtensionFactory(): ExtensionFactory {
	return molianExtension;
}
