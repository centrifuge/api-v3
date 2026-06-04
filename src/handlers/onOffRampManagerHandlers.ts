import { multiMapper } from "../helpers/multiMapper";
import {
  AccountService,
  BlockchainService,
  OffRampAddressService,
  OffRampRelayerService,
  OnOffRampManagerService,
} from "../services";
import { logEvent, serviceError } from "../helpers/logger";
import { AssetService, OnRampAssetService } from "../services";

multiMapper("onOfframpManagerFactory:DeployOnOfframpManager", async ({ event, context }) => {
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
});

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
    serviceError("OnOffRampManager not found. Cannot retrieve poolId and tokenId");
    return;
  }
  const { poolId, tokenId } = onOffRampManager.read();

  const relayerAddress = relayer.substring(0, 42).toLowerCase() as `0x${string}`;
  const offRampRelayer = (await OffRampRelayerService.getOrInit(
    context,
    {
      poolId,
      centrifugeId,
      tokenId,
      address: relayerAddress,
    },
    event,
    undefined,
    true
  )) as OffRampRelayerService;
  await offRampRelayer.setCrosschainInProgress().setEnabled(isEnabled).save(event);
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
    serviceError(`OnOffRampManager not found. Cannot retrieve poolId and tokenId`);
    return;
  }

  const { poolId, tokenId } = onOffRampManager.read();

  // Spoke UpdateOnramp ABI exposes `address asset` only; ERC-20 is tokenId 0 until the contract adds tokenId.
  const indexedAsset = await AssetService.getByToken(context, {
    centrifugeId,
    address: asset,
    assetTokenId: 0n,
  });
  if (!indexedAsset) {
    serviceError(
      `Asset not found for on-ramp update (centrifugeId=${centrifugeId}, address=${asset}, assetTokenId=0)`
    );
    return;
  }
  const { id: assetId } = indexedAsset.read();

  const onRampAsset = (await OnRampAssetService.getOrInit(
    context,
    {
      assetId,
      assetAddress: asset,
      poolId,
      centrifugeId,
      tokenId,
    },
    event,
    undefined,
    true
  )) as OnRampAssetService;
  await onRampAsset.setCrosschainInProgress().setEnabled(isEnabled).save(event);
});

multiMapper("onOfframpManager:UpdateOfframp", async ({ event, context }) => {
  logEvent(event, context, "onOffRampManager:UpdateOfframp");
  const { asset, receiver, isEnabled } = event.args;
  const manager = event.log.address;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const onOffRampManager = (await OnOffRampManagerService.get(context, {
    address: manager,
    centrifugeId,
  })) as OnOffRampManagerService;
  if (!onOffRampManager) {
    serviceError(`OnOffRampManager not found. Cannot retrieve poolId and tokenId`);
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

  const indexedAsset = await AssetService.getByToken(context, {
    centrifugeId,
    address: asset,
    assetTokenId: 0n,
  });
  if (!indexedAsset) {
    serviceError(
      `Asset not found for off-ramp update (centrifugeId=${centrifugeId}, address=${asset}, assetTokenId=0)`
    );
    return;
  }
  const { id: assetId } = indexedAsset.read();

  const offRampAddress = (await OffRampAddressService.getOrInit(
    context,
    {
      poolId,
      centrifugeId,
      tokenId,
      assetId,
      assetAddress: asset,
      receiverAddress,
    },
    event,
    undefined,
    true
  )) as OffRampAddressService;
  await offRampAddress.setCrosschainInProgress().setEnabled(isEnabled).save(event);
});
