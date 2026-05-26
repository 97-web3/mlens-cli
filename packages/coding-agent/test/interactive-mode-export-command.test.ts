import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import * as reportWorkflow from "../src/molian/asset-proof-workflow.ts";
import { MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE } from "../src/molian/report-progress.ts";

type ExportCommandContext = {
	session: {
		exportToJsonl: (outputPath?: string) => string;
		exportToHtml: (outputPath?: string) => Promise<string>;
		modelRegistry: { authStorage: unknown };
		sendCustomMessage: (message: unknown) => Promise<void>;
		model?: unknown;
	};
	sessionManager: {
		getCwd: () => string;
	};
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	setExtensionStatus: (key: string, text: string | undefined) => void;
	getPathCommandArgument: (text: string, command: "/export" | "/import") => string | undefined;
	tryHandleAddressReportExport: (text: string) => Promise<boolean>;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as {
	handleExportCommand(this: ExportCommandContext, text: string): Promise<void>;
	getPathCommandArgument(this: unknown, text: string, command: "/export" | "/import"): string | undefined;
	tryHandleAddressReportExport(this: ExportCommandContext, text: string): Promise<boolean>;
};

describe("InteractiveMode /export routing", () => {
	it("routes address + chain arguments to the Molian report export flow", async () => {
		const exportToJsonl = vi.fn();
		const exportToHtml = vi.fn();
		const showStatus = vi.fn();
		const showError = vi.fn();
		const sendCustomMessage = vi.fn(async () => {});
		const setExtensionStatus = vi.fn();
		const exportMolianAssetProofReport = vi
			.spyOn(reportWorkflow, "exportMolianAssetProofReport")
			.mockImplementation(async (options) => {
				options.onProgress?.({ stage: "collecting_data", message: "Collecting on-chain data..." });
				return {
					report: {} as never,
					html: "",
					outputPath: "/tmp/report.html",
					usedAgentSummary: true,
				};
			});

		await interactiveModePrototype.handleExportCommand.call(
			{
				session: {
					exportToJsonl,
					exportToHtml,
					modelRegistry: { authStorage: {} },
					sendCustomMessage,
					model: undefined,
				},
				sessionManager: { getCwd: () => "/repo" },
				showStatus,
				showError,
				setExtensionStatus,
				getPathCommandArgument: interactiveModePrototype.getPathCommandArgument,
				tryHandleAddressReportExport: interactiveModePrototype.tryHandleAddressReportExport,
			},
			"/export 0x9A5Ed2f83fc6f4c2A55A4cFEe69F0C76cb3D5227 eth",
		);

		expect(exportMolianAssetProofReport).toHaveBeenCalled();
		expect(setExtensionStatus).toHaveBeenCalledWith("molian.report", "Collecting on-chain data...");
		expect(sendCustomMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE,
				display: true,
			}),
		);
		expect(exportToJsonl).not.toHaveBeenCalled();
		expect(exportToHtml).not.toHaveBeenCalled();
		expect(showError).not.toHaveBeenCalled();
		exportMolianAssetProofReport.mockRestore();
	});

	it("keeps session export behavior for normal file arguments", async () => {
		const exportToJsonl = vi.fn();
		const exportToHtml = vi.fn(async () => "/tmp/session.html");
		const showStatus = vi.fn();
		const showError = vi.fn();

		await interactiveModePrototype.handleExportCommand.call(
			{
				session: {
					exportToJsonl,
					exportToHtml,
					modelRegistry: { authStorage: {} },
					sendCustomMessage: vi.fn(async () => {}),
					model: undefined,
				},
				sessionManager: { getCwd: () => "/repo" },
				showStatus,
				showError,
				setExtensionStatus: vi.fn(),
				getPathCommandArgument: interactiveModePrototype.getPathCommandArgument,
				tryHandleAddressReportExport: interactiveModePrototype.tryHandleAddressReportExport,
			},
			"/export report.html",
		);

		expect(exportToHtml).toHaveBeenCalledWith("report.html");
		expect(showStatus).toHaveBeenCalledWith("Session exported to: /tmp/session.html");
		expect(showError).not.toHaveBeenCalled();
	});
});
