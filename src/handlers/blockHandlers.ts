import { ponder } from "ponder:registry";
import type { Context, Event } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { getPeriodStart, Timekeeper } from "../helpers/timekeeper";
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

const timekeeper = Timekeeper.start();

/** New-period snapshots when the timekeeper rolls the chain period. */
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

  const blockTime = new Date(Number(event.block.timestamp) * 1000);
  const asOf = getPeriodStart(blockTime);
  const tokenIds = tokens.map((t) => t.read().id);
  const tokenHistory = await TokenService.loadTokenSnapshotHistoryForYields(
    context,
    tokenIds,
    asOf
  );
  const tokenYields = TokenService.computeYieldsBatch(tokens, asOf, tokenHistory);

  const periodSnapshotOpts = { timestamp: asOf };
  await snapshotter(
    context,
    event,
    `${chainName}:NewPeriod`,
    pools,
    PoolSnapshot,
    periodSnapshotOpts
  );
  await snapshotter(context, event, `${chainName}:NewPeriod`, tokens, TokenSnapshot, {
    ...periodSnapshotOpts,
    augment: (tok) => tokenYields.get(tok.read().id) ?? {},
  });
  await snapshotter(
    context,
    event,
    `${chainName}:NewPeriod`,
    tokenInstances,
    TokenInstanceSnapshot,
    periodSnapshotOpts
  );
  await snapshotter(
    context,
    event,
    `${chainName}:NewPeriod`,
    holdingEscrows,
    HoldingEscrowSnapshot,
    periodSnapshotOpts
  );
}

// Register block handlers for each chain using the block names from the blocks config
// This ensures type safety by using the actual block event names from the config
(Object.keys(blocks) as Array<keyof typeof blocks>).forEach((chainName: keyof typeof blocks) => {
  ponder.on(`${chainName}:block`, processBlock);
});
