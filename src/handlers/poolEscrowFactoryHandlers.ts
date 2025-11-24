

import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import { EscrowService } from "../services/EscrowService";

ponder.on("PoolEscrowFactoryV3:DeployPoolEscrow", async ({ event, context }) => {
  logEvent(event, context, "PoolEscrowFactoryV3:DeployPoolEscrow");
  const { poolId, escrow: escrowAddress } = event.args;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const _escrow = (await EscrowService.insert(context, {
    address: escrowAddress,
    poolId,
    centrifugeId,
  }, event.block)) as EscrowService | null;
});