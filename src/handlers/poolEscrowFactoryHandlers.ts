

import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import { EscrowService } from "../services/EscrowService";

ponder.on("PoolEscrowFactory:DeployPoolEscrow", async ({ event, context }) => {
  logEvent(event, context, "PoolEscrowFactory:DeployPoolEscrow");
  const chainId = context.chain.id
  if (typeof chainId !== 'number') throw new Error('Chain ID is required')
  const { poolId, escrow: escrowAddress } = event.args;

  const blockchain = await BlockchainService.get(context, { id: chainId.toString() }) as BlockchainService
  const { centrifugeId } = blockchain.read()

  const _escrow = (await EscrowService.init(context, {
    address: escrowAddress,
    poolId,
    centrifugeId,
  })) as EscrowService;
});