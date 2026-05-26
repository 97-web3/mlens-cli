import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { getAgentDir } from "../config.ts";
import { AuthStorage } from "../core/auth-storage.ts";
import type { ModelRegistry } from "../core/model-registry.ts";
import { DefaultResourceLoader } from "../core/resource-loader.ts";
import { createAgentSession } from "../core/sdk.ts";
import { SessionManager } from "../core/session-manager.ts";
import { SettingsManager } from "../core/settings-manager.ts";
import { resolvePath } from "../utils/paths.ts";
import {
	createMolianAssetProofReportFilename,
	createMolianAssetProofReportTemplate,
	type MolianAssetProofItem,
	type MolianAssetProofReport,
	type MolianEvidenceSampleRow,
	type MolianParticipationItem,
	type MolianReportGrade,
	renderMolianAssetProofReportHtml,
} from "./asset-proof-report.ts";
import {
	type MolianBtcProviderConfig,
	type MolianEvmChain,
	type MolianEvmProviderConfig,
	type MolianTronProviderConfig,
	resolveMolianBtcProviderConfig,
	resolveMolianEvmProviderConfig,
	resolveMolianTronProviderConfig,
} from "./chain-config.ts";
import { getBtcAddressOverview } from "./providers/btc.ts";
import { type EvmTokenTransfer, getEvmAddressOverview, getEvmTokenTransfers } from "./providers/evm.ts";
import { getTronAddressOverview } from "./providers/tron.ts";
import type { AddressOverview, SupportedChain } from "./tools/types.ts";

const STABLECOIN_SYMBOLS = new Set(["USDT", "USDC", "DAI", "BUSD", "FDUSD", "TUSD"]);
const MAJOR_ALT_SYMBOLS = new Set(["BTC", "WBTC", "BNB", "TRX", "XRP", "LTC", "BCH", "EOS", "ETH", "WETH"]);

const PROJECT_SYMBOL_MAP = new Map<
	string,
	{ projectName: string; participationType: MolianParticipationItem["participationType"] }
>([
	["FWB", { projectName: "Friends With Benefits", participationType: "DAO_or_Social_Token" }],
	["PICKLE", { projectName: "Pickle Finance", participationType: "Other" }],
	["OSQTH", { projectName: "Opyn Squeeth", participationType: "Derivatives" }],
	["EPYVUSDC", { projectName: "Element Finance", participationType: "Lending" }],
]);

const REPORT_COMMAND_SUPPORTED_CHAINS = new Set<SupportedChain>(["eth", "bsc", "tron", "btc"]);

export interface MolianAgentSummaryPatch {
	overallGrade?: MolianReportGrade;
	coreConclusion?: string;
	topFindings?: string[];
	keyAssets?: string[];
	evidenceStrengthNote?: string;
	coverageLimitations?: string[];
	missingDataPoints?: string[];
	assumptionNotes?: string[];
	cannotConcludeItems?: string[];
}

export interface MolianAssetProofNarrator {
	narrate(report: MolianAssetProofReport): Promise<MolianAgentSummaryPatch | string>;
}

export interface MolianReportProviderOverrides {
	evmOverview?: (config: MolianEvmProviderConfig, chain: MolianEvmChain, address: string) => Promise<AddressOverview>;
	evmTokenTransfers?: (
		config: MolianEvmProviderConfig,
		chain: MolianEvmChain,
		address: string,
	) => Promise<EvmTokenTransfer[]>;
	btcOverview?: (config: MolianBtcProviderConfig, address: string) => Promise<AddressOverview>;
	tronOverview?: (config: MolianTronProviderConfig, address: string) => Promise<AddressOverview>;
}

export interface BuildMolianAssetProofReportOptions {
	address: string;
	chain: SupportedChain;
	subjectName?: string;
	authStorage?: AuthStorage;
	generatedAt?: string;
	dataAsOf?: string;
	providerOverrides?: MolianReportProviderOverrides;
}

export interface ExportMolianAssetProofReportOptions extends BuildMolianAssetProofReportOptions {
	cwd?: string;
	agentDir?: string;
	outputPath?: string;
	enableAgentSummary?: boolean;
	onProgress?: (event: MolianAssetProofProgressEvent) => void;
	narrator?: MolianAssetProofNarrator;
	modelRegistry?: ModelRegistry;
	model?: Model<any>;
}

