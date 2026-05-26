import { Box, type Component, Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { MessageRenderer } from "../core/extensions/index.ts";
import type { CustomMessage } from "../core/messages.ts";
import type { MolianAssetProofProgressEvent, MolianAssetProofProgressSnapshot } from "./asset-proof-workflow.ts";

export interface MolianReportProgressDetails extends MolianAssetProofProgressEvent {
	runId: string;
	index: number;
	total: number;
}

export const MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE = "molian-report-progress";

const STAGE_LABELS: Record<MolianAssetProofProgressEvent["stage"], string> = {
	collecting_data: "收集链上数据",
	building_report: "构建量化报告",
	agent_summary: "Agent 守卫摘要",
	rendering_html: "渲染 HTML",
	writing_file: "写入文件",
};

const progressState = new Map<string, MolianReportProgressDetails>();

export function createMolianReportProgressMessage(
	details: MolianReportProgressDetails,
): Pick<CustomMessage<MolianReportProgressDetails>, "customType" | "content" | "display" | "details"> {
	return {
		customType: MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE,
		content: details.message,
		display: true,
		details,
	};
}

export function updateMolianReportProgress(details: MolianReportProgressDetails): void {
	progressState.set(details.runId, details);
}

function getMolianReportProgress(details: MolianReportProgressDetails): MolianReportProgressDetails {
	return progressState.get(details.runId) ?? details;
}

function buildSnapshotLines(snapshot: MolianAssetProofProgressSnapshot | undefined): string[] {
	if (!snapshot) {
		return [];
	}

	const metrics = [
		`chain=${snapshot.chain.toUpperCase()}`,
		typeof snapshot.totalTxCount === "number" ? `tx=${snapshot.totalTxCount.toLocaleString()}` : undefined,
		typeof snapshot.tokenTransferCount === "number"
			? `tokenTx=${snapshot.tokenTransferCount.toLocaleString()}`
			: undefined,
		`assets=${snapshot.assetCount}`,
		`projects=${snapshot.participationCount}`,
		`evidence=${snapshot.evidenceCount}`,
	]
		.filter(Boolean)
		.join(" | ");

	const lines = metrics ? [metrics] : [];
	if (snapshot.currentNativeBalance.trim()) {
		lines.push(`balance=${snapshot.currentNativeBalance}`);
	}
	return lines;
}

export function formatMolianReportProgressWidgetLines(details: MolianReportProgressDetails): string[] {
	const current = getMolianReportProgress(details);
	return [
		`[report] ${current.index}/${current.total} · ${STAGE_LABELS[current.stage]}`,
		current.message,
		...buildSnapshotLines(current.snapshot),
	];
}

class LiveMolianReportProgressComponent implements Component {
	private readonly seed: MolianReportProgressDetails;
	private readonly theme: Parameters<NonNullable<MessageRenderer<MolianReportProgressDetails>>>[2];

	constructor(
		seed: MolianReportProgressDetails,
		theme: Parameters<NonNullable<MessageRenderer<MolianReportProgressDetails>>>[2],
	) {
		this.seed = seed;
		this.theme = theme;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const details = getMolianReportProgress(this.seed);
		const box = new Box(1, 1, (text) => this.theme.bg("customMessageBg", text));
		box.addChild(
			new Text(
				this.theme.fg(
					"customMessageLabel",
					`\x1b[1m[report]\x1b[22m ${details.index}/${details.total} · ${STAGE_LABELS[details.stage]}`,
				),
				0,
				0,
			),
		);
		box.addChild(new Spacer(1));
		box.addChild(new Text(this.theme.fg("customMessageText", details.message), 0, 0));
		for (const line of buildSnapshotLines(details.snapshot)) {
			box.addChild(new Spacer(1));
			box.addChild(new Text(this.theme.fg("muted", line), 0, 0));
		}
		return box.render(width);
	}
}

export const renderMolianReportProgressMessage: MessageRenderer<MolianReportProgressDetails> = (
	message,
	_options,
	theme,
) => {
	const details = message.details;
	if (!details) {
		return undefined;
	}

	const container = new Container();
	container.addChild(new Spacer(1));
	container.addChild(new LiveMolianReportProgressComponent(details, theme));
	return container;
};
