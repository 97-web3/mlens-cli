import type { ExtensionAPI, ExtensionFactory } from "../index.ts";
import {
	MOLIAN_CHAIN_CONFIG_COMMAND,
	maybePromptForMolianChainConfigOnStartup,
	runMolianChainConfigWizard,
} from "./chain-config.ts";
import {
	buildMolianReportWorkflowPrompt,
	handleMolianReportCommand,
	maybeCreateMolianReportWorkflowRequest,
} from "./commands/report.ts";
import { MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE, renderMolianReportProgressMessage } from "./report-progress.ts";
import { createBuildMolianAssetProofReportTool } from "./tools/build-molian-asset-proof-report.ts";
import { createCollectMolianAssetProofDataTool } from "./tools/collect-molian-asset-proof-data.ts";
import { createGetAddressRiskSignalsTool } from "./tools/get-address-risk-signals.ts";
import { createGetBtcAddressOverviewTool } from "./tools/get-btc-address-overview.ts";
import { createGetEvmAddressOverviewTool } from "./tools/get-evm-address-overview.ts";
import { createGetSolAddressOverviewTool } from "./tools/get-sol-address-overview.ts";
import { createGetTronAddressOverviewTool } from "./tools/get-tron-address-overview.ts";
import { createResolveChainTool } from "./tools/resolve-chain.ts";
import { createWriteMolianAssetProofReportHtmlTool } from "./tools/write-molian-asset-proof-report-html.ts";

function molianExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer(MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE, renderMolianReportProgressMessage);

	pi.registerCommand("report", {
		description: "Generate an HTML asset-proof report: /report <address> <chain> [output.html]",
		handler: async (args, ctx) => {
			await handleMolianReportCommand(pi, args, ctx);
		},
	});

	pi.registerCommand(MOLIAN_CHAIN_CONFIG_COMMAND, {
		description: "Configure Molian chain API keys for ETH, BSC, and TRON.",
		handler: async (_args, ctx) => {
			await runMolianChainConfigWizard(ctx, { allowSkip: true });
		},
	});

	pi.on("input", async (event) => {
		if (event.source !== "interactive" || event.text.trimStart().startsWith("/")) {
			return { action: "continue" };
		}

		const request = maybeCreateMolianReportWorkflowRequest(event.text);
		if (!request) {
			return { action: "continue" };
		}

		return {
			action: "transform",
			text: buildMolianReportWorkflowPrompt(request),
			images: event.images,
		};
	});

	pi.on("session_start", async (event, ctx) => {
		pi.registerTool(createResolveChainTool());
		pi.registerTool(createCollectMolianAssetProofDataTool());
		pi.registerTool(createBuildMolianAssetProofReportTool());
		pi.registerTool(createWriteMolianAssetProofReportHtmlTool());
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
