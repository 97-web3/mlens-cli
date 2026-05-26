import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/index.ts";
import { resolveChainForAddress } from "../tools/resolve-chain.ts";

const SUPPORTED_CHAINS = new Set(["eth", "bsc", "btc", "sol"]);

export function buildAnalyzePrompt(address: string, chain?: string): string {
	const chainText = chain ? `已知链别：${chain}` : "链别：需要先判定，若是 EVM 地址则要求用户明确 eth 或 bsc";
	return [
		"请对以下链上公共地址进行分析，并优先使用链上工具收集事实。",
		`目标地址：${address}`,
		chainText,
		"请严格输出 6 段报告：1. 地址概览 2. 流水统计 3. 资产与余额 4. 对手方与交互模式 5. 风险与特征判断 6. 结论摘要。",
		"所有结论都要明确基于公开数据源；证据不足时请直接说明证据不足。",
	].join("\n");
}

export function parseAnalyzeArgs(rawArgs: string): { address?: string; chain?: string; error?: string } {
	const [address, rawChain] = rawArgs
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);

	if (!address) {
		return { error: "Usage: /analyze <address> [chain]" };
	}

	if (rawChain && !SUPPORTED_CHAINS.has(rawChain)) {
		return { error: `Unsupported chain "${rawChain}". Use eth, bsc, btc, or sol.` };
	}

	return { address, chain: rawChain };
}

export async function handleAnalyzeCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const parsed = parseAnalyzeArgs(rawArgs);
	if (parsed.error) {
		ctx.ui.notify(parsed.error, "warning");
		return;
	}

	const address = parsed.address!;
	const resolved = resolveChainForAddress(address);

	if (!parsed.chain && resolved === "unknown") {
		ctx.ui.notify("Address format is not recognized. Supported chains: eth, bsc, btc, sol.", "warning");
		return;
	}

	if (!parsed.chain && resolved === "evm") {
		ctx.ui.notify("EVM 地址无法自动区分 ETH/BSC，请补充链别：/analyze <address> eth|bsc", "warning");
		return;
	}

	const inferredChain = parsed.chain ?? (resolved === "btc" || resolved === "sol" ? resolved : undefined);
	pi.sendUserMessage(buildAnalyzePrompt(address, inferredChain));
}