export interface ExportMolianAssetProofReportResult {
	report: MolianAssetProofReport;
	html: string;
	outputPath: string;
	usedAgentSummary: boolean;
}

export interface MolianAssetProofProgressEvent {
	stage: "collecting_data" | "building_report" | "agent_summary" | "rendering_html" | "writing_file";
	message: string;
}

type TokenAssetSummary = {
	assetSymbol: string;
	assetName: string;
	category: MolianAssetProofItem["assetCategory"];
	firstSeenAt: string;
	firstAcquiredAt: string;
	peakBalance: string;
	peakBalanceAt: string;
	proofSummary: string;
	sampleEvidenceRows: MolianEvidenceSampleRow[];
};

function normalizeAddress(address: string): string {
	return address.trim().toLowerCase();
}

function explorerTxUrl(chain: SupportedChain, txHash: string | undefined): string {
	if (!txHash) {
		return "";
	}

	switch (chain) {
		case "eth":
			return `https://etherscan.io/tx/${txHash}`;
		case "bsc":
			return `https://bscscan.com/tx/${txHash}`;
		case "tron":
			return `https://tronscan.org/#/transaction/${txHash}`;
		case "btc":
			return `https://mempool.space/tx/${txHash}`;
		case "sol":
			return "";
	}
}

function formatTokenAmount(value: bigint, decimals: number): string {
	const sign = value < 0n ? "-" : "";
	const absoluteValue = value < 0n ? -value : value;
	const scale = 10n ** BigInt(decimals);
	const whole = absoluteValue / scale;
	const fraction = absoluteValue % scale;
	if (fraction === 0n) {
		return `${sign}${whole.toString()}`;
	}
	return `${sign}${whole.toString()}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function classifyAssetSymbol(symbol: string): MolianAssetProofItem["assetCategory"] {
	const upper = symbol.toUpperCase();
	if (STABLECOIN_SYMBOLS.has(upper)) {
		return "stablecoin";
	}
	if (MAJOR_ALT_SYMBOLS.has(upper)) {
		return "major_alt";
	}
	if (PROJECT_SYMBOL_MAP.has(upper)) {
		return "defi_token";
	}
	if (upper.includes("NFT")) {
		return "nft_related";
	}
	if (upper.length <= 5) {
		return "other";
	}
	return "meme";
}

function dedupeEvidenceRows(rows: MolianEvidenceSampleRow[]): MolianEvidenceSampleRow[] {
	const seen = new Set<string>();
	const deduped: MolianEvidenceSampleRow[] = [];
	for (const row of rows) {
		const key = `${row.txHash}|${row.assetSymbol}|${row.eventType}|${row.direction}|${row.amountText}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(row);
	}
	return deduped;
}

function buildEvidenceRowFromTransfer(
	chain: SupportedChain,
	row: {
		title: string;
		time?: string;
		eventType: string;
		assetSymbol: string;
		direction: MolianEvidenceSampleRow["direction"];
		amountText: string;
		counterpartyAddress?: string;
		counterpartyLabel?: string;
		txHash?: string;
		note: string;
		sectionKey?: string;
	},
): MolianEvidenceSampleRow {
	return {
		sectionKey: row.sectionKey,
		sampleTitle: row.title,
		eventTime: row.time ?? "",
		eventType: row.eventType,
		assetSymbol: row.assetSymbol,
		direction: row.direction,
		amountText: row.amountText,
		counterpartyLabel: row.counterpartyLabel ?? row.counterpartyAddress ?? "",
		counterpartyAddress: row.counterpartyAddress ?? "",
		txHash: row.txHash ?? "",
		explorerUrl: explorerTxUrl(chain, row.txHash),
		note: row.note,
	};
}

function estimatePeakBalanceText(
	overview: AddressOverview,
	assetSymbol: string,
): { peakBalance: string; peakBalanceAt: string; highHoldingPeriod: string } {
	const largestTransfer = overview.transferSummary.largeTransfers?.[0];
	if (largestTransfer) {
		return {
			peakBalance: `${largestTransfer.amount} ${assetSymbol}`,
			peakBalanceAt: largestTransfer.timestamp ?? "",
			highHoldingPeriod: overview.activitySummary.recentActivityWindow ?? "",
		};
	}

	return {
		peakBalance: `${overview.balanceSummary.nativeBalance} ${assetSymbol}`,
		peakBalanceAt: "",
		highHoldingPeriod: overview.activitySummary.recentActivityWindow ?? "",
	};
}

