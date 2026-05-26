export type SupportedChain = "eth" | "bsc" | "tron" | "btc" | "sol";

export type ResolvedChainKind = SupportedChain | "evm" | "unknown";

export interface AddressOverview {
	chain: SupportedChain;
	address: string;
	balanceSummary: {
		nativeSymbol: string;
		nativeBalance: string;
		assets?: Array<{ symbol: string; amount: string }>;
	};
	activitySummary: {
		txCount: number;
		firstSeenAt?: string;
		lastSeenAt?: string;
		recentActivityWindow?: string;
	};
	transferSummary: {
		totalIn?: string;
		totalOut?: string;
		largeTransfers?: Array<{
			timestamp?: string;
			amount: string;
			symbol: string;
			direction: "in" | "out";
			txHash?: string;
			counterpartyAddress?: string;
			counterpartyLabel?: string;
		}>;
	};
	counterparties: Array<{
		address: string;
		label?: string;
		txCount?: number;
		relation?: string;
	}>;
	labels: Array<{
		label: string;
		confidence?: "low" | "medium" | "high";
		source?: string;
	}>;
	sourceMeta: {
		provider: string;
		partial: boolean;
		notes: string[];
	};
}

export interface RiskSignal {
	name: string;
	severity: "low" | "medium" | "high";
	evidence: string;
}

export interface ProviderErrorDetails {
	code: "invalid_address" | "chain_ambiguous" | "missing_configuration" | "provider_error" | "not_implemented";
	message: string;
	chain?: SupportedChain | "evm";
	address?: string;
}

export class MolianProviderError extends Error {
	readonly details: ProviderErrorDetails;

	constructor(details: ProviderErrorDetails) {
		super(details.message);
		this.name = "MolianProviderError";
		this.details = details;
	}
}
