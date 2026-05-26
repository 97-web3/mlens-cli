import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/index.ts";
import {
	exportMolianAssetProofReport,
	isSupportedMolianReportChain,
	type MolianAssetProofProgressEvent,
} from "../asset-proof-workflow.ts";
import {
	createMolianReportProgressMessage,
	formatMolianReportProgressWidgetLines,
	updateMolianReportProgress,
} from "../report-progress.ts";
import type { SupportedChain } from "../tools/types.ts";

export interface ParsedMolianReportArgs {
	address: string;
	chain: SupportedChain;
	outputPath?: string;
}

export interface MolianReportCommandDeps {
	exportReport: typeof exportMolianAssetProofReport;
}

const DEFAULT_DEPS: MolianReportCommandDeps = {
	exportReport: exportMolianAssetProofReport,
};

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

export async function handleMolianReportCommand(
	pi: Pick<ExtensionAPI, "sendMessage">,
	rawArgs: string,
	ctx: ExtensionCommandContext,
	deps: MolianReportCommandDeps = DEFAULT_DEPS,
): Promise<void> {
	const parsed = parseMolianReportArgs(rawArgs);
	if ("error" in parsed) {
		ctx.ui.notify(parsed.error, "warning");
		return;
	}

	try {
		const progressOrder: MolianAssetProofProgressEvent["stage"][] = [
			"collecting_data",
			"building_report",
			"agent_summary",
			"rendering_html",
			"writing_file",
		];
		const runId = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		let progressMessageSent = false;
		const result = await deps.exportReport({
			address: parsed.address,
			chain: parsed.chain,
			outputPath: parsed.outputPath,
			cwd: ctx.cwd,
			authStorage: ctx.modelRegistry.authStorage,
			modelRegistry: ctx.modelRegistry,
			model: ctx.model ?? undefined,
			enableAgentSummary: true,
			onProgress: (event) => {
				const details = {
					...event,
					runId,
					index: progressOrder.indexOf(event.stage) + 1,
					total: progressOrder.length,
				};
				updateMolianReportProgress(details);
				ctx.ui.setStatus("molian.report", event.message);
				ctx.ui.setWidget("molian.report.progress", formatMolianReportProgressWidgetLines(details), {
					placement: "belowEditor",
				});
				if (!progressMessageSent) {
					progressMessageSent = true;
					pi.sendMessage(createMolianReportProgressMessage(details));
				}
			},
		});

		ctx.ui.setStatus("molian.report", undefined);
		ctx.ui.setWidget("molian.report.progress", undefined, { placement: "belowEditor" });
		ctx.ui.notify(
			`Asset-proof report exported to ${result.outputPath}${result.usedAgentSummary ? " (agent summary applied)." : "."}`,
			"info",
		);
	} catch (error) {
		ctx.ui.setStatus("molian.report", undefined);
		ctx.ui.setWidget("molian.report.progress", undefined, { placement: "belowEditor" });
		ctx.ui.notify(
			`Failed to export asset-proof report: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}
