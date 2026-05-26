import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createMolianAssetProofReportTemplate,
	type MolianAssetProofReport,
} from "../../src/molian/asset-proof-report.ts";
import type { MolianCollectedAssetProofData } from "../../src/molian/asset-proof-workflow.ts";
import * as reportWorkflow from "../../src/molian/asset-proof-workflow.ts";
import { createMolianExtensionFactory } from "../../src/molian/extension.ts";
import { createHarness, type Harness } from "../suite/harness.ts";

function createCollectedData(): MolianCollectedAssetProofData {
	return {
		address: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
		chain: "eth",
		generatedAt: "2026-01-30T00:00:00.000Z",
		dataAsOf: "2026-01-29T00:00:00.000Z",
		addressProfile: {
			firstActivityAt: "2020-10-03T00:00:00.000Z",
			lastActivityAt: "2026-01-29T00:00:00.000Z",
			addressAgeText: "自 2020-10-03 起活跃",
			totalTxCount: 42,
			tokenTransferCount: 5,
			currentNativeBalance: "2.5 ETH",
			currentKeyTokenHoldings: ["ETH", "USDT"],
			primaryFundingSources: ["0xsource"],
			primaryExitDestinations: ["0xexit"],
			activityCharacterization: "检测到原生资产与代币层面的双重链上活动。",
		},
		assetProofItems: [],
		participationItems: [],
		evidenceSamples: [],
		sourceSummary: "etherscan, evm_token_transfers",
	};
}

function createReport(): MolianAssetProofReport {
	const report = createMolianAssetProofReportTemplate({
		targetAddress: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
		chain: "eth",
	});
	report.reportMeta.generatedAt = "2026-01-30T00:00:00.000Z";
	report.reportMeta.dataAsOf = "2026-01-29T00:00:00.000Z";
	report.addressProfile.totalTxCount = 42;
	report.addressProfile.currentNativeBalance = "2.5 ETH";
	report.executiveSummary.overallGrade = "moderate_support";
	report.executiveSummary.keyAssets = ["ETH"];
	report.executiveSummary.coreConclusion = "该地址存在一定链上持仓与交互证据，可中度支持资产证明。";
	report.reportMeta.sourceSummary = "etherscan, evm_token_transfers";
	return report;
}

describe("molian report tools", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		vi.restoreAllMocks();
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("chains collect, build, and write through session-scoped run state", async () => {
		const harness = await createHarness({
			extensionFactories: [createMolianExtensionFactory()],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		const collectedData = createCollectedData();
		const report = createReport();
		const progressTexts: string[] = [];

		const collectSpy = vi.spyOn(reportWorkflow, "collectMolianAssetProofData").mockImplementation(async (options) => {
			options.onProgress?.({
				stage: "collecting_data",
				message: "Collecting mock facts...",
				snapshot: {
					chain: "eth",
					totalTxCount: 42,
					tokenTransferCount: 5,
					currentNativeBalance: "2.5 ETH",
					assetCount: 0,
					participationCount: 0,
					evidenceCount: 0,
				},
			});
			return collectedData;
		});
		const buildSpy = vi
			.spyOn(reportWorkflow, "buildMolianAssetProofReportFromCollectedData")
			.mockResolvedValue(report);
		const writeSpy = vi
			.spyOn(reportWorkflow, "writeMolianAssetProofReportHtml")
			.mockImplementation(async (options) => {
				options.onProgress?.({
					stage: "writing_file",
					message: "Writing mock file...",
					snapshot: {
						chain: "eth",
						totalTxCount: 42,
						tokenTransferCount: 5,
						currentNativeBalance: "2.5 ETH",
						assetCount: 0,
						participationCount: 0,
						evidenceCount: 0,
					},
				});
				return {
					html: "<html></html>",
					outputPath: "/tmp/mock-report.html",
				};
			});

		const collectTool = harness.session.getToolDefinition("collect_molian_asset_proof_data");
		const buildTool = harness.session.getToolDefinition("build_molian_asset_proof_report");
		const writeTool = harness.session.getToolDefinition("write_molian_asset_proof_report_html");

		expect(collectTool).toBeDefined();
		expect(buildTool).toBeDefined();
		expect(writeTool).toBeDefined();

		const toolContext = {
			cwd: harness.tempDir,
			sessionManager: harness.sessionManager,
			modelRegistry: { authStorage: harness.authStorage },
		} as never;

		const collectResult = await collectTool!.execute(
			"tool-collect-1",
			{
				address: collectedData.address,
				chain: collectedData.chain,
			},
			undefined,
			(update) => {
				const content = update.content
					.filter((part): part is { type: "text"; text: string } => part.type === "text")
					.map((part) => part.text)
					.join("\n");
				progressTexts.push(content);
			},
			toolContext,
		);

		const runId = (collectResult.details as { runId: string }).runId;
		expect(runId).toEqual(expect.any(String));

		await buildTool!.execute(
			"tool-build-1",
			{
				runId,
				summaryPatch: {
					coreConclusion: "基于公开链上数据的简要结论。",
				},
			},
			undefined,
			undefined,
			toolContext,
		);
		const writeResult = await writeTool!.execute("tool-write-1", { runId }, undefined, undefined, toolContext);

		expect(collectSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				address: collectedData.address,
				chain: collectedData.chain,
				onProgress: expect.any(Function),
			}),
		);
		expect(buildSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				collectedData,
				summaryPatch: expect.objectContaining({
					coreConclusion: "基于公开链上数据的简要结论。",
				}),
			}),
		);
		expect(writeSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				report,
				onProgress: expect.any(Function),
			}),
		);
		expect(progressTexts.join("\n")).toContain("Collecting mock facts...");
		expect(
			writeResult.content.some((part) => part.type === "text" && part.text.includes("/tmp/mock-report.html")),
		).toBe(true);
	});
});
