import { describe, expect, it } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

describe("interactive-mode built-in command conflicts", () => {
	it("suppresses the intentional report command dual registration warning", () => {
		const diagnostics = (InteractiveMode.prototype as any).getBuiltInCommandConflictDiagnostics({
			getRegisteredCommands: () => [
				{
					name: "report",
					invocationName: "report",
					sourceInfo: { path: "<inline:1>" },
				},
				{
					name: "export",
					invocationName: "export",
					sourceInfo: { path: "<inline:2>" },
				},
			],
		});

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.message).toContain("/export");
		expect(diagnostics[0]?.message).not.toContain("/report");
	});
});
