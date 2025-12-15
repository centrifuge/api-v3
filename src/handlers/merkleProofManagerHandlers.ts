import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
import {
  BlockchainService,
  MerkleProofManagerService,
  PolicyService,
} from "../services";
import { Abis } from "../contracts";

multiMapper(
  "merkleProofManagerFactory:DeployMerkleProofManager",
  async ({ event, context }) => {
    logEvent(
      event,
      context,
      "merkleProofManagerFactory:DeployMerkleProofManager"
    );
    const { poolId, manager } = event.args;
    const centrifugeId = await BlockchainService.getCentrifugeId(context);

    const merkleProofManager = (await MerkleProofManagerService.upsert(
      context,
      {
        address: manager,
        centrifugeId,
        poolId,
      },
      event
    )) as MerkleProofManagerService | null;
    if (!merkleProofManager) {
      serviceError("Failed to insert MerkleProofManager");
    }
  }
);

multiMapper("merkleProofManager:UpdatePolicy", async ({ event, context }) => {
  logEvent(event, context, "merkleProofManager:UpdatePolicy");
  const { strategist, newRoot } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const poolId = await context.client.readContract({
    address: event.log.address,
    abi: Abis.v3.MerkleProofManager,
    functionName: "poolId",
  });

  const merkleProofManager = (await PolicyService.getOrInit(
    context,
    {
      strategistAddress: strategist,
      centrifugeId,
      poolId,
      root: newRoot,
    },
    event
  )) as PolicyService;
  await merkleProofManager.save(event);
});
