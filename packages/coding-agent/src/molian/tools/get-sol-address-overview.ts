import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import { getSolAddressOverview } from "../providers/sol.ts";

export function createGetSolAddressOverviewTool() {
	return defineTool({
		name: "get_sol_address_overview",
		label: "SOL Address Overview",
		description: "Fetch a SOL address overview.",
		promptSnippet: "Get a SOL address overview when SOL support is available.",
		parameters: Type.Object({
			address: Type.String({ description: "SOL address to inspect." }),
		}),
		execute: async (_toolCallId, params) => {
			const overview = await getSolAddressOverview(params.address);
			return {
				content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
				details: overview,
			};
		},
	});
}
