import type { MolianTronProviderConfig } from "../chain-config.ts";
import { type AddressOverview, MolianProviderError } from "../tools/types.ts";

interface TronFrozenEntry {
	amount?: number;
	type?: string;
}

interface TronAccount {
	address: string;
	balance?: number;
	create_time?: number;
	frozenV2?: TronFrozenEntry[];
	frozen?: TronFrozenEntry[];
	trc20?: Array<Record<string, string>>;
}

interface TronAccountResponse {
	data?: TronAccount[];
}

interface TronTransferContractValue {
	owner_address?: string;
	to_address?: string;
	amount?: number;
}

interface TronTransaction {
	txID: string;
	block_timestamp?: number;
	raw_data?: {
		timestamp?: number;
		contract?: Array<{
			parameter?: {
				value?: TronTransferContractValue;
			};
		}>;
	};
}

interface TronPaginatedResponse<T> {
	data?: T[];
	meta?: {
		fingerprint?: string;
		links?: { next?: string };
	};
}

export interface TronTokenTransfer {
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

interface TronRawTrc20Transfer {
	transaction_id?: string;
	block_timestamp?: number;
	from?: string;
	to?: string;
	value?: string;
	token_info?: {
		symbol?: string;
		decimals?: number;
		name?: string;
		address?: string;
	};
}

const DEFAULT_TRON_PAGE_SIZE = 200;
const DEFAULT_TRON_MAX_PAGES = 1000;
const TRON_UPGRADE_HINT = "Upgrade or change the TronGrid API key/plan, then retry.";

function sunToTrx(value: number | bigint): string {
	const sun = typeof value === "bigint" ? value : BigInt(value);
	const whole = sun / 1000000n;
	const fractional = sun % 1000000n;
	if (fractional === 0n) {
		return whole.toString();
	}
	return `${whole.toString()}.${fractional.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

function tokenAmountToString(value: bigint, decimals: number): string {
	if (decimals <= 0) {
		return value.toString();
	}
	const sign = value < 0n ? "-" : "";
	const absolute = value < 0n ? -value : value;
	const scale = 10n ** BigInt(decimals);
	const whole = absolute / scale;
	const fraction = absolute % scale;
	if (fraction === 0n) {
		return `${sign}${whole.toString()}`;
	}
	return `${sign}${whole.toString()}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function buildTronUrl(config: MolianTronProviderConfig, path: string, params: Record<string, string> = {}): string {
	const url = new URL(`${config.baseUrl.replace(/\/+$/, "")}${path}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

function createTronProviderError(address: string, message: string): MolianProviderError {
	return new MolianProviderError({
		code: "provider_error",
		chain: "tron",
		address,
		message: `${message} ${TRON_UPGRADE_HINT}`,
	});
}

async function fetchJson<T>(
	config: MolianTronProviderConfig,
	url: string,
	options: { address: string; operation: string },
): Promise<T> {
	const response = await fetch(url, {
		headers: {
			"TRON-PRO-API-KEY": config.apiKey,
		},
	});
	if (!response.ok) {
		throw createTronProviderError(
			options.address,
			`TronGrid request for ${options.operation} failed with status ${response.status} while collecting exact TRON history.`,
		);
	}
	return (await response.json()) as T;
}

async function fetchPaginated<T>(
	config: MolianTronProviderConfig,
	address: string,
	operation: string,
	path: string,
	baseParams: Record<string, string>,
): Promise<T[]> {
	const items: T[] = [];
	let fingerprint: string | undefined;
	const seenFingerprints = new Set<string>();

	for (let page = 1; page <= DEFAULT_TRON_MAX_PAGES; page += 1) {
		const params = { ...baseParams };
		if (fingerprint) {
			params.fingerprint = fingerprint;
		}
		const response = await fetchJson<TronPaginatedResponse<T>>(config, buildTronUrl(config, path, params), {
			address,
			operation,
		});
		const pageItems = response.data ?? [];
		items.push(...pageItems);
		fingerprint = response.meta?.fingerprint;
		if (!fingerprint) {
			return items;
		}
		if (pageItems.length === 0) {
			throw createTronProviderError(
				address,
				`TronGrid returned an empty continuation page while collecting exact TRON ${operation}.`,
			);
		}
		if (seenFingerprints.has(fingerprint)) {
			throw createTronProviderError(
				address,
				`TronGrid returned a repeated pagination fingerprint while collecting exact TRON ${operation}.`,
			);
		}
		seenFingerprints.add(fingerprint);
	}

	throw createTronProviderError(
		address,
		`Could not complete exact TRON ${operation} within ${DEFAULT_TRON_MAX_PAGES} pages.`,
	);
}

function getTxTimestamp(tx: TronTransaction | undefined): number | undefined {
	return tx?.block_timestamp ?? tx?.raw_data?.timestamp;
}

function getCounterparties(address: string, txs: TronTransaction[]): AddressOverview["counterparties"] {
	const normalizedAddress = address.toLowerCase();
	const counts = new Map<string, number>();
	for (const tx of txs) {
		const value = tx.raw_data?.contract?.[0]?.parameter?.value;
		const from = value?.owner_address?.toLowerCase();
		const to = value?.to_address?.toLowerCase();
		const counterparty = from === normalizedAddress ? to : from;
		if (!counterparty || counterparty === normalizedAddress) {
			continue;
		}
		counts.set(counterparty, (counts.get(counterparty) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([counterparty, txCount]) => ({
			address: counterparty,
			txCount,
			relation: "recent TRX transfer counterparty",
		}));
}

function getLargeTransfers(
	address: string,
	txs: TronTransaction[],
): AddressOverview["transferSummary"]["largeTransfers"] {
	const normalizedAddress = address.toLowerCase();
	return txs
		.map((tx) => {
			const value = tx.raw_data?.contract?.[0]?.parameter?.value;
			const amount = value?.amount ?? 0;
			if (amount <= 0) {
				return undefined;
			}

			const from = value?.owner_address?.toLowerCase();
			const to = value?.to_address?.toLowerCase();
			const direction =
				to === normalizedAddress ? ("in" as const) : from === normalizedAddress ? ("out" as const) : undefined;
			if (!direction) {
				return undefined;
			}

			const timestamp = getTxTimestamp(tx);
			return {
				timestamp: timestamp ? new Date(timestamp).toISOString() : undefined,
				amount: sunToTrx(amount),
				symbol: "TRX",
				direction,
				txHash: tx.txID,
				counterpartyAddress: direction === "in" ? from : to,
				rawValue: amount,
			};
		})
		.filter((transfer): transfer is NonNullable<typeof transfer> => transfer !== undefined)
		.sort((a, b) => b.rawValue - a.rawValue)
		.slice(0, 3)
		.map(({ rawValue: _rawValue, ...transfer }) => transfer);
}

function summarizeTransferTotals(address: string, txs: TronTransaction[]): { totalIn: string; totalOut: string } {
	const normalizedAddress = address.toLowerCase();
	let totalInSun = 0n;
	let totalOutSun = 0n;
	for (const tx of txs) {
		const value = tx.raw_data?.contract?.[0]?.parameter?.value;
		const amount = BigInt(value?.amount ?? 0);
		if (amount <= 0n) {
			continue;
		}
		const from = value?.owner_address?.toLowerCase();
		const to = value?.to_address?.toLowerCase();
		if (to === normalizedAddress) {
			totalInSun += amount;
		}
		if (from === normalizedAddress) {
			totalOutSun += amount;
		}
	}
	return {
		totalIn: sunToTrx(totalInSun),
		totalOut: sunToTrx(totalOutSun),
	};
}

function sumFrozenSun(entries: TronFrozenEntry[] | undefined): bigint {
	if (!entries) {
		return 0n;
	}
	let total = 0n;
	for (const entry of entries) {
		const amount = entry.amount ?? 0;
		if (amount > 0) {
			total += BigInt(amount);
		}
	}
	return total;
}

function buildTrc20TokenInfo(
	transfers: TronRawTrc20Transfer[],
): Map<string, { symbol: string; decimals: number; name?: string }> {
	const map = new Map<string, { symbol: string; decimals: number; name?: string }>();
	for (const transfer of transfers) {
		const contractAddress = transfer.token_info?.address;
		if (!contractAddress) {
			continue;
		}
		const key = contractAddress.toLowerCase();
		if (map.has(key)) {
			continue;
		}
		map.set(key, {
			symbol: transfer.token_info?.symbol?.trim() || "UNKNOWN",
			decimals: typeof transfer.token_info?.decimals === "number" ? transfer.token_info.decimals : 0,
			name: transfer.token_info?.name?.trim() || undefined,
		});
	}
	return map;
}

function buildTrc20Assets(
	account: TronAccount | undefined,
	tokenInfo: Map<string, { symbol: string; decimals: number; name?: string }>,
): Array<{ symbol: string; amount: string }> {
	const balances = account?.trc20 ?? [];
	const assets: Array<{ symbol: string; amount: string; raw: bigint }> = [];
	for (const entry of balances) {
		for (const [contractAddress, rawAmount] of Object.entries(entry)) {
			const trimmed = rawAmount?.trim();
			if (!trimmed || !/^\d+$/u.test(trimmed)) {
				continue;
			}
			const raw = BigInt(trimmed);
			if (raw <= 0n) {
				continue;
			}
			const info = tokenInfo.get(contractAddress.toLowerCase());
			const symbol = info?.symbol ?? contractAddress;
			const decimals = info?.decimals ?? 0;
			assets.push({ symbol, amount: tokenAmountToString(raw, decimals), raw });
		}
	}
	return assets
		.sort((a, b) => (a.raw > b.raw ? -1 : a.raw < b.raw ? 1 : 0))
		.map(({ symbol, amount }) => ({ symbol, amount }));
}

function normalizeTrc20Transfer(raw: TronRawTrc20Transfer): TronTokenTransfer | undefined {
	if (!raw.transaction_id || !raw.token_info?.address) {
		return undefined;
	}
	const value = raw.value?.trim();
	if (!value || !/^\d+$/u.test(value)) {
		return undefined;
	}
	const blockTimestampMs = raw.block_timestamp ?? 0;
	const timeStampSeconds = Math.floor(blockTimestampMs / 1000).toString();
	return {
		timeStamp: timeStampSeconds,
		hash: raw.transaction_id,
		from: raw.from ?? "",
		to: raw.to ?? "",
		value,
		tokenDecimal: String(raw.token_info?.decimals ?? 0),
		tokenSymbol: raw.token_info?.symbol?.trim() || "UNKNOWN",
		tokenName: raw.token_info?.name?.trim() || undefined,
		contractAddress: raw.token_info.address,
	};
}

function pickEarliest(values: Array<number | undefined>): number | undefined {
	let earliest: number | undefined;
	for (const value of values) {
		if (typeof value !== "number" || value <= 0) {
			continue;
		}
		if (earliest === undefined || value < earliest) {
			earliest = value;
		}
	}
	return earliest;
}

function pickLatest(values: Array<number | undefined>): number | undefined {
	let latest: number | undefined;
	for (const value of values) {
		if (typeof value !== "number" || value <= 0) {
			continue;
		}
		if (latest === undefined || value > latest) {
			latest = value;
		}
	}
	return latest;
}

async function fetchTronAccount(config: MolianTronProviderConfig, address: string): Promise<TronAccount | undefined> {
	const response = await fetchJson<TronAccountResponse>(config, buildTronUrl(config, `/v1/accounts/${address}`), {
		address,
		operation: "account snapshot",
	});
	return response.data?.[0];
}

async function fetchNativeTransactions(config: MolianTronProviderConfig, address: string): Promise<TronTransaction[]> {
	return fetchPaginated<TronTransaction>(
		config,
		address,
		"transaction history",
		`/v1/accounts/${address}/transactions`,
		{
			only_confirmed: "true",
			limit: String(DEFAULT_TRON_PAGE_SIZE),
			order_by: "block_timestamp,desc",
		},
	);
}

async function fetchTrc20Transfers(config: MolianTronProviderConfig, address: string): Promise<TronRawTrc20Transfer[]> {
	return fetchPaginated<TronRawTrc20Transfer>(
		config,
		address,
		"TRC20 transfer history",
		`/v1/accounts/${address}/transactions/trc20`,
		{
			only_confirmed: "true",
			limit: String(DEFAULT_TRON_PAGE_SIZE),
			order_by: "block_timestamp,desc",
		},
	);
}

function requireApiKey(config: MolianTronProviderConfig, address: string): void {
	if (!config.apiKey.trim()) {
		throw new MolianProviderError({
			code: "missing_configuration",
			chain: "tron",
			address,
			message: "Missing TRON API key. Run /chain-config to configure chain API access.",
		});
	}
}

export async function getTronAddressOverview(
	config: MolianTronProviderConfig,
	address: string,
): Promise<AddressOverview> {
	requireApiKey(config, address);

	const [account, nativeResult, trc20Result] = await Promise.all([
		fetchTronAccount(config, address),
		fetchNativeTransactions(config, address),
		fetchTrc20Transfers(config, address),
	]);

	const nativeTxs = nativeResult;
	const trc20Transfers = trc20Result;

	const tokenInfo = buildTrc20TokenInfo(trc20Transfers);
	const assets = buildTrc20Assets(account, tokenInfo);

	const nativeTimestamps = nativeTxs.map(getTxTimestamp);
	const trc20Timestamps = trc20Transfers.map((transfer) => transfer.block_timestamp);
	const allTimestamps = [...nativeTimestamps, ...trc20Timestamps, account?.create_time];
	const firstTimestamp = pickEarliest(allTimestamps);
	const lastTimestamp = pickLatest(allTimestamps);

	const observedNativeTxIds = new Set<string>();
	let nativeTxCount = 0;
	for (const tx of nativeTxs) {
		if (!tx.txID) {
			nativeTxCount += 1;
			continue;
		}
		if (!observedNativeTxIds.has(tx.txID)) {
			observedNativeTxIds.add(tx.txID);
			nativeTxCount += 1;
		}
	}

	const transferTotals = summarizeTransferTotals(address, nativeTxs);
	const stakedSun = sumFrozenSun(account?.frozenV2) + sumFrozenSun(account?.frozen);

	return {
		chain: "tron",
		address,
		balanceSummary: {
			nativeSymbol: "TRX",
			nativeBalance: sunToTrx(account?.balance ?? 0),
			nativeStakedBalance: stakedSun > 0n ? sunToTrx(stakedSun) : undefined,
			assets: assets.length > 0 ? assets : undefined,
		},
		activitySummary: {
			txCount: nativeTxCount,
			firstSeenAt: firstTimestamp ? new Date(firstTimestamp).toISOString() : undefined,
			lastSeenAt: lastTimestamp ? new Date(lastTimestamp).toISOString() : undefined,
			recentActivityWindow:
				firstTimestamp && lastTimestamp
					? `${new Date(firstTimestamp).toISOString()} -> ${new Date(lastTimestamp).toISOString()}`
					: undefined,
		},
		transferSummary: {
			totalIn: transferTotals.totalIn,
			totalOut: transferTotals.totalOut,
			largeTransfers: getLargeTransfers(address, nativeTxs),
		},
		counterparties: getCounterparties(address, nativeTxs),
		labels: [],
		sourceMeta: {
			provider: "trongrid",
			partial: false,
			notes: ["Sourced from TronGrid account, transaction, and TRC20 transfer endpoints with exact pagination."],
		},
	};
}

export async function getTronTokenTransfers(
	config: MolianTronProviderConfig,
	address: string,
): Promise<TronTokenTransfer[]> {
	requireApiKey(config, address);
	const items = await fetchTrc20Transfers(config, address);
	const normalized: TronTokenTransfer[] = [];
	for (const raw of items) {
		const transfer = normalizeTrc20Transfer(raw);
		if (transfer) {
			normalized.push(transfer);
		}
	}
	return normalized.sort((a, b) => {
		const timestampDelta = Number(a.timeStamp) - Number(b.timeStamp);
		if (timestampDelta !== 0) {
			return timestampDelta;
		}
		return a.hash.localeCompare(b.hash);
	});
}
