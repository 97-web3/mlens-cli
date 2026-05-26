import { afterEach, describe, expect, it, vi } from "vitest";
import { getTronAddressOverview, getTronTokenTransfers } from "../../../src/molian/providers/tron.ts";

const TEST_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

interface RecordedRequest {
	url: string;
	headers: Record<string, string>;
}

function createFetchMock(handlers: Array<(request: RecordedRequest) => unknown>): {
	fetchMock: ReturnType<typeof vi.fn>;
	requests: RecordedRequest[];
} {
	const requests: RecordedRequest[] = [];
	let callIndex = 0;
	const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const headers: Record<string, string> = {};
		const rawHeaders = init?.headers as Record<string, string> | undefined;
		if (rawHeaders) {
			for (const [key, value] of Object.entries(rawHeaders)) {
				headers[key] = String(value);
			}
		}
		requests.push({ url, headers });
		const handler = handlers[callIndex] ?? handlers[handlers.length - 1];
		callIndex += 1;
		const body = handler({ url, headers });
		return Response.json(body);
	});
	return { fetchMock, requests };
}

describe("getTronAddressOverview", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("requires an API key", async () => {
		await expect(
			getTronAddressOverview(
				{
					baseUrl: "https://api.trongrid.io",
					apiKey: "",
				},
				TEST_ADDRESS,
			),
		).rejects.toThrow("Missing TRON API key. Run /chain-config to configure chain API access.");
	});

	it("normalizes account, native transfers, and TRC20 transfers into an overview", async () => {
		const { fetchMock, requests } = createFetchMock([
			() => ({
				data: [
					{
						address: TEST_ADDRESS,
						balance: 152089472,
						create_time: 1626428406000,
						frozenV2: [{ amount: 108393_000000, type: "BANDWIDTH" }],
						trc20: [{ [USDT_CONTRACT]: "80154420799" }],
					},
				],
			}),
			() => ({
				data: [
					{
						txID: "tron-native-1",
						block_timestamp: 1716690000000,
						raw_data: {
							contract: [
								{
									parameter: {
										value: {
											owner_address: "TSourceAddress11111111111111111111111",
											to_address: TEST_ADDRESS,
											amount: 5_000000,
										},
									},
								},
							],
						},
					},
					{
						txID: "tron-native-2",
						block_timestamp: 1716680000000,
						raw_data: {
							contract: [
								{
									parameter: {
										value: {
											owner_address: TEST_ADDRESS,
											to_address: "TDestinationAddress11111111111111111111",
											amount: 1_000000,
										},
									},
								},
							],
						},
					},
				],
				meta: {},
			}),
			() => ({
				data: [
					{
						transaction_id: "trc20-1",
						block_timestamp: 1716690000000,
						from: "TSenderAddress",
						to: TEST_ADDRESS,
						value: "10000000",
						token_info: {
							address: USDT_CONTRACT,
							symbol: "USDT",
							decimals: 6,
							name: "Tether USD",
						},
					},
				],
				meta: {},
			}),
		]);
		vi.stubGlobal("fetch", fetchMock);

		const overview = await getTronAddressOverview(
			{
				baseUrl: "https://api.trongrid.io",
				apiKey: "tron-key",
			},
			TEST_ADDRESS,
		);

		expect(overview.chain).toBe("tron");
		expect(overview.balanceSummary.nativeBalance).toBe("152.089472");
		expect(overview.balanceSummary.nativeStakedBalance).toBe("108393");
		expect(overview.balanceSummary.assets).toEqual([{ symbol: "USDT", amount: "80154.420799" }]);
		expect(overview.activitySummary.txCount).toBe(2);
		expect(overview.activitySummary.lastSeenAt).toBe(new Date(1716690000000).toISOString());
		expect(overview.transferSummary.largeTransfers?.[0]).toMatchObject({
			amount: "5",
			direction: "in",
			symbol: "TRX",
		});
		expect(overview.sourceMeta.partial).toBe(false);
		expect(overview.sourceMeta.provider).toBe("trongrid");

		const nativeUrl = requests[1].url;
		expect(nativeUrl).toContain("order_by=block_timestamp%2Cdesc");
		expect(nativeUrl).toContain("limit=200");
		expect(requests[2].url).toContain("/transactions/trc20");
		expect(requests[0].headers["TRON-PRO-API-KEY"]).toBe("tron-key");
	});

	it("paginates native transfers via fingerprint until history is exhausted", async () => {
		let nativeCalls = 0;
		const fetchMock = vi.fn(async (input: string | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes(`/v1/accounts/${TEST_ADDRESS}?`) || url.endsWith(`/v1/accounts/${TEST_ADDRESS}`)) {
				return Response.json({ data: [{ address: TEST_ADDRESS, balance: 0 }] });
			}
			if (url.includes("/transactions/trc20")) {
				return Response.json({ data: [], meta: {} });
			}
			if (url.includes(`/v1/accounts/${TEST_ADDRESS}/transactions`)) {
				nativeCalls += 1;
				if (nativeCalls === 1) {
					expect(url).not.toContain("fingerprint=");
					return Response.json({
						data: [
							{
								txID: "tx-1",
								block_timestamp: 1716690000000,
								raw_data: { contract: [{ parameter: { value: {} } }] },
							},
						],
						meta: { fingerprint: "fp-page-2" },
					});
				}
				expect(url).toContain("fingerprint=fp-page-2");
				return Response.json({
					data: [
						{
							txID: "tx-2",
							block_timestamp: 1716680000000,
							raw_data: { contract: [{ parameter: { value: {} } }] },
						},
					],
					meta: {},
				});
			}
			throw new Error(`unexpected url ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const overview = await getTronAddressOverview(
			{ baseUrl: "https://api.trongrid.io", apiKey: "tron-key" },
			TEST_ADDRESS,
		);

		expect(overview.activitySummary.txCount).toBe(2);
		expect(overview.sourceMeta.partial).toBe(false);
		expect(nativeCalls).toBe(2);
	});

	it("fails exact-history collection when pagination exceeds the defensive page limit", async () => {
		let nativeCalls = 0;
		const fetchMock = vi.fn(async (input: string | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/transactions/trc20")) {
				return Response.json({ data: [], meta: {} });
			}
			if (url.includes(`/v1/accounts/${TEST_ADDRESS}/transactions`)) {
				nativeCalls += 1;
				return Response.json({
					data: [
						{
							txID: `tx-${nativeCalls}`,
							block_timestamp: 1716690000000 - nativeCalls * 1000,
							raw_data: { contract: [{ parameter: { value: {} } }] },
						},
					],
					meta: { fingerprint: `page-${nativeCalls}` },
				});
			}
			return Response.json({ data: [{ address: TEST_ADDRESS, balance: 0 }] });
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getTronAddressOverview({ baseUrl: "https://api.trongrid.io", apiKey: "tron-key" }, TEST_ADDRESS),
		).rejects.toThrow("Upgrade or change the TronGrid API key/plan");
		expect(nativeCalls).toBe(1000);
	}, 30_000);
});

describe("getTronTokenTransfers", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("normalizes TRC20 transfers into the EVM-style shape in chronological order", async () => {
		const { fetchMock } = createFetchMock([
			() => ({
				data: [
					{
						transaction_id: "trc20-hash-2",
						block_timestamp: 1716693600000,
						from: TEST_ADDRESS,
						to: "TReceiverAddress",
						value: "4000000",
						token_info: {
							address: USDT_CONTRACT,
							symbol: "USDT",
							decimals: 6,
							name: "Tether USD",
						},
					},
					{
						transaction_id: "trc20-hash-1",
						block_timestamp: 1716690000000,
						from: "TSenderAddress",
						to: TEST_ADDRESS,
						value: "10000000",
						token_info: {
							address: USDT_CONTRACT,
							symbol: "USDT",
							decimals: 6,
							name: "Tether USD",
						},
					},
				],
				meta: {},
			}),
		]);
		vi.stubGlobal("fetch", fetchMock);

		const transfers = await getTronTokenTransfers(
			{ baseUrl: "https://api.trongrid.io", apiKey: "tron-key" },
			TEST_ADDRESS,
		);

		expect(transfers).toEqual([
			{
				timeStamp: "1716690000",
				hash: "trc20-hash-1",
				from: "TSenderAddress",
				to: TEST_ADDRESS,
				value: "10000000",
				tokenDecimal: "6",
				tokenSymbol: "USDT",
				tokenName: "Tether USD",
				contractAddress: USDT_CONTRACT,
			},
			{
				timeStamp: "1716693600",
				hash: "trc20-hash-2",
				from: TEST_ADDRESS,
				to: "TReceiverAddress",
				value: "4000000",
				tokenDecimal: "6",
				tokenSymbol: "USDT",
				tokenName: "Tether USD",
				contractAddress: USDT_CONTRACT,
			},
		]);
	});

	it("requires an API key", async () => {
		await expect(
			getTronTokenTransfers({ baseUrl: "https://api.trongrid.io", apiKey: "" }, TEST_ADDRESS),
		).rejects.toThrow("Missing TRON API key");
	});
});