function buildNativeAssetItem(chain: SupportedChain, overview: AddressOverview): MolianAssetProofItem {
	const peak = estimatePeakBalanceText(overview, overview.balanceSummary.nativeSymbol);
	const evidenceRows = dedupeEvidenceRows(
		(overview.transferSummary.largeTransfers ?? []).map((transfer, index) =>
			buildEvidenceRowFromTransfer(chain, {
				sectionKey: "native_asset",
				title: index === 0 ? "代表性大额样本" : `大额样本 ${index + 1}`,
				time: transfer.timestamp,
				eventType: "native_transfer",
				assetSymbol: transfer.symbol,
				direction: transfer.direction,
				amountText: `${transfer.amount} ${transfer.symbol}`,
				counterpartyAddress: transfer.counterpartyAddress,
				counterpartyLabel: transfer.counterpartyLabel,
				txHash: transfer.txHash,
				note: "来自原生资产历史样本",
			}),
		),
	);

	return {
		assetSymbol: overview.balanceSummary.nativeSymbol,
		assetCategory: "native",
		proofGrade: evidenceRows.length >= 2 ? "moderate_support" : "weak_support",
		firstSeenAt: overview.activitySummary.firstSeenAt ?? "",
		firstAcquiredAt: overview.activitySummary.firstSeenAt ?? "",
		peakBalance: peak.peakBalance,
		peakBalanceAt: peak.peakBalanceAt,
		highHoldingPeriod: peak.highHoldingPeriod,
		historicalShareOfPortfolio: "核心原生资产",
		proofSummary: "基于原生资产历史转账与活跃窗口生成。",
		sampleEvidenceRows: evidenceRows,
	};
}

function buildTokenAssetSummaries(
	chain: MolianEvmChain,
	address: string,
	transfers: EvmTokenTransfer[],
): TokenAssetSummary[] {
	const normalizedAddress = normalizeAddress(address);
	const grouped = new Map<
		string,
		{
			symbol: string;
			name: string;
			decimals: number;
			firstSeenAt?: string;
			firstAcquiredAt?: string;
			balance: bigint;
			peakBalance: bigint;
			peakBalanceAt?: string;
			rows: MolianEvidenceSampleRow[];
		}
	>();

	for (const transfer of transfers) {
		const symbol = transfer.tokenSymbol.trim() || "UNKNOWN";
		const key = `${transfer.contractAddress.toLowerCase()}::${symbol.toUpperCase()}`;
		const decimals = Number.parseInt(transfer.tokenDecimal, 10) || 0;
		const timestamp = new Date(Number(transfer.timeStamp) * 1000).toISOString();
		const rawValue = BigInt(transfer.value || "0");
		const incoming = normalizeAddress(transfer.to) === normalizedAddress;
		const outgoing = normalizeAddress(transfer.from) === normalizedAddress;
		if (!incoming && !outgoing) {
			continue;
		}

		let entry = grouped.get(key);
		if (!entry) {
			entry = {
				symbol,
				name: transfer.tokenName?.trim() || symbol,
				decimals,
				balance: 0n,
				peakBalance: 0n,
				rows: [],
			};
			grouped.set(key, entry);
		}

		entry.firstSeenAt ??= timestamp;
		if (incoming && !entry.firstAcquiredAt) {
			entry.firstAcquiredAt = timestamp;
		}

		entry.balance += incoming ? rawValue : -rawValue;
		if (entry.balance > entry.peakBalance) {
			entry.peakBalance = entry.balance;
			entry.peakBalanceAt = timestamp;
		}

		entry.rows.push(
			buildEvidenceRowFromTransfer(chain, {
				sectionKey: "token_asset",
				title: incoming ? `首次/样本转入 ${symbol}` : `样本转出 ${symbol}`,
				time: timestamp,
				eventType: "token_transfer",
				assetSymbol: symbol,
				direction: incoming ? "in" : "out",
				amountText: `${formatTokenAmount(rawValue, decimals)} ${symbol}`,
				counterpartyAddress: incoming ? transfer.from.toLowerCase() : transfer.to.toLowerCase(),
				txHash: transfer.hash,
				note: incoming ? "代币转入样本" : "代币转出样本",
			}),
		);
	}

	return Array.from(grouped.values())
		.filter((entry) => entry.firstSeenAt)
		.map((entry) => {
			const peakBalance =
				entry.peakBalance > 0n ? `${formatTokenAmount(entry.peakBalance, entry.decimals)} ${entry.symbol}` : "";
			return {
				assetSymbol: entry.symbol,
				assetName: entry.name,
				category: classifyAssetSymbol(entry.symbol),
				firstSeenAt: entry.firstSeenAt ?? "",
				firstAcquiredAt: entry.firstAcquiredAt ?? "",
				peakBalance,
				peakBalanceAt: entry.peakBalanceAt ?? "",
				proofSummary: `观测到 ${entry.symbol} 历史转账样本，可辅助证明该地址曾持有相关资产。`,
				sampleEvidenceRows: dedupeEvidenceRows(entry.rows).slice(0, 3),
			};
		})
		.filter((entry) => entry.sampleEvidenceRows.length > 0)
		.sort((a, b) => {
			if (a.category === "stablecoin" && b.category !== "stablecoin") return -1;
			if (a.category !== "stablecoin" && b.category === "stablecoin") return 1;
			return a.assetSymbol.localeCompare(b.assetSymbol);
		});
}

