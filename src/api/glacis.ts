import { sValidator } from "@hono/standard-validator";
import { type Context, Hono } from "hono";
import * as z from "zod";
import { getContract, getContractAbi, getPublicClient } from "../helpers/contracts";
import { emptyMessage, MessageType } from "../helpers/messaging";
import { centrifugeId, poolId } from "../helpers/tokenId";
import * as Services from "../services";
import type { ApiContext } from "./types";

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

/** Glacis Airlift-style tx hash; invalid input returns 400 before lookup. */
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

const routesParams = z.object({
  limit: z.coerce.number().int().min(0).max(1000).optional().default(100),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1000)
    .optional()
    .default(0),
  isEnabled: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
});

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
  isEnabled: boolean;
};

const quoteAmountAndToken = {
  fromAmount: z.coerce.bigint().min(1n).max(340282366920938463463374607431768211455n), // uint128 max
  fromToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
} as const;

const quoteParamsPost = z.object({
  fromChain: z.coerce.number().int().min(1).max(4294967295),
  toChain: z.coerce.number().int().min(1).max(4294967295),
  ...quoteAmountAndToken,
});

const quoteParamsLegacyGet = z.object({
  fromChainId: z.coerce.number().int().min(1).max(4294967295),
  toChainId: z.coerce.number().int().min(1).max(4294967295),
  ...quoteAmountAndToken,
});

type QuoteInput = {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  fromAmount: bigint;
};

