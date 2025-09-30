import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { Timekeeper } from "../helpers/timekeeper";
import { BlockchainService, HoldingEscrowService, PoolService, TokenInstanceService, TokenService } from "../services";
import { PoolSnapshot, HoldingEscrowSnapshot, TokenInstanceSnapshot, TokenSnapshot } from "ponder:schema";
import { snapshotter } from "../helpers/snapshotter";
import { currentChains } from "../../ponder.config";
import {  } from "ponder:schema";

const timekeeper = Timekeeper.start()

/**
 * Processes a new block and creates snapshots if a new period has started
 * @param args - Event arguments containing context and event details
 * @param args.context - Ponder context object containing chain information
 * @param args.event - Block event containing block details
 * @returns Promise that resolves when processing is complete
 */
async function processBlock(args: Parameters<Parameters<typeof ponder.on>[1]>[0]) {
  const chainName  = args.context.chain.name
  const { event, context } = args
  const newPeriod = await timekeeper.processBlock(context, event)
  if (!newPeriod) return
  logEvent(event, context, `${chainName}:NewPeriod`)
  
  const centrifugeId = await BlockchainService.getCentrifugeId(context);
  
  const pools = await PoolService.query(context, {
    isActive: true,
    centrifugeId
  }) as PoolService[];

  const tokens = await TokenService.query(context, {
    isActive: true,
    centrifugeId
  }) as TokenService[];

  const tokenInstances = await TokenInstanceService.query(context, {
    isActive: true,
    centrifugeId
  }) as TokenInstanceService[];

  const holdingEscrows = await HoldingEscrowService.query(context, {
    centrifugeId,
    assetAmount_not: 0n
  }) as HoldingEscrowService[];

  await snapshotter(context, event, `${chainName}:NewPeriod`, pools, PoolSnapshot)
  await snapshotter(context, event, `${chainName}:NewPeriod`, tokens, TokenSnapshot)
  await snapshotter(context, event, `${chainName}:NewPeriod`, tokenInstances, TokenInstanceSnapshot)
  await snapshotter(context, event, `${chainName}:NewPeriod`, holdingEscrows, HoldingEscrowSnapshot)
}

currentChains.forEach(chain => {
  ponder.on(`${chain.network.network}:block`, processBlock);
})
