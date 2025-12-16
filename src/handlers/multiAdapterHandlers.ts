import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError } from "../helpers/logger";
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
import { RegistryChains } from "../chains";
import { AdapterParticipationService } from "../services/AdapterParticipationService";

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

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messages = extractMessagesFromPayload(payloadData);
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
        prepareTxHash: event.transaction.hash,
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
    logEvent(event, context, "multiAdapterFile2");

    const chainId = context.chain.id;

    const currentChain = RegistryChains.find(
      (chain) => chain.network.chainId === chainId
    );
    if (!currentChain) throw new Error("Chain not found");

    const { what, centrifugeId, adapters } = event.args;
    const parsedWhat = Buffer.from(what.substring(2), "hex").toString("utf-8");
    if (!parsedWhat.startsWith("adapters")) return;

    const adapterInits: Promise<AdapterService | null>[] = [];
    for (const adapter of adapters) {
      const contracts = Object.entries(currentChain.contracts);
      const [contractName = null] =
        contracts.find(
          ([_, contractObject]) => typeof contractObject === 'object' && contractObject.address.toLowerCase() === adapter
        ) ?? [];
      const firstPart = contractName
        ? contractName.split(/(?=[A-Z])/)[0]
        : null;
      const adapterInit = AdapterService.upsert(
        context,
        {
          address: adapter,
          centrifugeId: centrifugeId.toString(),
          name: firstPart,
        },
        event
      );
      adapterInits.push(adapterInit);
    }
    await Promise.all(adapterInits);
  }
);
