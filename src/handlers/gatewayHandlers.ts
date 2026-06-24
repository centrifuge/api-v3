import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError, serviceLog } from "../helpers/logger";
import { BlockchainService, PoolAdapterService } from "../services";
import { timestamperWithChain } from "../helpers/timestamper";
import {
  getCrosschainMessageType,
  CrosschainMessageService,
  getMessageId,
  getMessageHash,
  decodeMessage,
  CROSSCHAIN_MESSAGE_TYPE_STUB,
  CROSSCHAIN_RAW_DATA_STUB,
} from "../services/CrosschainMessageService";
import {
  CrosschainPayloadService,
  getPayloadId,
  extractMessagesFromPayload,
} from "../services/CrosschainPayloadService";
import { getVersionForContract } from "../contracts";
import {
  messageReceiveEntryFromEvent,
  reconcileMessageReceives,
  runWithSendReconciliation,
} from "../helpers/crosschainReconciliation";
import { isLiveIndexingBlock } from "../helpers/liveIndexingWindow";

/**
 * Gateway outbound paths in cfg-protocol:
 * - `gateway.send()` always `emit PrepareMessage` before `_send` / `UnderpaidBatch` (v3.1+ and v3 `send()`).
 * - **v3 only:** `gateway.addUnpaidMessage()` emits `UnderpaidBatch` with no `PrepareMessage`
 *   (`MessageDispatcher.sendExecuteTransferShares`). Same-chain log order is deterministic per path.
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
    if (setPoolAdapters && isLiveIndexingBlock(event.block.timestamp)) {
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
      const key = await CrosschainPayloadService.resolvePayloadKey(
        context,
        payloadId,
        "UnderpaidBatch",
        { deferAllowed: false, messageIds: orderedMessageIds }
      );
      if (key.action === "defer") {
        serviceLog(`UnderpaidBatch: defer late underpaid for ${payloadId} (payload already sent)`);
        return;
      }
      const payloadIndex = key.index;

      const poolIdSet = new Set<bigint>();
      const tokenIdSet = new Set<`0x${string}`>();
      const crosschainMessagesByMessageId =
        await CrosschainMessageService.loadCrosschainMessagesByMessageIds(
          context,
          orderedMessageIds
        );

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]!;
        const messageBuffer = Buffer.from(message.substring(2), "hex");
        const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), version);
        const messagePayload = messageBuffer.subarray(1);

        const messageHash = getMessageHash(message);
        const messageId = orderedMessageIds[i]!;

        const rawData = `0x${Buffer.from(messageBuffer.toString("hex"))}` as `0x${string}`;
        const data = decodeMessage(messageType, messagePayload, version);
        const decodedPoolId = data && "poolId" in data ? BigInt(data.poolId) : null;
        const decodedTokenId = data && "scId" in data ? (data.scId as `0x${string}`) : null;

        const rowsForId = crosschainMessagesByMessageId.get(messageId) ?? [];
        const pendingMessage = CrosschainMessageService.getFirstUnlinkedAwaiting(rowsForId);
        if (pendingMessage) {
          const prior = pendingMessage.read();
          if (prior.poolId != null) poolIdSet.add(prior.poolId);
          if (prior.tokenId != null) tokenIdSet.add(prior.tokenId);
          if (decodedPoolId) poolIdSet.add(decodedPoolId);
          if (decodedTokenId) tokenIdSet.add(decodedTokenId);

          const linkFacts: Parameters<typeof CrosschainMessageService.upsertFacts>[3] = {
            payloadId,
            payloadIndex,
          };
          if (data && (prior.poolId == null || prior.tokenId == null)) {
            if (prior.poolId == null && decodedPoolId != null) linkFacts.poolId = decodedPoolId;
            if (prior.tokenId == null && decodedTokenId != null) linkFacts.tokenId = decodedTokenId;
            if (prior.data == null) linkFacts.data = data;
            if (prior.rawData === CROSSCHAIN_RAW_DATA_STUB) linkFacts.rawData = rawData;
            if (prior.messageType === CROSSCHAIN_MESSAGE_TYPE_STUB)
              linkFacts.messageType = messageType;
            if (!prior.hash) linkFacts.hash = messageHash;
          }

          await CrosschainMessageService.upsertFacts(
            context,
            event,
            { id: messageId, index: prior.index },
            linkFacts
          );
          continue;
        }

        if (!data) {
          serviceLog(`UnderpaidBatch: skip undecodable message ${messageId}`);
          continue;
        }

        if (decodedPoolId) poolIdSet.add(decodedPoolId);
        if (decodedTokenId) tokenIdSet.add(decodedTokenId);

        const messageIndex = i;
        await CrosschainMessageService.upsertFacts(
          context,
          event,
          { id: messageId, index: messageIndex },
          {
            poolId: decodedPoolId,
            tokenId: decodedTokenId,
            fromCentrifugeId,
            toCentrifugeId: toCentrifugeId.toString(),
            messageType,
            rawData,
            data,
            hash: messageHash,
            payloadId,
            payloadIndex,
          }
        );
      }

      const linkedMessages = (await CrosschainMessageService.query(context, {
        payloadId,
        payloadIndex,
      })) as CrosschainMessageService[];
      const linkedMessageIds = new Set(linkedMessages.map((row) => row.read().id));
      const unlinkedBatchIds = orderedMessageIds.filter((id) => !linkedMessageIds.has(id));
      if (unlinkedBatchIds.length > 0) {
        serviceError(
          `UnderpaidBatch: ${unlinkedBatchIds.length} batch message(s) not linked to payload ${payloadId} index ${payloadIndex}`
        );
      }

      const [aggregatedPoolId, aggregatedTokenId] =
        CrosschainMessageService.aggregatePoolAndTokenFromRows(linkedMessages);
      const poolIds = Array.from(poolIdSet);
      if (poolIds.length > 1) {
        serviceError(`Multiple poolIds found. Cannot determine single poolId for payload`);
        return;
      }
      const poolId = poolIds.pop() ?? aggregatedPoolId;
      const tokenId = Array.from(tokenIdSet).pop() ?? aggregatedTokenId;

      if (key.action === "mutate") {
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
            ...timestamperWithChain("underpaid", event, context.chain.id),
          }
        );
        return;
      }

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
          ...timestamperWithChain("underpaid", event, context.chain.id),
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
      const key = await CrosschainPayloadService.resolvePayloadKey(
        context,
        payloadId,
        "RepayBatch",
        { deferAllowed: false, messageIds: batchMessageIds }
      );
      if (key.action !== "mutate") {
        serviceError(`RepayBatch: no open payload row for ${payloadId}`);
        return;
      }
      const payloadIndex = key.index;

      await CrosschainPayloadService.upsertFacts(
        context,
        event,
        { id: payloadId, index: payloadIndex },
        {
          rawData: batch,
          fromCentrifugeId,
          toCentrifugeId: toCentrifugeId.toString(),
        }
      );
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

  await reconcileMessageReceives(
    context,
    event,
    [messageId],
    [
      messageReceiveEntryFromEvent(event, context.chain.id, {
        status: "execute",
        messageId,
        hash: messageHash,
        fromCentrifugeId: fromCentrifugeId.toString(),
        toCentrifugeId,
        rawData: (message ?? "0x") as `0x${string}`,
      }),
    ]
  );
});

multiMapper("gateway:FailMessage", async ({ event, context }) => {
  logEvent(event, context, "gateway:FailMessage");
  const { centrifugeId: fromCentrifugeId, error } = event.args;
  const message = "message" in event.args ? event.args.message : undefined;
  const messageHash =
    "messageHash" in event.args ? event.args.messageHash : getMessageHash(message!);

  const toCentrifugeId = await BlockchainService.getCentrifugeId(context);
  const messageId = getMessageId(fromCentrifugeId.toString(), toCentrifugeId, messageHash);

  await reconcileMessageReceives(
    context,
    event,
    [messageId],
    [
      messageReceiveEntryFromEvent(event, context.chain.id, {
        status: "fail",
        messageId,
        hash: messageHash,
        fromCentrifugeId: fromCentrifugeId.toString(),
        toCentrifugeId,
        failReason: error,
        rawData: (message ?? "0x") as `0x${string}`,
      }),
    ]
  );
});
