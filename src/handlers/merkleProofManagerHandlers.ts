import { multiMapper } from "../helpers/multiMapper";
import { readContractSafe } from "../helpers/readContractSafe";
import { formatBytes32ToAddress } from "../helpers/formatter";
import { logEvent, serviceError } from "../helpers/logger";
import { BlockchainService, MerkleProofManagerService, PolicyService } from "../services";
import { Abis, REGISTRY_VERSION_ORDER } from "../contracts";

multiMapper("merkleProofManagerFactory:DeployMerkleProofManager", async ({ event, context }) => {
  logEvent(event, context, "merkleProofManagerFactory:DeployMerkleProofManager");
  const { poolId, manager } = event.args;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const merkleProofManager = (await MerkleProofManagerService.upsert(
    context,
    {
      address: formatBytes32ToAddress(manager),
      centrifugeId,
      poolId,
    },
    event
  )) as MerkleProofManagerService | null;
  if (!merkleProofManager) {
    serviceError("Failed to insert MerkleProofManager");
  }
});

multiMapper("merkleProofManager:UpdatePolicy", async ({ event, context }) => {
  logEvent(event, context, "merkleProofManager:UpdatePolicy");
  const { strategist, newRoot } = event.args;

  const indexerVersion = REGISTRY_VERSION_ORDER[0];

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const poolId = await readContractSafe(context, event, {
    address: event.log.address,
    abi: Abis[indexerVersion as keyof typeof Abis].MerkleProofManager,
    functionName: "poolId",
  });

  const policy = (await PolicyService.getOrInit(
    context,
    {
      strategistAddress: formatBytes32ToAddress(strategist),
      centrifugeId,
      poolId,
    },
    event,
    undefined,
    true
  )) as PolicyService;
  await policy.setRoot(newRoot).setCrosschainInProgress().save(event);
});
