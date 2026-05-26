import type { SupportedChain } from "./tools/types.ts";

export type MolianReportGrade = "strong_support" | "moderate_support" | "weak_support" | "inconclusive";
export type MolianAssetPriceSource = "binance" | "okx" | "stablecoin_fallback" | "unavailable";
export type MolianAssetPriceStatus = "live" | "fallback" | "unavailable";
export type MolianAssetFlowCoverage = "complete" | "sampled";

export type MolianAssetCategory =
	| "native"
	| "stablecoin"
	| "major_alt"
	| "defi_token"
	| "nft_related"
	| "meme"
	| "other";

export type MolianParticipationType =
	| "ICO"
	| "DeFi_LP"
	| "Lending"
	| "Airdrop"
	| "NFT"
	| "Derivatives"
	| "DAO_or_Social_Token"
	| "Other";

export type MolianEvidenceDirection = "in" | "out" | "both" | "unknown";

export interface MolianAssetProofReportMeta {
	reportId: string;
	targetAddress: string;
	chain: SupportedChain;
	reportType: "asset_proof";
	generatedAt: string;
	dataAsOf: string;
	analystVersion: string;
	sourceSummary: string;
}

export interface MolianExecutiveSummary {
	overallGrade: MolianReportGrade;
	coreConclusion: string;
	topFindings: string[];
	keyAssets: string[];
	evidenceStrengthNote: string;
}

export interface MolianAddressProfile {
	firstActivityAt?: string;
	lastActivityAt?: string;
	addressAgeText: string;
	totalTxCount?: number;
	tokenTransferCount?: number;
	currentNativeBalance: string;
	currentKeyTokenHoldings: string[];
	primaryFundingSources: string[];
	primaryExitDestinations: string[];
	activityCharacterization: string;
}

export interface MolianEvidenceSampleRow {
	sectionKey?: string;
	sampleTitle: string;
	eventTime: string;
	eventType: string;
	assetSymbol: string;
	direction: MolianEvidenceDirection;
	amountText: string;
	counterpartyLabel: string;
	counterpartyAddress: string;
	txHash: string;
	explorerUrl: string;
	note: string;
}

export interface MolianAssetProofItem {
	assetSymbol: string;
	assetCategory: MolianAssetCategory;
	proofGrade: MolianReportGrade;
	firstSeenAt: string;
	firstAcquiredAt: string;
	peakBalance: string;
	peakBalanceAt: string;
	highHoldingPeriod: string;
	historicalShareOfPortfolio: string;
	currentPriceUsd: string;
	currentValueUsd: string;
	priceSource: MolianAssetPriceSource;
	priceStatus: MolianAssetPriceStatus;
	quoteSymbolNormalized: string;
	historicalTotalInText: string;
	historicalTotalOutText: string;
	flowCoverage: MolianAssetFlowCoverage;
	proofSummary: string;
	sampleEvidenceRows: MolianEvidenceSampleRow[];
}

export interface MolianParticipationItem {
	projectName: string;
	participationType: MolianParticipationType;
	participationAt: string;
	inputAsset: string;
	inputAmountText: string;
	exitAsset: string;
	exitAmountText: string;
	estimatedProfitText: string;
	proofGrade: MolianReportGrade;
	proofSummary: string;
	sampleEvidenceRows: MolianEvidenceSampleRow[];
}

export interface MolianAssetProofReport {
	reportMeta: MolianAssetProofReportMeta;
	executiveSummary: MolianExecutiveSummary;
	addressProfile: MolianAddressProfile;
	assetProofItems: MolianAssetProofItem[];
	participationItems: MolianParticipationItem[];
	evidenceSamples: MolianEvidenceSampleRow[];
}

export interface CreateMolianAssetProofReportTemplateInput {
	targetAddress: string;
	chain: SupportedChain;
}

const REPORT_TITLE = "资产证明审查报告";
const TEMPLATE_ANALYST_VERSION = "mlens-asset-proof-template-v1";

const GRADE_LABELS: Record<MolianReportGrade, string> = {
	strong_support: "强支持",
	moderate_support: "中度支持",
	weak_support: "弱支持",
	inconclusive: "无法判断",
};

const PARTICIPATION_LABELS: Record<MolianParticipationType, string> = {
	ICO: "ICO",
	DeFi_LP: "DeFi LP",
	Lending: "借贷收益",
	Airdrop: "空投收益",
	NFT: "NFT 收益",
	Derivatives: "衍生品",
	DAO_or_Social_Token: "DAO / 社交代币",
	Other: "其他",
};

