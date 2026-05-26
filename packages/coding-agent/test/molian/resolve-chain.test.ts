import { describe, expect, it } from "vitest";
import { resolveChainForAddress } from "../../src/molian/tools/resolve-chain.ts";

describe("resolveChainForAddress", () => {
	it("detects EVM addresses", () => {
		expect(resolveChainForAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe("evm");
	});

	it("detects BTC addresses", () => {
		expect(resolveChainForAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080")).toBe("btc");
	});

	it("detects SOL addresses", () => {
		expect(resolveChainForAddress("Vote111111111111111111111111111111111111111")).toBe("sol");
	});

	it("returns unknown for unsupported formats", () => {
		expect(resolveChainForAddress("not-an-address")).toBe("unknown");
	});
});
