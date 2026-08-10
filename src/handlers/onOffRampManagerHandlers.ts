import { multiMapper } from "../helpers/multiMapper";
import type { Context, Event } from "ponder:registry";
import {
  AccountService,
  BlockchainService,
  OffRampAddressService,
  OffRampRelayerService,
  OnOffRampManagerService,
} from "../services";
import { logEvent, serviceError } from "../helpers/logger";
import { OnRampAssetService } from "../services";
import { isLiveIndexingBlock } from "../helpers/liveIndexingWindow";
import { formatBytes32ToAddress } from "../helpers/formatter";

/**
 * Deploy event variants handled by {@link deployOnOffRampManager}.
 *
 * `OnOfframpManagerFactory` (pre-rename) emits `DeployOnOfframpManager`; `OnOffRampFactory`
 * (post-rename, protocol commit 41e19975) emits `DeployOnOffRamp`. Both carry
 * `(poolId, scId, manager)` with identical types, so one handler serves both factories.
 */
type DeployOnOffRampManagerEvent = Event<
  | "onOfframpManagerFactoryV3:DeployOnOfframpManager"
  | "onOfframpManagerFactoryV3_1:DeployOnOfframpManager"
  | "onOffRampFactoryV3_1:DeployOnOffRamp"
>;

/**
 * Child update event variants handled by the shared update handlers.
 *
 * `OnOfframpManager` (pre-rename) and `OnOffRamp` (post-rename) expose identical event
 * signatures, so each handler is registered under both the `onOfframpManager:` and `onOffRamp:`
 * namespaces. One type alias per event keeps `event.args` a union of identical-shaped variants.
 */
type UpdateRelayerEvent = Event<
  | "onOfframpManagerV3:UpdateRelayer"
  | "onOfframpManagerV3_1:UpdateRelayer"
  | "onOffRampV3_1:UpdateRelayer"
>;
type UpdateOnrampEvent = Event<
  | "onOfframpManagerV3:UpdateOnramp"
  | "onOfframpManagerV3_1:UpdateOnramp"
  | "onOffRampV3_1:UpdateOnramp"
>;
type UpdateOfframpEvent = Event<
  | "onOfframpManagerV3:UpdateOfframp"
  | "onOfframpManagerV3_1:UpdateOfframp"
  | "onOffRampV3_1:UpdateOfframp"
>;

/**
 * Upserts an `OnOffRampManager` row from a factory deploy event.
 *
 * Handles both `DeployOnOfframpManager` (pre-rename `OnOfframpManagerFactory`) and
 * `DeployOnOffRamp` (post-rename `OnOffRampFactory`); the two events are structurally
 * identical (`poolId`, `scId`, `manager`).
 * @param event - The factory deploy event.
 * @param context - The Ponder handler context.
 */
export async function deployOnOffRampManager({
  event,
  context,
}: {
  event: DeployOnOffRampManagerEvent;
  context: Context;
}): Promise<void> {
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

/**
 * Handles `UpdateRelayer` for both `OnOfframpManager` and `OnOffRamp` children.
 * @param event - The `UpdateRelayer` event.
 * @param context - The Ponder handler context.
 */
export async function updateRelayer({
  event,
  context,
}: {
  event: UpdateRelayerEvent;
  context: Context;
}): Promise<void> {
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

  const relayerAddress = formatBytes32ToAddress(relayer);
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
  offRampRelayer.setEnabled(isEnabled);
  if (isLiveIndexingBlock(event.block.timestamp)) {
    offRampRelayer.setCrosschainInProgress();
  }
  await offRampRelayer.save(event);
}

/**
 * Handles `UpdateOnramp` for both `OnOfframpManager` and `OnOffRamp` children.
 * @param event - The `UpdateOnramp` event.
 * @param context - The Ponder handler context.
 */
export async function updateOnramp({
  event,
  context,
}: {
  event: UpdateOnrampEvent;
  context: Context;
}): Promise<void> {
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

  const onRampAsset = (await OnRampAssetService.getOrInit(
    context,
    {
      assetAddress: asset,
      poolId,
      centrifugeId,
      tokenId,
    },
    event,
    undefined,
    true
  )) as OnRampAssetService;
  onRampAsset.setEnabled(isEnabled);
  if (isLiveIndexingBlock(event.block.timestamp)) {
    onRampAsset.setCrosschainInProgress();
  }
  await onRampAsset.save(event);
}

/**
 * Handles `UpdateOfframp` for both `OnOfframpManager` and `OnOffRamp` children.
 * @param event - The `UpdateOfframp` event.
 * @param context - The Ponder handler context.
 */
export async function updateOfframp({
  event,
  context,
}: {
  event: UpdateOfframpEvent;
  context: Context;
}): Promise<void> {
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
      address: formatBytes32ToAddress(receiver),
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
    event,
    undefined,
    true
  )) as OffRampAddressService;
  offRampAddress.setEnabled(isEnabled);
  if (isLiveIndexingBlock(event.block.timestamp)) {
    offRampAddress.setCrosschainInProgress();
  }
  await offRampAddress.save(event);
}

// Pre-rename factory (OnOfframpManagerFactory) and children.
multiMapper("onOfframpManagerFactory:DeployOnOfframpManager", deployOnOffRampManager);
multiMapper("onOfframpManager:UpdateRelayer", updateRelayer);
multiMapper("onOfframpManager:UpdateOnramp", updateOnramp);
multiMapper("onOfframpManager:UpdateOfframp", updateOfframp);

// Post-rename factory (OnOffRampFactory, protocol commit 41e19975) and children.
// OnOffRamp is ABI-event-compatible with OnOfframpManager, so the same handlers apply.
multiMapper("onOffRampFactory:DeployOnOffRamp", deployOnOffRampManager);
multiMapper("onOffRamp:UpdateRelayer", updateRelayer);
multiMapper("onOffRamp:UpdateOnramp", updateOnramp);
multiMapper("onOffRamp:UpdateOfframp", updateOfframp);
