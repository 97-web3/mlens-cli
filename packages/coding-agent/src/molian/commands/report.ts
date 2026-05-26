import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/index.ts";
import { isSupportedMolianReportChain } from "../asset-proof-workflow.ts";
import type { SupportedChain } from "../tools/types.ts";

const EVM_ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/u;
const TRON_ADDRESS_PATTERN = /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/u;
const BTC_ADDRESS_PATTERN = /\b(?:bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/u;

const REPORT_INTENT_PATTERNS = [
	/资产证明/u,
	/证明报告/u,
	/链上报告/u,
	/\basset[- ]proof\b/iu,
	/\bproof of assets?\b/iu,
	/\breport\b/iu,
];

export interface ParsedMolianReportArgs {
	address: string;
	chain: SupportedChain;
	outputPath?: string;
}

export interface MolianReportWorkflowRequest {
	address: string;
	chain?: SupportedChain;
	outputPath?: string;
	originalInput: string;
	source: "command" | "interactive";
}

export function parseMolianReportArgs(rawArgs: string): ParsedMolianReportArgs | { error: string } {
	const [address, rawChain, outputPath] = rawArgs
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);

	if (!address || !rawChain) {
		return { error: "Usage: /report <address> <chain> [output.html]" };
	}

	if (!isSupportedMolianReportChain(rawChain)) {
		return { error: `Unsupported chain "${rawChain}". Use eth, bsc, tron, or btc.` };
	}

	return { address, chain: rawChain, outputPath };
}

function extractAddress(text: string): string | undefined {
	return (
		text.match(EVM_ADDRESS_PATTERN)?.[0] ??
		text.match(TRON_ADDRESS_PATTERN)?.[0] ??
		text.match(BTC_ADDRESS_PATTERN)?.[0]
	);
}

function hasStrongReportIntent(text: string): boolean {
	return REPORT_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

function detectChain(text: string): SupportedChain | undefined {
	const normalized = text.toLowerCase();
	if (/(^|\W)(eth|ethereum)(\W|$)/u.test(normalized) || /以太坊/u.test(text)) {
		return "eth";
	}
	if (/(^|\W)(bsc|bnb)(\W|$)/u.test(normalized) || /币安/u.test(text)) {
		return "bsc";
	}
	if (/(^|\W)(tron|trx)(\W|$)/u.test(normalized) || /波场/u.test(text)) {
		return "tron";
	}
	if (/(^|\W)(btc|bitcoin)(\W|$)/u.test(normalized) || /比特币/u.test(text)) {
		return "btc";
	}
	return undefined;
}

export function maybeCreateMolianReportWorkflowRequest(text: string): MolianReportWorkflowRequest | undefined {
	if (!hasStrongReportIntent(text)) {
		return undefined;
	}
	const address = extractAddress(text);
	if (!address) {
		return undefined;
	}
	return {
		address,
		chain: detectChain(text),
		originalInput: text,
		source: "interactive",
	};
}

export function buildMolianReportWorkflowPrompt(request: MolianReportWorkflowRequest): string {
	const requestedChain = request.chain ?? "unresolved";
	const outputInstruction = request.outputPath
		? `- Write the final HTML report to this exact path: ${request.outputPath}`
		: "- If no explicit output path is requested, let the write tool use its default output path.";

	return [
		"Start the Molian staged asset-proof report workflow now.",
		`Original user request: ${request.originalInput}`,
		`Target address: ${request.address}`,
		`Requested chain: ${requestedChain}`,
		outputInstruction,
		"Workflow requirements:",
		"1. If the chain is unresolved, call `resolve_chain_for_address` first. If it remains ambiguous or unsupported, ask the user a concise follow-up instead of guessing.",
		"2. Before each major stage, send one brief natural-language progress update so the CLI visibly leads the workflow.",
		"3. Call `collect_molian_asset_proof_data` with the resolved chain and target address.",
		"4. Based only on collected public-data facts, prepare an optional `summaryPatch`. Do not invent hashes, addresses, projects, balances, timestamps, or asset claims.",
		"5. Call `build_molian_asset_proof_report` with the `runId` from the collect step. Include `summaryPatch` only if every field is grounded in the collected facts.",
		"6. Call `write_molian_asset_proof_report_html` with the same `runId` to produce the final HTML report.",
	].join("\n");
}

export async function handleMolianReportCommand(
	pi: Pick<ExtensionAPI, "sendUserMessage">,
	rawArgs: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const parsed = parseMolianReportArgs(rawArgs);
	if ("error" in parsed) {
		ctx.ui.notify(parsed.error, "warning");
		return;
	}

	const workflowPrompt = buildMolianReportWorkflowPrompt({
		address: parsed.address,
		chain: parsed.chain,
		outputPath: parsed.outputPath,
		originalInput: rawArgs,
		source: "command",
	});

	if (ctx.isIdle()) {
		pi.sendUserMessage(workflowPrompt);
		return;
	}

	pi.sendUserMessage(workflowPrompt, { deliverAs: "followUp" });
	ctx.ui.notify("Queued staged report workflow after the current response.", "info");
}
