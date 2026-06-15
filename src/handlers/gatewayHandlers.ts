import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError, serviceLog } from "../helpers/logger";
import { BlockchainService, PoolAdapterService } from "../services";
import { timestamperWithChain } from "../helpers/timestamper";
import {
  messageReceiveEntryFromEvent,
  reconcileMessageReceives,
  runWithSendReconciliation,
} from "../helpers/crosschainReconciliation";

import {
  getCrosschainMessageType,
  CrosschainMessageService,
  getMessageId,
  getMessageHash,
  decodeMessage,
} from "../services/CrosschainMessageService";
import {
  CrosschainPayloadService,
  getPayloadId,
  extractMessagesFromPayload,
} from "../services/CrosschainPayloadService";
import { getVersionForContract } from "../contracts";

/**
 * Gateway outbound batching matches `Gateway.send` in cfg-protocol (`src/core/messaging/Gateway.sol`):
 * `emit PrepareMessage` runs unconditionally at the start of `send` (before batching / `_send`), and
 * `UnderpaidBatch` is only emitted from `_addUnpaidBatch` inside `_send` after that. Same-chain ordering
 * only; under multichain, handlers upsert facts in any order.
 */

multiMapper("gateway:PrepareMessage", async ({ event, context }) => {
  logEvent(event, context, "gateway:PrepareMessage");
  const { centrifugeId: toCentrifugeId, poolId, message } = event.args;

  const version = getVersionForContract("gateway", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");

  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), version);
  const messagePayload = messageBuffer.subarray(1);

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);

  const messageHash = getMessageHash(message);
  const messageId = getMessageId(fromCentrifugeId, toCentrifugeId.toString(), messageHash);

  const awaitingDuplicate = (await CrosschainMessageService.query(context, {
    id: messageId,
    status: "AwaitingBatchDelivery",
    payloadId: null,
    _sort: [{ field: "index", direction: "asc" }],
  })) as CrosschainMessageService[];
  if (awaitingDuplicate.length > 0) {
    logEvent(
      event,
      context,
      `PrepareMessage skipped: ${messageId} already awaiting batch delivery`
    );
    return;
  }

  const rawData = `0x${Buffer.from(messageBuffer.toString("hex"))}` as `0x${string}`;
  const data = decodeMessage(messageType, messagePayload, version);
  const tokenId = data && "scId" in data ? (data.scId! as `0x${string}`) : null;

  await runWithSendReconciliation(context, event, { messageIds: [messageId] }, async () => {
    const messageIndex = await CrosschainMessageService.nextMessageIndex(context, messageId);

    await CrosschainMessageService.upsertFacts(
      context,
      event,
      { id: messageId, index: messageIndex },
      {
        poolId: poolId || null,
        tokenId,
        fromCentrifugeId,
        toCentrifugeId: toCentrifugeId.toString(),
        messageType,
        rawData,
        hash: messageHash,
        data,
        ...timestamperWithChain("prepared", event, context.chain.id),
      }
    );

    const setPoolAdapters = PoolAdapterService.parseSetPoolAdaptersMessageData(data);
    if (setPoolAdapters) {
      await PoolAdapterService.setCrosschainInProgressFromMessage(
        context,
        {
          localCentrifugeId: toCentrifugeId.toString(),
          remoteCentrifugeId: fromCentrifugeId,
          poolId: setPoolAdapters.poolId,
          adapterAddresses: setPoolAdapters.adapterAddresses,
          enabledTransition: true,
        },
        event
      );
    }
  });
});

