import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService, PolicyService } from "../services";
import { MerkleProofManagerAbi } from "../../abis/MerkleProofManagerAbi";

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
  }) as PolicyService;
  await merkleProofManager.save();
});