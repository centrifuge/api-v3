import { ponder } from "ponder:registry";
import {
  AccountService,
  BlockchainService,
  OffRampAddressService,
  OffRampRelayerService,
  OnOffRampManagerService,
} from "../services";
import { logEvent } from "../helpers/logger";
import { OnRampAssetService } from "../services";
import { getAddress } from "viem";

ponder.on(
  "OnOffRampManagerFactory:DeployOnOfframpManager",
  async ({ event, context }) => {
    logEvent(event, context, "OnOffRampManagerFactory:DeployOnOfframpManager");
    const { poolId, scId: tokenId, manager } = event.args;
    const chainId = context.chain.id;
    if (typeof chainId !== "number")
      throw new Error("Chain ID is not a number");
    const blockchain = (await BlockchainService.get(context, {
      id: chainId.toString(),
    })) as BlockchainService;
    if (!blockchain) throw new Error("Blockchain not found");
    const { centrifugeId } = blockchain.read();

    const _onOffRampManager = (await OnOffRampManagerService.insert(
      context,
      {
        address: manager,
        centrifugeId,
        poolId,
        tokenId,
      },
      event.block
    )) as OnOffRampManagerService | null;
    if (!_onOffRampManager) {
      console.error("Failed to insert OnOffRampManager");
    }
  }
);

ponder.on("OnOffRampManager:UpdateRelayer", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManager:UpdateRelayer");
  const { relayer, isEnabled } = event.args;
  const manager = getAddress(event.log.address);

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const onOffRampManager = (await OnOffRampManagerService.get(context, {
    address: manager,
    centrifugeId,
  })) as OnOffRampManagerService;
  if (!onOffRampManager) {
    console.error("OnOffRampManager not found");
    return;
  }
  const { poolId, tokenId } = onOffRampManager.read();

  const offRampRelayer = (await OffRampRelayerService.upsert(
    context,
    {
      address: relayer,
      centrifugeId,
      tokenId,
      poolId,
      isEnabled,
    },
    event.block
  )) as OffRampRelayerService | null;
  if (!offRampRelayer) console.error("Failed to upsert OffRampRelayer");
});

ponder.on("OnOffRampManager:UpdateOnramp", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManager:UpdateOnramp");
  const manager = event.log.address;
  const { asset, isEnabled } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const onOffRampManager = (await OnOffRampManagerService.get(context, {
    address: manager,
    centrifugeId,
  })) as OnOffRampManagerService;
  if (!onOffRampManager) {
    console.error("OnOffRampManager not found");
    return;
  }

  const { poolId, tokenId } = onOffRampManager.read();

  const onRampAsset = (await OnRampAssetService.upsert(
    context,
    {
      assetAddress: asset,
      poolId,
      centrifugeId,
      tokenId,
      isEnabled,
    },
    event.block
  )) as OnRampAssetService | null;
  if (!onRampAsset) console.error("Failed to upsert OnRampAsset");
});

ponder.on("OnOffRampManager:UpdateOfframp", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManager:UpdateOfframp");
  const { asset, receiver } = event.args;
  const manager = event.log.address;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is not a number");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const onOffRampManager = (await OnOffRampManagerService.get(context, {
    address: manager,
    centrifugeId,
  })) as OnOffRampManagerService;
  if (!onOffRampManager) {
    console.error("OnOffRampManager not found");
    return;
  }
  const { poolId, tokenId } = onOffRampManager.read();

  const receiverAccount = (await AccountService.getOrInit(
    context,
    {
      address: getAddress(receiver),
    },
    event.block
  )) as AccountService;
  const { address: receiverAddress } = receiverAccount.read();

  const offRampAddress = (await OffRampAddressService.getOrInit(
    context,
    {
      poolId,
      centrifugeId,
      tokenId,
      assetAddress: getAddress(asset),
      receiverAddress,
    },
    event.block
  )) as OffRampAddressService;
  await offRampAddress.save(event.block);
});
