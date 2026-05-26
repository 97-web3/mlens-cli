import { afterEach, describe, expect, it } from "vitest";
import { createMolianExtensionFactory } from "../../src/molian/extension.ts";
import { createHarness, type Harness } from "../suite/harness.ts";

describe("molian session flow", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("registers report-related commands and excludes analyze", async () => {
		const harness = await createHarness({
			extensionFactories: [createMolianExtensionFactory()],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});
		const commands = harness.session.extensionRunner.getRegisteredCommands().map((command) => command.name);

		expect(commands).toContain("report");
		expect(commands).toContain("chain-config");
		expect(commands).not.toContain("analyze");
		expect(harness.session.getAllTools().map((tool) => tool.name)).toContain("resolve_chain_for_address");
	});
});
