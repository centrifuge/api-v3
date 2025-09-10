import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService, MerkleProofManagerService, PolicyService } from "../services";
import { MerkleProofManagerAbi } from "../../abis/MerkleProofManagerAbi";

ponder.on("MerkleProofManagerFactory:DeployMerkleProofManager", async ({ event, context }) => {
  logEvent(event, context, "MerkleProofManagerFactory:DeployMerkleProofManager");
  const { poolId, manager } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const merkleProofManager = (await MerkleProofManagerService.insert(context, {
    address: manager,
    centrifugeId,
    poolId,
  }, event.block)) as MerkleProofManagerService | null;
  if (!merkleProofManager) {
    console.error("Failed to insert MerkleProofManager");
  }
});

ponder.on("MerkleProofManager:UpdatePolicy", async ({ event, context }) => {
  logEvent(event, context, "MerkleProofManager:UpdatePolicy");
  const { strategist, newRoot } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const poolId = await context.client.readContract({
    address: event.log.address,
    abi: MerkleProofManagerAbi,
    functionName: "poolId",
  });

  const merkleProofManager = await PolicyService.getOrInit(context, {
    strategistAddress: strategist,
    centrifugeId,
    poolId,
    root: newRoot,
  }, event.block) as PolicyService;
  await merkleProofManager.save(event.block);
});