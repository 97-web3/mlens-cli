import { afterEach, describe, expect, it } from "vitest";
import { createMolianExtensionFactory } from "../../src/molian/extension.ts";
import { createHarness, type Harness } from "../suite/harness.ts";

describe("molian report input transform", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("transforms strong report intent into the staged workflow prompt", async () => {
		const harness = await createHarness({
			extensionFactories: [createMolianExtensionFactory()],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		const result = await harness.session.extensionRunner.emitInput(
			"给这个地址生成资产证明报告 0x464e146614D53B675B74cD04d2d727b2c04aeABa",
			undefined,
			"interactive",
		);

		expect(result.action).toBe("transform");
		if (result.action !== "transform") {
			throw new Error("expected transformed input");
		}
		expect(result.text).toContain("0x464e146614D53B675B74cD04d2d727b2c04aeABa");
		expect(result.text).toContain("resolve_chain_for_address");
		expect(result.text).toContain("collect_molian_asset_proof_data");
		expect(result.text).toContain("build_molian_asset_proof_report");
		expect(result.text).toContain("write_molian_asset_proof_report_html");
		expect(result.text).toContain("结论仅基于公开链上数据");
	});

	it("does not transform generic risk-analysis requests", async () => {
		const harness = await createHarness({
			extensionFactories: [createMolianExtensionFactory()],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		const result = await harness.session.extensionRunner.emitInput(
			"分析这个地址有没有风险 0x464e146614D53B675B74cD04d2d727b2c04aeABa",
			undefined,
			"interactive",
		);

		expect(result).toEqual({ action: "continue" });
	});
});
