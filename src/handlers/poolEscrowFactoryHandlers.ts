import { multiMapper } from "../helpers/multiMapper";
import { logEvent } from "../helpers/logger";
import { BlockchainService, EscrowService } from "../services";

multiMapper("poolEscrowFactory:DeployPoolEscrow", async ({ event, context }) => {
  logEvent(event, context, "poolEscrowFactory:DeployPoolEscrow");
  const { poolId, escrow: escrowAddress } = event.args;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const _escrow = (await EscrowService.upsert(
    context,
    {
      address: escrowAddress,
      poolId,
      centrifugeId,
    },
    event
  )) as EscrowService | null;
});
