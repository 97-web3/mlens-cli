#!/usr/bin/env node
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getAgentDir } from "../config.ts";
import { AuthStorage } from "../core/auth-storage.ts";
import { exportMolianAssetProofReport, isSupportedMolianReportChain } from "./asset-proof-workflow.ts";

export interface ReportCliArgs {
	address?: string;
	chain?: string;
	outputPath?: string;
	enableAgentSummary: boolean;
	help: boolean;
	error?: string;
}

export function parseArgs(args: string[]): ReportCliArgs {
	const result: ReportCliArgs = {
		enableAgentSummary: true,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--subject" || arg.startsWith("--subject=")) {
			result.error = 'The "--subject" option has been removed.';
			if (arg === "--subject" && i + 1 < args.length) {
				i++;
			}
			return result;
		} else if (arg === "--address" && i + 1 < args.length) {
			result.address = args[++i];
		} else if (arg === "--chain" && i + 1 < args.length) {
			result.chain = args[++i];
		} else if (arg === "--output" && i + 1 < args.length) {
			result.outputPath = args[++i];
		} else if (arg === "--no-agent-summary") {
			result.enableAgentSummary = false;
		}
	}

	return result;
}

export function getHelpText(): string {
	return `Usage:
  npx tsx packages/coding-agent/src/molian/report-cli.ts --address <address> --chain <eth|bsc|tron|btc> [--output <file>] [--no-agent-summary]
`;
}

function printHelp(): void {
	console.log(getHelpText());
}

function isExecutedAsScript(): boolean {
	const entryPath = process.argv[1];
	return entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href;
}

async function main(): Promise<void> {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.error) {
		console.error(parsed.error);
		process.exit(1);
	}
	if (parsed.help || !parsed.address || !parsed.chain) {
		printHelp();
		process.exit(parsed.help ? 0 : 1);
	}

	if (!isSupportedMolianReportChain(parsed.chain)) {
		console.error(`Unsupported chain "${parsed.chain}". Use eth, bsc, tron, or btc.`);
		process.exit(1);
	}

	const agentDir = getAgentDir();
	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	try {
		const result = await exportMolianAssetProofReport({
			address: parsed.address,
			chain: parsed.chain,
			outputPath: parsed.outputPath,
			authStorage,
			agentDir,
			enableAgentSummary: parsed.enableAgentSummary,
		});

		console.log(result.outputPath);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

if (isExecutedAsScript()) {
	void main();
}
