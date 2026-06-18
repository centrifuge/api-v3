import type { Context, Event } from "ponder:registry";
import { encodeAbiParameters, keccak256 } from "viem";
import { ERC20Abi } from "../../abis/ERC20";
import type { BasinConfig } from "../config/basin";
import { readContractSafe, type ReadContractSafeEvent } from "./readContractSafe";
import { formatBytes32ToAddress } from "./formatter";

const GROVE_RATE_PROVIDER_ABI = [
  {
    type: "function",
    name: "getConversionRateWithAge",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "rate", type: "uint256" },
      { name: "lastUpdated", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getRatePrecision",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

type RateTriple = {
  rate: bigint;
  ratePrecision: bigint;
  tokenPrecision: bigint;
};

/**
 * ERC-20 `decimals()` as a power-of-ten precision factor at the event block.
 *
 * @param context - Ponder context for `readContract`
 * @param event - Block to pin the `eth_call`
 * @param token - Token contract address
 * @returns `10 ** decimals`
 */
async function getTokenDecimals(
  context: Context,
  event: ReadContractSafeEvent,
  token: `0x${string}`
): Promise<bigint | undefined> {
  const decimals = await readContractSafe(context, event, {
    abi: ERC20Abi,
    address: token,
    functionName: "decimals",
  });
  if (decimals === undefined) return undefined;
  return 10n ** BigInt(decimals);
}

/**
 * Rate, rate precision, and token precision for a GroveBasin-supported asset.
 *
 * @param context - Ponder context for `readContract`
 * @param event - Block to pin the `eth_call`
 * @param cfg - Basin config (rate provider addresses per leg)
 * @param token - Credit, collateral, or swap token address
 * @returns Rate triple used by `_convert`
 */
async function getTokenRateAndPrecision(
  context: Context,
  event: ReadContractSafeEvent,
  cfg: BasinConfig,
  token: `0x${string}`
): Promise<RateTriple | undefined> {
  const credit = formatBytes32ToAddress(cfg.creditToken);
  const collateral = formatBytes32ToAddress(cfg.collateralToken);
  const swap = formatBytes32ToAddress(cfg.swapToken);
  const normalized = formatBytes32ToAddress(token);

  let rateProvider: `0x${string}`;
  let tokenAddress: `0x${string}`;
  if (normalized === swap) {
    rateProvider = cfg.swapTokenRateProvider;
    tokenAddress = swap;
  } else if (normalized === collateral) {
    rateProvider = cfg.collateralTokenRateProvider;
    tokenAddress = collateral;
  } else if (normalized === credit) {
    rateProvider = cfg.creditTokenRateProvider;
    tokenAddress = credit;
  } else {
    throw new Error(`Unsupported basin asset ${token}`);
  }

  const [rateResult, ratePrecision] = await Promise.all([
    readContractSafe(context, event, {
      abi: GROVE_RATE_PROVIDER_ABI,
      address: rateProvider,
      functionName: "getConversionRateWithAge",
    }),
    readContractSafe(context, event, {
      abi: GROVE_RATE_PROVIDER_ABI,
      address: rateProvider,
      functionName: "getRatePrecision",
    }),
  ]);
  if (rateResult === undefined || ratePrecision === undefined) return undefined;

  const tokenPrecision = await getTokenDecimals(context, event, tokenAddress);
  if (tokenPrecision === undefined) return undefined;
  return { rate: rateResult[0], ratePrecision, tokenPrecision };
}

/**
 * Fixed-point multiply-divide with optional ceiling (matches Solidity `mulDiv`).
 *
 * @param a - Numerator factor
 * @param b - Numerator factor
 * @param c - Denominator
 * @param rounding - When `"ceil"`, round up; otherwise truncate toward zero
 * @returns `(a * b) / c` with the chosen rounding
 */
function mulDiv(a: bigint, b: bigint, c: bigint, rounding?: "ceil"): bigint {
  const product = a * b;
  if (rounding === "ceil") return (product + c - 1n) / c;
  return product / c;
}

/** Mirrors GroveBasin `_convert` (single mulDiv path). */
function convertAmount(
  amount: bigint,
  rateIn: bigint,
  ratePrecisionIn: bigint,
  tokenPrecisionIn: bigint,
  rateOut: bigint,
  ratePrecisionOut: bigint,
  tokenPrecisionOut: bigint,
  roundUp: boolean
): bigint {
  const numeratorPrecision = tokenPrecisionOut * ratePrecisionOut;
  const denominatorPrecision = tokenPrecisionIn * ratePrecisionIn;

  if (numeratorPrecision >= denominatorPrecision) {
    const scalar = numeratorPrecision / denominatorPrecision;
    if (!roundUp) return mulDiv(amount, rateIn * scalar, rateOut);
    return mulDiv(amount, rateIn * scalar, rateOut, "ceil");
  }

  const scalar = denominatorPrecision / numeratorPrecision;
  if (!roundUp) return mulDiv(amount, rateIn, rateOut * scalar);
  return mulDiv(amount, rateIn, rateOut * scalar, "ceil");
}

/**
 * Mirrors GroveBasin `_getSwapQuote` (gross quote, no swap fees).
 *
 * @param context - Ponder context for rate provider reads
 * @param event - Block to pin `eth_call`s
 * @param cfg - Basin config
 * @param asset - Asset being converted from
 * @param quoteAsset - Asset being converted to
 * @param amount - Amount of `asset`
 * @param roundUp - Match contract rounding flag
 * @returns Quoted amount of `quoteAsset`
 */
export async function getSwapQuote(
  context: Context,
  event: ReadContractSafeEvent,
  cfg: BasinConfig,
  asset: `0x${string}`,
  quoteAsset: `0x${string}`,
  amount: bigint,
  roundUp: boolean
): Promise<bigint | undefined> {
  const assetNorm = formatBytes32ToAddress(asset);
  const quoteNorm = formatBytes32ToAddress(quoteAsset);
  const credit = formatBytes32ToAddress(cfg.creditToken);

  if (assetNorm === quoteNorm) throw new Error("Invalid asset: same token");
  if (assetNorm !== credit && quoteNorm !== credit)
    throw new Error("Invalid swap: credit token required");

  const [inRate, outRate] = await Promise.all([
    getTokenRateAndPrecision(context, event, cfg, assetNorm),
    getTokenRateAndPrecision(context, event, cfg, quoteNorm),
  ]);
  if (inRate === undefined || outRate === undefined) return undefined;

  return convertAmount(
    amount,
    inRate.rate,
    inRate.ratePrecision,
    inRate.tokenPrecision,
    outRate.rate,
    outRate.ratePrecision,
    outRate.tokenPrecision,
    roundUp
  );
}

/**
 * `keccak256(abi.encode(RedeemRequest))` per GroveBasin `_initiateRedeem`.
 *
 * @param params - Encoded redeem request fields (must match on-chain struct)
 * @returns `requestId` bytes32
 */
export function computeRedeemRequestId(params: {
  blockNumber: bigint;
  redeemer: `0x${string}`;
  creditTokenAmount: bigint;
  collateralTokenAmount: bigint;
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [params.blockNumber, params.redeemer, params.creditTokenAmount, params.collateralTokenAmount]
    )
  );
}

/**
 * Computes `requestId` at the event block using a live gross credit→collateral quote.
 *
 * @param context - Ponder context for `getSwapQuote`
 * @param event - Initiate event (block number and `eth_call` pin)
 * @param cfg - Basin config
 * @param redeemer - TokenRedeemer / redeemer address
 * @param creditTokenAmount - JTRSY amount from `RedeemInitiated`
 * @returns `requestId` matching GroveBasin storage key
 */
export async function computeRedeemRequestIdAtBlock(
  context: Context,
  event: Event,
  cfg: BasinConfig,
  redeemer: `0x${string}`,
  creditTokenAmount: bigint
): Promise<`0x${string}` | undefined> {
  const collateralTokenAmount = await getSwapQuote(
    context,
    event,
    cfg,
    formatBytes32ToAddress(cfg.creditToken),
    formatBytes32ToAddress(cfg.collateralToken),
    creditTokenAmount,
    false
  );
  if (collateralTokenAmount === undefined) return undefined;

  return computeRedeemRequestId({
    blockNumber: event.block.number,
    redeemer: formatBytes32ToAddress(redeemer),
    creditTokenAmount,
    collateralTokenAmount,
  });
}
