import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService } from "../services/BlockchainService";
import {
  CrosschainMessageService,
  getMessageId,
} from "../services/CrosschainMessageService";
import {
  CrosschainPayloadService,
  excractMessagesFromPayload,
} from "../services/CrosschainPayloadService";
import { AdapterService } from "../services/AdapterService";
import { currentChains } from "../../ponder.config";

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

  const messages = excractMessagesFromPayload(payload);
  const messageIds = messages.map((message) =>
    getMessageId(fromCentrifugeId, toCentrifugeId.toString(), message)
  );

  const poolIdSet = new Set<bigint>();
  const crosschainMessageSaves: Promise<CrosschainMessageService>[] = [];

  for (const messageId of messageIds) {
    const crosschainMessages = (await CrosschainMessageService.query(context, {
      id: messageId,
      payloadId: null,
    })) as CrosschainMessageService[];
    if (crosschainMessages.length === 0) {
      console.error(`CrosschainMessage with id ${messageId} not found`);
      continue;
    }
    crosschainMessages.sort((a, b) => a.read().index - b.read().index);
    const crosschainMessage = crosschainMessages.shift()!;
    const { poolId } = crosschainMessage.read();
    crosschainMessage.setPayloadId(payloadId);
    crosschainMessageSaves.push(crosschainMessage.save());
    if (poolId) poolIdSet.add(poolId);
  }

  if (poolIdSet.size > 1) {
    console.error("Multiple pools found");
    return;
  }
  const poolId = Array.from(poolIdSet).pop() ?? null;

  const _crosschainPayload = (await CrosschainPayloadService.init(context, {
    id: payloadId,
    poolId,
    toCentrifugeId: toCentrifugeId.toString(),
    fromCentrifugeId: fromCentrifugeId,
    status: "InProgress",
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
    adapterSending: adapter,
  }).catch((error) => {
    console.error("Error initializing crosschain payload", error);
    return null;
  })) as CrosschainPayloadService | null;
});

ponder.on("MultiAdapter:SendProof", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:SendProof");
  // TODO: connect payloadHash to right batch and the right payloadId and store adapter
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
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  })) as CrosschainPayloadService | null;
  if (!crosschainPayload) {
    console.error("CrosschainPayload not found");
    return;
  }
  const { status } = crosschainPayload.read();
  if (status === "InProgress") crosschainPayload.delivered(event);
  crosschainPayload.setAdapterReceiving(adapter);
  await crosschainPayload.save();
  //TODO: Increase Votes by 1 and mark this adapter as processed successfully
});

ponder.on("MultiAdapter:HandleProof", async ({ event, context }) => {
  logEvent(event, context, "MultiAdapter:HandleProof"); //RECEIVING CHAIN
  // TODO: increase votes for this batch by one
  // TODO: mark this adapter as processed successfully
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
      const adapterInit = AdapterService.init(context, {
        address: adapter,
        centrifugeId: centrifugeId.toString(),
        createdAt: new Date(Number(event.block.timestamp) * 1000),
        createdAtBlock: Number(event.block.number),
        name: firstPart,
      });
      adapterInits.push(adapterInit);
    }
    await Promise.all(adapterInits);
  }
);
