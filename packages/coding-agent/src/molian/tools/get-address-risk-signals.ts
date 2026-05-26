import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import type { AddressOverview, RiskSignal } from "./types.ts";

export function deriveRiskSignals(overview: AddressOverview): RiskSignal[] {
	const signals: RiskSignal[] = [];

	if (overview.activitySummary.txCount >= 1000) {
		signals.push({
			name: "high_activity_volume",
			severity: "medium",
			evidence: `Observed ${overview.activitySummary.txCount} transactions in the sampled history.`,
		});
	}

	if (
		overview.counterparties.length > 0 &&
		overview.counterparties[0]?.txCount &&
		overview.counterparties[0].txCount >= 10
	) {
		signals.push({
			name: "concentrated_counterparty_pattern",
			severity: "medium",
			evidence: `Top counterparty appears ${overview.counterparties[0].txCount} times in sampled activity.`,
		});
	}

	if (overview.sourceMeta.partial) {
		signals.push({
			name: "partial_public_data",
			severity: "low",
			evidence: "Current judgment is based on partial public explorer data.",
		});
	}

	return signals;
}

export function createGetAddressRiskSignalsTool() {
	return defineTool({
		name: "get_address_risk_signals",
		label: "Address Risk Signals",
		description: "Derive lightweight risk and behavior signals from a normalized address overview.",
		promptSnippet: "Derive lightweight risk signals from a normalized address overview.",
		parameters: Type.Object({
			overview: Type.Any({ description: "Normalized address overview payload." }),
		}),
		execute: async (_toolCallId, params) => {
			const signals = deriveRiskSignals(params.overview as AddressOverview);
			return {
				content: [{ type: "text", text: JSON.stringify(signals, null, 2) }],
				details: signals,
			};
		},
	});
}
