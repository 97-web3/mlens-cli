import { afterEach, describe, expect, it, vi } from "vitest";
import { getBtcAddressOverview } from "../../../src/molian/providers/btc.ts";

describe("getBtcAddressOverview", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("normalizes mempool responses into an address overview", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
					chain_stats: {
						tx_count: 2,
						funded_txo_sum: 175000000,
						spent_txo_sum: 25000000,
					},
					mempool_stats: {
						tx_count: 1,
						funded_txo_sum: 5000000,
						spent_txo_sum: 0,
					},
				}),
			)
			.mockResolvedValueOnce(
				Response.json([
					{
						txid: "btc-1",
						status: { confirmed: true, block_time: 1716680000 },
						vin: [
							{
								prevout: {
									scriptpubkey_address: "bc1sourceaddress000000000000000000000000000",
									value: 100000000,
								},
							},
						],
						vout: [
							{
								scriptpubkey_address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
								value: 100000000,
							},
						],
					},
					{
						txid: "btc-2",
						status: { confirmed: true, block_time: 1716690000 },
						vin: [
							{
								prevout: {
									scriptpubkey_address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
									value: 25000000,
								},
							},
						],
						vout: [
							{
								scriptpubkey_address: "bc1counterparty0000000000000000000000000000",
								value: 24000000,
							},
						],
					},
				]),
			);
		vi.stubGlobal("fetch", fetchMock);

		const overview = await getBtcAddressOverview(
			{ baseUrl: "https://mempool.space/api" },
			"bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
		);

		expect(overview.chain).toBe("btc");
		expect(overview.balanceSummary.nativeBalance).toBe("1.5");
		expect(overview.activitySummary.txCount).toBe(3);
		expect(overview.transferSummary.totalIn).toBe("1.75");
		expect(overview.transferSummary.totalOut).toBe("0.25");
		expect(overview.counterparties).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ address: "bc1sourceaddress000000000000000000000000000" }),
				expect.objectContaining({ address: "bc1counterparty0000000000000000000000000000" }),
			]),
		);
		expect(overview.sourceMeta.provider).toBe("mempool.space");
	});
});
