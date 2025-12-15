

import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import { EscrowService } from "../services/EscrowService";

multiMapper("poolEscrowFactory:DeployPoolEscrow", async ({ event, context }) => {
  logEvent(event, context, "PoolEscrowFactoryV3:DeployPoolEscrow");
  const { poolId, escrow: escrowAddress } = event.args;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const _escrow = (await EscrowService.upsert(context, {
    address: escrowAddress,
    poolId,
    centrifugeId,
  }, event)) as EscrowService | null;
});