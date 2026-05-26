import type { MolianEvmProviderConfig } from "../chain-config.ts";
import { type AddressOverview, MolianProviderError } from "../tools/types.ts";

interface EtherscanBalanceResponse {
	status: string;
	message: string;
	result: string;
}

interface EtherscanListResponse<T> {
	status: string;
	message: string;
	result: T[] | string;
}

interface EtherscanTx {
	timeStamp: string;
	hash: string;
	from: string;
	to: string;
	value: string;
	tokenSymbol?: string;
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

const DEFAULT_EVM_HISTORY_PAGE_SIZE = 200;
const EXPLORER_EMPTY_RESULT_PATTERNS = [/^no transactions found$/iu, /^no records found$/iu];

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

async function fetchPaginatedResults<T>(
	config: MolianEvmProviderConfig,
	chain: "eth" | "bsc",
	address: string,
	params: Record<string, string>,
	offset: number,
): Promise<T[]> {
	const results: T[] = [];
	for (let page = 1; ; page++) {
		const response = await fetchJson<EtherscanListResponse<T>>(config, chain, {
			...params,
			page: String(page),
			offset: String(offset),
		});
		const pageResults = parseExplorerListResult(response, chain, address);
		results.push(...pageResults);
		if (pageResults.length < offset) {
			break;
		}
	}
	return results;
}

function isExplorerEmptyResult(message: string, result: string): boolean {
	const normalizedMessage = message.trim();
	const normalizedResult = result.trim();
	return EXPLORER_EMPTY_RESULT_PATTERNS.some(
		(pattern) => pattern.test(normalizedMessage) || pattern.test(normalizedResult),
	);
}

function createExplorerProviderError(chain: "eth" | "bsc", address: string, message: string): MolianProviderError {
	return new MolianProviderError({
		code: "provider_error",
		chain,
		address,
		message,
	});
}

function parseExplorerListResult<T>(response: EtherscanListResponse<T>, chain: "eth" | "bsc", address: string): T[] {
	if (Array.isArray(response.result)) {
		return response.result;
	}
	if (isExplorerEmptyResult(response.message, response.result)) {
		return [];
	}
	throw createExplorerProviderError(
		chain,
		address,
		response.result.trim() || response.message.trim() || "Explorer history request failed.",
	);
}

function parseExplorerBalanceResult(response: EtherscanBalanceResponse, chain: "eth" | "bsc", address: string): string {
	if (/^\d+$/u.test(response.result.trim())) {
		return response.result;
	}
	throw createExplorerProviderError(
		chain,
		address,
		response.result.trim() || response.message.trim() || "Explorer balance request failed.",
	);
}

function parseExplorerBigInt(
	value: string | undefined,
	chain: "eth" | "bsc",
	address: string,
	fallbackMessage: string,
): bigint {
	const trimmed = value?.trim() ?? "";
	if (/^\d+$/u.test(trimmed)) {
		return BigInt(trimmed);
	}
	throw createExplorerProviderError(chain, address, trimmed || fallbackMessage);
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
		.map((tx) => {
			const rawValue = parseExplorerBigInt(
				tx.value,
				chain,
				address,
				"Explorer response contained a malformed native transfer value.",
			);
			return {
				timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
				amount: toNative(rawValue.toString()),
				symbol,
				direction: tx.to.toLowerCase() === normalizedAddress ? ("in" as const) : ("out" as const),
				txHash: tx.hash,
				counterpartyAddress:
					tx.to.toLowerCase() === normalizedAddress ? tx.from.toLowerCase() : tx.to.toLowerCase(),
				rawValue,
			};
		})
		.sort((a, b) => (a.rawValue > b.rawValue ? -1 : a.rawValue < b.rawValue ? 1 : 0))
		.slice(0, 3)
		.map(({ rawValue: _rawValue, ...transfer }) => transfer);
}

function summarizeTransferTotals(
	chain: "eth" | "bsc",
	address: string,
	txs: EtherscanTx[],
): { totalIn: string; totalOut: string } {
	const normalizedAddress = address.toLowerCase();
	let totalInWei = 0n;
	let totalOutWei = 0n;
	for (const tx of txs) {
		const rawValue = parseExplorerBigInt(
			tx.value,
			chain,
			address,
			"Explorer response contained a malformed native transfer value.",
		);
		if (tx.to.toLowerCase() === normalizedAddress) {
			totalInWei += rawValue;
		}
		if (tx.from.toLowerCase() === normalizedAddress) {
			totalOutWei += rawValue;
		}
	}
	return {
		totalIn: toNative(totalInWei.toString()),
		totalOut: toNative(totalOutWei.toString()),
	};
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
		fetchPaginatedResults<EtherscanTx>(
			config,
			chain,
			address,
			{
				module: "account",
				action: "txlist",
				address,
				sort: "asc",
				startblock: "0",
				endblock: "99999999",
			},
			DEFAULT_EVM_HISTORY_PAGE_SIZE,
		),
	]);

	const txs = txResponse;
	const firstSeen = txs[0]?.timeStamp;
	const lastSeen = txs[txs.length - 1]?.timeStamp;
	const transferTotals = summarizeTransferTotals(chain, address, txs);
	const nativeBalanceWei = parseExplorerBalanceResult(balanceResponse, chain, address);

	return {
		chain,
		address,
		balanceSummary: {
			nativeSymbol: chain === "eth" ? "ETH" : "BNB",
			nativeBalance: toNative(nativeBalanceWei),
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
			totalIn: transferTotals.totalIn,
			totalOut: transferTotals.totalOut,
			largeTransfers: summarizeLargeTransfers(chain, address, txs),
		},
		counterparties: uniqueCounterparties(address, txs),
		labels: [],
		sourceMeta: {
			provider: chain === "eth" ? "etherscan" : "bscscan",
			partial: true,
			notes: [
				"Overview currently relies on explorer account endpoints.",
				"Native transfer totals are computed from paginated explorer history and remain subject to explorer coverage and rate limits.",
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

	return fetchPaginatedResults<EvmTokenTransfer>(
		config,
		chain,
		address,
		{
			module: "account",
			action: "tokentx",
			address,
			sort: "asc",
			startblock: "0",
			endblock: "99999999",
		},
		options.offset ?? DEFAULT_EVM_HISTORY_PAGE_SIZE,
	);
}
