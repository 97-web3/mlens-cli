import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import { resolveMolianBtcProviderConfig } from "../chain-config.ts";
import { getBtcAddressOverview } from "../providers/btc.ts";

export function createGetBtcAddressOverviewTool() {
	return defineTool({
		name: "get_btc_address_overview",
		label: "BTC Address Overview",
		description: "Fetch a BTC address overview.",
		promptSnippet: "Get a BTC address overview when BTC support is available.",
		parameters: Type.Object({
			address: Type.String({ description: "BTC address to inspect." }),
		}),
		execute: async (_toolCallId, params) => {
			const overview = await getBtcAddressOverview(resolveMolianBtcProviderConfig(), params.address);
			return {
				content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
				details: overview,
			};
		},
	});
}
