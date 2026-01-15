import { sValidator } from "@hono/standard-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import { db } from "ponder:api";
import schema, {
  Blockchain,
  CrosschainPayload,
  Token,
  TokenInstance,
} from "ponder:schema";
import { Hex } from "viem";
import * as z from "zod";
import { formatBigIntToDecimal } from "../helpers/formatter";
import {
  AccountService,
  AdapterService,
  AssetRegistrationService,
  AssetService,
  BlockchainService,
  CrosschainMessageService,
  CrosschainPayloadService,
  EpochInvestOrderService,
  EpochRedeemOrderService,
  HoldingService,
  InvestOrderService,
  InvestorTransactionService,
  PoolService,
  RedeemOrderService,
  TokenInstanceService,
  TokenService,
} from "../services";
import { AdapterParticipationService } from "../services/AdapterParticipationService";

const app = new Hono();
const context = { db };

app.use("/", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

const jsonDefaultHeaders = {
  charset: "utf-8",
  "Content-Type": "application/json",
};
app.get("/tokens/:address/total-issuance", async (c) => {
  const address = c.req.param("address") as `0x${string}`;
  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance)
    return c.json(
      { error: "TokenInstance address not found" },
      404,
      jsonDefaultHeaders
    );
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token)
    return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

  const { totalIssuance, decimals } = token.read();
  if (totalIssuance === null)
    return c.json({ error: "Total issuance not set" }, 404, jsonDefaultHeaders);
  if (decimals === null)
    return c.json({ error: "Token decimals not set" }, 404, jsonDefaultHeaders);
  return c.json(
    { result: formatBigIntToDecimal(totalIssuance, decimals) },
    200,
    jsonDefaultHeaders
  );
});

app.get("/tokens/:address/price", async (c) => {
  const address = c.req.param("address") as `0x${string}`;

  const tokenInstance = await TokenInstanceService.get(context, { address });
  if (!tokenInstance)
    return c.json(
      { error: "TokenInstance not found" },
      404,
      jsonDefaultHeaders
    );
  const { tokenId } = tokenInstance.read();

  const token = await TokenService.get(context, { id: tokenId });
  if (!token)
    return c.json({ error: "Token not found" }, 404, jsonDefaultHeaders);

  const { tokenPrice } = token.read();
  if (tokenPrice === null) return c.json({ error: "Token price not set" }, 404);

  return c.json(
    { result: formatBigIntToDecimal(tokenPrice) },
    200,
    jsonDefaultHeaders
  );
});

