import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { APP_NAME } from "../../../config.ts";
import { theme } from "../theme/theme.ts";

// Generated from `bit` using the `pressstart` font as the source glyphs.
const MLENS_BRAND_LINES = [
	"████      ████  ████          ██████████████  ████      ████    ████████    ",
	"██████  ██████  ████          ████            ██████    ████  ████    ████  ",
	"██████████████  ████          ████            ████████  ████  ████          ",
	"██████████████  ████          ████████████    ██████████████    ██████████  ",
	"████  ██  ████  ████          ████            ████  ████████            ████",
	"████      ████  ████          ████            ████    ██████  ████      ████",
	"████      ████  ████████████  ██████████████  ████      ████    ██████████  ",
];

const BRAND_LINE_COLORS = ["accent", "accent", "mdLink", "success", "warning", "warning", "accent"] as const;

export function shouldRenderLargeStartupBrand(appName: string = APP_NAME): boolean {
	return appName === "mlens";
}

function centerLine(line: string, width: number): string {
	const padding = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
	return `${" ".repeat(padding)}${line}`;
}

export class StartupBrandComponent implements Component {
	private tui: TUI;
	private version: string;
	private appName: string;

	constructor(tui: TUI, version: string, appName: string = APP_NAME) {
		this.tui = tui;
		this.version = version;
		this.appName = appName;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (!shouldRenderLargeStartupBrand(this.appName)) {
			return [];
		}

		const brandLines = MLENS_BRAND_LINES.map((line, index) =>
			centerLine(theme.bold(theme.fg(BRAND_LINE_COLORS[index] ?? "accent", line)), width),
		);
		const versionLine = centerLine(theme.fg("dim", `${this.appName} v${this.version}`), width);

		const topPadding = this.tui.terminal.rows >= 42 ? 2 : 1;
		const output: string[] = [];

		for (let i = 0; i < topPadding; i += 1) {
			output.push(" ".repeat(width));
		}

		output.push(...brandLines);
		output.push(versionLine);
		return output;
	}
}