function buildTokenAssetItems(tokenSummaries: TokenAssetSummary[]): MolianAssetProofItem[] {
	return tokenSummaries.map((summary) => ({
		assetSymbol: summary.assetSymbol,
		assetCategory: summary.category,
		proofGrade: summary.sampleEvidenceRows.length >= 2 ? "moderate_support" : "weak_support",
		firstSeenAt: summary.firstSeenAt,
		firstAcquiredAt: summary.firstAcquiredAt,
		peakBalance: summary.peakBalance,
		peakBalanceAt: summary.peakBalanceAt,
		highHoldingPeriod: summary.peakBalanceAt ? summary.peakBalanceAt.slice(0, 7) : "",
		historicalShareOfPortfolio: "脚本回放样本估算",
		proofSummary: summary.proofSummary,
		sampleEvidenceRows: summary.sampleEvidenceRows,
	}));
}

function buildParticipationItems(tokenSummaries: TokenAssetSummary[]): MolianParticipationItem[] {
	return tokenSummaries
		.filter((summary) => summary.category !== "stablecoin" && summary.category !== "major_alt")
		.map((summary) => {
			const project = PROJECT_SYMBOL_MAP.get(summary.assetSymbol.toUpperCase());
			const firstIn = summary.sampleEvidenceRows.find((row) => row.direction === "in");
			const firstOut = summary.sampleEvidenceRows.find((row) => row.direction === "out");
			return {
				projectName: project?.projectName ?? summary.assetName,
				participationType: project?.participationType ?? "Other",
				participationAt: summary.firstSeenAt,
				inputAsset: summary.assetSymbol,
				inputAmountText: firstIn?.amountText ?? "",
				exitAsset: summary.assetSymbol,
				exitAmountText: firstOut?.amountText ?? "",
				estimatedProfitText: "",
				proofGrade: summary.sampleEvidenceRows.length >= 2 ? "moderate_support" : "weak_support",
				proofSummary: `脚本检测到 ${summary.assetSymbol} 的链上交互样本，可作为项目参与或收益线索。`,
				sampleEvidenceRows: summary.sampleEvidenceRows,
			};
		});
}

function deriveDeterministicGrade(report: MolianAssetProofReport): MolianReportGrade {
	let score = 0;
	if (report.assetProofItems.length > 0) score += 1;
	if (report.evidenceSamples.length >= 2) score += 1;
	if (report.participationItems.length > 0) score += 1;
	if (report.assetProofItems.some((item) => item.peakBalance && item.sampleEvidenceRows.length >= 2)) score += 1;

	if (score >= 4) return "strong_support";
	if (score >= 2) return "moderate_support";
	if (score >= 1) return "weak_support";
	return "inconclusive";
}

