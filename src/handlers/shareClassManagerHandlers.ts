import { multiMapper } from "../helpers/multiMapper";
import { expandInlineObject, logEvent, serviceError } from "../helpers/logger";
import { TokenService, BlockchainService, PoolService } from "../services";
import { snapshotter } from "../helpers/snapshotter";
import { TokenSnapshot } from "ponder:schema";
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

multiMapper(
  "shareClassManager:AddShareClass(uint64 indexed poolId, bytes16 indexed scId, uint32 indexed index, string name, string symbol, bytes32 salt)",
  async ({ event, context }) => {
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
});

multiMapper("shareClassManager:UpdateDepositRequest", updateDepositRequest);
multiMapper("shareClassManager:UpdateRedeemRequest", updateRedeemRequest);
multiMapper("shareClassManager:ApproveDeposits", approveDeposits);
multiMapper("shareClassManager:ApproveRedeems", approveRedeems);
multiMapper("shareClassManager:IssueShares", issueShares);
multiMapper("shareClassManager:RevokeShares", revokeShares);

multiMapper("shareClassManager:ClaimDeposit", claimDeposit);
multiMapper("shareClassManager:ClaimRedeem", claimRedeem);
