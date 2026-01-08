import { multiMapper } from "../helpers/multiMapper";
import { expandInlineObject,
logEvent, serviceError,serviceLog } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import {
  CrosschainMessageService,
  getMessageId,
} from "../services/CrosschainMessageService";
import {
  CrosschainPayloadService,
  extractMessagesFromPayload,
} from "../services/CrosschainPayloadService";
import { AdapterService } from "../services/AdapterService";
import { AdapterParticipationService } from "../services/AdapterParticipationService";
import { AdapterWiringService } from "../services";
import { timestamper } from "../helpers/timestamper";
import { getVersionIndexForContract } from "../contracts";

multiMapper("multiAdapter:SendPayload", async ({ event, context }) => {
  logEvent(event, context, "multiAdapterSendPayload");
  const {
    centrifugeId: toCentrifugeId,
    payload: payloadData,
    payloadId,
    adapter,
    // adapterData,
    // refund,
  } = event.args;

  const versionIndex = getVersionIndexForContract("multiAdapter", context.chain.id, event.log.address);
  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messages = extractMessagesFromPayload(payloadData, versionIndex);
  const messageIds = messages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), message)
  );

  let payload = (await CrosschainPayloadService.getUnderpaidFromQueue(
    context,
    payloadId
  )) as CrosschainPayloadService | null;
  
  if (!payload) {
    const payloadIndex = await CrosschainPayloadService.count(context, {
      id: payloadId,
    });
    const poolId = await CrosschainMessageService.linkMessagesToPayload(
      context,
      event,
      messageIds,
      payloadId,
      payloadIndex
    );
    payload = (await CrosschainPayloadService.insert(
      context,
      {
        id: payloadId,
        index: payloadIndex,
        rawData: payloadData,
        status: "InTransit",
        toCentrifugeId: toCentrifugeId.toString(),
        fromCentrifugeId: fromCentrifugeId,
        poolId,
        ...timestamper("prepared", event),
      },
      event
    )) as CrosschainPayloadService;
  }

  const { index: payloadIndex } = payload.read();
  const adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: adapter,
      centrifugeId: fromCentrifugeId,
      fromCentrifugeId: fromCentrifugeId,
      toCentrifugeId: toCentrifugeId.toString(),
      side: "SEND",
      type: "PAYLOAD",
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    },
    event
  )) as AdapterParticipationService | null;
  if (!adapterParticipation)
    serviceError("Failed to initialize adapter participation");
});

multiMapper("multiAdapter:SendProof", async ({ event, context }) => {
  logEvent(event, context, "multiAdapterSendProof");
  const { payloadId, adapter, centrifugeId: toCentrifugeId } = event.args;

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const payload = (await CrosschainPayloadService.getIncompleteFromQueue(
    context,
    payloadId
  )) as CrosschainPayloadService | null;
  if (!payload) {
    serviceError("CrosschainPayload not found");
    return;
  }
  const { index: payloadIndex } = payload.read();

  const _adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: adapter,
      centrifugeId: fromCentrifugeId,
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId: toCentrifugeId.toString(),
      side: "SEND",
      type: "PROOF",
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    },
    event
  )) as AdapterParticipationService;
});

multiMapper("multiAdapter:HandlePayload", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "multiAdapter:HandlePayload");
  const {
    payloadId,
    adapter,
    // adapterData,
    // refund,
    centrifugeId: fromCentrifugeId,
  } = event.args;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const payload =
    (await CrosschainPayloadService.getInTransitFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
  if (!payload) {
    serviceError(`CrosschainPayload ${payloadId} not found`);
    return;
  }

  const { index: payloadIndex } = payload.read();
  const _adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: adapter,
      centrifugeId: toCentrifugeId.toString(),
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId: toCentrifugeId.toString(),
      side: "HANDLE",
      type: "PAYLOAD",
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    },
    event
  )) as AdapterParticipationService;

  const isPayloadVerified = await AdapterParticipationService.checkPayloadVerified(context, payloadId, payloadIndex);
  if (!isPayloadVerified) return;

  payload.delivered(event);
  await payload.save(event);

  const isPayloadFullyExecuted = await CrosschainMessageService.checkPayloadFullyExecuted(context, payloadId, payloadIndex);
  if (!isPayloadFullyExecuted) return;

  payload.completed(event);
  await payload.save(event);
});

multiMapper("multiAdapter:HandleProof", async ({ event, context }) => {
  logEvent(event, context, "multiAdapterHandleProof"); //RECEIVING CHAIN
  const { payloadId, adapter, centrifugeId: fromCentrifugeId } = event.args;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const crosschainPayload =
    (await CrosschainPayloadService.getIncompleteFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(`CrosschainPayload not found in Delivered queue for payloadId ${payloadId}`);
    return;
  }
  const { index: payloadIndex } = crosschainPayload.read();

  const _adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: adapter,
      centrifugeId: toCentrifugeId.toString(),
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId: toCentrifugeId.toString(),
      side: "HANDLE",
      type: "PROOF",
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    },
    event
  )) as AdapterParticipationService;

  const isPayloadVerified = await AdapterParticipationService.checkPayloadVerified(context, payloadId, payloadIndex);
  if (!isPayloadVerified) return;

  crosschainPayload.delivered(event);
  await crosschainPayload.save(event);

  const isPayloadFullyExecuted = await CrosschainMessageService.checkPayloadFullyExecuted(context, payloadId, payloadIndex);
  if (!isPayloadFullyExecuted) return;

  crosschainPayload.completed(event);
  await crosschainPayload.save(event);
});

multiMapper(
  "multiAdapter:File(bytes32 indexed what, uint16 centrifugeId, address[] adapters)",
  async ({ event, context }) => {
    logEvent(event, context, "multiAdapterFile");
    const localCentrifugeId = await BlockchainService.getCentrifugeId(context);
    const { what, centrifugeId: remoteCentrifugeId, adapters } = event.args;
    const parsedWhat = Buffer.from(what.substring(2), "hex").toString("utf-8").replace(/\0/g, '');
    serviceLog("Event data: ", expandInlineObject({parsedWhat, remoteCentrifugeId, adapters}));
    if (parsedWhat !== "adapters") return;

    const localAdapters = ((await AdapterService.query(context, { centrifugeId: localCentrifugeId.toString() })) as AdapterService[]).map((adapter) => adapter.read());
    const adapterWirings: Promise<AdapterWiringService | null>[] = [];
    for (const remoteAdapterAddress of adapters) {
      const remoteAdapter = await AdapterService.get(context, { centrifugeId: remoteCentrifugeId.toString(), address: remoteAdapterAddress });
      if (!remoteAdapter) continue;
      const { name: remoteAdapterName } = remoteAdapter.read();
      const localAdapter = localAdapters.find((localAdapter) => localAdapter.name === remoteAdapterName);
      if (!localAdapter) continue;
      serviceLog(`Wiring adapter ${localAdapter.name} on chain ${localCentrifugeId} to adapter ${remoteAdapterName} on chain ${remoteCentrifugeId}`);
      const adapterWiring = AdapterWiringService.insert(context, {
        fromAddress: localAdapter.address,
        fromCentrifugeId: localCentrifugeId,
        toAddress: remoteAdapterAddress,
        toCentrifugeId: remoteCentrifugeId.toString(),
      }, event) as Promise<AdapterWiringService | null>;
      adapterWirings.push(adapterWiring);
    }
    await Promise.all(adapterWirings);
  }
);
