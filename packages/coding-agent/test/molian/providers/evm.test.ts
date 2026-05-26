import { afterEach, describe, expect, it, vi } from "vitest";
import { getEvmAddressOverview } from "../../../src/molian/providers/evm.ts";

describe("getEvmAddressOverview", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.MOLIAN_ETH_API_KEY;
		delete process.env.MOLIAN_ETH_API_URL;
	});

	it("requires an API key", async () => {
		await expect(getEvmAddressOverview("eth", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).rejects.toThrow(
			"Missing MOLIAN_ETH_API_KEY environment variable.",
		);
	});

	it("normalizes explorer responses into an address overview", async () => {
		process.env.MOLIAN_ETH_API_KEY = "test-key";
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

		const overview = await getEvmAddressOverview("eth", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");

		expect(overview.chain).toBe("eth");
		expect(overview.balanceSummary.nativeBalance).toBe("2.5");
		expect(overview.activitySummary.txCount).toBe(2);
		expect(overview.counterparties).toHaveLength(2);
		expect(overview.sourceMeta.provider).toBe("etherscan");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
