import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { Timekeeper } from "../helpers/timekeeper";
import { BlockchainService, PoolService, TokenService } from "../services";
import { PoolSnapshot } from "ponder:schema";
import { snapshotter } from "../helpers/snapshotter";
import { currentChains } from "../../ponder.config";
import { TokenSnapshot } from "ponder:schema";

const timekeeper = Timekeeper.start()

async function processBlock(args: Parameters<Parameters<typeof ponder.on>[1]>[0]) {
  const chainName  = args.context.chain.name
  const { event, context } = args
  const newPeriod = await timekeeper.processBlock(context, event)
  if (!newPeriod) return
  logEvent(event, `${chainName}:newPeriod`)
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

  await snapshotter(context, event, `${chainName}:newPeriod`, pools, PoolSnapshot)
  await snapshotter(context, event, `${chainName}:newPeriod`, tokens, TokenSnapshot)
}

currentChains.forEach(chain => {
  ponder.on(`${chain.network.network}:block`, processBlock);
})
