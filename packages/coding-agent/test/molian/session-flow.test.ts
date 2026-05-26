import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createMolianExtensionFactory } from "../../src/molian/extension.ts";
import { createHarness, getUserTexts, type Harness } from "../suite/harness.ts";

describe("molian session flow", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("routes /analyze into a normal user message for follow-up analysis", async () => {
		const harness = await createHarness({
			extensionFactories: [createMolianExtensionFactory()],
		});
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("analysis complete")]);

		await harness.session.prompt("/analyze bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080");

		expect(getUserTexts(harness)).toHaveLength(1);
		expect(getUserTexts(harness)[0]).toContain("目标地址：bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080");
		expect(harness.session.getAllTools().map((tool) => tool.name)).toContain("resolve_chain_for_address");
	});
});
