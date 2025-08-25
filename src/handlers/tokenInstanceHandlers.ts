import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import { BlockchainService, TokenInstanceService, TokenInstancePositionService, AccountService
  
 } from "../services";
import { getAddress } from "viem";

ponder.on("TokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "TokenInstance:Transfer");
  const { from, to, value: amount } = event.args
  const chainId = context.chain.id;
  if (typeof chainId !== "number") throw new Error("Chain ID is required");
  const _chainId = chainId.toString();

  const blockchain = (await BlockchainService.get(context, {
    id: _chainId,
  })) as BlockchainService;
  if (!blockchain) throw new Error("Blockchain not found");
  const { centrifugeId } = blockchain.read();

  const tokenInstanceQuery = (await TokenInstanceService.query(context, {
    address: event.log.address,
    centrifugeId,
  })) as TokenInstanceService[];
  const tokenInstance = tokenInstanceQuery.pop();
  if (!tokenInstance) {
    console.error("TokenInstance not found for ", event.log.address) 
    return
  }
  const { tokenId } = tokenInstance.read();


  const isFromNull = BigInt(from) === 0n
  const isToNull = BigInt(to) === 0n

  const fromAccount = isFromNull ? null : await AccountService.getOrInit(context, {
    address: getAddress(from),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  }) as AccountService | null;
  
  const toAccount = isToNull ? null : await AccountService.getOrInit(context, {
    address: getAddress(to),
    createdAt: new Date(Number(event.block.timestamp) * 1000),
    createdAtBlock: Number(event.block.number),
  }) as AccountService | null;

  if (fromAccount) {
    const fromPosition = await TokenInstancePositionService.getOrInit(context, {
      tokenId: tokenId,
      centrifugeId,
      accountAddress: from,
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
      updatedAt: new Date(Number(event.block.timestamp) * 1000),
      updatedAtBlock: Number(event.block.number),
    }) as TokenInstancePositionService;
    fromPosition.subBalance(amount)
    await fromPosition.save()
  }

  if (toAccount) {
    const toPosition = await TokenInstancePositionService.getOrInit(context, {
      tokenId: tokenId,
      centrifugeId,
      accountAddress: to,
      createdAt: new Date(Number(event.block.timestamp) * 1000),
      createdAtBlock: Number(event.block.number),
      updatedAt: new Date(Number(event.block.timestamp) * 1000),
      updatedAtBlock: Number(event.block.number),
    }) as TokenInstancePositionService;
    toPosition.addBalance(amount)
    await toPosition.save()
  }

  if (isFromNull){
    tokenInstance.increaseTotalIssuance(amount)
    await tokenInstance.save()
  }

  if (isToNull){
    tokenInstance.decreaseTotalIssuance(amount)
    await tokenInstance.save()
  }
});