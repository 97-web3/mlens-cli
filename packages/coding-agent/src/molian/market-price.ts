import type { MolianAssetPriceSource, MolianAssetPriceStatus } from "./asset-proof-report.ts";

const STABLECOIN_SYMBOLS = new Set(["USDT", "USDC", "DAI", "BUSD", "FDUSD", "TUSD"]);
const PRICE_SYMBOL_ALIASES = new Map([
	["WETH", "ETH"],
	["WBTC", "BTC"],
]);

interface BinanceTickerPriceResponse {
	price?: string;
	symbol?: string;
}

interface OkxTickerPriceResponse {
	code?: string;
	data?: Array<{
		instId?: string;
		last?: string;
	}>;
}

export interface MolianAssetMarketPrice {
	currentPriceUsd: string;
	priceSource: MolianAssetPriceSource;
	priceStatus: MolianAssetPriceStatus;
	quoteSymbolNormalized: string;
}

function normalizeAssetSymbol(symbol: string): string {
	const normalized = symbol.trim().toUpperCase();
	return PRICE_SYMBOL_ALIASES.get(normalized) ?? normalized;
}

function isNumericPrice(value: string | undefined): value is string {
	if (!value) {
		return false;
	}
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed >= 0;
}

async function tryBinanceQuote(symbol: string): Promise<string | undefined> {
	try {
		const response = await fetch(
			`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(`${symbol}USDT`)}`,
		);
		if (!response.ok) {
			return undefined;
		}
		const payload = (await response.json()) as BinanceTickerPriceResponse;
		return isNumericPrice(payload.price) ? payload.price : undefined;
	} catch {
		return undefined;
	}
}

async function tryOkxQuote(symbol: string): Promise<string | undefined> {
	try {
		const response = await fetch(
			`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(`${symbol}-USDT`)}`,
		);
		if (!response.ok) {
			return undefined;
		}
		const payload = (await response.json()) as OkxTickerPriceResponse;
		const lastPrice = payload.data?.[0]?.last;
		return isNumericPrice(lastPrice) ? lastPrice : undefined;
	} catch {
		return undefined;
	}
}

function createPriceResult(
	currentPriceUsd: string,
	priceSource: MolianAssetPriceSource,
	priceStatus: MolianAssetPriceStatus,
	quoteSymbolNormalized: string,
): MolianAssetMarketPrice {
	return {
		currentPriceUsd,
		priceSource,
		priceStatus,
		quoteSymbolNormalized,
	};
}

export async function resolveMolianAssetMarketPrice(symbol: string): Promise<MolianAssetMarketPrice> {
	const normalizedSymbol = normalizeAssetSymbol(symbol);
	const binanceQuote = await tryBinanceQuote(normalizedSymbol);
	if (binanceQuote) {
		return createPriceResult(binanceQuote, "binance", "live", `${normalizedSymbol}USDT`);
	}

	const okxQuote = await tryOkxQuote(normalizedSymbol);
	if (okxQuote) {
		return createPriceResult(okxQuote, "okx", "live", `${normalizedSymbol}-USDT`);
	}

	if (STABLECOIN_SYMBOLS.has(normalizedSymbol)) {
		return createPriceResult("1", "stablecoin_fallback", "fallback", `${normalizedSymbol}/USD`);
	}

	return createPriceResult("0", "unavailable", "unavailable", `${normalizedSymbol}USDT`);
}
