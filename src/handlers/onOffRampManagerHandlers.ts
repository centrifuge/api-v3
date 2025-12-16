import { multiMapper } from "../helpers/multiMapper";
import {
  AccountService,
  BlockchainService,
  OffRampAddressService,
  OffRampRelayerService,
  OnOffRampManagerService,
} from "../services";
import { logEvent, serviceError } from "../helpers/logger";
import { OnRampAssetService } from "../services";

multiMapper(
  "onOfframpManagerFactory:DeployOnOfframpManager",
  async ({ event, context }) => {
    logEvent(event, context, "onOffRampManagerFactory:DeployOnOffRampManager");
    const { poolId, scId: tokenId, manager } = event.args;

    const centrifugeId = await BlockchainService.getCentrifugeId(context);

    const _onOffRampManager = (await OnOffRampManagerService.upsert(
      context,
      {
        address: manager,
        centrifugeId,
        poolId,
        tokenId,
      },
      event
    )) as OnOffRampManagerService | null;
    if (!_onOffRampManager) {
      serviceError("Failed to insert OnOffRampManager");
    }
  }
);

multiMapper("onOfframpManager:UpdateRelayer", async ({ event, context }) => {
  logEvent(event, context, "onOffRampManager:UpdateRelayer");
  const { relayer, isEnabled } = event.args;
  const manager = event.log.address;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const onOffRampManager = (await OnOffRampManagerService.get(context, {
    address: manager,
    centrifugeId,
  })) as OnOffRampManagerService;
  if (!onOffRampManager) {
    serviceError("OnOffRampManager not found");
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
    event
  )) as OffRampRelayerService | null;
  if (!offRampRelayer) serviceError("Failed to upsert OffRampRelayer");
});

multiMapper("onOfframpManager:UpdateOnramp", async ({ event, context }) => {
  logEvent(event, context, "onOffRampManager:UpdateOnramp");
  const manager = event.log.address;
  const { asset, isEnabled } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const onOffRampManager = (await OnOffRampManagerService.get(context, {
    address: manager,
    centrifugeId,
  })) as OnOffRampManagerService;
  if (!onOffRampManager) {
    serviceError("OnOffRampManager not found");
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
    event
  )) as OnRampAssetService | null;
  if (!onRampAsset) serviceError("Failed to upsert OnRampAsset");
});

multiMapper("onOfframpManager:UpdateOfframp", async ({ event, context }) => {
  logEvent(event, context, "onOffRampManager:UpdateOfframp");
  const { asset, receiver } = event.args;
  const manager = event.log.address;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const onOffRampManager = (await OnOffRampManagerService.get(context, {
    address: manager,
    centrifugeId,
  })) as OnOffRampManagerService;
  if (!onOffRampManager) {
    serviceError("onOffRampManager not found");
    return;
  }
  const { poolId, tokenId } = onOffRampManager.read();

  const receiverAccount = (await AccountService.getOrInit(
    context,
    {
      address: receiver,
    },
    event
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
    event
  )) as OffRampAddressService;
  await offRampAddress.save(event);
});
