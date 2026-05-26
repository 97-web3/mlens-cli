import type { MolianAssetProofReport } from "./asset-proof-report.ts";
import type { MolianAssetProofProgressEvent, MolianCollectedAssetProofData } from "./asset-proof-workflow.ts";
import type { SupportedChain } from "./tools/types.ts";

export interface MolianReportRunState {
	runId: string;
	address: string;
	chain: SupportedChain;
	collectedData?: MolianCollectedAssetProofData;
	report?: MolianAssetProofReport;
	defaultOutputPath?: string;
	lastProgress?: MolianAssetProofProgressEvent;
}

const reportRuns = new WeakMap<object, Map<string, MolianReportRunState>>();

function getSessionRuns(sessionScope: object): Map<string, MolianReportRunState> {
	let runs = reportRuns.get(sessionScope);
	if (!runs) {
		runs = new Map<string, MolianReportRunState>();
		reportRuns.set(sessionScope, runs);
	}
	return runs;
}

export function createMolianReportRun(sessionScope: object, state: MolianReportRunState): MolianReportRunState {
	getSessionRuns(sessionScope).set(state.runId, state);
	return state;
}

export function getMolianReportRun(sessionScope: object, runId: string): MolianReportRunState | undefined {
	return getSessionRuns(sessionScope).get(runId);
}

export function updateMolianReportRun(sessionScope: object, state: MolianReportRunState): void {
	getSessionRuns(sessionScope).set(state.runId, state);
}