app.get("/transactions/:txHash", async (c) => {
  const txHash = c.req.param("txHash") as `0x${string}`;

  // Query CrosschainPayload by preparedAtTxHash
  const [payload] = await db
    .select()
    .from(CrosschainPayload)
    .where(eq(CrosschainPayload.preparedAtTxHash, txHash))
    .limit(1);

  if (!payload) {
    return c.json({
      data: {
        status: "NOT_FOUND",
        substatus: "NOT_FOUND",
        sourceTx: txHash,
        destinationTx: null,
        explorerLink: null,
      },
    });
  }

  // Set explorer link to centrifugescan.io
  const explorerLink = `https://centrifugescan.io/tx/${payload.preparedAtTxHash}`;

  // Map CrosschainPayload status to transaction status
  let status: string;
  let substatus: string;

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
    .default("false")
    .pipe(z.transform((val) => val === "true")),
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

app.get("/routes", sValidator("query", routesParams), async (c) => {
  const { limit, offset } = c.req.valid("query");
  const ESTIMATED_DURATION = 210; // in seconds
  const ESTIMATED_GAS = 1000000;

  // Get all blockchains
  const blockchains = await db.select().from(Blockchain);
  const blockchainByCentId = new Map(
    blockchains.map((b) => [b.centrifugeId, b])
  );

  const tokenInstanceRows = await db
    .select()
    .from(TokenInstance)
    .innerJoin(Token, eq(TokenInstance.tokenId, Token.id));

  const hubTokenInstanceRowsByTokenId = new Map<
    string,
    (typeof tokenInstanceRows)[number]
  >();
  const nonHubTokenInstanceRowsByTokenId = new Map<
    string,
    typeof tokenInstanceRows
  >();
  const nonHubTokenInstanceRows = tokenInstanceRows.filter((row) => {
    const isSpoke =
      Number(row.token_instance.centrifugeId) !==
      Number(BigInt(row.token_instance.tokenId) >> 112n);
    if (isSpoke) {
      const tokenRows =
        nonHubTokenInstanceRowsByTokenId.get(row.token.id) || [];
      tokenRows.push(row);
      nonHubTokenInstanceRowsByTokenId.set(row.token.id, tokenRows);
      return true;
    } else {
      hubTokenInstanceRowsByTokenId.set(row.token.id, row);
      return false;
    }
  });

  const routes = nonHubTokenInstanceRows.flatMap((row) => {
    const hubBlockchain = blockchainByCentId.get(row.token.centrifugeId!);
    const spokeBlockchain = blockchainByCentId.get(
      row.token_instance.centrifugeId
    );
    const hubRow = hubTokenInstanceRowsByTokenId.get(row.token.id);

    if (
      !hubBlockchain?.chainId ||
      !hubBlockchain?.name ||
      !spokeBlockchain?.chainId ||
      !spokeBlockchain?.name ||
      !hubRow
    )
      return [];

    return [
      // Hub to Spoke route
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
      // Spoke to Hub route
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
      // Spoke to Other Spoke routes (via Hub)
      ...(nonHubTokenInstanceRowsByTokenId
        .get(row.token.id)
        ?.flatMap((otherRow) => {
          // Skip same token on the same chain
          if (
            otherRow.token_instance.centrifugeId ===
            row.token_instance.centrifugeId
          )
            return [];
          const otherSpokeBlockchain = blockchainByCentId.get(
            otherRow.token_instance.centrifugeId
          );
          if (!otherSpokeBlockchain?.chainId || !otherSpokeBlockchain?.name)
            return [];

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
              estimatedDuration: ESTIMATED_DURATION * 2, // Times 2 because 2 hops: spoke->hub->spoke
              estimatedGas: ESTIMATED_GAS * 2, // Times 2 because 2 hops: spoke->hub->spoke
              standard: "CentrifugeV31",
              isEnabled: true,
            },
          ] satisfies Route[];
        }) || []),
    ] satisfies Route[];
  });

  const paginatedRoutes = routes.slice(offset, offset + limit);
  const url = new URL(c.req.url);
  const baseUrl = `${url.origin}${url.pathname}`;

  return c.json({
    paging: {
      self: `${baseUrl}?limit=${limit}&offset=${offset}`,
      prev:
        offset - limit >= 0
          ? `${baseUrl}?limit=${limit}&offset=${offset - limit}`
          : null,
      next:
        offset + limit < routes.length
          ? `${baseUrl}?limit=${limit}&offset=${offset + limit}`
          : null,
    },
    data: paginatedRoutes,
  });
});