multiMapper("gateway:UnderpaidBatch", async ({ event, context }) => {
  logEvent(event, context, "gateway:UnderpaidBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;

  const version = getVersionForContract("gateway", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");

  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const payloadId = getPayloadId(fromCentrifugeId, toCentrifugeId.toString(), batch);

  const messages = extractMessagesFromPayload(batch, version);
  const orderedMessageIds = messages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), getMessageHash(message))
  );

  await runWithSendReconciliation(
    context,
    event,
    { messageIds: orderedMessageIds, payloadIds: [payloadId] },
    async () => {
      const alreadyInitialized = (await CrosschainPayloadService.getUnderpaidFromQueue(
        context,
        payloadId
      )) as CrosschainPayloadService | null;

      if (alreadyInitialized) {
        const { index: existingPayloadIndex } = alreadyInitialized.read();
        for (let i = 0; i < orderedMessageIds.length; i++) {
          const messageId = orderedMessageIds[i]!;
          const message = messages[i]!;
          const messageBuffer = Buffer.from(message.substring(2), "hex");
          const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), version);
          const messagePayload = messageBuffer.subarray(1);
          const data = decodeMessage(messageType, messagePayload, version);
          const rowsForId = (await CrosschainMessageService.query(context, {
            id: messageId,
            _sort: [{ field: "index", direction: "asc" }],
          })) as CrosschainMessageService[];
          const pending = CrosschainMessageService.getFirstUnlinkedAwaiting(rowsForId);
          const index = pending?.read().index ?? rowsForId.length;
          await CrosschainMessageService.upsertFacts(context, event, { id: messageId, index }, {
            payloadId,
            payloadIndex: existingPayloadIndex,
            ...timestamperWithChain("batched", event, context.chain.id),
            ...(data && "poolId" in data ? { poolId: BigInt(data.poolId) } : {}),
            ...(data && "scId" in data ? { tokenId: data.scId as `0x${string}` } : {}),
          });
        }
        logEvent(
          event,
          context,
          `UnderpaidBatch already initialized for payloadId ${payloadId}; linked awaiting rows`
        );
        return;
      }

      const payloadIndex = await CrosschainPayloadService.nextPayloadIndex(context, payloadId);

      const poolIdSet = new Set<bigint>();
      const tokenIdSet = new Set<`0x${string}`>();
      const crosschainMessagesByMessageId =
        await CrosschainMessageService.loadCrosschainMessagesByMessageIds(context, orderedMessageIds);
      const pendingInsertsById = new Map<`0x${string}`, number>();

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]!;
        const messageBuffer = Buffer.from(message.substring(2), "hex");
        const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), version);
        const messagePayload = messageBuffer.subarray(1);

        const messageHash = getMessageHash(message);
        const messageId = orderedMessageIds[i]!;

        const rowsForId = crosschainMessagesByMessageId.get(messageId) ?? [];
        const pendingMessage = CrosschainMessageService.getFirstUnlinkedAwaiting(rowsForId);
        if (pendingMessage) {
          await CrosschainMessageService.upsertFacts(
            context,
            event,
            { id: messageId, index: pendingMessage.read().index },
            {
              payloadId,
              payloadIndex,
              ...timestamperWithChain("batched", event, context.chain.id),
            }
          );
          continue;
        }

        const messageIndex = rowsForId.length + (pendingInsertsById.get(messageId) ?? 0);
        const rawData = `0x${Buffer.from(messageBuffer.toString("hex"))}` as `0x${string}`;
        const data = decodeMessage(messageType, messagePayload, version);
        if (!data) {
          serviceLog(`UnderpaidBatch: skip undecodable message ${messageId}`);
          continue;
        }

        const poolId = "poolId" in data ? BigInt(data.poolId) : null;
        if (poolId) poolIdSet.add(poolId);

        const tokenId = "scId" in data ? (data.scId as `0x${string}`) : null;
        if (tokenId) tokenIdSet.add(tokenId);

        await CrosschainMessageService.upsertFacts(context, event, { id: messageId, index: messageIndex }, {
          poolId,
          tokenId,
          fromCentrifugeId,
          toCentrifugeId: toCentrifugeId.toString(),
          messageType,
          rawData,
          data,
          hash: messageHash,
          payloadId,
          payloadIndex,
          ...timestamperWithChain("batched", event, context.chain.id),
        });

        pendingInsertsById.set(messageId, (pendingInsertsById.get(messageId) ?? 0) + 1);
      }

      const poolIds = Array.from(poolIdSet);
      if (poolIds.length > 1) {
        serviceError(`Multiple poolIds found. Cannot determine single poolId for payload`);
        return;
      }
      const poolId = poolIds.pop() ?? null;
      const tokenId = Array.from(tokenIdSet).pop() ?? null;

      await CrosschainPayloadService.upsertFacts(
        context,
        event,
        { id: payloadId, index: payloadIndex },
        {
          poolId,
          tokenId,
          rawData: batch,
          toCentrifugeId: toCentrifugeId.toString(),
          fromCentrifugeId,
          status: "Underpaid",
          ...timestamperWithChain("prepared", event, context.chain.id),
        }
      );
    }
  );
});

