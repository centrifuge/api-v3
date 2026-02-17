import { type Event, type Context } from "ponder:registry";
import { multiMapper } from "../helpers/multiMapper";
import { expandInlineObject, logEvent, serviceError } from "../helpers/logger";
import { TokenService, BlockchainService, PoolService } from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { TokenSnapshot } from "ponder:schema";
import { computeYields, recalculateAffectedYields } from "../helpers/yieldCalculator";
import { eq, and } from "drizzle-orm";
import {
  approveRedeems,
  claimDeposit,
  claimRedeem,
  issueShares,
  revokeShares,
  updateDepositRequest,
  updateRedeemRequest,
  approveDeposits,
} from "./batchRequestManagerHandlers";

multiMapper("shareClassManager:AddShareClass", addShareClassLong);
multiMapper(
  "shareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
  addShareClassLong
);
async function addShareClassLong({
  event,
  context,
}: {
  event: Event<"shareClassManagerV3_1:AddShareClass">;
  context: Context;
}) {
  logEvent(event, context, "shareClassManager:AddShareClassLong");
  const { poolId, scId: tokenId, index, name, symbol, salt } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const pool = (await PoolService.get(context, {
    id: poolId,
  })) as PoolService;
  const { decimals: poolDecimals } = pool.read();
  if (typeof poolDecimals !== "number")
    serviceError("Pool decimals is not a initialised", expandInlineObject(pool.read()));

  const _token = (await TokenService.upsert(
    context,
    {
      id: tokenId,
      poolId,
      centrifugeId,
      name,
      symbol,
      salt,
      decimals: poolDecimals,
      isActive: true,
      index,
    },
    event
  )) as TokenService;
}

// SHARE CLASS LIFECYCLE
multiMapper(
  "shareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index)",
  async ({ event, context }) => {
    logEvent(event, context, "shareClassManager:AddShareClassShort");
    const { poolId, scId: tokenId, index } = event.args;

    const centrifugeId = await BlockchainService.getCentrifugeId(context);
    const pool = (await PoolService.get(context, {
      id: poolId,
    })) as PoolService;
    const { decimals: poolDecimals } = pool.read();
    if (typeof poolDecimals !== "number")
      serviceError("Pool decimals is not a initialised", expandInlineObject(pool.read()));

    const _token = (await TokenService.upsert(
      context,
      {
        id: tokenId,
        poolId,
        centrifugeId,
        isActive: true,
        index,
        decimals: poolDecimals,
      },
      event
    )) as TokenService;
  }
);

// INVESTOR TRANSACTIONS
multiMapper("shareClassManager:UpdateMetadata", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:UpdatedMetadata");
  const { poolId, scId: tokenId, name, symbol } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
      centrifugeId,
    },
    event
  )) as TokenService;
  await token.setMetadata(name, symbol);
  await token.save(event);
});

multiMapper("shareClassManager:UpdateShareClass", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:UpdateShareClass");
  const { poolId, scId: tokenId, navPoolPerShare: tokenPrice } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
      centrifugeId,
    },
    event
  )) as TokenService;
  if (!token) return serviceError(`Token not found. Cannot update token price`);
  await token.setTokenPrice(tokenPrice);
  await token.save(event);
  await snapshotter(context, event, "shareClassManagerV3:UpdateShareClass", [token], TokenSnapshot);

  const db = context.db.sql;
  const blockTimestamp = new Date(Number(event.block.timestamp) * 1000);
  const yields = await computeYields(db, tokenId, tokenPrice, blockTimestamp);
  await db
    .update(TokenSnapshot)
    .set(yields)
    .where(
      and(
        eq(TokenSnapshot.id, tokenId),
        eq(TokenSnapshot.blockNumber, Number(event.block.number)),
        eq(TokenSnapshot.trigger, "shareClassManagerV3:UpdateShareClass")
      )
    );
});

multiMapper("shareClassManager:UpdatePricePoolPerShare", async ({ event, context }) => {
  logEvent(event, context, "shareClassManager:UpdateShareClass");
  const { poolId, scId: tokenId, price: tokenPrice, computedAt: computedAtTimestamp } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  const computedAt = new Date(Number(computedAtTimestamp.toString()) * 1000);

  const token = (await TokenService.getOrInit(
    context,
    {
      id: tokenId,
      poolId,
      centrifugeId,
    },
    event
  )) as TokenService;
  if (!token) return serviceError(`Token not found. Cannot update token price`);
  await token.setTokenPrice(tokenPrice, computedAt);
  await token.save(event);
  await snapshotter(
    context,
    event,
    "shareClassManagerV3_1:UpdatePricePoolPerShare",
    [token],
    TokenSnapshot
  );

  const db = context.db.sql;
  const blockTimestamp = new Date(Number(event.block.timestamp) * 1000);
  const yields = await computeYields(db, tokenId, tokenPrice, blockTimestamp);
  await db
    .update(TokenSnapshot)
    .set(yields)
    .where(
      and(
        eq(TokenSnapshot.id, tokenId),
        eq(TokenSnapshot.blockNumber, Number(event.block.number)),
        eq(TokenSnapshot.trigger, "shareClassManagerV3_1:UpdatePricePoolPerShare")
      )
    );

  // Correction detection: if computedAt is > 1 day before block timestamp, treat as retroactive
  const ONE_DAY_MS = 86400 * 1000;
  if (blockTimestamp.getTime() - computedAt.getTime() > ONE_DAY_MS) {
    await recalculateAffectedYields(db, tokenId, computedAt);
  }
});

multiMapper("shareClassManager:UpdateDepositRequest", updateDepositRequest);
multiMapper("shareClassManager:UpdateRedeemRequest", updateRedeemRequest);
multiMapper("shareClassManager:ApproveDeposits", approveDeposits);
multiMapper("shareClassManager:ApproveRedeems", approveRedeems);
multiMapper("shareClassManager:IssueShares", issueShares);
multiMapper("shareClassManager:RevokeShares", revokeShares);

multiMapper("shareClassManager:ClaimDeposit", claimDeposit);
multiMapper("shareClassManager:ClaimRedeem", claimRedeem);
