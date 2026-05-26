import { describe, expect, test } from "vitest";
import type { TUI } from "../../tui/src/index.ts";
import {
	StartupBrandComponent,
	shouldRenderLargeStartupBrand,
} from "../src/modes/interactive/components/startup-brand.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

describe("StartupBrandComponent", () => {
	test("renders large startup branding for mlens", () => {
		initTheme("dark");
		const component = new StartupBrandComponent(
			{
				terminal: {
					rows: 40,
				},
			} as unknown as TUI,
			"0.75.5",
			"mlens",
		);

		const rendered = stripAnsi(component.render(80).join("\n"));

		expect(rendered).toContain("██████████████");
		expect(rendered).toContain("mlens v0.75.5");
		expect(rendered.split("\n").filter((line) => line.trim().length > 0).length).toBeGreaterThanOrEqual(8);
	});

	test("enables the large startup brand only for mlens", () => {
		expect(shouldRenderLargeStartupBrand("mlens")).toBe(true);
		expect(shouldRenderLargeStartupBrand("pi")).toBe(false);
	});
});
