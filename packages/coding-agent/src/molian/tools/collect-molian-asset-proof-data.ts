import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { defineTool } from "../../core/extensions/index.ts";
import {
	collectMolianAssetProofData,
	type MolianAssetProofProgressSnapshot,
	type MolianCollectedAssetProofData,
} from "../asset-proof-workflow.ts";
import { createMolianReportRun, updateMolianReportRun } from "../report-run-state.ts";

function formatCollectedFacts(runId: string, collectedData: MolianCollectedAssetProofData): string {
	const keyAssets =
		collectedData.assetProofItems
			.map((item) => item.assetSymbol)
			.slice(0, 5)
			.join(", ") || "none";
	const projects =
		collectedData.participationItems
			.map((item) => item.projectName)
			.slice(0, 3)
			.join(", ") || "none";
	return [
		`runId: ${runId}`,
		`chain: ${collectedData.chain.toUpperCase()}`,
		`address: ${collectedData.address}`,
		`firstActivityAt: ${collectedData.addressProfile.firstActivityAt ?? "unknown"}`,
		`lastActivityAt: ${collectedData.addressProfile.lastActivityAt ?? "unknown"}`,
		`totalTxCount: ${collectedData.addressProfile.totalTxCount ?? 0}`,
		`tokenTransferCount: ${collectedData.addressProfile.tokenTransferCount ?? 0}`,
		`currentNativeBalance: ${collectedData.addressProfile.currentNativeBalance || "unknown"}`,
		`keyAssets: ${keyAssets}`,
		`participationClues: ${projects}`,
		`evidenceCount: ${collectedData.evidenceSamples.length}`,
		`sourceSummary: ${collectedData.sourceSummary || "unknown"}`,
	].join("\n");
}

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

export function createCollectMolianAssetProofDataTool() {
	return defineTool({
		name: "collect_molian_asset_proof_data",
		label: "Collect Molian Report Facts",
		description: "Collect normalized public-data facts for a single-address single-chain Molian asset-proof report.",
		promptSnippet:
			"Collect normalized report facts for an address before building a Molian asset-proof report. Returns a runId for later build/write steps.",
		parameters: Type.Object({
			address: Type.String({ description: "Target wallet address to inspect." }),
			chain: Type.Union([Type.Literal("eth"), Type.Literal("bsc"), Type.Literal("tron"), Type.Literal("btc")]),
		}),
		execute: async (_toolCallId, params, _signal, onUpdate, ctx) => {
			const runId = `molian-report-${randomUUID()}`;
			const state = createMolianReportRun(ctx.sessionManager, {
				runId,
				address: params.address,
				chain: params.chain,
			});
			const collectedData = await collectMolianAssetProofData({
				address: params.address,
				chain: params.chain,
				authStorage: ctx.modelRegistry.authStorage,
				onProgress: (event) => {
					state.lastProgress = event;
					updateMolianReportRun(ctx.sessionManager, state);
					onUpdate?.({
						content: [{ type: "text", text: event.message }],
						details: {
							runId,
							stage: event.stage,
							snapshot: event.snapshot,
						},
					});
				},
			});
			state.collectedData = collectedData;
			updateMolianReportRun(ctx.sessionManager, state);
			return {
				content: [{ type: "text", text: formatCollectedFacts(runId, collectedData) }],
				details: {
					runId,
					chain: collectedData.chain,
					address: collectedData.address,
					snapshot: buildSnapshot(collectedData),
				},
			};
		},
	});
}
