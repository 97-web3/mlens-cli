import { type AddressOverview, MolianProviderError } from "../tools/types.ts";

export async function getBtcAddressOverview(_address: string): Promise<AddressOverview> {
	throw new MolianProviderError({
		code: "not_implemented",
		chain: "btc",
		message: "BTC provider is scaffolded for MVP but not implemented yet.",
	});
}