multiMapper("gateway:RepayBatch", async ({ event, context }) => {
  logEvent(event, context, "gateway:RepayBatch");
  const { centrifugeId: toCentrifugeId, batch } = event.args;
  const fromCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const payloadId = getPayloadId(fromCentrifugeId, toCentrifugeId.toString(), batch);

  const version = getVersionForContract("gateway", context.chain.id, event.log.address);
  if (!version) return serviceError("Failed to get registry version");

  const batchMessages = extractMessagesFromPayload(batch, version);
  const batchMessageIds = batchMessages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), getMessageHash(message))
  );

  await runWithSendReconciliation(
    context,
    event,
    { messageIds: batchMessageIds, payloadIds: [payloadId] },
    async () => {
      const existingPayload = (await CrosschainPayloadService.query(context, {
        id: payloadId,
        status_in: ["Underpaid", "InTransit"],
        _sort: [{ field: "index", direction: "asc" }],
      })) as CrosschainPayloadService[];

      const payloadIndex =
        existingPayload[0]?.read().index ??
        (await CrosschainPayloadService.nextPayloadIndex(context, payloadId));

      await CrosschainPayloadService.upsertFacts(
        context,
        event,
        { id: payloadId, index: payloadIndex },
        {
          rawData: batch,
          fromCentrifugeId,
          toCentrifugeId: toCentrifugeId.toString(),
          ...timestamperWithChain("repaid", event, context.chain.id),
        }
      );

      const crosschainMessages = (await CrosschainMessageService.query(context, {
        payloadId,
        payloadIndex,
      })) as CrosschainMessageService[];

      for (const crosschainMessage of crosschainMessages) {
        const { id, index } = crosschainMessage.read();
        await CrosschainMessageService.upsertFacts(context, event, { id, index }, {
          ...timestamperWithChain("repaid", event, context.chain.id),
        });
      }
    }
  );
});

multiMapper("gateway:ExecuteMessage", async ({ event, context }) => {
  logEvent(event, context, "gateway:ExecuteMessage");
  const { centrifugeId: fromCentrifugeId } = event.args;
  const message = "message" in event.args ? event.args.message : undefined;
  const messageHash =
    "messageHash" in event.args ? event.args.messageHash : getMessageHash(message!);

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const messageId = getMessageId(fromCentrifugeId.toString(), toCentrifugeId, messageHash);

  await reconcileMessageReceives(context, event, [messageId], [
    messageReceiveEntryFromEvent(event, context.chain.id, {
      status: "execute",
      messageId,
      hash: messageHash,
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId,
      rawData: (message ?? "0x") as `0x${string}`,
    }),
  ]);
});

multiMapper("gateway:FailMessage", async ({ event, context }) => {
  logEvent(event, context, "gateway:FailMessage");
  const { centrifugeId: fromCentrifugeId, error } = event.args;
  const message = "message" in event.args ? event.args.message : undefined;
  const messageHash =
    "messageHash" in event.args ? event.args.messageHash : getMessageHash(message!);

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const messageId = getMessageId(fromCentrifugeId.toString(), toCentrifugeId, messageHash);

  await reconcileMessageReceives(context, event, [messageId], [
    messageReceiveEntryFromEvent(event, context.chain.id, {
      status: "fail",
      messageId,
      hash: messageHash,
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId,
      failReason: error,
      rawData: (message ?? "0x") as `0x${string}`,
    }),
  ]);
});
