#!/usr/bin/env node
import { join } from "node:path";
import { getAgentDir } from "../config.ts";
import { AuthStorage } from "../core/auth-storage.ts";
import { exportMolianAssetProofReport, isSupportedMolianReportChain } from "./asset-proof-workflow.ts";

interface ReportCliArgs {
	address?: string;
	chain?: string;
	outputPath?: string;
	subjectName?: string;
	enableAgentSummary: boolean;
	help: boolean;
}

function parseArgs(args: string[]): ReportCliArgs {
	const result: ReportCliArgs = {
		enableAgentSummary: true,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--address" && i + 1 < args.length) {
			result.address = args[++i];
		} else if (arg === "--chain" && i + 1 < args.length) {
			result.chain = args[++i];
		} else if (arg === "--output" && i + 1 < args.length) {
			result.outputPath = args[++i];
		} else if (arg === "--subject" && i + 1 < args.length) {
			result.subjectName = args[++i];
		} else if (arg === "--no-agent-summary") {
			result.enableAgentSummary = false;
		}
	}

	return result;
}

function printHelp(): void {
	console.log(`Usage:
  npx tsx packages/coding-agent/src/molian/report-cli.ts --address <address> --chain <eth|bsc|tron|btc> [--output <file>] [--subject <name>] [--no-agent-summary]
`);
}

async function main(): Promise<void> {
	const parsed = parseArgs(process.argv.slice(2));
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
			subjectName: parsed.subjectName,
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

void main();
