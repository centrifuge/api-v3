import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService, TokenInstancePositionService } from "../services";
import { getAddress } from "viem";

enum RestrictionType {
  "Invalid",
  "Member",
  "Freeze",
  "Unfreeze",
}

ponder.on("Hub:UpdateRestriction", async ({ event, context }) => {
  logEvent(event, context, "Hub:UpdateRestriction");
  const {
    centrifugeId: spokeCentrifugeId,
    scId: tokenId,
    payload,
  } = event.args;

  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");

  const blockchain = (await BlockchainService.get(context, {
    id: chainId.toString(),
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId: _hubCentrifugeId } = blockchain.read();

  const dataBuffer = Buffer.from(payload.slice(2), "hex");
  const restrictionType = dataBuffer.readUInt8(0);
  const accountBuffer = dataBuffer.subarray(1,21);

  const accountAddress =
    accountBuffer.length > 0 ? getAddress(`0x${accountBuffer.toString("hex")}`) : null;
  if (!accountAddress) {
    console.error("Account address is null");
    return;
  }

  const tokenInstancePosition = (await TokenInstancePositionService.getOrInit(
    context,
    {
      tokenId,
      centrifugeId: spokeCentrifugeId.toString(),
      accountAddress,
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
      updatedAt: new Date(Number(event.block.timestamp) * 1000),
      updatedAtBlock: Number(event.block.number),
    }
  )) as TokenInstancePositionService;

  switch (restrictionType) {
    case RestrictionType.Freeze:
      tokenInstancePosition.freeze();
      await tokenInstancePosition.save();
      break;
    case RestrictionType.Unfreeze:
      tokenInstancePosition.unfreeze();
      await tokenInstancePosition.save();
      break;
    default:
      break;
  }
});
