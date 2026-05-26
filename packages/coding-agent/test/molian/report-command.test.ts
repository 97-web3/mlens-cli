import { describe, expect, it, vi } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../../src/core/slash-commands.ts";
import { handleMolianReportCommand, parseMolianReportArgs } from "../../src/molian/commands/report.ts";
import { MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE } from "../../src/molian/report-progress.ts";

describe("molian report command", () => {
	it("is listed as a built-in slash command for interactive autocomplete", () => {
		expect(BUILTIN_SLASH_COMMANDS.map((command) => command.name)).toContain("report");
	});

	it("parses address chain and optional output path", () => {
		expect(parseMolianReportArgs("0xabc eth out/report.html")).toEqual({
			address: "0xabc",
			chain: "eth",
			outputPath: "out/report.html",
		});
	});

	it("reports usage errors for incomplete arguments", async () => {
		const notify = vi.fn();
		const setWidget = vi.fn();

		await handleMolianReportCommand(
			{ sendMessage: vi.fn() },
			"",
			{
				ui: { notify, setWidget },
			} as never,
			{
				exportReport: vi.fn(),
			},
		);

		expect(notify).toHaveBeenCalledWith("Usage: /report <address> <chain> [output.html]", "warning");
	});

	it("exports a report and notifies the user with the final path", async () => {
		const notify = vi.fn();
		const setStatus = vi.fn();
		const setWidget = vi.fn();
		const sendMessage = vi.fn();
		const exportReport = vi.fn().mockImplementation(async (options) => {
			options.onProgress?.({ stage: "collecting_data", message: "Collecting on-chain data..." });
			options.onProgress?.({ stage: "building_report", message: "Building quantitative report structure..." });
			return {
				outputPath: "/tmp/mlens-report.html",
				usedAgentSummary: true,
			};
		});

		await handleMolianReportCommand(
			{ sendMessage },
			"0xabc eth",
			{
				ui: { notify, setStatus, setWidget },
				cwd: "/repo",
				modelRegistry: { authStorage: {} },
				model: { provider: "openai", id: "gpt-5.4", api: "responses" },
			} as never,
			{ exportReport },
		);

		expect(exportReport).toHaveBeenCalledWith(
			expect.objectContaining({
				address: "0xabc",
				chain: "eth",
				cwd: "/repo",
				enableAgentSummary: true,
				onProgress: expect.any(Function),
			}),
		);
		expect(setStatus).toHaveBeenCalledWith("molian.report", "Collecting on-chain data...");
		expect(setWidget).toHaveBeenCalledWith(
			"molian.report.progress",
			expect.arrayContaining(["[report] 1/5 · 收集链上数据", "Collecting on-chain data..."]),
			{ placement: "belowEditor" },
		);
		expect(setWidget).toHaveBeenCalledWith(
			"molian.report.progress",
			expect.arrayContaining(["[report] 2/5 · 构建量化报告", "Building quantitative report structure..."]),
			{ placement: "belowEditor" },
		);
		expect(sendMessage).toHaveBeenCalledTimes(1);
		expect(sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: MOLIAN_REPORT_PROGRESS_CUSTOM_TYPE,
				display: true,
				details: expect.objectContaining({
					stage: "collecting_data",
					index: 1,
					total: 5,
				}),
			}),
		);
		expect(setStatus).toHaveBeenCalledWith("molian.report", undefined);
		expect(setWidget).toHaveBeenCalledWith("molian.report.progress", undefined, { placement: "belowEditor" });
		expect(notify).toHaveBeenCalledWith(
			"Asset-proof report exported to /tmp/mlens-report.html (agent summary applied).",
			"info",
		);
	});
});
