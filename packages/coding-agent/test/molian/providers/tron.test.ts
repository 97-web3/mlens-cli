import { afterEach, describe, expect, it, vi } from "vitest";
import { getTronAddressOverview } from "../../../src/molian/providers/tron.ts";

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
				"TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
			),
		).rejects.toThrow("Missing TRON API key. Run /chain-config to configure chain API access.");
	});

	it("normalizes TronGrid responses into an address overview", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					data: [
						{
							address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
							balance: 2500000,
							create_time: 1716600000000,
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					data: [
						{
							txID: "tron-1",
							block_timestamp: 1716680000000,
							raw_data: {
								contract: [
									{
										parameter: {
											value: {
												owner_address: "TSourceAddress11111111111111111111111",
												to_address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
												amount: 1500000,
											},
										},
									},
								],
							},
						},
						{
							txID: "tron-2",
							block_timestamp: 1716690000000,
							raw_data: {
								contract: [
									{
										parameter: {
											value: {
												owner_address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
												to_address: "TDestinationAddress11111111111111111111",
												amount: 500000,
											},
										},
									},
								],
							},
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const overview = await getTronAddressOverview(
			{
				baseUrl: "https://api.trongrid.io",
				apiKey: "tron-key",
			},
			"TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
		);

		expect(overview.chain).toBe("tron");
		expect(overview.balanceSummary.nativeBalance).toBe("2.5");
		expect(overview.activitySummary.txCount).toBe(2);
		expect(overview.counterparties).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ address: "tsourceaddress11111111111111111111111" }),
				expect.objectContaining({ address: "tdestinationaddress11111111111111111111" }),
			]),
		);
		expect(overview.sourceMeta.provider).toBe("trongrid");
	});
});
