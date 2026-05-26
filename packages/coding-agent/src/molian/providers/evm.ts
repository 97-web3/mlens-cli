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

function getEnv(name: string): string | undefined {
	const value = process.env[name];
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function getBaseUrl(chain: "eth" | "bsc"): string {
	const explicit = chain === "eth" ? getEnv("MOLIAN_ETH_API_URL") : getEnv("MOLIAN_BSC_API_URL");
	if (explicit) {
		return explicit.replace(/\/+$/, "");
	}

	return chain === "eth" ? "https://api.etherscan.io/api" : "https://api.bscscan.com/api";
}

function getApiKey(chain: "eth" | "bsc"): string | undefined {
	return chain === "eth" ? getEnv("MOLIAN_ETH_API_KEY") : getEnv("MOLIAN_BSC_API_KEY");
}

function buildUrl(chain: "eth" | "bsc", params: Record<string, string>): string {
	const url = new URL(getBaseUrl(chain));
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	const apiKey = getApiKey(chain);
	if (apiKey) {
		url.searchParams.set("apikey", apiKey);
	}
	return url.toString();
}

async function fetchJson<T>(chain: "eth" | "bsc", params: Record<string, string>): Promise<T> {
	const response = await fetch(buildUrl(chain, params));
	if (!response.ok) {
		throw new MolianProviderError({
			code: "provider_error",
			chain,
			message: `Provider request failed with status ${response.status}.`,
		});
	}
	return (await response.json()) as T;
}

function toEth(balanceWei: string): string {
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

function summarizeLargeTransfers(txs: EtherscanTx[]): AddressOverview["transferSummary"]["largeTransfers"] {
	return txs
		.map((tx) => ({
			timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
			amount: toEth(tx.value),
			symbol: "ETH",
			direction: "out" as const,
			rawValue: BigInt(tx.value),
		}))
		.sort((a, b) => (a.rawValue > b.rawValue ? -1 : a.rawValue < b.rawValue ? 1 : 0))
		.slice(0, 3)
		.map(({ rawValue: _rawValue, ...transfer }) => transfer);
}

export async function getEvmAddressOverview(chain: "eth" | "bsc", address: string): Promise<AddressOverview> {
	if (!getApiKey(chain)) {
		throw new MolianProviderError({
			code: "missing_configuration",
			chain,
			address,
			message: `Missing ${chain === "eth" ? "MOLIAN_ETH_API_KEY" : "MOLIAN_BSC_API_KEY"} environment variable.`,
		});
	}

	const [balanceResponse, txResponse] = await Promise.all([
		fetchJson<EtherscanBalanceResponse>(chain, {
			module: "account",
			action: "balance",
			address,
			tag: "latest",
		}),
		fetchJson<EtherscanTxListResponse>(chain, {
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
			nativeBalance: toEth(balanceResponse.result || "0"),
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
			largeTransfers: summarizeLargeTransfers(txs),
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