/** Shared Airlift-style fee quote for POST (fromChain/toChain) and legacy GET (fromChainId/toChainId). */
async function handleQuote(c: Context, ctx: ApiContext, input: QuoteInput): Promise<Response> {
  const { fromChainId, toChainId, fromAmount, fromToken } = input;
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
    return c.json({ error: "Token does not exist on the origin chain" }, 400);
  }
  if (!toInstance) {
    return c.json({ error: "Token does not exist on the destination chain" }, 400);
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
    return c.json({ error: "Hub chain not found for this token" }, 400);
  }

  let estimatedDuration = ESTIMATED_DURATION;

  const fromClient = getPublicClient(fromChainId);
  const hubClient = getPublicClient(hubChainId);

  const [initiateTransferSharesGasLimit, executeTransferSharesGasLimit] = await Promise.all([
    fromClient.readContract({
      abi: getContractAbi("gasServiceV3_1"),
      address: getContract("gasServiceV3_1", fromChainId),
      functionName: "messageOverallGasLimit",
      args: [
        isTwoHops ? hubCentId : toCentId,
        emptyMessage(MessageType.InitiateTransferShares, poolId(tokenId)),
      ],
    }),
    hubClient.readContract({
      abi: getContractAbi("gasServiceV3_1"),
      address: getContract("gasServiceV3_1", hubChainId),
      functionName: "messageOverallGasLimit",
      args: [toCentId, emptyMessage(MessageType.ExecuteTransferShares, poolId(tokenId))],
    }),
  ]);

  const [initiateFee, executeFee] = await Promise.all([
    fromClient.readContract({
      abi: getContractAbi("multiAdapterV3_1"),
      address: getContract("multiAdapterV3_1", fromChainId),
      functionName: "estimate",
      args: [
        isTwoHops ? hubCentId : toCentId,
        emptyMessage(MessageType.InitiateTransferShares, poolId(tokenId)),
        initiateTransferSharesGasLimit,
      ],
    }),
    hubClient.readContract({
      abi: getContractAbi("multiAdapterV3_1"),
      address: getContract("multiAdapterV3_1", hubChainId),
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

  return c.json({
    data: {
      // Same as fromAmount while tokenFee is 0 (native-only bridge fees are in feeCosts).
      toAmount: fromAmount.toString(),
      estimatedDuration,
      estimatedGas,
      feeCosts: {
        bridgeFee: {
          tokenFee: "0",
          nativeFee: totalFee.toString(),
        },
        airliftFee: {
          tokenFee: "0",
          nativeFee: "0",
        },
      },
    },
  });
}

/** Glacis / Airlift-style routes: `/transactions`, `/routes`, `/quote`. */
export function createGlacisApp(ctx: ApiContext) {
  const app = new Hono();

  app.get("/transactions/:txHash", async (c) => {
    const txHash = c.req.param("txHash");
    if (!TX_HASH_PATTERN.test(txHash)) {
      return c.json({ error: "Bad Request" }, 400);
    }
    const txHashNorm = txHash as `0x${string}`;

    const payloadSvc = await Services.CrosschainPayloadService.getByPreparedAtTxHash(
      ctx,
      txHashNorm
    );
    if (!payloadSvc) {
      return c.json({
        data: {
          status: "NOT_FOUND",
          substatus: "NOT_FOUND",
          sourceTx: txHashNorm,
          destinationTx: null,
          explorerLink: null,
        },
      });
    }

    const payload = payloadSvc.read();
    const explorerLink = `https://centrifugescan.io/tx/${payload.preparedAtTxHash}`;

    let status: string;
    let substatus: string;

    // Airlift spec includes FAILED + substatuses; CrosschainPayload only has
    // Underpaid | InTransit | Delivered | PartiallyFailed | Completed — no FAILED until domain extends.
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

    return c.json({
      data: {
        status,
        substatus,
        sourceTx: payload.preparedAtTxHash,
        destinationTx: payload.deliveredAtTxHash || null,
        explorerLink,
      },
    });
  });

  app.get("/routes", sValidator("query", routesParams), async (c) => {
    const { limit, offset, isEnabled } = c.req.valid("query");
    const requestUrl = new URL(c.req.url);
    const pagingIncludesIsEnabled = requestUrl.searchParams.has("isEnabled");
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
          decimals: row.token.decimals || 18,
          estimatedDuration: ESTIMATED_DURATION,
          estimatedGas: 1000000,
          standard: "CentrifugeV31",
          isEnabled: true,
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
          decimals: row.token.decimals || 18,
          estimatedDuration: ESTIMATED_DURATION,
          estimatedGas: 1000000,
          standard: "CentrifugeV31",
          isEnabled: true,
        },
        ...(nonHubTokenInstanceRowsByTokenId.get(row.token.id)?.flatMap((otherRow) => {
          if (otherRow.token_instance.centrifugeId === row.token_instance.centrifugeId) {
            return [];
          }
          const otherSpokeBlockchain = routeChainFromCentrifugeId(
            otherRow.token_instance.centrifugeId
          );
          if (!otherSpokeBlockchain?.chainId || !otherSpokeBlockchain?.name) {
            return [];
          }

          return [
            {
              tokenId: row.token.id,
              tokenName: row.token.name || row.token.id,
              fromAddress: row.token_instance.address,
              toAddress: otherRow.token_instance.address,
              fromChainId: spokeBlockchain.chainId!.toString() as `${number}`,
              fromChainName: spokeBlockchain.name!,
              toChainId: otherSpokeBlockchain.chainId.toString() as `${number}`,
              toChainName: otherSpokeBlockchain.name,
              minTransferSize: "0",
              maxTransferSize: "340282366920938463463374607431768211455", // uint128 max
              decimals: row.token.decimals || 18,
              estimatedDuration: ESTIMATED_DURATION * 2,
              estimatedGas: ESTIMATED_GAS * 2,
              standard: "CentrifugeV31",
              isEnabled: true,
            },
          ] satisfies Route[];
        }) || []),
      ] satisfies Route[];
    });

    const filteredRoutes =
      isEnabled === undefined ? routes : routes.filter((r) => r.isEnabled === isEnabled);

    const paginatedRoutes = filteredRoutes.slice(offset, offset + limit);
    const baseUrl = `${requestUrl.origin}${requestUrl.pathname}`;

    const routesPagingQuery = (off: number): string => {
      const p = new URLSearchParams();
      p.set("limit", String(limit));
      p.set("offset", String(off));
      if (pagingIncludesIsEnabled && isEnabled !== undefined) {
        p.set("isEnabled", isEnabled ? "true" : "false");
      }
      return p.toString();
    };

    return c.json({
      paging: {
        self: `${baseUrl}?${routesPagingQuery(offset)}`,
        prev: offset - limit >= 0 ? `${baseUrl}?${routesPagingQuery(offset - limit)}` : null,
        next:
          offset + limit < filteredRoutes.length
            ? `${baseUrl}?${routesPagingQuery(offset + limit)}`
            : null,
      },
      data: paginatedRoutes,
    });
  });

  app.post("/quote", sValidator("query", quoteParamsPost), async (c) => {
    const q = c.req.valid("query");
    return handleQuote(c, ctx, {
      fromChainId: q.fromChain,
      toChainId: q.toChain,
      fromAmount: q.fromAmount,
      fromToken: q.fromToken,
    });
  });

  app.get("/quote", sValidator("query", quoteParamsLegacyGet), async (c) => {
    const q = c.req.valid("query");
    return handleQuote(c, ctx, {
      fromChainId: q.fromChainId,
      toChainId: q.toChainId,
      fromAmount: q.fromAmount,
      fromToken: q.fromToken,
    });
  });

  return app;
}
