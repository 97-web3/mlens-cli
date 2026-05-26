import type { MainOptions } from "../main.ts";
import { main as runMain } from "../main.ts";
import { createMolianExtensionFactory } from "./extension.ts";
import { createMolianSystemPrompt } from "./system-prompt.ts";

export async function main(args: string[], options?: MainOptions): Promise<void> {
	const userSystemPromptOverride = options?.resourceLoaderOptions?.systemPromptOverride;
	await runMain(args, {
		...options,
		extensionFactories: [...(options?.extensionFactories ?? []), createMolianExtensionFactory()],
		resourceLoaderOptions: {
			...(options?.resourceLoaderOptions ?? {}),
			systemPromptOverride: (basePrompt) => {
				const resolvedBase = userSystemPromptOverride ? userSystemPromptOverride(basePrompt) : basePrompt;
				return createMolianSystemPrompt(resolvedBase);
			},
		},
	});
}