function fillDeterministicSummary(report: MolianAssetProofReport): void {
	const grade = deriveDeterministicGrade(report);
	report.executiveSummary.overallGrade = grade;
	report.executiveSummary.keyAssets = report.assetProofItems.map((item) => item.assetSymbol).slice(0, 5);
	report.executiveSummary.topFindings = [
		report.addressProfile.firstActivityAt ? `首次活跃时间：${report.addressProfile.firstActivityAt}` : "",
		report.addressProfile.totalTxCount !== undefined
			? `总交易笔数：${report.addressProfile.totalTxCount.toLocaleString()}`
			: "",
		report.participationItems.length > 0 ? `识别到 ${report.participationItems.length} 项项目/协议交互线索` : "",
		report.assetProofItems.length > 0
			? `重点资产：${report.assetProofItems.map((item) => item.assetSymbol).join(", ")}`
			: "",
	]
		.filter(Boolean)
		.slice(0, 5);

	report.executiveSummary.evidenceStrengthNote =
		grade === "strong_support"
			? "脚本已识别多组资产证据与项目交互样本。"
			: grade === "moderate_support"
				? "脚本已识别部分资产证据，仍需人工复核样本覆盖范围。"
				: grade === "weak_support"
					? "当前仅有有限链上样本，证明力度偏弱。"
					: "当前脚本样本不足，无法形成稳定结论。";

	report.executiveSummary.coreConclusion =
		grade === "strong_support"
			? "该地址存在多组链上资产与项目交互证据，可强支持资产证明。"
			: grade === "moderate_support"
				? "该地址存在一定链上持仓与交互证据，可中度支持资产证明。"
				: grade === "weak_support"
					? "该地址仅提供有限链上样本，当前仅弱支持资产证明。"
					: "当前链上样本不足，暂无法判断资产证明力度。";
}

function sanitizeNarratorPatch(
	patch: MolianAgentSummaryPatch,
	report: MolianAssetProofReport,
): MolianAgentSummaryPatch {
	const allowedGrades = new Set<MolianReportGrade>([
		"strong_support",
		"moderate_support",
		"weak_support",
		"inconclusive",
	]);
	const knownAssets = new Set(report.assetProofItems.map((item) => item.assetSymbol));

	return {
		overallGrade: patch.overallGrade && allowedGrades.has(patch.overallGrade) ? patch.overallGrade : undefined,
		coreConclusion: patch.coreConclusion?.trim() || undefined,
		topFindings:
			patch.topFindings
				?.map((item) => item.trim())
				.filter(Boolean)
				.slice(0, 5) ?? undefined,
		keyAssets:
			patch.keyAssets
				?.map((item) => item.trim())
				.filter((item) => item && knownAssets.has(item))
				.slice(0, 5) ?? undefined,
		evidenceStrengthNote: patch.evidenceStrengthNote?.trim() || undefined,
		coverageLimitations:
			patch.coverageLimitations
				?.map((item) => item.trim())
				.filter(Boolean)
				.slice(0, 5) ?? undefined,
		missingDataPoints:
			patch.missingDataPoints
				?.map((item) => item.trim())
				.filter(Boolean)
				.slice(0, 5) ?? undefined,
		assumptionNotes:
			patch.assumptionNotes
				?.map((item) => item.trim())
				.filter(Boolean)
				.slice(0, 5) ?? undefined,
		cannotConcludeItems:
			patch.cannotConcludeItems
				?.map((item) => item.trim())
				.filter(Boolean)
				.slice(0, 5) ?? undefined,
	};
}

function parseNarratorResponse(value: MolianAgentSummaryPatch | string): MolianAgentSummaryPatch {
	if (typeof value !== "string") {
		return value;
	}

	const trimmed = value.trim();
	const jsonCandidate = trimmed.startsWith("```")
		? trimmed
				.replace(/^```(?:json)?/u, "")
				.replace(/```$/u, "")
				.trim()
		: trimmed;
	const parsed = JSON.parse(jsonCandidate) as unknown;
	if (!parsed || typeof parsed !== "object") {
		return {};
	}
	return parsed as MolianAgentSummaryPatch;
}

