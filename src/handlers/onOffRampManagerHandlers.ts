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

ponder.on(
  "OnOffRampManagerFactoryV3:DeployOnOfframpManager",
  async ({ event, context }) => {
    logEvent(event, context, "OnOffRampManagerFactoryV3:DeployOnOfframpManager");
    const { poolId, scId: tokenId, manager } = event.args;
    
    const centrifugeId = await BlockchainService.getCentrifugeId(context);

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

ponder.on("OnOffRampManagerV3:UpdateRelayer", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManagerV3:UpdateRelayer");
  const { relayer, isEnabled } = event.args;
  const manager = event.log.address;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

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

ponder.on("OnOffRampManagerV3:UpdateOnramp", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManagerV3:UpdateOnramp");
  const manager = event.log.address;
  const { asset, isEnabled } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

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

ponder.on("OnOffRampManagerV3:UpdateOfframp", async ({ event, context }) => {
  logEvent(event, context, "OnOffRampManagerV3:UpdateOfframp");
  const { asset, receiver } = event.args;
  const manager = event.log.address;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

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
      address: receiver,
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
      assetAddress: asset,
      receiverAddress,
    },
    event.block
  )) as OffRampAddressService;
  await offRampAddress.save(event.block);
});
