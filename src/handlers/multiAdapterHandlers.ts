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
import { timestamperWithChain } from "../helpers/timestamper";
import { getVersionForContract } from "../contracts";
import {
  payloadReceiveEntryFromEvent,
  reconcilePayloadReceives,
  runWithSendReconciliation,
} from "../helpers/crosschainReconciliation";

/**
 * Multi-adapter cross-chain delivery differs by registry version — see prior module comment.
 */

multiMapper("multiAdapter:SendPayload", async ({ event, context }) => {
  logEvent(event, context, "multiAdapterSendPayload");
  const {
    centrifugeId: toCentrifugeId,
    payload: payloadData,
    payloadId,
    adapter,
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

  await runWithSendReconciliation(
    context,
    event,
    { messageIds, payloadIds: [payloadId] },
    async () => {
      let payload: CrosschainPayloadService | null = null;

      if (version === "v3_1")
        payload = await CrosschainPayloadService.getUnderpaidOrInTransitFromQueue(
          context,
          payloadId
        );
      else payload = await CrosschainPayloadService.getUnderpaidFromQueue(context, payloadId);

      let payloadIndex: number;
      if (!payload) {
        payloadIndex = await CrosschainPayloadService.nextPayloadIndex(context, payloadId);
        const [poolId, tokenId] = await CrosschainMessageService.linkMessagesToPayload(
          context,
          event,
          messageIds,
          payloadId,
          payloadIndex
        );
        payload = await CrosschainPayloadService.upsertFacts(
          context,
          event,
          { id: payloadId, index: payloadIndex },
          {
            rawData: payloadData,
            toCentrifugeId: toCentrifugeId.toString(),
            fromCentrifugeId,
            poolId,
            tokenId,
            gasLimit,
            gasPrice,
            ...timestamperWithChain("prepared", event, context.chain.id),
            ...timestamperWithChain("repaid", event, context.chain.id),
          }
        );
      } else {
        payloadIndex = payload.read().index;
        await CrosschainMessageService.linkMessagesToPayload(
          context,
          event,
          messageIds,
          payloadId,
          payloadIndex
        );
        await CrosschainPayloadService.upsertFacts(
          context,
          event,
          { id: payloadId, index: payloadIndex },
          {
            ...timestamperWithChain("repaid", event, context.chain.id),
          }
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
    }
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

  await runWithSendReconciliation(context, event, { payloadIds: [payloadId] }, async () => {
    const payload = (await CrosschainPayloadService.getIncompleteFromQueue(
      context,
      payloadId
    )) as CrosschainPayloadService | null;
    if (!payload) return;

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
});

multiMapper("multiAdapter:HandlePayload", async ({ event, context }) => {
  logEvent(event, context, "multiAdapter:HandlePayload");
  const { payloadId, adapter, centrifugeId: fromCentrifugeId } = event.args;

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);

  await reconcilePayloadReceives(context, event, [payloadId], [
    payloadReceiveEntryFromEvent(event, context.chain.id, {
      type: "PAYLOAD",
      payloadId,
      adapterId: (adapter as string).toLowerCase(),
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId,
    }),
  ]);
});

multiMapper("multiAdapter:HandleProof", async ({ event, context }) => {
  logEvent(event, context, "multiAdapterHandleProof");

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

  await reconcilePayloadReceives(context, event, [payloadId], [
    payloadReceiveEntryFromEvent(event, context.chain.id, {
      type: "PROOF",
      payloadId,
      adapterId: (adapter as string).toLowerCase(),
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId,
    }),
  ]);
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

    for (const remoteAdapterAddress of adapters) {
      const remoteAdapter = await AdapterService.get(context, {
        centrifugeId: remoteCentrifugeId.toString(),
        address: remoteAdapterAddress,
      });
      if (!remoteAdapter) {
        for (const localAdapter of localAdapters) {
          await AdapterWiringService.upsertDeferred(
            context,
            {
              fromAddress: localAdapter.address,
              fromCentrifugeId: localCentrifugeId,
              toAddress: remoteAdapterAddress as `0x${string}`,
              pendingRemoteAdapter: remoteAdapterAddress as `0x${string}`,
              toCentrifugeId: remoteCentrifugeId.toString(),
            },
            event
          );
        }
        continue;
      }
      const { name: remoteAdapterName } = remoteAdapter.read();
      const localAdapter = localAdapters.find((la) => la.name === remoteAdapterName);
      if (!localAdapter) continue;
      serviceLog(
        `Wiring adapter ${localAdapter.name} on chain ${localCentrifugeId} to adapter ${remoteAdapterName} on chain ${remoteCentrifugeId}`
      );
      await AdapterWiringService.upsert(
        context,
        {
          fromAddress: localAdapter.address,
          fromCentrifugeId: localCentrifugeId,
          toAddress: remoteAdapterAddress,
          toCentrifugeId: remoteCentrifugeId.toString(),
          ...timestamperWithChain("wired", event, context.chain.id),
        },
        event
      );
    }
    await AdapterWiringService.reconcilePending(context, remoteCentrifugeId.toString());
  }
);