async function maybeApplyNarratorSummary(
	report: MolianAssetProofReport,
	narrator: MolianAssetProofNarrator | undefined,
): Promise<boolean> {
	if (!narrator) {
		return false;
	}

	const rawPatch = await narrator.narrate(report);
	const patch = sanitizeNarratorPatch(parseNarratorResponse(rawPatch), report);
	if (patch.overallGrade) report.executiveSummary.overallGrade = patch.overallGrade;
	if (patch.coreConclusion) report.executiveSummary.coreConclusion = patch.coreConclusion;
	if (patch.topFindings) report.executiveSummary.topFindings = patch.topFindings;
	if (patch.keyAssets) report.executiveSummary.keyAssets = patch.keyAssets;
	if (patch.evidenceStrengthNote) report.executiveSummary.evidenceStrengthNote = patch.evidenceStrengthNote;
	if (patch.coverageLimitations) report.limitations.coverageLimitations = patch.coverageLimitations;
	if (patch.missingDataPoints) report.limitations.missingDataPoints = patch.missingDataPoints;
	if (patch.assumptionNotes) report.limitations.assumptionNotes = patch.assumptionNotes;
	if (patch.cannotConcludeItems) report.limitations.cannotConcludeItems = patch.cannotConcludeItems;
	return Object.values(patch).some((value) => value !== undefined);
}

function buildAgentSummaryPrompt(report: MolianAssetProofReport): string {
	return [
		"你是链上资产证明报告的摘要器。",
		"只能基于给定 JSON 生成摘要，不得发明新的交易哈希、链接、金额、地址或项目事实。",
		"输出严格 JSON，不要 markdown，不要解释。",
		"允许的键：overallGrade, coreConclusion, topFindings, keyAssets, evidenceStrengthNote, coverageLimitations, missingDataPoints, assumptionNotes, cannotConcludeItems。",
		"overallGrade 只能是 strong_support, moderate_support, weak_support, inconclusive。",
		"topFindings 最多 5 条，keyAssets 只能从现有重点资产里挑选。",
		JSON.stringify(report, null, 2),
	].join("\n\n");
}

function createDefaultNarrator(options: {
	cwd: string;
	agentDir: string;
	authStorage: AuthStorage;
	modelRegistry?: ModelRegistry;
	model?: Model<any>;
}): MolianAssetProofNarrator {
	return {
		async narrate(report) {
			const settingsManager = SettingsManager.inMemory();
			const resourceLoader = new DefaultResourceLoader({
				cwd: options.cwd,
				agentDir: options.agentDir,
				settingsManager,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
			});
			await resourceLoader.reload();

			const { session } = await createAgentSession({
				cwd: options.cwd,
				agentDir: options.agentDir,
				authStorage: options.authStorage,
				modelRegistry: options.modelRegistry,
				model: options.model,
				settingsManager,
				resourceLoader,
				sessionManager: SessionManager.inMemory(),
				noTools: "all",
				tools: [],
			});

			try {
				await session.prompt(buildAgentSummaryPrompt(report));
				return session.getLastAssistantText() ?? "{}";
			} finally {
				session.dispose();
			}
		},
	};
}

async function buildEvmReport(
	report: MolianAssetProofReport,
	authStorage: AuthStorage,
	chain: MolianEvmChain,
	providerOverrides: MolianReportProviderOverrides,
): Promise<void> {
	const config = resolveMolianEvmProviderConfig(authStorage, chain);
	const overview = await (providerOverrides.evmOverview ?? getEvmAddressOverview)(
		config,
		chain,
		report.reportMeta.targetAddress,
	);
	const tokenTransfers = await (providerOverrides.evmTokenTransfers ?? getEvmTokenTransfers)(
		config,
		chain,
		report.reportMeta.targetAddress,
	);

	const nativeItem = buildNativeAssetItem(chain, overview);
	const tokenSummaries = buildTokenAssetSummaries(chain, report.reportMeta.targetAddress, tokenTransfers);
	const tokenItems = buildTokenAssetItems(tokenSummaries);

	report.addressProfile.firstActivityAt = overview.activitySummary.firstSeenAt;
	report.addressProfile.lastActivityAt = overview.activitySummary.lastSeenAt;
	report.addressProfile.addressAgeText = overview.activitySummary.firstSeenAt
		? `自 ${overview.activitySummary.firstSeenAt.slice(0, 10)} 起活跃`
		: "";
	report.addressProfile.totalTxCount = overview.activitySummary.txCount;
	report.addressProfile.tokenTransferCount = tokenTransfers.length;
	report.addressProfile.currentNativeBalance = `${overview.balanceSummary.nativeBalance} ${overview.balanceSummary.nativeSymbol}`;
	report.addressProfile.currentKeyTokenHoldings = tokenItems.map((item) => item.assetSymbol).slice(0, 5);
	report.addressProfile.primaryFundingSources = overview.counterparties.slice(0, 3).map((item) => item.address);
	report.addressProfile.primaryExitDestinations = overview.counterparties.slice(0, 3).map((item) => item.address);
	report.addressProfile.activityCharacterization =
		tokenTransfers.length > 0 ? "检测到原生资产与代币层面的双重链上活动。" : "当前仅检测到原生资产层面的链上活动。";

	report.assetProofItems = [nativeItem, ...tokenItems];
	report.participationItems = buildParticipationItems(tokenSummaries);
	report.evidenceSamples = dedupeEvidenceRows([
		...nativeItem.sampleEvidenceRows,
		...tokenItems.flatMap((item) => item.sampleEvidenceRows),
	]).slice(0, 8);
	report.limitations.coverageLimitations = [...overview.sourceMeta.notes];
	report.limitations.cannotConcludeItems = ["当前脚本未回放完整历史余额曲线，峰值为样本近似值。"];
	report.appendix.dataSources = [overview.sourceMeta.provider, "evm_token_transfers"];
	report.reportMeta.sourceSummary = `${overview.sourceMeta.provider}, evm_token_transfers`;
}