const ASSET_CATEGORY_LABELS: Record<MolianAssetCategory, string> = {
	native: "原生资产",
	stablecoin: "稳定币",
	major_alt: "主流币",
	defi_token: "DeFi 资产",
	nft_related: "NFT 相关",
	meme: "Meme / 空投",
	other: "其他",
};

const PRIMARY_DISPLAYABLE_ASSET_GRADES = new Set<MolianReportGrade>(["strong_support", "moderate_support"]);
const PRICE_SOURCE_LABELS: Record<MolianAssetPriceSource, string> = {
	binance: "Binance",
	okx: "OKX",
	stablecoin_fallback: "稳定币回退",
	unavailable: "未获取",
};
const FLOW_COVERAGE_LABELS: Record<MolianAssetFlowCoverage, string> = {
	complete: "完整历史",
	sampled: "样本历史",
};

function normalizeAddressForId(address: string): string {
	return address.trim().toLowerCase();
}

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function formatMaybeText(value: string | undefined): string {
	const trimmed = value?.trim();
	return trimmed ? escapeHtml(replaceInlineIsoDateTimes(trimmed)) : '<span class="placeholder">待补充</span>';
}

function formatMaybeNumber(value: number | undefined): string {
	return value !== undefined ? escapeHtml(value.toLocaleString()) : '<span class="placeholder">待补充</span>';
}

function formatDateTimeText(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return trimmed;
	}
	if (trimmed.includes(" -> ")) {
		return trimmed
			.split(" -> ")
			.map((part) => formatDateTimeText(part))
			.join(" -> ");
	}
	const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/u);
	if (!isoMatch) {
		return trimmed;
	}
	const [, year, month, day, hour, minute, second] = isoMatch;
	return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function replaceInlineIsoDateTimes(value: string): string {
	return value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/gu, (match) =>
		formatDateTimeText(match),
	);
}

function formatMaybeDateTime(value: string | undefined): string {
	const trimmed = value?.trim();
	return trimmed ? escapeHtml(formatDateTimeText(trimmed)) : '<span class="placeholder">待补充</span>';
}

