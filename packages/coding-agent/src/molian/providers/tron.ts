import type { MolianTronProviderConfig } from "../chain-config.ts";
import { type AddressOverview, MolianProviderError } from "../tools/types.ts";

interface TronAccount {
	address: string;
	balance?: number;
	create_time?: number;
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

interface TronTransactionsResponse {
	data?: TronTransaction[];
}

function sunToTrx(value: number): string {
	const sun = BigInt(value);
	const whole = sun / 1000000n;
	const fractional = sun % 1000000n;
	if (fractional === 0n) {
		return whole.toString();
	}
	return `${whole.toString()}.${fractional.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

async function fetchJson<T>(config: MolianTronProviderConfig, path: string): Promise<T> {
	const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}${path}`, {
		headers: {
			"TRON-PRO-API-KEY": config.apiKey,
		},
	});
	if (!response.ok) {
		throw new MolianProviderError({
			code: "provider_error",
			chain: "tron",
			message: `Provider request failed with status ${response.status}.`,
		});
	}
	return (await response.json()) as T;
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

export async function getTronAddressOverview(
	config: MolianTronProviderConfig,
	address: string,
): Promise<AddressOverview> {
	if (!config.apiKey.trim()) {
		throw new MolianProviderError({
			code: "missing_configuration",
			chain: "tron",
			address,
			message: "Missing TRON API key. Run /chain-config to configure chain API access.",
		});
	}

	const [accountResponse, txsResponse] = await Promise.all([
		fetchJson<TronAccountResponse>(config, `/v1/accounts/${address}`),
		fetchJson<TronTransactionsResponse>(
			config,
			`/v1/accounts/${address}/transactions?only_confirmed=true&limit=50&order_by=block_timestamp,asc`,
		),
	]);

	const account = accountResponse.data?.[0];
	const txs = txsResponse.data ?? [];
	const firstTimestamp = getTxTimestamp(txs[0]);
	const lastTimestamp = getTxTimestamp(txs[txs.length - 1]);

	return {
		chain: "tron",
		address,
		balanceSummary: {
			nativeSymbol: "TRX",
			nativeBalance: sunToTrx(account?.balance ?? 0),
		},
		activitySummary: {
			txCount: txs.length,
			firstSeenAt: firstTimestamp ? new Date(firstTimestamp).toISOString() : undefined,
			lastSeenAt: lastTimestamp ? new Date(lastTimestamp).toISOString() : undefined,
			recentActivityWindow:
				firstTimestamp && lastTimestamp
					? `${new Date(firstTimestamp).toISOString()} -> ${new Date(lastTimestamp).toISOString()}`
					: undefined,
		},
		transferSummary: {
			largeTransfers: getLargeTransfers(address, txs),
		},
		counterparties: getCounterparties(address, txs),
		labels: [],
		sourceMeta: {
			provider: "trongrid",
			partial: true,
			notes: [
				"Overview currently relies on TronGrid account and transfer endpoints.",
				"Only sampled TRX transfer history is included in the MVP provider.",
			],
		},
	};
}