async function buildBtcReport(
	report: MolianAssetProofReport,
	providerOverrides: MolianReportProviderOverrides,
): Promise<void> {
	const overview = await (providerOverrides.btcOverview ?? getBtcAddressOverview)(
		resolveMolianBtcProviderConfig(),
		report.reportMeta.targetAddress,
	);
	const nativeItem = buildNativeAssetItem("btc", overview);

	report.addressProfile.firstActivityAt = overview.activitySummary.firstSeenAt;
	report.addressProfile.lastActivityAt = overview.activitySummary.lastSeenAt;
	report.addressProfile.addressAgeText = overview.activitySummary.firstSeenAt
		? `自 ${overview.activitySummary.firstSeenAt.slice(0, 10)} 起活跃`
		: "";
	report.addressProfile.totalTxCount = overview.activitySummary.txCount;
	report.addressProfile.currentNativeBalance = `${overview.balanceSummary.nativeBalance} ${overview.balanceSummary.nativeSymbol}`;
	report.addressProfile.primaryFundingSources = overview.counterparties.slice(0, 3).map((item) => item.address);
	report.addressProfile.primaryExitDestinations = overview.counterparties.slice(0, 3).map((item) => item.address);
	report.addressProfile.activityCharacterization = "当前为 BTC 单资产样本分析。";

	report.assetProofItems = [nativeItem];
	report.evidenceSamples = nativeItem.sampleEvidenceRows;
	report.limitations.coverageLimitations = [...overview.sourceMeta.notes];
	report.limitations.cannotConcludeItems = ["当前未提供代币层或链下资金信息。"];
	report.appendix.dataSources = [overview.sourceMeta.provider];
	report.reportMeta.sourceSummary = overview.sourceMeta.provider;
}

async function buildTronReport(
	report: MolianAssetProofReport,
	authStorage: AuthStorage,
	providerOverrides: MolianReportProviderOverrides,
): Promise<void> {
	const overview = await (providerOverrides.tronOverview ?? getTronAddressOverview)(
		resolveMolianTronProviderConfig(authStorage),
		report.reportMeta.targetAddress,
	);
	const nativeItem = buildNativeAssetItem("tron", overview);

	report.addressProfile.firstActivityAt = overview.activitySummary.firstSeenAt;
	report.addressProfile.lastActivityAt = overview.activitySummary.lastSeenAt;
	report.addressProfile.addressAgeText = overview.activitySummary.firstSeenAt
		? `自 ${overview.activitySummary.firstSeenAt.slice(0, 10)} 起活跃`
		: "";
	report.addressProfile.totalTxCount = overview.activitySummary.txCount;
	report.addressProfile.currentNativeBalance = `${overview.balanceSummary.nativeBalance} ${overview.balanceSummary.nativeSymbol}`;
	report.addressProfile.primaryFundingSources = overview.counterparties.slice(0, 3).map((item) => item.address);
	report.addressProfile.primaryExitDestinations = overview.counterparties.slice(0, 3).map((item) => item.address);
	report.addressProfile.activityCharacterization = "当前为 TRON 原生资产样本分析。";

	report.assetProofItems = [nativeItem];
	report.evidenceSamples = nativeItem.sampleEvidenceRows;
	report.limitations.coverageLimitations = [...overview.sourceMeta.notes];
	report.limitations.cannotConcludeItems = ["当前未回放 TRC20 层面的完整资产历史。"];
	report.appendix.dataSources = [overview.sourceMeta.provider];
	report.reportMeta.sourceSummary = overview.sourceMeta.provider;
}