function formatUsdAmount(value: string): string {
	const numericValue = Number.parseFloat(value);
	if (!Number.isFinite(numericValue)) {
		return '<span class="placeholder">待补充</span>';
	}
	return escapeHtml(
		numericValue.toLocaleString("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}),
	);
}

function formatList(items: string[], emptyText = "待补充"): string {
	if (items.length === 0) {
		return `<span class="placeholder">${escapeHtml(emptyText)}</span>`;
	}
	return items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("");
}

function renderBulletList(items: string[], emptyText: string): string {
	if (items.length === 0) {
		return `<p class="placeholder-block">${escapeHtml(emptyText)}</p>`;
	}
	return `<ul>${items.map((item) => `<li>${escapeHtml(replaceInlineIsoDateTimes(item))}</li>`).join("")}</ul>`;
}

function renderKeyValueGrid(items: Array<{ label: string; value: string }>): string {
	return `<div class="kv-grid">
		${items
			.map(
				(item) => `<div class="kv-item">
					<div class="kv-label">${escapeHtml(item.label)}</div>
					<div class="kv-value">${item.value}</div>
				</div>`,
			)
			.join("")}
	</div>`;
}

function renderAssetFlowSummary(items: MolianAssetProofItem[]): string {
	if (items.length === 0) {
		return '<p class="placeholder-block">暂无资产流水统计</p>';
	}

	return `<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>资产</th>
					<th>历史流入</th>
					<th>历史流出</th>
					<th>口径</th>
				</tr>
			</thead>
			<tbody>
				${items
					.map(
						(item) => `<tr>
							<td>${escapeHtml(item.assetSymbol)}</td>
							<td>${formatMaybeText(item.historicalTotalInText)}</td>
							<td>${formatMaybeText(item.historicalTotalOutText)}</td>
							<td>${escapeHtml(FLOW_COVERAGE_LABELS[item.flowCoverage])}</td>
						</tr>`,
					)
					.join("")}
			</tbody>
		</table>
	</div>`;
}

function renderQuantSummary(report: MolianAssetProofReport): string {
	return `<div class="panel">
		<h3>量化快照</h3>
		${renderKeyValueGrid([
			{ label: "链", value: escapeHtml(report.reportMeta.chain.toUpperCase()) },
			{ label: "首次活跃", value: formatMaybeDateTime(report.addressProfile.firstActivityAt) },
			{ label: "最后活跃", value: formatMaybeDateTime(report.addressProfile.lastActivityAt) },
			{ label: "总交易笔数", value: formatMaybeNumber(report.addressProfile.totalTxCount) },
			{ label: "Token 转账笔数", value: formatMaybeNumber(report.addressProfile.tokenTransferCount) },
			{ label: "当前原生币余额", value: formatMaybeText(report.addressProfile.currentNativeBalance) },
			{ label: "重点资产数", value: escapeHtml(String(report.assetProofItems.length)) },
			{ label: "项目线索数", value: escapeHtml(String(report.participationItems.length)) },
			{ label: "关键证据样本数", value: escapeHtml(String(report.evidenceSamples.length)) },
		])}
		<h3>资产历史流水</h3>
		${renderAssetFlowSummary(report.assetProofItems)}
	</div>`;
}

function getDisplayAssetProofItems(items: MolianAssetProofItem[]): MolianAssetProofItem[] {
	const preferredItems = items.filter((item) => PRIMARY_DISPLAYABLE_ASSET_GRADES.has(item.proofGrade));
	if (preferredItems.length > 0) {
		return preferredItems;
	}

	const weakItems = items.filter((item) => item.proofGrade === "weak_support");
	if (weakItems.length > 0) {
		return weakItems;
	}

	return items;
}

function renderPriceMeta(item: MolianAssetProofItem): string {
	return `<div class="muted">报价来源：${escapeHtml(PRICE_SOURCE_LABELS[item.priceSource])} · ${escapeHtml(item.quoteSymbolNormalized || "-")}</div>`;
}

function renderAssetProofItems(items: MolianAssetProofItem[]): string {
	const displayItems = getDisplayAssetProofItems(items);
	if (displayItems.length === 0) {
		return '<p class="placeholder-block">未发现可支持证据</p>';
	}

	return displayItems
		.map((item) => {
			return `<article class="card">
				<div class="card-header">
					<div>
						<h3>${escapeHtml(item.assetSymbol)}</h3>
						<div class="muted">${escapeHtml(ASSET_CATEGORY_LABELS[item.assetCategory])}</div>
					</div>
					<span class="grade-badge grade-${escapeHtml(item.proofGrade)}">${escapeHtml(GRADE_LABELS[item.proofGrade])}</span>
				</div>
				${renderKeyValueGrid([
					{ label: "最早出现", value: formatMaybeDateTime(item.firstSeenAt) },
					{ label: "最早获得", value: formatMaybeDateTime(item.firstAcquiredAt) },
					{ label: "历史峰值", value: formatMaybeText(item.peakBalance) },
					{ label: "峰值时间", value: formatMaybeDateTime(item.peakBalanceAt) },
					{ label: "大额持仓时期", value: formatMaybeDateTime(item.highHoldingPeriod) },
					{ label: "历史占比", value: formatMaybeText(item.historicalShareOfPortfolio) },
					{ label: "当前单价 (USD)", value: formatUsdAmount(item.currentPriceUsd) },
					{ label: "峰值等价 (USD)", value: formatUsdAmount(item.currentValueUsd) },
				])}
				<p class="summary-text">${formatMaybeText(item.proofSummary)}</p>
				${renderPriceMeta(item)}
			</article>`;
		})
		.join("");
}

function renderParticipationItems(items: MolianParticipationItem[]): string {
	if (items.length === 0) {
		return '<p class="placeholder-block">未发现可支持证据</p>';
	}

	return items
		.map((item) => {
			return `<article class="card">
				<div class="card-header">
					<div>
						<h3>${escapeHtml(item.projectName)}</h3>
						<div class="muted">${escapeHtml(PARTICIPATION_LABELS[item.participationType])}</div>
					</div>
					<span class="grade-badge grade-${escapeHtml(item.proofGrade)}">${escapeHtml(GRADE_LABELS[item.proofGrade])}</span>
				</div>
				${renderKeyValueGrid([
					{ label: "参与时间", value: formatMaybeDateTime(item.participationAt) },
					{ label: "投入资产", value: formatMaybeText(item.inputAsset) },
					{ label: "投入金额", value: formatMaybeText(item.inputAmountText) },
					{ label: "退出资产", value: formatMaybeText(item.exitAsset) },
					{ label: "退出金额", value: formatMaybeText(item.exitAmountText) },
					{ label: "估计收益", value: formatMaybeText(item.estimatedProfitText) },
				])}
				<p class="summary-text">${formatMaybeText(item.proofSummary)}</p>
			</article>`;
		})
		.join("");
}

function renderPeakBalanceSection(items: MolianAssetProofItem[]): string {
	const displayItems = getDisplayAssetProofItems(items);
	if (displayItems.length === 0) {
		return '<p class="placeholder-block">未发现可支持证据</p>';
	}

	return `<div class="panel">
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>资产</th>
						<th>证明分级</th>
						<th>历史峰值</th>
						<th>峰值时间</th>
						<th>大额持仓时期</th>
						<th>历史占比</th>
						<th>当前单价 (USD)</th>
						<th>峰值等价 (USD)</th>
						<th>摘要</th>
					</tr>
				</thead>
				<tbody>
					${displayItems
						.map(
							(item) => `<tr>
								<td>${escapeHtml(item.assetSymbol)}</td>
								<td>${escapeHtml(GRADE_LABELS[item.proofGrade])}</td>
								<td>${formatMaybeText(item.peakBalance)}</td>
								<td>${formatMaybeDateTime(item.peakBalanceAt)}</td>
								<td>${formatMaybeDateTime(item.highHoldingPeriod)}</td>
								<td>${formatMaybeText(item.historicalShareOfPortfolio)}</td>
								<td>${formatUsdAmount(item.currentPriceUsd)}</td>
								<td>${formatUsdAmount(item.currentValueUsd)}</td>
								<td>${formatMaybeText(item.proofSummary)}</td>
							</tr>`,
						)
						.join("")}
				</tbody>
			</table>
		</div>
	</div>`;
}

function renderStyles(): string {
	return `
		:root {
			color-scheme: light;
			--bg: #f6f4ef;
			--card: #ffffff;
			--text: #1d1b16;
			--muted: #6d675c;
			--line: #ddd6ca;
			--accent: #0f766e;
			--accent-soft: #dff4ef;
			--warning: #9a6700;
			--warning-soft: #fff1c2;
			--danger: #8b1e3f;
			--danger-soft: #ffe1ea;
			--shadow: 0 10px 30px rgba(35, 28, 20, 0.08);
		}

		* { box-sizing: border-box; }

		body {
			margin: 0;
			font-family: "SF Pro Text", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
			background: linear-gradient(180deg, #efe8da 0%, var(--bg) 160px);
			color: var(--text);
		}

		a {
			color: var(--accent);
			text-decoration: none;
		}

		a:hover {
			text-decoration: underline;
		}

		.page {
			max-width: 1100px;
			margin: 0 auto;
			padding: 40px 24px 64px;
		}

		.hero {
			background: linear-gradient(135deg, #173930 0%, #245d4e 100%);
			color: #f7f4eb;
			border-radius: 24px;
			padding: 28px 32px;
			box-shadow: var(--shadow);
			margin-bottom: 24px;
		}

		.hero h1 {
			margin: 0 0 10px;
			font-size: 32px;
			line-height: 1.2;
		}

		.hero-meta {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 12px;
			margin-top: 20px;
		}

		.hero-meta-item {
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 16px;
			padding: 12px 14px;
		}

		.hero-meta-label {
			font-size: 12px;
			opacity: 0.8;
			margin-bottom: 6px;
		}

		.hero-meta-value {
			font-size: 14px;
			font-weight: 600;
			word-break: break-word;
		}

		.section {
			margin-bottom: 24px;
		}

		.section-title {
			font-size: 22px;
			margin: 0 0 14px;
			padding-left: 12px;
			border-left: 4px solid var(--accent);
		}

		.card,
		.panel {
			background: var(--card);
			border: 1px solid var(--line);
			border-radius: 20px;
			padding: 20px;
			box-shadow: var(--shadow);
		}

		.panel + .panel,
		.card + .card {
			margin-top: 16px;
		}

		.card-header {
			display: flex;
			justify-content: space-between;
			gap: 16px;
			align-items: flex-start;
			margin-bottom: 16px;
		}

		.card-header h3 {
			margin: 0 0 4px;
			font-size: 20px;
		}

		.muted {
			color: var(--muted);
			font-size: 13px;
		}

		.kv-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 12px;
			margin-bottom: 16px;
		}

		.kv-item {
			background: #faf7f0;
			border: 1px solid #ece4d8;
			border-radius: 14px;
			padding: 12px;
		}

		.kv-label {
			color: var(--muted);
			font-size: 12px;
			margin-bottom: 6px;
		}

		.kv-value {
			font-size: 14px;
			font-weight: 600;
			word-break: break-word;
		}

		.summary-text {
			margin: 0 0 14px;
			line-height: 1.7;
		}

		.grade-badge {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 8px 12px;
			border-radius: 999px;
			font-size: 12px;
			font-weight: 700;
			white-space: nowrap;
		}

		.grade-strong_support {
			background: var(--accent-soft);
			color: var(--accent);
		}

		.grade-moderate_support {
			background: var(--warning-soft);
			color: var(--warning);
		}

		.grade-weak_support,
		.grade-inconclusive {
			background: var(--danger-soft);
			color: var(--danger);
		}

		.chip {
			display: inline-flex;
			padding: 6px 10px;
			margin: 4px 6px 0 0;
			border-radius: 999px;
			background: #edf7f4;
			border: 1px solid #d3ebe5;
			font-size: 12px;
		}

		.table-wrap {
			overflow-x: auto;
		}

		table {
			width: 100%;
			border-collapse: collapse;
			font-size: 13px;
		}

		th,
		td {
			padding: 10px 12px;
			border-bottom: 1px solid var(--line);
			text-align: left;
			vertical-align: top;
		}

		th {
			background: #f8f5ee;
			font-size: 12px;
			color: var(--muted);
			text-transform: none;
		}

		tr:last-child td {
			border-bottom: none;
		}

		.placeholder,
		.placeholder-block {
			color: var(--muted);
		}

		.placeholder-block {
			margin: 0;
			padding: 14px 16px;
			background: #fbf8f2;
			border: 1px dashed #d9cebd;
			border-radius: 14px;
		}

		.two-column {
			display: grid;
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
			gap: 20px;
		}

		ul {
			margin: 0;
			padding-left: 20px;
			line-height: 1.7;
		}

		.footer-note {
			margin-top: 28px;
			color: var(--muted);
			font-size: 12px;
			text-align: center;
		}

		@media (max-width: 800px) {
			.page {
				padding: 24px 16px 48px;
			}

			.hero {
				padding: 22px 20px;
				border-radius: 20px;
			}

			.hero h1 {
				font-size: 26px;
			}

			.two-column {
				grid-template-columns: 1fr;
			}

			.card-header {
				flex-direction: column;
			}
		}
	`;
}

function renderExecutiveSummary(report: MolianAssetProofReport): string {
	return `<section class="section">
		<h2 class="section-title">报告摘要</h2>
		${renderQuantSummary(report)}
		<div class="panel">
			<div class="card-header">
				<div>
					<h3>总结论</h3>
					<p class="summary-text">${formatMaybeText(report.executiveSummary.coreConclusion)}</p>
				</div>
				<span class="grade-badge grade-${escapeHtml(report.executiveSummary.overallGrade)}">${escapeHtml(GRADE_LABELS[report.executiveSummary.overallGrade])}</span>
			</div>
			${renderKeyValueGrid([
				{ label: "重点资产", value: formatList(report.executiveSummary.keyAssets) },
				{ label: "证据强度说明", value: formatMaybeText(report.executiveSummary.evidenceStrengthNote) },
			])}
			<h3>关键发现</h3>
			${renderBulletList(report.executiveSummary.topFindings, "待补充")}
		</div>
	</section>`;
}

function renderAddressProfile(report: MolianAssetProofReport): string {
	const profile = report.addressProfile;
	return `<section class="section">
		<h2 class="section-title">地址基本信息</h2>
		<div class="panel">
			${renderKeyValueGrid([
				{ label: "首次活跃时间", value: formatMaybeDateTime(profile.firstActivityAt) },
				{ label: "最后活跃时间", value: formatMaybeDateTime(profile.lastActivityAt) },
				{ label: "地址年龄", value: formatMaybeText(profile.addressAgeText) },
				{ label: "总交易笔数", value: formatMaybeNumber(profile.totalTxCount) },
				{ label: "Token 转账笔数", value: formatMaybeNumber(profile.tokenTransferCount) },
				{ label: "当前原生币余额", value: formatMaybeText(profile.currentNativeBalance) },
				{ label: "重点 Token 持仓", value: formatList(profile.currentKeyTokenHoldings) },
				{ label: "主要资金来源", value: formatList(profile.primaryFundingSources) },
				{ label: "主要退出去向", value: formatList(profile.primaryExitDestinations) },
			])}
			<h3>活跃模式摘要</h3>
			<p class="summary-text">${formatMaybeText(profile.activityCharacterization)}</p>
		</div>
	</section>`;
}

export function createMolianAssetProofReportTemplate(
	input: CreateMolianAssetProofReportTemplateInput,
): MolianAssetProofReport {
	const normalizedAddress = normalizeAddressForId(input.targetAddress);
	return {
		reportMeta: {
			reportId: `asset-proof-${input.chain}-${normalizedAddress}`,
			targetAddress: input.targetAddress.trim(),
			chain: input.chain,
			reportType: "asset_proof",
			generatedAt: "",
			dataAsOf: "",
			analystVersion: TEMPLATE_ANALYST_VERSION,
			sourceSummary: "",
		},
		executiveSummary: {
			overallGrade: "inconclusive",
			coreConclusion: "",
			topFindings: [],
			keyAssets: [],
			evidenceStrengthNote: "",
		},
		addressProfile: {
			addressAgeText: "",
			currentNativeBalance: "",
			currentKeyTokenHoldings: [],
			primaryFundingSources: [],
			primaryExitDestinations: [],
			activityCharacterization: "",
		},
		assetProofItems: [],
		participationItems: [],
		evidenceSamples: [],
	};
}

export function createMolianAssetProofReportFilename(report: MolianAssetProofReport): string {
	return `mlens-asset-proof-${report.reportMeta.chain}-${normalizeAddressForId(report.reportMeta.targetAddress)}.html`;
}

export function renderMolianAssetProofReportHtml(report: MolianAssetProofReport): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(REPORT_TITLE)} - ${escapeHtml(report.reportMeta.targetAddress)}</title>
	<style>
