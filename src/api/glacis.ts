import { sValidator } from "@hono/standard-validator";
import { type Context, Hono } from "hono";
import * as z from "zod";
import { getContractAddressForChain, REGISTRY_VERSION_ORDER } from "../contracts";
import { emptyMessage, MessageType } from "../helpers/messaging";
import { centrifugeId, poolId } from "../helpers/tokenId";
import * as Services from "../services";
import { getContractAbi, getPublicClient } from "./helpers/contracts";
import { apiContext, type ApiContext, type ApiEnv } from "./types";

const V3_1_REGISTRY_INDEX = REGISTRY_VERSION_ORDER.indexOf("v3_1");
if (V3_1_REGISTRY_INDEX < 0) {
  throw new Error('Registry "v3_1" not found in REGISTRY_VERSION_ORDER');
}

/** Deployed address from the v3_1 registry for on-chain quote reads. */
function v3_1ContractAddress(
  chainId: number,
  contractName: "gasService" | "multiAdapter"
): `0x${string}` {
  const address = getContractAddressForChain(chainId, V3_1_REGISTRY_INDEX, contractName);
  if (!address) {
    throw new Error(`${contractName} not deployed on chain ${chainId}`);
  }
  return address;
}

/**
 * Get the chain id and name from a centrifuge id.
 */
function routeChainFromCentrifugeId(
  centrifugeId: string
): { chainId: number; name: string } | null {
  const chainId = Services.BlockchainService.getChainIdFromCentrifugeId(centrifugeId);
  if (chainId == null) return null;
  return { chainId, name: Services.BlockchainService.networkNameFromChainId(chainId) };
}

/** LI.FI-style tx hash; invalid input returns 400 before lookup. */
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

/** Tool identifier reported to LI.FI for every route/quote/status. */
const TOOL = "centrifuge";
const STANDARD = "CentrifugeV31";
const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * Native currency metadata per chain, best-effort. Defaults to 18 decimals and a
 * null symbol/name for chains not listed here — LI.FI treats fee/gas amounts as the
 * source of truth and only uses this for display.
 */
const NATIVE_CURRENCY: Record<number, { symbol: string; name: string }> = {
  1: { symbol: "ETH", name: "Ether" },
  10: { symbol: "ETH", name: "Ether" },
  8453: { symbol: "ETH", name: "Ether" },
  42161: { symbol: "ETH", name: "Ether" },
  56: { symbol: "BNB", name: "BNB" },
  43114: { symbol: "AVAX", name: "Avalanche" },
  98866: { symbol: "PLUME", name: "Plume" },
  999: { symbol: "HYPE", name: "Hyperliquid" },
};

type LifiToken = {
  address: string;
  chainId: number;
  symbol: string | null;
  name: string | null;
  decimals: number;
};

/** LI.FI token object for a chain's native gas currency (fees are paid in native). */
function nativeToken(chainId: number): LifiToken {
  const meta = NATIVE_CURRENCY[chainId];
  return {
    address: NATIVE_TOKEN_ADDRESS,
    chainId,
    symbol: meta?.symbol ?? null,
    name: meta?.name ?? null,
    decimals: 18,
  };
}

/**
 * TokenBridge `send` entrypoint per chain. Not tracked in the protocol registry, so
 * addresses are pinned here. Absent chains simply omit the executable `transactionRequest`.
 */
const TOKEN_BRIDGE_ADDRESS: Record<number, `0x${string}`> = {
  1: "0x82a6c7753380f98c093b27c53f86ef6b09c40f49",
  8453: "0x82a6c7753380f98c093b27c53f86ef6b09c40f49",
};

/** Per-chain block explorer tx URL builder; null when the chain isn't mapped. */
const EXPLORER_TX_BASE: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  10: "https://optimistic.etherscan.io/tx/",
  56: "https://bscscan.com/tx/",
  8453: "https://basescan.org/tx/",
  42161: "https://arbiscan.io/tx/",
  43114: "https://snowtrace.io/tx/",
};