export async function buildMolianAssetProofReport(
	options: BuildMolianAssetProofReportOptions,
): Promise<MolianAssetProofReport> {
	const authStorage = options.authStorage ?? AuthStorage.create(join(getAgentDir(), "auth.json"));
	const report = createMolianAssetProofReportTemplate({
		targetAddress: options.address,
		chain: options.chain,
		subjectName: options.subjectName,
	});
	report.reportMeta.generatedAt = options.generatedAt ?? new Date().toISOString();
	report.reportMeta.dataAsOf = options.dataAsOf ?? report.reportMeta.generatedAt;

	switch (options.chain) {
		case "eth":
		case "bsc":
			await buildEvmReport(report, authStorage, options.chain, options.providerOverrides ?? {});
			break;
		case "btc":
			await buildBtcReport(report, options.providerOverrides ?? {});
			break;
		case "tron":
			await buildTronReport(report, authStorage, options.providerOverrides ?? {});
			break;
		case "sol":
			throw new Error("SOL asset-proof workflow is not implemented yet.");
	}

	fillDeterministicSummary(report);
	return report;
}

function resolveOutputPath(cwd: string, outputPath: string | undefined, report: MolianAssetProofReport): string {
	if (outputPath?.trim()) {
		return resolvePath(outputPath, cwd);
	}
	return join(cwd, "molian-reports", createMolianAssetProofReportFilename(report));
}

export async function exportMolianAssetProofReport(
	options: ExportMolianAssetProofReportOptions,
): Promise<ExportMolianAssetProofReportResult> {
	const cwd = resolvePath(options.cwd ?? process.cwd());
	const agentDir = options.agentDir ? resolvePath(options.agentDir) : getAgentDir();
	const authStorage = options.authStorage ?? AuthStorage.create(join(agentDir, "auth.json"));
	options.onProgress?.({
		stage: "collecting_data",
		message: "Collecting on-chain data...",
	});
	const report = await buildMolianAssetProofReport({
		address: options.address,
		chain: options.chain,
		subjectName: options.subjectName,
		authStorage,
		generatedAt: options.generatedAt,
		dataAsOf: options.dataAsOf,
		providerOverrides: options.providerOverrides,
	});
	options.onProgress?.({
		stage: "building_report",
		message: "Building quantitative report structure...",
	});

	let narrator = options.narrator;
	if (!narrator && options.enableAgentSummary) {
		narrator = createDefaultNarrator({
			cwd,
			agentDir,
			authStorage,
			modelRegistry: options.modelRegistry,
			model: options.model,
		});
	}
	let usedAgentSummary = false;
	if (options.enableAgentSummary) {
		options.onProgress?.({
			stage: "agent_summary",
			message: "Applying agent summary guard...",
		});
		try {
			usedAgentSummary = await maybeApplyNarratorSummary(report, narrator);
		} catch (error) {
			report.limitations.assumptionNotes.push(
				`Agent summary unavailable: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	options.onProgress?.({
		stage: "rendering_html",
		message: "Rendering HTML report...",
	});
	const html = renderMolianAssetProofReportHtml(report);
	const finalOutputPath = resolveOutputPath(cwd, options.outputPath, report);
	options.onProgress?.({
		stage: "writing_file",
		message: `Writing report file to ${finalOutputPath}...`,
	});
	await mkdir(dirname(finalOutputPath), { recursive: true });
	await writeFile(finalOutputPath, html, "utf-8");

	return {
		report,
		html,
		outputPath: finalOutputPath,
		usedAgentSummary,
	};
}

export function isSupportedMolianReportChain(chain: string): chain is SupportedChain {
	return REPORT_COMMAND_SUPPORTED_CHAINS.has(chain as SupportedChain);
}
