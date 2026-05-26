import { describe, expect, it, vi } from "vitest";
import { resolveMolianAssetMarketPrice } from "../../src/molian/market-price.ts";

describe("molian market price provider", () => {
	it("uses Binance spot price when available", async () => {
		const fetchMock = vi.fn(async () => Response.json({ symbol: "ETHUSDT", price: "2500.12" }));
		vi.stubGlobal("fetch", fetchMock);

		const quote = await resolveMolianAssetMarketPrice("ETH");

		expect(quote.currentPriceUsd).toBe("2500.12");
		expect(quote.priceSource).toBe("binance");
		expect(quote.priceStatus).toBe("live");
		expect(quote.quoteSymbolNormalized).toBe("ETHUSDT");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("falls back to OKX when Binance does not have a spot quote", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ code: -1121, msg: "Invalid symbol." }), {
					status: 404,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					code: "0",
					msg: "",
					data: [{ instId: "FWB-USDT", last: "3.45" }],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const quote = await resolveMolianAssetMarketPrice("FWB");

		expect(quote.currentPriceUsd).toBe("3.45");
		expect(quote.priceSource).toBe("okx");
		expect(quote.priceStatus).toBe("live");
		expect(quote.quoteSymbolNormalized).toBe("FWB-USDT");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("falls back to 1 USD for stablecoins when both exchanges miss", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("{}", { status: 404 }))
			.mockResolvedValueOnce(new Response("{}", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		const quote = await resolveMolianAssetMarketPrice("USDT");

		expect(quote.currentPriceUsd).toBe("1");
		expect(quote.priceSource).toBe("stablecoin_fallback");
		expect(quote.priceStatus).toBe("fallback");
		expect(quote.quoteSymbolNormalized).toBe("USDT/USD");
	});

	it("returns zero and unavailable status for non-stablecoins without exchange quotes", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("{}", { status: 404 }))
			.mockResolvedValueOnce(new Response("{}", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		const quote = await resolveMolianAssetMarketPrice("TLP");

		expect(quote.currentPriceUsd).toBe("0");
		expect(quote.priceSource).toBe("unavailable");
		expect(quote.priceStatus).toBe("unavailable");
		expect(quote.quoteSymbolNormalized).toBe("TLPUSDT");
	});
});