/** Block explorer tx URL for a chain, falling back to centrifugescan; null without inputs. */
function explorerTxLink(chainId: number | null, txHash: string | null): string | null {
  if (chainId == null || !txHash) return null;
  const base = EXPLORER_TX_BASE[chainId];
  return base ? `${base}${txHash}` : `https://centrifugescan.io/tx/${txHash}`;
}

/** Left-pad a 20-byte address to a 32-byte word for the bridge `receiver` arg. */
function addressToBytes32(address: string): `0x${string}` {
  return `0x${address.replace(/^0x/, "").toLowerCase().padStart(64, "0")}` as `0x${string}`;
}

/** Take the low 20 bytes of a 32-byte word as an address. */
function bytes32ToAddress(word: string): `0x${string}` {
  return `0x${word.replace(/^0x/, "").slice(-40)}` as `0x${string}`;
}

type Route = {
  tokenId: string;
  tokenName: string;
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  fromChainId: `${number}`;
  fromChainName: string;
  toChainId: `${number}`;
  toChainName: string;
  minTransferSize: `${number}`;
  maxTransferSize: `${number}`;
  decimals: number;
  estimatedDuration: number;
  estimatedGas: number;
  standard: string;
};

/** Hono query values are strings (or string[] if repeated); normalize for Zod. */
function queryParamToString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined || first === null ? undefined : String(first);
  }
  return String(value);
}

const zQueryChainId = z.preprocess(
  queryParamToString,
  z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number(s))
    .pipe(z.number().int().min(1).max(4294967295))
);

const zQueryUint128 = z.preprocess(
  queryParamToString,
  z
    .string()
    .regex(/^\d+$/)
    .transform((s) => BigInt(s))
    .pipe(z.bigint().min(1n).max(340282366920938463463374607431768211455n))
);

const zQueryAddress = z.preprocess(queryParamToString, z.string().regex(/^0x[a-fA-F0-9]{40}$/));

const zQueryAddressOptional = z.preprocess(
  queryParamToString,
  z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
);

/**
 * POST /quote with `fromChain`, `toChain`, `fromToken`, `fromAmount` as query params.
 * `toToken` is accepted for LI.FI parity but must resolve to the same share class as
 * `fromToken` (transfers are 1:1). `fromAddress`/`toAddress` are optional and only used
 * to build the executable `transactionRequest`.
 */
const quoteParams = z.object({
  fromChain: zQueryChainId,
  toChain: zQueryChainId,
  fromAmount: zQueryUint128,
  fromToken: zQueryAddress,
  toToken: z.preprocess(
    queryParamToString,
    z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional()
  ),
  fromAddress: zQueryAddress,
  toAddress: zQueryAddressOptional,
  // Transfers are 1:1, so slippage is ignored
  slippage: z.preprocess(queryParamToString, z.string().optional()),
});

type QuoteInput = {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  fromAmount: bigint;
  fromAddress?: string;
  toAddress?: string;
};

