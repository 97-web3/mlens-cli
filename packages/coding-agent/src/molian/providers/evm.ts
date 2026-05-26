import type { MolianEvmProviderConfig } from "../chain-config.ts";
import { type AddressOverview, MolianProviderError } from "../tools/types.ts";

interface EtherscanBalanceResponse {
	status: string;
	message: string;
	result: string;
}

interface EtherscanTx {
	timeStamp: string;
	hash: string;
	from: string;
	to: string;
	value: string;
	tokenSymbol?: string;
}

interface EtherscanTxListResponse {
	status: string;
	message: string;
	result: EtherscanTx[] | string;
}

export interface EvmTokenTransfer {
	timeStamp: string;
	hash: string;
	from: string;
	to: string;
	value: string;
	tokenDecimal: string;
	tokenSymbol: string;
	tokenName?: string;
	contractAddress: string;
}

interface EtherscanTokenTxListResponse {
	status: string;
	message: string;
	result: EvmTokenTransfer[] | string;
}

function getMissingConfigMessage(chain: "eth" | "bsc"): string {
	return `Missing ${chain.toUpperCase()} API key. Run /chain-config to configure chain API access.`;
}

function buildChainAwareUrl(
	config: MolianEvmProviderConfig,
	chain: "eth" | "bsc",
	params: Record<string, string>,
): string {
	const url = new URL(config.baseUrl.replace(/\/+$/, ""));
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	if (config.baseUrl.includes("/v2/api")) {
		url.searchParams.set("chainid", chain === "eth" ? "1" : "56");
	}
	url.searchParams.set("apikey", config.apiKey);
	return url.toString();
}

async function fetchJson<T>(
	config: MolianEvmProviderConfig,
	chain: "eth" | "bsc",
	params: Record<string, string>,
): Promise<T> {
	const response = await fetch(buildChainAwareUrl(config, chain, params));
	if (!response.ok) {
		throw new MolianProviderError({
			code: "provider_error",
			chain,
			message: `Provider request failed with status ${response.status}.`,
		});
	}
	return (await response.json()) as T;
}

function toNative(balanceWei: string): string {
	const value = BigInt(balanceWei);
	const whole = value / 1000000000000000000n;
	const fractional = value % 1000000000000000000n;
	if (fractional === 0n) {
		return whole.toString();
	}
	const fractionText = fractional.toString().padStart(18, "0").replace(/0+$/, "");
	return `${whole.toString()}.${fractionText}`;
}

function uniqueCounterparties(address: string, txs: EtherscanTx[]): AddressOverview["counterparties"] {
	const normalizedAddress = address.toLowerCase();
	const counts = new Map<string, number>();
	for (const tx of txs) {
		const from = tx.from.toLowerCase();
		const to = tx.to.toLowerCase();
		const counterparty = from === normalizedAddress ? to : from;
		if (!counterparty || counterparty === normalizedAddress) {
			continue;
		}
		counts.set(counterparty, (counts.get(counterparty) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([counterparty, txCount]) => ({ address: counterparty, txCount, relation: "recent transfer counterparty" }));
}

function summarizeLargeTransfers(
	chain: "eth" | "bsc",
	address: string,
	txs: EtherscanTx[],
): AddressOverview["transferSummary"]["largeTransfers"] {
	const symbol = chain === "eth" ? "ETH" : "BNB";
	const normalizedAddress = address.toLowerCase();
	return txs
		.map((tx) => ({
			timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
			amount: toNative(tx.value),
			symbol,
			direction: tx.to.toLowerCase() === normalizedAddress ? ("in" as const) : ("out" as const),
			txHash: tx.hash,
			counterpartyAddress: tx.to.toLowerCase() === normalizedAddress ? tx.from.toLowerCase() : tx.to.toLowerCase(),
			rawValue: BigInt(tx.value),
		}))
		.sort((a, b) => (a.rawValue > b.rawValue ? -1 : a.rawValue < b.rawValue ? 1 : 0))
		.slice(0, 3)
		.map(({ rawValue: _rawValue, ...transfer }) => transfer);
}

export async function getEvmAddressOverview(
	config: MolianEvmProviderConfig,
	chain: "eth" | "bsc",
	address: string,
): Promise<AddressOverview> {
	if (!config.apiKey.trim()) {
		throw new MolianProviderError({
			code: "missing_configuration",
			chain,
			address,
			message: getMissingConfigMessage(chain),
		});
	}

	const [balanceResponse, txResponse] = await Promise.all([
		fetchJson<EtherscanBalanceResponse>(config, chain, {
			module: "account",
			action: "balance",
			address,
			tag: "latest",
		}),
		fetchJson<EtherscanTxListResponse>(config, chain, {
			module: "account",
			action: "txlist",
			address,
			sort: "asc",
			page: "1",
			offset: "50",
			startblock: "0",
			endblock: "99999999",
		}),
	]);

	const txs = Array.isArray(txResponse.result) ? txResponse.result : [];
	const firstSeen = txs[0]?.timeStamp;
	const lastSeen = txs[txs.length - 1]?.timeStamp;

	return {
		chain,
		address,
		balanceSummary: {
			nativeSymbol: chain === "eth" ? "ETH" : "BNB",
			nativeBalance: toNative(balanceResponse.result || "0"),
		},
		activitySummary: {
			txCount: txs.length,
			firstSeenAt: firstSeen ? new Date(Number(firstSeen) * 1000).toISOString() : undefined,
			lastSeenAt: lastSeen ? new Date(Number(lastSeen) * 1000).toISOString() : undefined,
			recentActivityWindow:
				lastSeen && firstSeen
					? `${new Date(Number(firstSeen) * 1000).toISOString()} -> ${new Date(Number(lastSeen) * 1000).toISOString()}`
					: undefined,
		},
		transferSummary: {
			largeTransfers: summarizeLargeTransfers(chain, address, txs),
		},
		counterparties: uniqueCounterparties(address, txs),
		labels: [],
		sourceMeta: {
			provider: chain === "eth" ? "etherscan" : "bscscan",
			partial: true,
			notes: [
				"Overview currently relies on explorer account endpoints.",
				"Total in/out and richer labeling are not fully available in the MVP provider.",
			],
		},
	};
}

export async function getEvmTokenTransfers(
	config: MolianEvmProviderConfig,
	chain: "eth" | "bsc",
	address: string,
	options: { offset?: number } = {},
): Promise<EvmTokenTransfer[]> {
	if (!config.apiKey.trim()) {
		throw new MolianProviderError({
			code: "missing_configuration",
			chain,
			address,
			message: getMissingConfigMessage(chain),
		});
	}

	const response = await fetchJson<EtherscanTokenTxListResponse>(config, chain, {
		module: "account",
		action: "tokentx",
		address,
		sort: "asc",
		page: "1",
		offset: String(options.offset ?? 200),
		startblock: "0",
		endblock: "99999999",
	});

	return Array.isArray(response.result) ? response.result : [];
}
