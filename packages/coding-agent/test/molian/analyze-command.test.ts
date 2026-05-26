import { describe, expect, it, vi } from "vitest";
import { buildAnalyzePrompt, handleAnalyzeCommand, parseAnalyzeArgs } from "../../src/molian/commands/analyze.ts";

function createCommandContext() {
	const notify = vi.fn();
	return {
		ui: { notify },
	} as any;
}

function createExtensionApi() {
	return {
		sendUserMessage: vi.fn(),
	} as any;
}

describe("molian analyze command", () => {
	it("parses address and chain arguments", () => {
		expect(parseAnalyzeArgs("0xabc eth")).toEqual({ address: "0xabc", chain: "eth" });
	});

	it("reports usage when address is missing", async () => {
		const pi = createExtensionApi();
		const ctx = createCommandContext();
		await handleAnalyzeCommand(pi, "", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /analyze <address> [chain]", "warning");
	});

	it("requires explicit chain for EVM addresses", async () => {
		const pi = createExtensionApi();
		const ctx = createCommandContext();
		await handleAnalyzeCommand(pi, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"EVM 地址无法自动区分 ETH/BSC，请补充链别：/analyze <address> eth|bsc",
			"warning",
		);
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
	});

	it("sends a deterministic analysis prompt when chain is known", async () => {
		const pi = createExtensionApi();
		const ctx = createCommandContext();
		await handleAnalyzeCommand(pi, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e eth", ctx);
		expect(pi.sendUserMessage).toHaveBeenCalledWith(
			buildAnalyzePrompt("0x742d35Cc6634C0532925a3b844Bc454e4438f44e", "eth"),
		);
	});
});
