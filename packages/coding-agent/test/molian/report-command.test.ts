import { describe, expect, it, vi } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../../src/core/slash-commands.ts";
import { handleMolianReportCommand, parseMolianReportArgs } from "../../src/molian/commands/report.ts";

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

		await handleMolianReportCommand(
			"",
			{
				ui: { notify },
			} as never,
			{
				exportReport: vi.fn(),
			},
		);

		expect(notify).toHaveBeenCalledWith("Usage: /report <address> <chain> [output.html]", "warning");
	});

	it("exports a report and notifies the user with the final path", async () => {
		const notify = vi.fn();
		const exportReport = vi.fn().mockResolvedValue({
			outputPath: "/tmp/mlens-report.html",
			usedAgentSummary: true,
		});

		await handleMolianReportCommand(
			"0xabc eth",
			{
				ui: { notify },
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
			}),
		);
		expect(notify).toHaveBeenCalledWith(
			"Asset-proof report exported to /tmp/mlens-report.html (agent summary applied).",
			"info",
		);
	});
});
