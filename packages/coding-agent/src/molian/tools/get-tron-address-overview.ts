import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import { resolveMolianTronProviderConfig } from "../chain-config.ts";
import { getTronAddressOverview } from "../providers/tron.ts";

export function createGetTronAddressOverviewTool() {
	return defineTool({
		name: "get_tron_address_overview",
		label: "TRON Address Overview",
		description: "Fetch a TRON address overview from TronGrid account endpoints.",
		promptSnippet: "Get a TRON address overview, including balance, activity timestamps, and recent counterparties.",
		parameters: Type.Object({
			address: Type.String({ description: "TRON address to inspect." }),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const overview = await getTronAddressOverview(
				resolveMolianTronProviderConfig(ctx.modelRegistry.authStorage),
				params.address,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
				details: overview,
			};
		},
	});
}
