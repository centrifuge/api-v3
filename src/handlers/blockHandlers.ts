import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { Timekeeper } from "../helpers/timekeeper";
import { BlockchainService, PoolService, TokenService } from "../services";
import { PoolSnapshot } from "ponder:schema";
import { snapshotter } from "../helpers/snapshotter";
import { currentChains } from "../../ponder.config";
import { TokenSnapshot } from "ponder:schema";

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
  const chainId = args.context.chain.id
  if(typeof chainId !== "number") throw new Error("Chain ID is required")
  const blockchain = await BlockchainService.get(context, { id: chainId.toString() })
  const { centrifugeId } = blockchain.read()
  
  const pools = await PoolService.query(context, {
    isActive: true,
    centrifugeId
  }) as PoolService[];

  const tokens = await TokenService.query(context, {
    isActive: true,
    centrifugeId
  }) as TokenService[];

  await snapshotter(context, event, `${chainName}:NewPeriod`, pools, PoolSnapshot)
  await snapshotter(context, event, `${chainName}:NewPeriod`, tokens, TokenSnapshot)
}

currentChains.forEach(chain => {
  ponder.on(`${chain.network.network}:block`, processBlock);
})
