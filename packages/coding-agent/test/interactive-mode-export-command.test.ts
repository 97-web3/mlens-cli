import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type ExportCommandContext = {
	session: {
		exportToJsonl: (outputPath?: string) => string;
		exportToHtml: (outputPath?: string) => Promise<string>;
	};
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	getPathCommandArgument: (text: string, command: "/export" | "/import") => string | undefined;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as {
	handleExportCommand(this: ExportCommandContext, text: string): Promise<void>;
	getPathCommandArgument(this: unknown, text: string, command: "/export" | "/import"): string | undefined;
};

describe("InteractiveMode /export routing", () => {
	it("treats address-like arguments as ordinary session export paths", async () => {
		const exportToJsonl = vi.fn();
		const exportToHtml = vi.fn(async () => "/tmp/session.html");
		const showStatus = vi.fn();
		const showError = vi.fn();

		await interactiveModePrototype.handleExportCommand.call(
			{
				session: {
					exportToJsonl,
					exportToHtml,
				},
				showStatus,
				showError,
				getPathCommandArgument: interactiveModePrototype.getPathCommandArgument,
			},
			"/export 0x9A5Ed2f83fc6f4c2A55A4cFEe69F0C76cb3D5227 eth",
		);

		expect(exportToJsonl).not.toHaveBeenCalled();
		expect(exportToHtml).toHaveBeenCalledWith("0x9A5Ed2f83fc6f4c2A55A4cFEe69F0C76cb3D5227");
		expect(showStatus).toHaveBeenCalledWith("Session exported to: /tmp/session.html");
		expect(showError).not.toHaveBeenCalled();
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
				},
				showStatus,
				showError,
				getPathCommandArgument: interactiveModePrototype.getPathCommandArgument,
			},
			"/export report.html",
		);

		expect(exportToHtml).toHaveBeenCalledWith("report.html");
		expect(showStatus).toHaveBeenCalledWith("Session exported to: /tmp/session.html");
		expect(showError).not.toHaveBeenCalled();
	});
});