/** Shared Airlift-style fee quote (POST /quote only per Glacis off-chain interface). */
async function handleQuote(c: Context, ctx: ApiContext, input: QuoteInput): Promise<Response> {
  const { fromChainId, toChainId, fromAmount, fromToken, fromAddress, toAddress } = input;
  const ESTIMATED_DURATION = 210; // in seconds

  const fromCentIdStr = Services.BlockchainService.getCentrifugeIdFromChainId(fromChainId);
  const toCentIdStr = Services.BlockchainService.getCentrifugeIdFromChainId(toChainId);
  if (fromCentIdStr == null || toCentIdStr == null) {
    return c.json({ error: "Origin or destination chain not supported" }, 400);
  }
  const fromCentId = Number(fromCentIdStr);
  const toCentId = Number(toCentIdStr);
  if (fromCentId === toCentId) {
    return c.json({ error: "Origin and destination chain cannot be the same" }, 400);
  }

  const tokenInstances = await Services.TokenInstanceService.query(ctx, {
    address: fromToken as `0x${string}`,
  });
  const fromInstance = tokenInstances.find((ti) => ti.read().centrifugeId === String(fromCentId));
  const toInstance = tokenInstances.find((ti) => ti.read().centrifugeId === String(toCentId));

  if (!fromInstance) {
    return c.json({ error: "Token does not exist on the origin chain" }, 404);
  }
  if (!toInstance) {
    return c.json({ error: "Token does not exist on the destination chain" }, 404);
  }

  const fromData = fromInstance.read();
  const toData = toInstance.read();
  if (fromData.tokenId !== toData.tokenId) {
    return c.json({ error: "Origin and destination addresses are not the same share class" }, 400);
  }

  const tokenId = fromData.tokenId;
  const hubCentId = centrifugeId(tokenId);
  const isFromHub = fromCentId === hubCentId;
  const isToHub = toCentId === hubCentId;
  const isTwoHops = !isFromHub && !isToHub;
  const hubChainId = Services.BlockchainService.getChainIdFromCentrifugeId(String(hubCentId));

  if (hubChainId == null) {
    return c.json({ error: "Hub chain not found for this token" }, 500);
  }

  let estimatedDuration = ESTIMATED_DURATION;

  const fromClient = getPublicClient(fromChainId);
  const hubClient = getPublicClient(hubChainId);

  const [initiateTransferSharesGasLimit, executeTransferSharesGasLimit] = await Promise.all([
    fromClient.readContract({
      abi: getContractAbi("gasServiceV3_1"),
      address: v3_1ContractAddress(fromChainId, "gasService"),
      functionName: "messageOverallGasLimit",
      args: [
        isTwoHops ? hubCentId : toCentId,
        emptyMessage(MessageType.InitiateTransferShares, poolId(tokenId)),
      ],
    }),
    hubClient.readContract({
      abi: getContractAbi("gasServiceV3_1"),
      address: v3_1ContractAddress(hubChainId, "gasService"),
      functionName: "messageOverallGasLimit",
      args: [toCentId, emptyMessage(MessageType.ExecuteTransferShares, poolId(tokenId))],
    }),
  ]);

  const [initiateFee, executeFee] = await Promise.all([
    fromClient.readContract({
      abi: getContractAbi("multiAdapterV3_1"),
      address: v3_1ContractAddress(fromChainId, "multiAdapter"),
      functionName: "estimate",
      args: [
        isTwoHops ? hubCentId : toCentId,
        emptyMessage(MessageType.InitiateTransferShares, poolId(tokenId)),
        initiateTransferSharesGasLimit,
      ],
    }),
    hubClient.readContract({
      abi: getContractAbi("multiAdapterV3_1"),
      address: v3_1ContractAddress(hubChainId, "multiAdapter"),
      functionName: "estimate",
      args: [
        toCentId,
        emptyMessage(MessageType.ExecuteTransferShares, poolId(tokenId)),
        executeTransferSharesGasLimit,
      ],
    }),
  ]);

  let estimatedGas: number;
  let totalFee: bigint;
  if (isFromHub) {
    estimatedGas = Number(executeTransferSharesGasLimit);
    totalFee = executeFee;
  } else if (isToHub) {
    estimatedGas = Number(initiateTransferSharesGasLimit);
    totalFee = initiateFee;
  } else {
    estimatedDuration = ESTIMATED_DURATION * 2;
    estimatedGas = Number(initiateTransferSharesGasLimit) + Number(executeTransferSharesGasLimit);
    totalFee = initiateFee + executeFee;
  }

  // Share class metadata (symbol/name) lives on the Token; decimals are on the instance.
  const [token] = await Services.TokenService.query(ctx, { id: tokenId });
  const tokenMeta = token?.read();

  const fromTokenObj: LifiToken = {
    address: fromData.address,
    chainId: fromChainId,
    symbol: tokenMeta?.symbol ?? null,
    name: tokenMeta?.name ?? null,
    decimals: fromData.decimals,
  };
  const toTokenObj: LifiToken = {
    address: toData.address,
    chainId: toChainId,
    symbol: tokenMeta?.symbol ?? null,
    name: tokenMeta?.name ?? null,
    decimals: toData.decimals,
  };

  // Uncompiled contract interaction parameters for the TokenBridge `send` call.
  // Fee is paid in native (value); refund defaults to the receiver.
  const bridgeAddress = TOKEN_BRIDGE_ADDRESS[fromChainId] ?? null;
  const receiver = toAddress ?? fromAddress ?? null;

  let parameters: {
    contractAddress: `0x${string}`;
    functionName: string;
    value: string;
    chainId: number;
    args: {
      token: string;
      amount: string;
      receiver: `0x${string}`;
      destinationChainId: string;
      refundAddress: string;
    };
  } | null = null;
  if (bridgeAddress && receiver) {
    parameters = {
      contractAddress: bridgeAddress,
      functionName: "send",
      value: totalFee.toString(),
      chainId: fromChainId,
      args: {
        token: fromToken,
        amount: fromAmount.toString(),
        receiver: addressToBytes32(receiver),
        destinationChainId: String(toChainId),
        refundAddress: fromAddress ?? receiver,
      },
    };
  }

  const amount = fromAmount.toString(); // 1:1 transfer — toAmount equals fromAmount

  return c.json({
    tool: TOOL,
    standard: STANDARD,
    fromChainId,
    toChainId,
    fromToken: fromTokenObj,
    toToken: toTokenObj,
    fromAmount: amount,
    toAmount: amount,
    estimate: {
      fromAmount: amount,
      toAmount: amount,
      // No slippage on a deterministic 1:1 transfer, so the minimum equals the amount.
      toAmountMin: amount,
      approvalAddress: bridgeAddress,
      executionDuration: estimatedDuration,
      feeCosts: [
        {
          name: "Bridge fee",
          description: "Cross-chain message delivery fee, paid in the source chain native token",
          percentage: "0",
          token: nativeToken(fromChainId),
          amount: totalFee.toString(),
          amountUSD: null,
          included: false,
        },
      ],
      gasEstimate: estimatedGas,
    },
    parameters,
  });
}

