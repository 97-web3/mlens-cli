import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import { writeMolianAssetProofReportHtml } from "../asset-proof-workflow.ts";
import { getMolianReportRun, updateMolianReportRun } from "../report-run-state.ts";

export function createWriteMolianAssetProofReportHtmlTool() {
	return defineTool({
		name: "write_molian_asset_proof_report_html",
		label: "Write Molian Report HTML",
		description: "Render and write the final Molian asset-proof HTML report for a previously built runId.",
		promptSnippet:
			"Write the final Molian asset-proof HTML report to disk. If no outputPath is provided, use the default path from the build step.",
		parameters: Type.Object({
			runId: Type.String({ description: "runId returned by collect_molian_asset_proof_data." }),
			outputPath: Type.Optional(Type.String({ description: "Optional output path for the final HTML report." })),
		}),
		execute: async (_toolCallId, params, _signal, onUpdate, ctx) => {
			const state = getMolianReportRun(ctx.sessionManager, params.runId);
			if (!state?.report) {
				throw new Error(`Unknown Molian report runId "${params.runId}". Build the report before writing HTML.`);
			}
			const result = await writeMolianAssetProofReportHtml({
				report: state.report,
				cwd: ctx.cwd,
				outputPath: params.outputPath,
				onProgress: (event) => {
					state.lastProgress = event;
					updateMolianReportRun(ctx.sessionManager, state);
					onUpdate?.({
						content: [{ type: "text", text: event.message }],
						details: {
							runId: params.runId,
							stage: event.stage,
							snapshot: event.snapshot,
						},
					});
				},
			});
			state.defaultOutputPath = result.outputPath;
			updateMolianReportRun(ctx.sessionManager, state);
			return {
				content: [{ type: "text", text: `Molian report written to ${result.outputPath}` }],
				details: {
					runId: params.runId,
					outputPath: result.outputPath,
				},
			};
		},
	});
}
