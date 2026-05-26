import { join } from "node:path";
import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import { createMolianAssetProofReportFilename } from "../asset-proof-report.ts";
import {
	buildMolianAssetProofReportFromCollectedData,
	type MolianAgentSummaryPatch,
	type MolianAssetProofProgressSnapshot,
	type MolianCollectedAssetProofData,
} from "../asset-proof-workflow.ts";
import { getMolianReportRun, updateMolianReportRun } from "../report-run-state.ts";

const summaryPatchSchema = Type.Object({
	overallGrade: Type.Optional(
		Type.Union([
			Type.Literal("strong_support"),
			Type.Literal("moderate_support"),
			Type.Literal("weak_support"),
			Type.Literal("inconclusive"),
		]),
	),
	coreConclusion: Type.Optional(Type.String()),
	topFindings: Type.Optional(Type.Array(Type.String())),
	keyAssets: Type.Optional(Type.Array(Type.String())),
	evidenceStrengthNote: Type.Optional(Type.String()),
});

function buildSnapshot(collectedData: MolianCollectedAssetProofData): MolianAssetProofProgressSnapshot {
	return {
		chain: collectedData.chain,
		totalTxCount: collectedData.addressProfile.totalTxCount,
		tokenTransferCount: collectedData.addressProfile.tokenTransferCount,
		currentNativeBalance: collectedData.addressProfile.currentNativeBalance,
		assetCount: collectedData.assetProofItems.length,
		participationCount: collectedData.participationItems.length,
		evidenceCount: collectedData.evidenceSamples.length,
	};
}

export function createBuildMolianAssetProofReportTool() {
	return defineTool({
		name: "build_molian_asset_proof_report",
		label: "Build Molian Asset-Proof Report",
		description: "Build the deterministic Molian report JSON from a previously collected runId.",
		promptSnippet:
			"Build the structured Molian asset-proof report from collected facts. Optionally pass a fact-grounded summaryPatch.",
		parameters: Type.Object({
			runId: Type.String({ description: "runId returned by collect_molian_asset_proof_data." }),
			summaryPatch: Type.Optional(summaryPatchSchema),
		}),
		execute: async (_toolCallId, params, _signal, onUpdate, ctx) => {
			const state = getMolianReportRun(ctx.sessionManager, params.runId);
			if (!state?.collectedData) {
				throw new Error(`Unknown Molian report runId "${params.runId}". Collect report facts first.`);
			}
			onUpdate?.({
				content: [{ type: "text", text: "Building quantitative report structure..." }],
				details: {
					runId: params.runId,
					stage: "building_report",
					snapshot: buildSnapshot(state.collectedData),
				},
			});
			const summaryPatch = params.summaryPatch as MolianAgentSummaryPatch | undefined;
			const report = await buildMolianAssetProofReportFromCollectedData({
				collectedData: state.collectedData,
				summaryPatch,
			});
			state.report = report;
			state.defaultOutputPath = join(ctx.cwd, "molian-reports", createMolianAssetProofReportFilename(report));
			state.lastProgress = {
				stage: "building_report",
				message: "Building quantitative report structure...",
				snapshot: buildSnapshot(state.collectedData),
			};
			updateMolianReportRun(ctx.sessionManager, state);
			return {
				content: [
					{
						type: "text",
						text: [
							`runId: ${params.runId}`,
							`reportId: ${report.reportMeta.reportId}`,
							`overallGrade: ${report.executiveSummary.overallGrade}`,
							`keyAssets: ${report.executiveSummary.keyAssets.join(", ") || "none"}`,
							`defaultOutputPath: ${state.defaultOutputPath}`,
						].join("\n"),
					},
				],
				details: {
					runId: params.runId,
					reportId: report.reportMeta.reportId,
					overallGrade: report.executiveSummary.overallGrade,
					keyAssets: report.executiveSummary.keyAssets,
					defaultOutputPath: state.defaultOutputPath,
				},
			};
		},
	});
}