/** Unix seconds from a DB timestamp (Date), or null. */
function toUnix(value: unknown): number | null {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return null;
}

/**
 * LI.FI-style transfer status for a source-chain tx hash. Returns HTTP 200 with a
 * `NOT_FOUND`/`PENDING`/`DONE` status even before the payload is indexed, since LI.FI polls it.
 */
async function handleStatus(c: Context, ctx: ApiContext, txHash: string): Promise<Response> {
  if (!TX_HASH_PATTERN.test(txHash)) {
    return c.json({ error: "Bad Request" }, 400);
  }
  const txHashNorm = txHash as `0x${string}`;

  const payloadSvc = await Services.CrosschainPayloadService.getByCreatedAtTxHash(ctx, txHashNorm);
  if (!payloadSvc) {
    return c.json({
      transactionId: txHashNorm,
      tool: TOOL,
      status: "NOT_FOUND",
      substatus: null,
      substatusMessage: null,
      sending: { txHash: txHashNorm, txLink: null, chainId: null, amount: null, token: null },
      receiving: null,
    });
  }

  const payload = payloadSvc.read();

  let status: string;
  let substatus: string;
  // CrosschainPayload has no hard FAILED state (Underpaid | InTransit | Delivered |
  // PartiallyFailed | Completed), so FAILED is not surfaced yet.
  switch (payload.status) {
    case "Underpaid":
    case "InTransit":
      status = "PENDING";
      substatus = payload.deliveredAt
        ? "WAIT_DESTINATION_TRANSACTION"
        : "WAIT_SOURCE_CONFIRMATIONS";
      break;
    case "Delivered":
      status = "PENDING";
      substatus = "WAIT_DESTINATION_TRANSACTION";
      break;
    case "Completed":
      status = "DONE";
      substatus = "COMPLETED";
      break;
    case "PartiallyFailed":
      status = "DONE";
      substatus = "PARTIAL";
      break;
    default:
      status = "PENDING";
      substatus = "UNKNOWN_ERROR";
  }

  const fromChainId = Services.BlockchainService.getChainIdFromCentrifugeId(
    payload.fromCentrifugeId
  );
  const toChainId = Services.BlockchainService.getChainIdFromCentrifugeId(payload.toCentrifugeId);

  // Transfer amount and receiver live on the transfer message's decoded `data`.
  const messages = await Services.CrosschainMessageService.query(ctx, {
    payloadId: payload.id,
    payloadIndex: payload.index,
  });
  const transferMsg = messages
    .map((m) => m.read())
    .find(
      (m) => m.messageType === "InitiateTransferShares" || m.messageType === "ExecuteTransferShares"
    );
  const msgData = transferMsg?.data as
    | { amount?: string | number | bigint; receiver?: string }
    | null
    | undefined;
  const amount = msgData?.amount != null ? String(msgData.amount) : null;
  const toAddress = msgData?.receiver ? bytes32ToAddress(msgData.receiver) : null;

  let tokenObj: LifiToken | null = null;
  if (payload.tokenId) {
    const [token] = await Services.TokenService.query(ctx, { id: payload.tokenId });
    const meta = token?.read();
    if (meta) {
      tokenObj = {
        address: payload.tokenId,
        chainId: fromChainId ?? 0,
        symbol: meta.symbol ?? null,
        name: meta.name ?? null,
        decimals: meta.decimals,
      };
    }
  }

  const receivingTxHash = payload.completedAtTxHash ?? payload.deliveredAtTxHash ?? null;
  const receivingDone = Boolean(receivingTxHash);

  return c.json({
    transactionId: payload.id,
    tool: TOOL,
    status,
    substatus,
    substatusMessage: null,
    toAddress,
    sending: {
      txHash: payload.createdAtTxHash,
      txLink: explorerTxLink(fromChainId, payload.createdAtTxHash),
      chainId: fromChainId,
      amount,
      token: tokenObj ? { ...tokenObj, chainId: fromChainId ?? tokenObj.chainId } : null,
      gasPrice: payload.gasPrice != null ? payload.gasPrice.toString() : null,
      timestamp: toUnix(payload.createdAt),
    },
    receiving: receivingDone
      ? {
          txHash: receivingTxHash,
          txLink: explorerTxLink(toChainId, receivingTxHash),
          chainId: toChainId,
          tokenAddress: tokenObj?.address ?? null,
          tokenAmount: amount,
          timestamp: toUnix(payload.completedAt ?? payload.deliveredAt),
        }
      : null,
  });
}

