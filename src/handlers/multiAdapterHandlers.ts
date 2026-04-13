import { multiMapper } from "../helpers/multiMapper";
import { expandInlineObject, logEvent, serviceError, serviceLog } from "../helpers/logger";
import {
  BlockchainService,
  AdapterService,
  AdapterParticipationService,
  PoolAdapterService,
  AdapterWiringService,
  CrosschainMessageService,
  CrosschainPayloadService,
  getMessageId,
  getMessageHash,
  extractMessagesFromPayload,
} from "../services";
import { effectiveGasPriceFromEvent } from "../helpers/effectiveGasPrice";
import { timestamper } from "../helpers/timestamper";
import { getVersionForContract } from "../contracts";

/**
 * Multi-adapter cross-chain delivery differs by registry version:
 *
 * **v3** — One payload per `payloadId` for the underpaid → in-transit leg (see `getUnderpaidFromQueue`
 * in `SendPayload`), plus **0..n** adapter **proof** rounds (`SendProof` / `HandleProof`) that count
 * toward `AdapterParticipationService.checkPayloadVerified` together with payload sends/handles.
 *
 * **v3_1** — **1..n** payload rows can share the same `payloadId` (different `payloadIndex`);
 * `SendPayload` may attach to an existing in-transit row. There is **no** proof phase on the protocol;
 * `SendProof` / `HandleProof` exit early when the emitting contract is `v3_1`.
 */

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

  const gasLimit = "gasLimit" in event.args ? event.args.gasLimit : null;
  const gasPaid = "gasPaid" in event.args ? event.args.gasPaid : null;
  const gasPrice = effectiveGasPriceFromEvent(event);

  const version = getVersionForContract("multiAdapter", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messages = extractMessagesFromPayload(payloadData, version);
  const messageIds = messages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), getMessageHash(message))
  );

  let payload: CrosschainPayloadService | null = null;

  // v3: at most one underpaid row per payloadId before adapters send. v3_1: multiple indices / resend.
  if (version === "v3_1")
    payload = await CrosschainPayloadService.getUnderpaidOrInTransitFromQueue(context, payloadId);
  else payload = await CrosschainPayloadService.getUnderpaidFromQueue(context, payloadId);

  let payloadIndex: number;
  if (!payload) {
    payloadIndex = await CrosschainPayloadService.count(context, {
      id: payloadId,
    });
    const [poolId, tokenId] = await CrosschainMessageService.linkMessagesToPayload(
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
        tokenId,
        gasLimit,
        gasPrice,
        ...timestamper("prepared", event),
      },
      event
    )) as CrosschainPayloadService;
  } else {
    payloadIndex = payload.read().index;
    await CrosschainMessageService.linkMessagesToPayload(
      context,
      event,
      messageIds,
      payloadId,
      payloadIndex
    );
  }
  await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: (adapter as string).toLowerCase(),
      centrifugeId: fromCentrifugeId,
      fromCentrifugeId: fromCentrifugeId,
      toCentrifugeId: toCentrifugeId.toString(),
      side: "SEND",
      type: "PAYLOAD",
      gasPaid,
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    },
    event
  );
});

multiMapper("multiAdapter:SendProof", async ({ event, context }) => {
  logEvent(event, context, "multiAdapterSendProof");

  const version = getVersionForContract("multiAdapter", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");
  if (version === "v3_1")
    return logEvent(event, context, "multiAdapter:SendProof skipped (v3_1 has no adapter proofs)");

  const { payloadId, adapter, centrifugeId: toCentrifugeId } = event.args;

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const payload = (await CrosschainPayloadService.getIncompleteFromQueue(
    context,
    payloadId
  )) as CrosschainPayloadService | null;
  if (!payload) {
    serviceError(`CrosschainPayload not found in Incomplete queue. Cannot send proof`);
    return;
  }
  const { index: payloadIndex } = payload.read();

  await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: (adapter as string).toLowerCase(),
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
  );
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

  const payload = (await CrosschainPayloadService.getInTransitOrDeliveredFromQueue(
    context,
    payloadId
  )) as CrosschainPayloadService | null;
  if (!payload)
    return serviceError(
      `CrosschainPayload not found in InTransit or Delivered queue. Cannot handle payload`
    );

  const { index: payloadIndex } = payload.read();
  await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: (adapter as string).toLowerCase(),
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
  );

  const isPayloadVerified = await AdapterParticipationService.checkPayloadVerified(
    context,
    payloadId,
    payloadIndex
  );
  if (!isPayloadVerified) return;

  payload.delivered(event);
  await payload.save(event);

  const isPayloadFullyExecuted = await CrosschainMessageService.checkPayloadFullyExecuted(
    context,
    payloadId,
    payloadIndex
  );
  if (!isPayloadFullyExecuted) return;

  payload.completed(event);
  await payload.save(event);
});

