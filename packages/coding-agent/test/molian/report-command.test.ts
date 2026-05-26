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

		await handleMolianReportCommand({ sendUserMessage: vi.fn() } as never, "", {
			ui: { notify },
		} as never);

		expect(notify).toHaveBeenCalledWith("Usage: /report <address> <chain> [output.html]", "warning");
	});

	it("injects the staged report workflow prompt into the active session", async () => {
		const notify = vi.fn();
		const sendUserMessage = vi.fn();

		await handleMolianReportCommand({ sendUserMessage } as never, "0xabc eth out/report.html", {
			ui: { notify },
			isIdle: () => true,
		} as never);

		expect(sendUserMessage).toHaveBeenCalledTimes(1);
		const [prompt, options] = sendUserMessage.mock.calls[0] as [string, { deliverAs?: "steer" | "followUp" }?];
		expect(options).toBeUndefined();
		expect(prompt).toContain("0xabc");
		expect(prompt).toContain("eth");
		expect(prompt).toContain("out/report.html");
		expect(prompt).toContain("collect_molian_asset_proof_data");
		expect(prompt).toContain("build_molian_asset_proof_report");
		expect(prompt).toContain("write_molian_asset_proof_report_html");
		expect(prompt).toContain("结论仅基于公开链上数据");
		expect(notify).not.toHaveBeenCalled();
	});
});
