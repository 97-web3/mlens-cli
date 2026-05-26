import { describe, expect, it } from "vitest";
import {
	createMolianAssetProofReportFilename,
	createMolianAssetProofReportTemplate,
	renderMolianAssetProofReportHtml,
} from "../../src/molian/asset-proof-report.ts";

describe("molian asset proof report template", () => {
	it("creates a single-address single-chain report skeleton", () => {
		const report = createMolianAssetProofReportTemplate({
			targetAddress: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
			chain: "eth",
		});

		expect(report.reportMeta.targetAddress).toBe("0x464e146614D53B675B74cD04d2d727b2c04aeABa");
		expect(report.reportMeta.chain).toBe("eth");
		expect(report.reportMeta.reportType).toBe("asset_proof");
		expect(report.executiveSummary.overallGrade).toBe("inconclusive");
		expect(report.executiveSummary.topFindings).toEqual([]);
		expect(report.assetProofItems).toEqual([]);
		expect(report.participationItems).toEqual([]);
		expect(report.limitations.cannotConcludeItems).toEqual([]);
	});

	it("builds a stable html filename per address and chain", () => {
		const report = createMolianAssetProofReportTemplate({
			targetAddress: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
			chain: "eth",
		});

		expect(createMolianAssetProofReportFilename(report)).toBe(
			"mlens-asset-proof-eth-0x464e146614d53b675b74cd04d2d727b2c04aeaba.html",
		);
	});

	it("renders a standalone html report with required sections and evidence links", () => {
		const report = createMolianAssetProofReportTemplate({
			targetAddress: "0x464e146614D53B675B74cD04d2d727b2c04aeABa",
			chain: "eth",
			subjectName: "Sample Subject",
		});

		report.executiveSummary.overallGrade = "strong_support";
		report.executiveSummary.coreConclusion = "该地址在 ETH 主链上存在较明确的历史资产持有证据，可支持资产证明方向。";
		report.executiveSummary.topFindings = [
			"ETH 主链活跃时间早于辅助链",
			"存在可识别的 DeFi 参与记录",
			"曾出现可见峰值余额",
		];
		report.executiveSummary.keyAssets = ["ETH", "USDT", "FWB"];
		report.addressProfile.firstActivityAt = "2020-10-03T00:00:00.000Z";
		report.addressProfile.lastActivityAt = "2026-01-29T00:00:00.000Z";
		report.addressProfile.totalTxCount = 2920;
		report.addressProfile.activityCharacterization = "ETH 主链深度活跃，BSC 仅辅助使用。";
		report.assetProofItems.push({
			assetSymbol: "ETH",
			assetCategory: "native",
			proofGrade: "strong_support",
			firstSeenAt: "2020-10-03T00:00:00.000Z",
			firstAcquiredAt: "2020-10-03T00:00:00.000Z",
			peakBalance: "220 ETH",
			peakBalanceAt: "2020-09-30T00:00:00.000Z",
			highHoldingPeriod: "2020 Q4",
			historicalShareOfPortfolio: "核心资产",
			proofSummary: "早期持有并在重要时期形成高峰余额。",
			sampleEvidenceRows: [
				{
					sampleTitle: "首次入金样本",
					eventTime: "2020-10-03T00:00:00.000Z",
					eventType: "first_funding",
					assetSymbol: "ETH",
					direction: "in",
					amountText: "50 ETH",
					counterpartyLabel: "0x62590090",
					counterpartyAddress: "0x62590090",
					txHash: "0xabc",
					explorerUrl: "https://etherscan.io/tx/0xabc",
					note: "来自早期个人地址的启动资金",
				},
			],
		});
		report.participationItems.push({
			projectName: "Uniswap LP",
			participationType: "DeFi_LP",
			participationAt: "2020-09",
			inputAsset: "ETH",
			inputAmountText: "50 ETH",
			exitAsset: "ETH",
			exitAmountText: "220 ETH",
			estimatedProfitText: "约 170 ETH",
			proofGrade: "moderate_support",
			proofSummary: "退出规模显著高于投入规模。",
			sampleEvidenceRows: [
				{
					sampleTitle: "LP 退出样本",
					eventTime: "2020-09-30T00:00:00.000Z",
					eventType: "lp_exit",
					assetSymbol: "ETH",
					direction: "out",
					amountText: "220 ETH",
					counterpartyLabel: "Uniswap V2",
					counterpartyAddress: "",
					txHash: "0xdef",
					explorerUrl: "https://etherscan.io/tx/0xdef",
					note: "退出规模明显放大",
				},
			],
		});
		report.evidenceSamples.push({
			sectionKey: "asset_proof",
			sampleTitle: "代表性资金流样本",
			eventTime: "2020-10-03T00:00:00.000Z",
			eventType: "funding",
			assetSymbol: "ETH",
			direction: "in",
			amountText: "50 ETH",
			counterpartyLabel: "0x62590090",
			counterpartyAddress: "0x62590090",
			txHash: "0xabc",
			explorerUrl: "https://etherscan.io/tx/0xabc",
			note: "可点击跳转原始交易",
		});
		report.limitations.coverageLimitations = ["仅覆盖公开链上可见样本"];
		report.limitations.cannotConcludeItems = ["无法仅凭当前样本确认链下资产规模"];
		report.appendix.dataSources = ["Etherscan", "DeFi protocol event samples"];

		const html = renderMolianAssetProofReportHtml(report);

		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("资产证明审查报告");
		expect(html).toContain("报告摘要");
		expect(html).toContain("地址基本信息");
		expect(html).toContain("早期持仓证明");
		expect(html).toContain("历史余额与峰值证明");
		expect(html).toContain("项目参与与收益证明");
		expect(html).toContain("关键证据样本");
		expect(html).toContain("结论与局限");
		expect(html).toContain("强支持");
		expect(html).toContain('href="https://etherscan.io/tx/0xabc"');
		expect(html).toContain("Uniswap LP");
	});

	it("escapes unsafe html and shows placeholders for empty sections", () => {
		const report = createMolianAssetProofReportTemplate({
			targetAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
			chain: "tron",
			subjectName: "<script>alert(1)</script>",
		});
		report.executiveSummary.topFindings = ["持有 <b>TRX</b>"];

		const html = renderMolianAssetProofReportHtml(report);

		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain("&lt;b&gt;TRX&lt;/b&gt;");
		expect(html).toContain("未发现可支持证据");
		expect(html).toContain("当前无法判断");
	});
});
