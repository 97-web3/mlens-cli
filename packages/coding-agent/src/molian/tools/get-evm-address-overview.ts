import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import { resolveMolianEvmProviderConfig } from "../chain-config.ts";
import { getEvmAddressOverview } from "../providers/evm.ts";

export function createGetEvmAddressOverviewTool() {
	return defineTool({
		name: "get_evm_address_overview",
		label: "EVM Address Overview",
		description: "Fetch an ETH or BSC address overview from an explorer-style API.",
		promptSnippet:
			"Get an ETH or BSC address overview, including balance, activity timestamps, and recent counterparties.",
		parameters: Type.Object({
			chain: Type.Union([Type.Literal("eth"), Type.Literal("bsc")]),
			address: Type.String({ description: "EVM address to inspect." }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const overview = await getEvmAddressOverview(
				resolveMolianEvmProviderConfig(ctx.modelRegistry.authStorage, params.chain),
				params.chain,
				params.address,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
				details: overview,
			};
		},
	});
}
