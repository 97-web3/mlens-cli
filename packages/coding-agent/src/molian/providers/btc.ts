import type { MolianBtcProviderConfig } from "../chain-config.ts";
import { type AddressOverview, MolianProviderError } from "../tools/types.ts";

interface MempoolStats {
	tx_count: number;
	funded_txo_sum: number;
	spent_txo_sum: number;
}

interface MempoolAddressResponse {
	address: string;
	chain_stats: MempoolStats;
	mempool_stats: MempoolStats;
}

interface MempoolTxInput {
	prevout?: {
		scriptpubkey_address?: string;
		value?: number;
	};
}

interface MempoolTxOutput {
	scriptpubkey_address?: string;
	value?: number;
}

interface MempoolTx {
	txid: string;
	status?: {
		confirmed?: boolean;
		block_time?: number;
	};
	vin?: MempoolTxInput[];
	vout?: MempoolTxOutput[];
}

function satsToBtc(value: number): string {
	const sats = BigInt(value);
	const whole = sats / 100000000n;
	const fractional = sats % 100000000n;
	if (fractional === 0n) {
		return whole.toString();
	}
	return `${whole.toString()}.${fractional.toString().padStart(8, "0").replace(/0+$/, "")}`;
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
	const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`);
	if (!response.ok) {
		throw new MolianProviderError({
			code: "provider_error",
			chain: "btc",
			message: `Provider request failed with status ${response.status}.`,
		});
	}
	return (await response.json()) as T;
}

function getCounterparties(address: string, txs: MempoolTx[]): AddressOverview["counterparties"] {
	const normalizedAddress = address.toLowerCase();
	const counts = new Map<string, number>();

	for (const tx of txs) {
		const counterparties = new Set<string>();
		for (const input of tx.vin ?? []) {
			const counterparty = input.prevout?.scriptpubkey_address?.toLowerCase();
			if (counterparty && counterparty !== normalizedAddress) {
				counterparties.add(counterparty);
			}
		}
		for (const output of tx.vout ?? []) {
			const counterparty = output.scriptpubkey_address?.toLowerCase();
			if (counterparty && counterparty !== normalizedAddress) {
				counterparties.add(counterparty);
			}
		}

		for (const counterparty of counterparties) {
			counts.set(counterparty, (counts.get(counterparty) ?? 0) + 1);
		}
	}

	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([counterparty, txCount]) => ({
			address: counterparty,
			txCount,
			relation: "recent transaction counterparty",
		}));
}

function getLargeTransfers(address: string, txs: MempoolTx[]): AddressOverview["transferSummary"]["largeTransfers"] {
	const normalizedAddress = address.toLowerCase();
	return txs
		.map((tx) => {
			let incoming = 0;
			let outgoing = 0;

			for (const input of tx.vin ?? []) {
				if (input.prevout?.scriptpubkey_address?.toLowerCase() === normalizedAddress) {
					outgoing += input.prevout.value ?? 0;
				}
			}

			for (const output of tx.vout ?? []) {
				if (output.scriptpubkey_address?.toLowerCase() === normalizedAddress) {
					incoming += output.value ?? 0;
				}
			}

			const amount = Math.max(incoming, outgoing);
			if (amount === 0) {
				return undefined;
			}

			return {
				timestamp: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : undefined,
				amount: satsToBtc(amount),
				symbol: "BTC",
				direction: incoming >= outgoing ? ("in" as const) : ("out" as const),
				txHash: tx.txid,
				counterpartyAddress:
					incoming >= outgoing
						? tx.vin
								?.find((input) => input.prevout?.scriptpubkey_address?.toLowerCase() !== normalizedAddress)
								?.prevout?.scriptpubkey_address?.toLowerCase()
						: tx.vout
								?.find((output) => output.scriptpubkey_address?.toLowerCase() !== normalizedAddress)
								?.scriptpubkey_address?.toLowerCase(),
				rawValue: amount,
			};
		})
		.filter((transfer): transfer is NonNullable<typeof transfer> => transfer !== undefined)
		.sort((a, b) => b.rawValue - a.rawValue)
		.slice(0, 3)
		.map(({ rawValue: _rawValue, ...transfer }) => transfer);
}

export async function getBtcAddressOverview(
	config: MolianBtcProviderConfig,
	address: string,
): Promise<AddressOverview> {
	const [addressResponse, txsResponse] = await Promise.all([
		fetchJson<MempoolAddressResponse>(config.baseUrl, `/address/${address}`),
		fetchJson<MempoolTx[]>(config.baseUrl, `/address/${address}/txs`),
	]);

	const firstSeen = [...txsResponse]
		.filter((tx) => tx.status?.block_time !== undefined)
		.sort((a, b) => (a.status?.block_time ?? 0) - (b.status?.block_time ?? 0));
	const lastSeen = firstSeen[firstSeen.length - 1];

	return {
		chain: "btc",
		address,
		balanceSummary: {
			nativeSymbol: "BTC",
			nativeBalance: satsToBtc(
				addressResponse.chain_stats.funded_txo_sum - addressResponse.chain_stats.spent_txo_sum,
			),
		},
		activitySummary: {
			txCount: addressResponse.chain_stats.tx_count + addressResponse.mempool_stats.tx_count,
			firstSeenAt:
				firstSeen[0]?.status?.block_time !== undefined
					? new Date(firstSeen[0].status.block_time * 1000).toISOString()
					: undefined,
			lastSeenAt:
				lastSeen?.status?.block_time !== undefined
					? new Date(lastSeen.status.block_time * 1000).toISOString()
					: undefined,
		},
		transferSummary: {
			totalIn: satsToBtc(addressResponse.chain_stats.funded_txo_sum),
			totalOut: satsToBtc(addressResponse.chain_stats.spent_txo_sum),
			largeTransfers: getLargeTransfers(address, txsResponse),
		},
		counterparties: getCounterparties(address, txsResponse),
		labels: [],
		sourceMeta: {
			provider: "mempool.space",
			partial: true,
			notes: [
				"Overview currently relies on public mempool.space address endpoints.",
				"Recent transaction samples are partial and may omit older history.",
			],
		},
	};
}