const quoteParams = z.object({
  fromChainId: z.coerce.number().int().min(1).max(4294967295),
  toChainId: z.coerce.number().int().min(1).max(4294967295),
  fromAmount: z.coerce
    .bigint()
    .min(1n)
    .max(340282366920938463463374607431768211455n), // uint128 max
  fromToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

app.get("/quote", sValidator("query", quoteParams), async (c) => {
  const { fromChainId, toChainId, fromAmount, fromToken } =
    c.req.valid("query");

  const ESTIMATED_DURATION = 210; // in seconds
  const ESTIMATED_GAS = 1000000;

  const blockchains = await db.select().from(Blockchain);
  const blockchainByChainId = new Map(blockchains.map((b) => [b.chainId, b]));

  const fromCentId = blockchainByChainId.get(fromChainId)?.centrifugeId;
  const toCentId = blockchainByChainId.get(toChainId)?.centrifugeId;

  if (!fromCentId || !toCentId) {
    return c.json({ error: "Origin or destination chain not supported" }, 400);
  } else if (fromCentId === toCentId) {
    return c.json(
      { error: "Origin and destination chain cannot be the same" },
      400
    );
  }

  // Get the token instance from the fromToken address
  const tokenInstanceRows = await db
    .select()
    .from(TokenInstance)
    .innerJoin(Token, eq(TokenInstance.tokenId, Token.id))
    .where(eq(TokenInstance.address, fromToken as Hex));

  const fromTokenInstance = tokenInstanceRows.find(
    (row) => row.token_instance.centrifugeId === fromCentId
  );
  const toTokenInstance = tokenInstanceRows.find(
    (row) => row.token_instance.centrifugeId === toCentId
  );

  if (!fromTokenInstance) {
    return c.json({ error: "Token does not exist on the origin chain" }, 400);
  } else if (!toTokenInstance) {
    return c.json(
      { error: "Token does not exist on the destination chain" },
      400
    );
  }

  const hubCentId = Number(BigInt(fromTokenInstance.token.id) >> 112n);
  const isFromHub = Number(fromCentId) === hubCentId;
  const isToHub = Number(toCentId) === hubCentId;

  let estimatedDuration = ESTIMATED_DURATION;
  let estimatedGas = ESTIMATED_GAS;

  if (!isFromHub && !isToHub) {
    // Spoke to Spoke route (via Hub) - requires 2 hops
    estimatedDuration = ESTIMATED_DURATION * 2;
    estimatedGas = ESTIMATED_GAS * 2;
  }

  return c.json({
    data: {
      toAmount: fromAmount.toString(),
      estimatedDuration,
      estimatedGas,
      feeCosts: {
        bridgeFee: {
          tokenFee: "0",
          nativeFee: "123456", // TODO: get actual fee
        },
        airliftFee: {
          tokenFee: "0",
          nativeFee: "0",
        },
      },
    },
  });
});

app.get("/stats", async (c) => {
  const tvl = await TokenService.getNormalisedTvl(context);
  const pools = await PoolService.count(context, { isActive: true });
  const tokens = await TokenService.count(context, { isActive: true });
  const tokenInstances = await TokenInstanceService.count(context, {
    isActive: true,
  });
  const assets = await AssetService.count(context, {});
  const assetRegistrations = await AssetRegistrationService.count(context, {});
  const adapters = await AdapterService.count(context, {});
  const adapterParticipations = await AdapterParticipationService.count(
    context,
    {}
  );
  const investorTransactions = await InvestorTransactionService.count(
    context,
    {}
  );
  const investOrders = await InvestOrderService.count(context, {});
  const redeemOrders = await RedeemOrderService.count(context, {});
  const epochInvestOrders = await EpochInvestOrderService.count(context, {});
  const epochRedeemOrders = await EpochRedeemOrderService.count(context, {});
  const crosschainMessages = await CrosschainMessageService.count(context, {});
  const crosschainPayloads = await CrosschainPayloadService.count(context, {});
  const accounts = await AccountService.count(context, {});
  const holdings = await HoldingService.count(context, {});
  const blockchains = await BlockchainService.count(context, {});
  return c.json(
    {
      tvl: formatBigIntToDecimal(tvl),
      blockchains,
      pools,
      tokens,
      tokenInstances,
      assets,
      assetRegistrations,
      adapters,
      adapterParticipations,
      investorTransactions,
      investOrders,
      redeemOrders,
      epochInvestOrders,
      epochRedeemOrders,
      crosschainMessages,
      crosschainPayloads,
      accounts,
      holdings,
    },
    200,
    jsonDefaultHeaders
  );
});

export default app;
