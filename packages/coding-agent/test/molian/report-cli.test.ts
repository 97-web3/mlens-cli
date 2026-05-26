import { describe, expect, it } from "vitest";
import { getHelpText, parseArgs } from "../../src/molian/report-cli.ts";

describe("molian report cli", () => {
	it("omits the removed --subject option from help output", () => {
		expect(getHelpText()).toContain("Usage:");
		expect(getHelpText()).not.toContain("--subject");
	});

	it("rejects the removed --subject option with a clear error", () => {
		expect(parseArgs(["--subject", "Alice"])).toEqual(
			expect.objectContaining({
				error: 'The "--subject" option has been removed.',
			}),
		);
	});
});
