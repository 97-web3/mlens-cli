import { afterEach, describe, expect, it, vi } from "vitest";
import { getEvmAddressOverview, getEvmTokenTransfers } from "../../../src/molian/providers/evm.ts";

describe("getEvmAddressOverview", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("requires an API key", async () => {
		await expect(
			getEvmAddressOverview(
				{
					baseUrl: "https://api.etherscan.io/api",
					apiKey: "",
				},
				"eth",
				"0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
			),
		).rejects.toThrow("Missing ETH API key. Run /chain-config to configure chain API access.");
	});

	it("normalizes explorer responses into an address overview", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: "2500000000000000000",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: [
						{
							timeStamp: "1716680000",
							hash: "0x1",
							from: "0x1111111111111111111111111111111111111111",
							to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
							value: "1000000000000000000",
						},
						{
							timeStamp: "1716690000",
							hash: "0x2",
							from: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
							to: "0x2222222222222222222222222222222222222222",
							value: "500000000000000000",
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const overview = await getEvmAddressOverview(
			{
				baseUrl: "https://api.etherscan.io/api",
				apiKey: "test-key",
			},
			"eth",
			"0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
		);

		expect(overview.chain).toBe("eth");
		expect(overview.balanceSummary.nativeBalance).toBe("2.5");
		expect(overview.activitySummary.txCount).toBe(2);
		expect(overview.transferSummary.totalIn).toBe("1");
		expect(overview.transferSummary.totalOut).toBe("0.5");
		expect(overview.counterparties).toHaveLength(2);
		expect(overview.sourceMeta.provider).toBe("etherscan");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("pages through explorer history for native transfers and token transfers", async () => {
		const nativeTxPage = Array.from({ length: 200 }, (_, index) => ({
			timeStamp: String(1716680000 + index),
			hash: `0x${index + 1}`,
			from:
				index % 2 === 0
					? "0x1111111111111111111111111111111111111111"
					: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
			to:
				index % 2 === 0
					? "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
					: "0x2222222222222222222222222222222222222222",
			value: index % 2 === 0 ? "1000000000000000000" : "500000000000000000",
		}));
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: "3000000000000000000",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: nativeTxPage,
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: [],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: [
						{
							timeStamp: "1716700000",
							hash: "0x3",
							from: "0xsource",
							to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
							value: "1000000",
							tokenDecimal: "6",
							tokenSymbol: "USDT",
							tokenName: "Tether USD",
							contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
						},
						{
							timeStamp: "1716710000",
							hash: "0x4",
							from: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
							to: "0xdest",
							value: "400000",
							tokenDecimal: "6",
							tokenSymbol: "USDT",
							tokenName: "Tether USD",
							contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: [],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const config = {
			baseUrl: "https://api.etherscan.io/api",
			apiKey: "test-key",
		};
		const address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
		const overview = await getEvmAddressOverview(config, "eth", address);
		const tokenTransfers = await getEvmTokenTransfers(config, "eth", address, { offset: 2 });

		expect(overview.transferSummary.totalIn).toBe("100");
		expect(overview.transferSummary.totalOut).toBe("50");
		expect(tokenTransfers).toHaveLength(2);
		expect(fetchMock).toHaveBeenCalledTimes(5);
	});

	it("keeps empty-history explorer responses as empty results", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: "0",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "0",
					message: "No transactions found",
					result: "No transactions found",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "0",
					message: "No transactions found",
					result: "No transactions found",
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const config = {
			baseUrl: "https://api.etherscan.io/api",
			apiKey: "test-key",
		};
		const address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
		const overview = await getEvmAddressOverview(config, "eth", address);
		const tokenTransfers = await getEvmTokenTransfers(config, "eth", address);

		expect(overview.activitySummary.txCount).toBe(0);
		expect(overview.transferSummary.totalIn).toBe("0");
		expect(overview.transferSummary.totalOut).toBe("0");
		expect(tokenTransfers).toEqual([]);
	});

	it("surfaces explorer history errors instead of returning empty results", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: "2500000000000000000",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "0",
					message: "NOTOK",
					result: "Max rate limit reached, please use API Key for higher rate limit",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "0",
					message: "NOTOK",
					result: "Query Timeout occured. Please select a smaller result dataset",
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const config = {
			baseUrl: "https://api.etherscan.io/api",
			apiKey: "test-key",
		};
		const address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

		await expect(getEvmAddressOverview(config, "eth", address)).rejects.toThrow(
			"Max rate limit reached, please use API Key for higher rate limit",
		);
		await expect(getEvmTokenTransfers(config, "eth", address)).rejects.toThrow(
			"Query Timeout occured. Please select a smaller result dataset",
		);
	});

	it("surfaces null explorer error payloads without throwing trim type errors", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: "2500000000000000000",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "0",
					message: "NOTOK",
					result: null,
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const config = {
			baseUrl: "https://api.etherscan.io/v2/api",
			apiKey: "test-key",
		};
		const address = "0x65f0ec303ad5007be21f6808febb3edccd1369e1";

		await expect(getEvmAddressOverview(config, "bsc", address)).rejects.toMatchObject({
			name: "MolianProviderError",
			message: "Explorer history request failed.",
		});
	});

	it("surfaces malformed native transfer values instead of throwing raw BigInt errors", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: "2500000000000000000",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: [
						{
							timeStamp: "1716680000",
							hash: "0x1",
							from: "0x1111111111111111111111111111111111111111",
							to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
							value: "You are using a deprecated V1 endpoint, switch to Etherscan API V2 using https://docs.etherscan.io/v2-migration",
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const config = {
			baseUrl: "https://api.etherscan.io/v2/api",
			apiKey: "test-key",
		};
		const address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

		await expect(getEvmAddressOverview(config, "bsc", address)).rejects.toMatchObject({
			name: "MolianProviderError",
			message:
				"You are using a deprecated V1 endpoint, switch to Etherscan API V2 using https://docs.etherscan.io/v2-migration",
		});
	});
});
