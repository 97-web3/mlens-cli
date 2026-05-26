import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../../src/core/auth-storage.ts";
import {
	buildMolianAssetProofReport,
	buildMolianAssetProofReportFromCollectedData,
	collectMolianAssetProofData,
	exportMolianAssetProofReport,
	type MolianAssetProofNarrator,
	writeMolianAssetProofReportHtml,
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
			providerOverrides: {
				marketPrice: async (symbol) => {
					if (symbol === "ETH") {
						return {
							currentPriceUsd: "2500",
							priceSource: "binance",
							priceStatus: "live",
							quoteSymbolNormalized: "ETHUSDT",
						};
					}
					if (symbol === "USDT") {
						return {
							currentPriceUsd: "1",
							priceSource: "stablecoin_fallback",
							priceStatus: "fallback",
							quoteSymbolNormalized: "USDT/USD",
						};
					}
					return {
						currentPriceUsd: "0",
						priceSource: "unavailable",
						priceStatus: "unavailable",
						quoteSymbolNormalized: `${symbol}USDT`,
					};
				},
			},
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
		expect(report.reportMeta.sourceSummary).toContain("etherscan");
		expect(report.assetProofItems.find((item) => item.assetSymbol === "ETH")).toEqual(
			expect.objectContaining({
				currentPriceUsd: "2500",
				currentValueUsd: "125000",
				priceSource: "binance",
				priceStatus: "live",
				quoteSymbolNormalized: "ETHUSDT",
				historicalTotalInText: "50 ETH",
				historicalTotalOutText: "1 ETH",
				flowCoverage: "complete",
			}),
		);
		expect(report.assetProofItems.find((item) => item.assetSymbol === "USDT")).toEqual(
			expect.objectContaining({
				historicalTotalInText: "100 USDT",
				historicalTotalOutText: "40 USDT",
				flowCoverage: "complete",
			}),
		);
		expect(report.assetProofItems.find((item) => item.assetSymbol === "FWB")).toEqual(
			expect.objectContaining({
				currentPriceUsd: "0",
				currentValueUsd: "0",
				priceSource: "unavailable",
				priceStatus: "unavailable",
				proofGrade: "weak_support",
				historicalTotalInText: "1143.8 FWB",
				historicalTotalOutText: "1000 FWB",
				flowCoverage: "complete",
			}),
		);
	});

	it("exports html and applies guarded agent summary patch", async () => {
		const tempDir = createTempDir();
		const authStorage = AuthStorage.inMemory();
		const progressEvents: Array<{ stage: string; message: string }> = [];
		const narrator: MolianAssetProofNarrator = {
			async narrate() {
				return {
					overallGrade: "strong_support",
					coreConclusion: "该地址具备 <b>较强</b> 资产证明线索。",
					topFindings: ["A", "B", "C", "D", "E", "F"],
					keyAssets: ["BTC", "FAKE"],
					evidenceStrengthNote: "基于脚本样本 + agent 总结",
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
			onProgress: (event) => {
				progressEvents.push({ stage: event.stage, message: event.message });
			},
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
				marketPrice: async () => ({
					currentPriceUsd: "76000",
					priceSource: "binance",
					priceStatus: "live",
					quoteSymbolNormalized: "BTCUSDT",
				}),
			},
		});

		await access(result.outputPath);

		const html = await readFile(result.outputPath, "utf-8");
		expect(result.usedAgentSummary).toBe(true);
		expect(result.report.executiveSummary.overallGrade).toBe("strong_support");
		expect(result.report.executiveSummary.topFindings).toEqual(["A", "B", "C", "D", "E"]);
		expect(result.report.executiveSummary.keyAssets).toEqual(["BTC"]);
		expect(result.report.assetProofItems[0]).toEqual(
			expect.objectContaining({
				historicalTotalInText: "1.75 BTC",
				historicalTotalOutText: "0.25 BTC",
				flowCoverage: "complete",
			}),
		);
		expect(html).toContain("&lt;b&gt;较强&lt;/b&gt;");
		expect(html).not.toContain("结论与局限");
		expect(html).not.toContain("附录");
		expect(result.outputPath).toContain("/molian-reports/");
		expect(progressEvents.slice(0, 5)).toEqual([
			{ stage: "collecting_data", message: "Collecting on-chain data..." },
			{ stage: "collecting_data", message: "Collecting BTC address overview..." },
			{ stage: "building_report", message: "Building quantitative report structure..." },
			{ stage: "agent_summary", message: "Applying agent summary guard..." },
			{ stage: "rendering_html", message: "Rendering HTML report..." },
		]);
		expect(progressEvents[5]).toEqual({
			stage: "writing_file",
			message: `Writing report file to ${result.outputPath}`,
		});
	});

	it("supports staged collect, build, and write phases", async () => {
		const tempDir = createTempDir();
		const collectedData = await collectMolianAssetProofData({
			address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
			chain: "btc",
			generatedAt: "2026-01-30T00:00:00.000Z",
			dataAsOf: "2026-01-30T00:00:00.000Z",
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
				marketPrice: async () => ({
					currentPriceUsd: "76000",
					priceSource: "binance",
					priceStatus: "live",
					quoteSymbolNormalized: "BTCUSDT",
				}),
			},
		});

		const report = await buildMolianAssetProofReportFromCollectedData({
			collectedData,
			providerOverrides: {
				marketPrice: async () => ({
					currentPriceUsd: "76000",
					priceSource: "binance",
					priceStatus: "live",
					quoteSymbolNormalized: "BTCUSDT",
				}),
			},
			summaryPatch: {
				coreConclusion: "该地址在公开链上数据中存在较明确的 BTC 持仓线索。",
			},
		});
		const result = await writeMolianAssetProofReportHtml({
			report,
			cwd: tempDir,
		});

		await access(result.outputPath);
		const html = await readFile(result.outputPath, "utf-8");

		expect(collectedData.addressProfile.totalTxCount).toBe(3);
		expect(report.executiveSummary.coreConclusion).toBe("该地址在公开链上数据中存在较明确的 BTC 持仓线索。");
		expect(report.assetProofItems[0]?.currentValueUsd).toBe("114000");
		expect(result.outputPath).toContain("/molian-reports/");
		expect(html).toContain("BTC");
	});

	it("builds a TRON report with native and TRC20 token assets", async () => {
		const report = await buildMolianAssetProofReport({
			address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
			chain: "tron",
			authStorage: AuthStorage.inMemory({
				"molian-tron": { type: "api_key", key: "tron-key" },
			}),
			providerOverrides: {
				tronOverview: async () => ({
					chain: "tron",
					address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
					balanceSummary: {
						nativeSymbol: "TRX",
						nativeBalance: "88",
						nativeStakedBalance: "108393",
						assets: [{ symbol: "USDT", amount: "80154.420799" }],
					},
					activitySummary: {
						txCount: 2,
						firstSeenAt: "2024-01-01T00:00:00.000Z",
						lastSeenAt: "2024-01-02T00:00:00.000Z",
					},
					transferSummary: {
						largeTransfers: [
							{
								timestamp: "2024-01-01T00:00:00.000Z",
								amount: "30",
								symbol: "TRX",
								direction: "in",
							},
							{
								timestamp: "2024-01-02T00:00:00.000Z",
								amount: "10",
								symbol: "TRX",
								direction: "out",
							},
						],
					},
					counterparties: [],
					labels: [],
					sourceMeta: {
						provider: "trongrid",
						partial: false,
						notes: ["Sourced from TronGrid account, transfer, and TRC20 transfer endpoints."],
					},
				}),
				tronTokenTransfers: async () => [
					{
						timeStamp: "1704240000",
						hash: "trc20-hash-3",
						from: "TThirdPartyAddress",
						to: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
						value: "10000000",
						tokenDecimal: "6",
						tokenSymbol: "VANT",
						tokenName: "Vantrix",
						contractAddress: "TL81r5Zze7Av4DiKxCBzCbtDnUQVSQfm82",
					},
					{
						timeStamp: "1704153600",
						hash: "trc20-hash-2",
						from: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
						to: "TReceiverAddress",
						value: "5000000",
						tokenDecimal: "6",
						tokenSymbol: "VANT",
						tokenName: "Vantrix",
						contractAddress: "TL81r5Zze7Av4DiKxCBzCbtDnUQVSQfm82",
					},
					{
						timeStamp: "1704067200",
						hash: "trc20-hash-1",
						from: "TSenderAddress",
						to: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
						value: "20000000",
						tokenDecimal: "6",
						tokenSymbol: "VANT",
						tokenName: "Vantrix",
						contractAddress: "TL81r5Zze7Av4DiKxCBzCbtDnUQVSQfm82",
					},
				],
				marketPrice: async () => ({
					currentPriceUsd: "0.12",
					priceSource: "binance",
					priceStatus: "live",
					quoteSymbolNormalized: "TRXUSDT",
				}),
			},
		});

		expect(report.assetProofItems[0]).toEqual(
			expect.objectContaining({
				assetSymbol: "TRX",
				historicalTotalInText: "30 TRX",
				historicalTotalOutText: "10 TRX",
				flowCoverage: "complete",
			}),
		);
		expect(report.assetProofItems.map((item) => item.assetSymbol)).toContain("VANT");
		expect(report.addressProfile.tokenTransferCount).toBe(3);
		expect(report.addressProfile.currentNativeBalance).toContain("含质押 108393 TRX");
		expect(report.assetProofItems.find((item) => item.assetSymbol === "VANT")).toEqual(
			expect.objectContaining({
				firstSeenAt: "2024-01-01T00:00:00.000Z",
				firstAcquiredAt: "2024-01-01T00:00:00.000Z",
				peakBalance: "25 VANT",
				peakBalanceAt: "2024-01-03T00:00:00.000Z",
				historicalTotalInText: "30 VANT",
				historicalTotalOutText: "5 VANT",
			}),
		);
		expect(report.participationItems.find((item) => item.projectName === "Vantrix")).toEqual(
			expect.objectContaining({
				participationAt: "2024-01-01T00:00:00.000Z",
				inputAmountText: "20 VANT",
				exitAmountText: "5 VANT",
			}),
		);
	});

	it("never reports a native peak balance below the current balance", async () => {
		const report = await buildMolianAssetProofReport({
			address: "16G1xYBbiNG78LSuZdMqp6tux5xvVp9Wxh",
			chain: "btc",
			providerOverrides: {
				btcOverview: async () => ({
					chain: "btc",
					address: "16G1xYBbiNG78LSuZdMqp6tux5xvVp9Wxh",
					balanceSummary: { nativeSymbol: "BTC", nativeBalance: "2.23362177" },
					activitySummary: {
						txCount: 96673,
						lastSeenAt: "2026-05-26T06:36:21.000Z",
					},
					transferSummary: {
						totalIn: "940.33318119",
						totalOut: "938.09955942",
						largeTransfers: [
							{
								timestamp: "2026-05-24T16:06:27.000Z",
								amount: "0.04516784",
								symbol: "BTC",
								direction: "in",
							},
						],
					},
					counterparties: [],
					labels: [],
					sourceMeta: {
						provider: "mempool.space",
						partial: true,
						notes: ["Recent transaction samples are partial and may omit older history."],
					},
				}),
				marketPrice: async () => ({
					currentPriceUsd: "76000",
					priceSource: "binance",
					priceStatus: "live",
					quoteSymbolNormalized: "BTCUSDT",
				}),
			},
		});

		expect(report.assetProofItems[0]).toEqual(
			expect.objectContaining({
				peakBalance: "2.23362177 BTC",
				peakBalanceAt: "",
				currentValueUsd: "169755.25",
			}),
		);
	});

	it("marks empty EVM reports as inconclusive and suggests checking chain selection", async () => {
		const report = await buildMolianAssetProofReport({
			address: "0x65f0ec303ad5007be21f6808febb3edccd1369e1",
			chain: "eth",
			authStorage: AuthStorage.inMemory({
				"molian-eth": { type: "api_key", key: "eth-key" },
			}),
			providerOverrides: {
				evmOverview: async () => ({
					chain: "eth",
					address: "0x65f0ec303ad5007be21f6808febb3edccd1369e1",
					balanceSummary: { nativeSymbol: "ETH", nativeBalance: "0" },
					activitySummary: {
						txCount: 0,
					},
					transferSummary: {
						totalIn: "0",
						totalOut: "0",
						largeTransfers: [],
					},
					counterparties: [],
					labels: [],
					sourceMeta: {
						provider: "etherscan",
						partial: true,
						notes: [],
					},
				}),
				evmTokenTransfers: async () => [],
				marketPrice: async () => ({
					currentPriceUsd: "2500",
					priceSource: "binance",
					priceStatus: "live",
					quoteSymbolNormalized: "ETHUSDT",
				}),
			},
		});

		expect(report.executiveSummary.overallGrade).toBe("inconclusive");
		expect(report.assetProofItems).toEqual([]);
		expect(report.executiveSummary.keyAssets).toEqual([]);
		expect(report.executiveSummary.coreConclusion).toContain("所选链上未观察到有效交易活动");
		expect(report.executiveSummary.evidenceStrengthNote).toContain("优先复核链选择");
		expect(report.executiveSummary.topFindings).toEqual(
			expect.arrayContaining([
				"所选链上未观测到交易记录。",
				"如预期该地址应有活动，优先复核链选择与链上 API 配置。",
			]),
		);
	});
});
