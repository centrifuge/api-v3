import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
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
import { currentChains } from "../../ponder.config";
import { AdapterParticipationService } from "../services/AdapterParticipationService";

ponder.on("MultiAdapter:SendPayload", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:SendPayload");
  const {
    centrifugeId: toCentrifugeId,
    payload,
    payloadId,
    adapter,
    // adapterData,
    // refund,
  } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: fromCentrifugeId } = blockchain.read();

  const messages = extractMessagesFromPayload(payload);
  const messageIds = messages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), message)
  );

  const poolIdSet = new Set<bigint>();
  const crosschainMessageSaves: Promise<CrosschainMessageService>[] = [];

  for (const messageId of messageIds) {
    const crosschainMessages = (await CrosschainMessageService.query(context, {
      id: messageId,
      payloadId: null,
      _sort: [{ field: "index", direction: "asc" }],
    })) as CrosschainMessageService[];
    if (crosschainMessages.length === 0) {
      console.error(`CrosschainMessage with id ${messageId} not found`);
      continue;
    }
    const crosschainMessage = crosschainMessages.shift()!;
    const { poolId } = crosschainMessage.read();
    crosschainMessage.setPayloadId(payloadId);
    crosschainMessageSaves.push(crosschainMessage.save(event.block));
    if (poolId) poolIdSet.add(poolId);
  }

  if (poolIdSet.size > 1) {
    console.error("Multiple pools found");
    return;
  }
  const poolId = Array.from(poolIdSet).pop() ?? null;

  const crosschainPayload = (await CrosschainPayloadService.insert(
    context,
    {
      id: payloadId,
      poolId,
      toCentrifugeId: toCentrifugeId.toString(),
      fromCentrifugeId: fromCentrifugeId,
      status: "InProgress",
    },
    event.block
  )) as CrosschainPayloadService | null;
  if (!crosschainPayload)
    console.error("Failed to initialize crosschain payload");

  const adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
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
    event.block
  )) as AdapterParticipationService | null;
  if (!adapterParticipation)
    console.error("Failed to initialize adapter participation");
});

ponder.on("MultiAdapter:SendProof", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:SendProof");
  const { payloadId, adapter, centrifugeId: toCentrifugeId } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: fromCentrifugeId } = blockchain.read();

  const _adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      adapterId: adapter,
      centrifugeId: fromCentrifugeId,
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId: toCentrifugeId.toString(),
      side: "SEND",
      type: "PROOF",
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    }, event.block
  )) as AdapterParticipationService;
});

ponder.on("MultiAdapter:HandlePayload", async ({ event, context }) => {
  // RECEIVING CHAIN
  logEvent(event, context, "MultiAdapter:HandlePayload");
  const {
    payloadId,
    adapter,
    // adapterData,
    // refund,
    centrifugeId: fromCentrifugeId,
  } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: toCentrifugeId } = blockchain.read();
  const crosschainPayload = (await CrosschainPayloadService.get(context, {
    id: payloadId,
    toCentrifugeId: toCentrifugeId,
    fromCentrifugeId: fromCentrifugeId.toString(),
  })) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    console.error("CrosschainPayload not found");
    return;
  }
  const { status } = crosschainPayload.read();
  if (status === "InProgress") crosschainPayload.delivered(event);
  await crosschainPayload.save(event.block);

  const _adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      adapterId: adapter,
      centrifugeId: toCentrifugeId.toString(),
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId: toCentrifugeId.toString(),
      side: "HANDLE",
      type: "PAYLOAD",
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    }, event.block
  )) as AdapterParticipationService;

  const handleCounts = await AdapterParticipationService.count(context, {
    payloadId,
    side: "HANDLE",
  });
  if (handleCounts >= 2) {
    crosschainPayload.setStatus("Delivered");
    await crosschainPayload.save(event.block);
  }
});

ponder.on("MultiAdapter:HandleProof", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:HandleProof"); //RECEIVING CHAIN
  const { payloadId, adapter, centrifugeId: fromCentrifugeId } = event.args;
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: toCentrifugeId } = blockchain.read();

  const _adapterParticipation = (await AdapterParticipationService.insert(
    context,
    {
      payloadId,
      adapterId: adapter,
      centrifugeId: toCentrifugeId.toString(),
      fromCentrifugeId: fromCentrifugeId.toString(),
      toCentrifugeId: toCentrifugeId.toString(),
      side: "HANDLE",
      type: "PROOF",
      timestamp: new Date(Number(event.block.timestamp) * 1000),
      blockNumber: Number(event.block.number),
      transactionHash: event.transaction.hash,
    }, event.block
  )) as AdapterParticipationService;

  const handleCounts = await AdapterParticipationService.count(context, {
    payloadId,
    side: "HANDLE",
  });

  if (handleCounts >= 2) {
    const crosschainPayload = (await CrosschainPayloadService.get(context, {
      id: payloadId,
    })) as CrosschainPayloadService | null;
    if (!crosschainPayload) {
      console.error(`CrosschainPayload for payloadId ${payloadId} not found`);
      return;
    }
    crosschainPayload.setStatus("Delivered");
    await crosschainPayload.save(event.block);
  }
});

ponder.on(
  "MultiAdapter:File(bytes32 indexed what, uint16 centrifugeId, address[] adapters)",
  async ({ event, context }) => {
    logEvent(event, context, "MultiAdapter:File2");

    const chainId = context.chain.id;
    if (typeof chainId !== "number") throw new Error("Chain ID is required");

    const currentChain = currentChains.find(
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
        contracts.find(([_, contractAddress]) => contractAddress === adapter) ??
        [];
      const firstPart = contractName
        ? contractName.split(/(?=[A-Z])/)[0]
        : null;
      const adapterInit = AdapterService.insert(
        context,
        {
          address: adapter,
          centrifugeId: centrifugeId.toString(),
          name: firstPart,
        },
        event.block
      );
      adapterInits.push(adapterInit);
    }
    await Promise.all(adapterInits);
  }
);
