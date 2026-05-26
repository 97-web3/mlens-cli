import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Input, setKeybindings, type TUI } from "../../tui/src/index.ts";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { LoginDialogComponent } from "../src/modes/interactive/components/login-dialog.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function getInput(dialog: LoginDialogComponent): Input {
	return (dialog as unknown as { input: Input }).input;
}

async function submitPrompt(dialog: LoginDialogComponent, value: string): Promise<void> {
	const input = getInput(dialog);
	input.setValue(value);
	input.onSubmit?.(value);
	await Promise.resolve();
}

describe("LoginDialogComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	it("replaces the previous prompt when prompting sequentially", async () => {
		const dialog = new LoginDialogComponent(
			{ requestRender: vi.fn() } as unknown as TUI,
			"openai",
			() => {},
			"OpenAI",
		);

		const firstPrompt = dialog.showPrompt("Enter API key:");
		await submitPrompt(dialog, "sk-test");
		await firstPrompt;

		void dialog.showPrompt("Enter base URL (leave blank to use the official endpoint):", "https://api.openai.com/v1");

		const output = stripAnsi(dialog.render(120).join("\n"));

		expect(output).toContain("Enter base URL (leave blank to use the official endpoint):");
		expect(output).not.toContain("Enter API key:");
	});

	it("preserves auth instructions when replacing prompt content", () => {
		const dialog = new LoginDialogComponent(
			{ requestRender: vi.fn() } as unknown as TUI,
			"anthropic",
			() => {},
			"Anthropic",
		);

		dialog.showAuth("https://example.com/login", "Open this URL in your browser.", { autoOpenBrowser: false });
		void dialog.showPrompt("Paste the code:");

		const output = stripAnsi(dialog.render(120).join("\n"));

		expect(output).toContain("https://example.com/login");
		expect(output).toContain("Open this URL in your browser.");
		expect(output).toContain("Paste the code:");
	});
});
