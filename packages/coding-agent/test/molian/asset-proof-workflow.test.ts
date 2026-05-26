import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../../src/core/auth-storage.ts";
import {
	buildMolianAssetProofReport,
	exportMolianAssetProofReport,
	type MolianAssetProofNarrator,
} from "../../src/molian/asset-proof-workflow.ts";

function createTempDir(): string {
	return join(tmpdir(), `molian-report-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("molian asset proof workflow", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("builds an ETH report from scripted provider data and token transfers", async () => {
		const authStorage = AuthStorage.inMemory({
			"molian-eth": { type: "api_key", key: "eth-key" },
		});

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: "2500000000000000000",
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: [
						{
							timeStamp: "1601683200",
							hash: "0xeth1",
							from: "0x62590090",
							to: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
							value: "50000000000000000000",
						},
						{
							timeStamp: "1609459200",
							hash: "0xeth2",
							from: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
							to: "0xuniswap",
							value: "1000000000000000000",
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					status: "1",
					message: "OK",
					result: [
						{
							timeStamp: "1609545600",
							hash: "0xusdt-in",
							from: "0xsource",
							to: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
							value: "100000000",
							tokenDecimal: "6",
							tokenSymbol: "USDT",
							tokenName: "Tether USD",
							contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
						},
						{
							timeStamp: "1609632000",
							hash: "0xusdt-out",
							from: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
							to: "0xbinance",
							value: "40000000",
							tokenDecimal: "6",
							tokenSymbol: "USDT",
							tokenName: "Tether USD",
							contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
						},
						{
							timeStamp: "1622505600",
							hash: "0xfwb-in",
							from: "0xfwbtreasury",
							to: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
							value: "1143800000000000000000",
							tokenDecimal: "18",
							tokenSymbol: "FWB",
							tokenName: "Friends With Benefits",
							contractAddress: "0x123",
						},
						{
							timeStamp: "1625097600",
							hash: "0xfwb-out",
							from: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
							to: "0xmember",
							value: "1000000000000000000000",
							tokenDecimal: "18",
							tokenSymbol: "FWB",
							tokenName: "Friends With Benefits",
							contractAddress: "0x123",
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const report = await buildMolianAssetProofReport({
			address: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
			chain: "eth",
			authStorage,
			dataAsOf: "2026-01-29T00:00:00.000Z",
			generatedAt: "2026-01-30T00:00:00.000Z",
		});

		expect(report.reportMeta.chain).toBe("eth");
		expect(report.addressProfile.firstActivityAt).toBe("2020-10-03T00:00:00.000Z");
		expect(report.addressProfile.tokenTransferCount).toBe(4);
		expect(report.assetProofItems.map((item) => item.assetSymbol)).toEqual(
			expect.arrayContaining(["ETH", "USDT", "FWB"]),
		);
		expect(report.participationItems.map((item) => item.projectName)).toContain("Friends With Benefits");
		expect(report.executiveSummary.keyAssets).toEqual(expect.arrayContaining(["ETH", "USDT", "FWB"]));
		expect(report.evidenceSamples.some((sample) => sample.explorerUrl.includes("etherscan.io/tx/0xusdt-in"))).toBe(
			true,
		);
		expect(report.appendix.dataSources).toEqual(expect.arrayContaining(["etherscan", "evm_token_transfers"]));
	});

	it("exports html and applies guarded agent summary patch", async () => {
		const tempDir = createTempDir();
		const authStorage = AuthStorage.inMemory();
		const narrator: MolianAssetProofNarrator = {
			async narrate() {
				return {
					overallGrade: "strong_support",
					coreConclusion: "该地址具备 <b>较强</b> 资产证明线索。",
					topFindings: ["A", "B", "C", "D", "E", "F"],
					keyAssets: ["BTC", "FAKE"],
					evidenceStrengthNote: "基于脚本样本 + agent 总结",
					coverageLimitations: ["仅覆盖公开数据"],
				};
			},
		};

		const result = await exportMolianAssetProofReport({
			address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
			chain: "btc",
			authStorage,
			cwd: tempDir,
			generatedAt: "2026-01-30T00:00:00.000Z",
			dataAsOf: "2026-01-30T00:00:00.000Z",
			enableAgentSummary: true,
			narrator,
			providerOverrides: {
				btcOverview: async () => ({
					chain: "btc",
					address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
					balanceSummary: { nativeSymbol: "BTC", nativeBalance: "1.5" },
					activitySummary: {
						txCount: 3,
						firstSeenAt: "2020-10-03T00:00:00.000Z",
						lastSeenAt: "2025-01-03T00:00:00.000Z",
						recentActivityWindow: "2020-10-03T00:00:00.000Z -> 2025-01-03T00:00:00.000Z",
					},
					transferSummary: {
						totalIn: "1.75",
						totalOut: "0.25",
						largeTransfers: [
							{
								timestamp: "2020-10-03T00:00:00.000Z",
								amount: "1.0",
								symbol: "BTC",
								direction: "in",
							},
						],
					},
					counterparties: [{ address: "bc1source", txCount: 1, relation: "recent transaction counterparty" }],
					labels: [],
					sourceMeta: {
						provider: "mempool.space",
						partial: true,
						notes: ["Recent transaction samples are partial."],
					},
				}),
			},
		});

		await access(result.outputPath);

		const html = await readFile(result.outputPath, "utf-8");
		expect(result.usedAgentSummary).toBe(true);
		expect(result.report.executiveSummary.overallGrade).toBe("strong_support");
		expect(result.report.executiveSummary.topFindings).toEqual(["A", "B", "C", "D", "E"]);
		expect(result.report.executiveSummary.keyAssets).toEqual(["BTC"]);
		expect(html).toContain("&lt;b&gt;较强&lt;/b&gt;");
		expect(html).toContain("仅覆盖公开数据");
		expect(result.outputPath).toContain("/molian-reports/");
	});
});
