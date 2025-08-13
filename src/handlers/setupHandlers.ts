import { ponder } from "ponder:registry";
import { currentChains } from "../../ponder.config";
import { DeploymentService } from "../services";

ponder.on("HubRegistry:setup", async ({ context }) => {
    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Need a chain id.");
    const currentChain = currentChains.find(chain => chain.network.chainId === chainId);
    if (!currentChain) {
        throw new Error(`Chain ${chainId} not found`);
    }
    const network = currentChain.network;
    const contracts = currentChain.contracts;
    const _deployment = await DeploymentService.init(context, {
      chainId: network.chainId.toString(),
      centrifugeId: network.centrifugeId.toString(),
      ...contracts,
    }) as DeploymentService | null;
});