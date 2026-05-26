import { type AddressOverview, MolianProviderError } from "../tools/types.ts";

export async function getSolAddressOverview(_address: string): Promise<AddressOverview> {
	throw new MolianProviderError({
		code: "not_implemented",
		chain: "sol",
		message: "SOL provider is scaffolded for MVP but not implemented yet.",
	});
}
