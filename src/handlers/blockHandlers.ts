import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { Timekeeper } from "../helpers/timekeeper";
import {
  BlockchainService,
  HoldingEscrowService,
  PoolService,
  TokenInstanceService,
  TokenService,
} from "../services";
import {
  PoolSnapshot,
  HoldingEscrowSnapshot,
  TokenInstanceSnapshot,
  TokenSnapshot,
} from "ponder:schema";
import { snapshotter } from "../helpers/snapshotter";
import { blocks } from "../chains";
import { computeYields } from "../helpers/yieldCalculator";
import { eq, and } from "drizzle-orm";

const timekeeper = Timekeeper.start();

/**
 * Processes a new block and creates snapshots if a new period has started
 * @param args - Event arguments containing context and event details
 * @param args.context - Ponder context object containing chain information
 * @param args.event - Block event containing block details
 * @returns Promise that resolves when processing is complete
 */
async function processBlock(args: { event: Event; context: Context }) {
  const chainName = args.context.chain.name;
  const { event, context } = args;
  const newPeriod = await timekeeper.processBlock(context, event);
  if (!newPeriod) return;
  logEvent(event, context, `${chainName}:NewPeriod`);

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const pools = (await PoolService.query(context, {
    isActive: true,
    centrifugeId,
  })) as PoolService[];

  const tokens = (await TokenService.query(context, {
    isActive: true,
    centrifugeId,
  })) as TokenService[];

  const tokenInstances = (await TokenInstanceService.query(context, {
    isActive: true,
    centrifugeId,
  })) as TokenInstanceService[];

  const holdingEscrows = (await HoldingEscrowService.query(context, {
    centrifugeId,
    assetAmount_not: 0n,
  })) as HoldingEscrowService[];

  await snapshotter(context, event, `${chainName}:NewPeriod`, pools, PoolSnapshot);
  await snapshotter(context, event, `${chainName}:NewPeriod`, tokens, TokenSnapshot);

  const db = context.db.sql;
  const blockTimestamp = new Date(Number(event.block.timestamp) * 1000);
  const trigger = `${chainName}:NewPeriod`;
  for (const token of tokens) {
    const { id: tokenId, tokenPrice } = token.read();
    if (!tokenPrice || tokenPrice === 0n) continue;
    const yields = await computeYields(db, tokenId, tokenPrice, blockTimestamp);
    await db
      .update(TokenSnapshot)
      .set(yields)
      .where(
        and(
          eq(TokenSnapshot.id, tokenId),
          eq(TokenSnapshot.blockNumber, Number(event.block.number)),
          eq(TokenSnapshot.trigger, trigger)
        )
      );
  }

  await snapshotter(
    context,
    event,
    `${chainName}:NewPeriod`,
    tokenInstances,
    TokenInstanceSnapshot
  );
  await snapshotter(
    context,
    event,
    `${chainName}:NewPeriod`,
    holdingEscrows,
    HoldingEscrowSnapshot
  );
}

// Register block handlers for each chain using the block names from the blocks config
// This ensures type safety by using the actual block event names from the config
(Object.keys(blocks) as Array<keyof typeof blocks>).forEach((chainName: keyof typeof blocks) => {
  ponder.on(`${chainName}:block`, processBlock);
});