/** LI.FI-style routes: `GET /routes`, `POST /quote`, `GET /status`, `GET /transactions/:txHash`. */
export function createGlacisApp() {
  const app = new Hono<ApiEnv>();

  // LI.FI polls status by source tx hash; keep the legacy path-param route as an alias.
  app.get("/status", async (c) => {
    const ctx = apiContext(c);
    return handleStatus(c, ctx, c.req.query("txHash") ?? "");
  });

  app.get("/transaction/:txHash", async (c) => {
    const ctx = apiContext(c);
    return handleStatus(c, ctx, c.req.param("txHash"));
  });

  app.get("/routes", async (c) => {
    const ctx = apiContext(c);
    const ESTIMATED_DURATION = 210; // in seconds
    const ESTIMATED_GAS = 1000000;

    const tokenInstanceRows = await Services.TokenInstanceService.listAllJoinedWithToken(ctx);

    const hubTokenInstanceRowsByTokenId = new Map<string, (typeof tokenInstanceRows)[number]>();
    const nonHubTokenInstanceRowsByTokenId = new Map<string, typeof tokenInstanceRows>();
    const nonHubTokenInstanceRows = tokenInstanceRows.filter((row) => {
      const isSpoke =
        Number(row.token_instance.centrifugeId) !== centrifugeId(row.token_instance.tokenId);
      if (isSpoke) {
        const tokenRows = nonHubTokenInstanceRowsByTokenId.get(row.token.id) || [];
        tokenRows.push(row);
        nonHubTokenInstanceRowsByTokenId.set(row.token.id, tokenRows);
        return true;
      }
      hubTokenInstanceRowsByTokenId.set(row.token.id, row);
      return false;
    });

    const routes = nonHubTokenInstanceRows.flatMap((row) => {
      const hubBlockchain = routeChainFromCentrifugeId(row.token.centrifugeId!);
      const spokeBlockchain = routeChainFromCentrifugeId(row.token_instance.centrifugeId);
      const hubRow = hubTokenInstanceRowsByTokenId.get(row.token.id);

      if (
        !hubBlockchain?.chainId ||
        !hubBlockchain?.name ||
        !spokeBlockchain?.chainId ||
        !spokeBlockchain?.name ||
        !hubRow
      ) {
        return [];
      }

      return [
        {
          tokenId: row.token.id,
          tokenName: row.token.name || row.token.id,
          fromAddress: hubRow.token_instance.address,
          toAddress: row.token_instance.address,
          fromChainId: hubBlockchain.chainId.toString() as `${number}`,
          fromChainName: hubBlockchain.name,
          toChainId: spokeBlockchain.chainId.toString() as `${number}`,
          toChainName: spokeBlockchain.name,
          minTransferSize: "0",
          maxTransferSize: "340282366920938463463374607431768211455", // uint128 max
          decimals: row.token.decimals,
          estimatedDuration: ESTIMATED_DURATION,
          estimatedGas: ESTIMATED_GAS,
          standard: "CentrifugeV31",
        },
        {
          tokenId: row.token.id,
          tokenName: row.token.name || row.token.id,
          fromAddress: row.token_instance.address,
          toAddress: hubRow.token_instance.address,
          fromChainId: spokeBlockchain.chainId.toString() as `${number}`,
          fromChainName: spokeBlockchain.name,
          toChainId: hubBlockchain.chainId.toString() as `${number}`,
          toChainName: hubBlockchain.name,
          minTransferSize: "0",
          maxTransferSize: "340282366920938463463374607431768211455", // uint128 max
          decimals: row.token.decimals,
          estimatedDuration: ESTIMATED_DURATION,
          estimatedGas: ESTIMATED_GAS,
          standard: "CentrifugeV31",
        },
        // Spoke-to-spoke (2-hop) routes commented out — hub↔spoke only for now.
        // ...(nonHubTokenInstanceRowsByTokenId.get(row.token.id)?.flatMap((otherRow) => {
        //   if (otherRow.token_instance.centrifugeId === row.token_instance.centrifugeId) {
        //     return [];
        //   }
        //   const otherSpokeBlockchain = routeChainFromCentrifugeId(
        //     otherRow.token_instance.centrifugeId
        //   );
        //   if (!otherSpokeBlockchain?.chainId || !otherSpokeBlockchain?.name) {
        //     return [];
        //   }
        //   return [
        //     {
        //       tokenId: row.token.id,
        //       tokenName: row.token.name || row.token.id,
        //       fromAddress: row.token_instance.address,
        //       toAddress: otherRow.token_instance.address,
        //       fromChainId: spokeBlockchain.chainId!.toString() as `${number}`,
        //       fromChainName: spokeBlockchain.name!,
        //       toChainId: otherSpokeBlockchain.chainId.toString() as `${number}`,
        //       toChainName: otherSpokeBlockchain.name,
        //       minTransferSize: "0",
        //       maxTransferSize: "340282366920938463463374607431768211455",
        //       decimals: row.token.decimals,
        //       estimatedDuration: ESTIMATED_DURATION * 2,
        //       estimatedGas: ESTIMATED_GAS * 2,
        //       standard: "CentrifugeV31",
        //     },
        //   ] satisfies Route[];
        // }) || []),
      ] satisfies Route[];
    });

    const bridgeRoutes = routes.filter((r) => TOKEN_BRIDGE_ADDRESS[Number(r.fromChainId)] != null);

    return c.json({
      routes: bridgeRoutes,
    });
  });

  app.get("/quote", sValidator("query", quoteParams), async (c) => {
    const ctx = apiContext(c);
    const q = c.req.valid("query");
    return handleQuote(c, ctx, {
      fromChainId: q.fromChain,
      toChainId: q.toChain,
      fromAmount: q.fromAmount,
      fromToken: q.fromToken,
      fromAddress: q.fromAddress,
      toAddress: q.toAddress,
    });
  });

  return app;
}