${renderStyles()}
	</style>
</head>
<body>
	<div class="page">
		<header class="hero">
			<h1>${escapeHtml(REPORT_TITLE)}</h1>
			<div class="muted">单地址 · 单链 · 摘要化取证模板</div>
			<div class="hero-meta">
				<div class="hero-meta-item">
					<div class="hero-meta-label">目标地址</div>
					<div class="hero-meta-value">${escapeHtml(report.reportMeta.targetAddress)}</div>
				</div>
				<div class="hero-meta-item">
					<div class="hero-meta-label">链</div>
					<div class="hero-meta-value">${escapeHtml(report.reportMeta.chain.toUpperCase())}</div>
				</div>
				<div class="hero-meta-item">
					<div class="hero-meta-label">报告编号</div>
					<div class="hero-meta-value">${escapeHtml(report.reportMeta.reportId)}</div>
				</div>
				<div class="hero-meta-item">
					<div class="hero-meta-label">生成时间</div>
					<div class="hero-meta-value">${formatMaybeDateTime(report.reportMeta.generatedAt)}</div>
				</div>
				<div class="hero-meta-item">
					<div class="hero-meta-label">数据截止</div>
					<div class="hero-meta-value">${formatMaybeDateTime(report.reportMeta.dataAsOf)}</div>
				</div>
			</div>
		</header>

		${renderExecutiveSummary(report)}
		${renderAddressProfile(report)}

		<section class="section">
			<h2 class="section-title">早期持仓证明</h2>
			${renderAssetProofItems(report.assetProofItems)}
		</section>

		<section class="section">
			<h2 class="section-title">历史余额与峰值证明</h2>
			${renderPeakBalanceSection(report.assetProofItems)}
		</section>

		<section class="section">
			<h2 class="section-title">项目参与与收益证明</h2>
			${renderParticipationItems(report.participationItems)}
		</section>

		<div class="footer-note">模板版本：${escapeHtml(report.reportMeta.analystVersion)} · 数据源摘要：${formatMaybeText(report.reportMeta.sourceSummary)} · 结论仅基于公开链上数据源，可能不完整。</div>
	</div>
</body>
</html>`;
}