multiMapper("multiAdapter:HandleProof", async ({ event, context }) => {
  logEvent(event, context, "multiAdapterHandleProof"); // RECEIVING CHAIN

  const version = getVersionForContract("multiAdapter", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");
  if (version === "v3_1")
    return logEvent(
      event,
      context,
      "multiAdapter:HandleProof skipped (v3_1 has no adapter proofs)"
    );

  const { payloadId, adapter, centrifugeId: fromCentrifugeId } = event.args;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const crosschainPayload = (await CrosschainPayloadService.getIncompleteFromQueue(
    context,
    payloadId
  )) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    serviceError(`CrosschainPayload not found in Incomplete queue. Cannot handle proof`);
    return;
  }
  const { index: payloadIndex } = crosschainPayload.read();

  await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      payloadIndex,
      adapterId: (adapter as string).toLowerCase(),
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
  );

  const isPayloadVerified = await AdapterParticipationService.checkPayloadVerified(
    context,
    payloadId,
    payloadIndex
  );
  if (!isPayloadVerified) return;

  crosschainPayload.delivered(event);
  await crosschainPayload.save(event);

  const isPayloadFullyExecuted = await CrosschainMessageService.checkPayloadFullyExecuted(
    context,
    payloadId,
    payloadIndex
  );
  if (!isPayloadFullyExecuted) return;

  crosschainPayload.completed(event);
  await crosschainPayload.save(event);
});

multiMapper("multiAdapter:SetAdapters", async ({ event, context }) => {
  logEvent(event, context, "multiAdapter:SetAdapters");
  const localCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const { centrifugeId: remoteCentrifugeId, poolId, adapters } = event.args;

  await PoolAdapterService.syncFromSetAdapters(
    context,
    {
      localCentrifugeId,
      remoteCentrifugeId: remoteCentrifugeId.toString(),
      poolId,
      adapterAddresses: adapters.map(
        (adapter) => (adapter as string).toLowerCase() as `0x${string}`
      ),
    },
    event
  );
});

multiMapper(
  "multiAdapter:File(bytes32 indexed what, uint16 centrifugeId, address[] adapters)",
  async ({ event, context }) => {
    logEvent(event, context, "multiAdapterFile");
    const localCentrifugeId = await BlockchainService.getCentrifugeId(context);
    const { what, centrifugeId: remoteCentrifugeId, adapters } = event.args;
    const parsedWhat = Buffer.from(what.substring(2), "hex").toString("utf-8").replace(/\0/g, "");
    serviceLog("Event data: ", expandInlineObject({ parsedWhat, remoteCentrifugeId, adapters }));
    if (parsedWhat !== "adapters") return;

    const localAdapters = (
      (await AdapterService.query(context, {
        centrifugeId: localCentrifugeId.toString(),
      })) as AdapterService[]
    ).map((adapter) => adapter.read());
    const adapterWirings: Promise<AdapterWiringService | null>[] = [];
    for (const remoteAdapterAddress of adapters) {
      const remoteAdapter = await AdapterService.get(context, {
        centrifugeId: remoteCentrifugeId.toString(),
        address: remoteAdapterAddress,
      });
      if (!remoteAdapter) continue;
      const { name: remoteAdapterName } = remoteAdapter.read();
      const localAdapter = localAdapters.find(
        (localAdapter) => localAdapter.name === remoteAdapterName
      );
      if (!localAdapter) continue;
      serviceLog(
        `Wiring adapter ${localAdapter.name} on chain ${localCentrifugeId} to adapter ${remoteAdapterName} on chain ${remoteCentrifugeId}`
      );
      const adapterWiring = AdapterWiringService.insert(
        context,
        {
          fromAddress: localAdapter.address,
          fromCentrifugeId: localCentrifugeId,
          toAddress: remoteAdapterAddress,
          toCentrifugeId: remoteCentrifugeId.toString(),
        },
        event
      ) as Promise<AdapterWiringService | null>;
      adapterWirings.push(adapterWiring);
    }
    await Promise.all(adapterWirings);
  }
);
