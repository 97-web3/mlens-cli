import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import type { ResolvedChainKind } from "./types.ts";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const HEX_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_RE = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/;

export function resolveChainForAddress(address: string): ResolvedChainKind {
	const trimmed = address.trim();
	if (!trimmed) {
		return "unknown";
	}

	if (HEX_RE.test(trimmed)) {
		return "evm";
	}

	if (BTC_RE.test(trimmed)) {
		return "btc";
	}

	if (BASE58_RE.test(trimmed) && trimmed.length >= 32 && trimmed.length <= 44) {
		return "sol";
	}

	return "unknown";
}

export function createResolveChainTool() {
	return defineTool({
		name: "resolve_chain_for_address",
		label: "Resolve Chain",
		description: "Resolve whether an address is BTC, SOL, EVM, or unknown.",
		promptSnippet: "Detect whether an address belongs to BTC, SOL, EVM, or is unknown.",
		parameters: Type.Object({
			address: Type.String({ description: "Wallet or account address to inspect." }),
		}),
		execute: async (_toolCallId, params) => {
			const chain = resolveChainForAddress(params.address);
			return {
				content: [{ type: "text", text: JSON.stringify({ address: params.address, chain }, null, 2) }],
				details: { address: params.address, chain },
			};
		},
	});
}
