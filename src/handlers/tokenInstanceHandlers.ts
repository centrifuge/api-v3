import { ponder } from "ponder:registry";
import { logEvent } from "../helpers/logger";
import {
  BlockchainService,
  TokenInstanceService,
  TokenInstancePositionService,
  AccountService,
  TokenService,
} from "../services";

ponder.on("TokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "TokenInstance:Transfer");
  const { from, to, value: amount } = event.args;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const tokenInstanceQuery = (await TokenInstanceService.query(context, {
    address: event.log.address,
    centrifugeId,
  })) as TokenInstanceService[];
  const tokenInstance = tokenInstanceQuery.pop();
  if (!tokenInstance) {
    console.error("TokenInstance not found for ", event.log.address);
    return;
  }
  const { tokenId } = tokenInstance.read();

  const isFromNull = BigInt(from) === 0n;
  const isToNull = BigInt(to) === 0n;

  const fromAccount = isFromNull
    ? null
    : ((await AccountService.getOrInit(
        context,
        {
          address: from,
        },
        event.block
      )) as AccountService | null);

  const toAccount = isToNull
    ? null
    : ((await AccountService.getOrInit(
        context,
        {
          address: to,
        },
        event.block
      )) as AccountService | null);

  if (fromAccount) {
    const fromPosition = (await TokenInstancePositionService.getOrInit(
      context,
      {
        tokenId: tokenId,
        centrifugeId,
        accountAddress: from,
      },
      event.block
    )) as TokenInstancePositionService;
    fromPosition.subBalance(amount);
    await fromPosition.save(event.block);
  }

  if (toAccount) {
    const toPosition = (await TokenInstancePositionService.getOrInit(context, {
      tokenId: tokenId,
      centrifugeId,
      accountAddress: to,
    }, event.block)) as TokenInstancePositionService;
    toPosition.addBalance(amount);
    await toPosition.save(event.block);
  }

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService | null;
  if (!token) {
    console.error("Token not found for ", tokenId);
    return;
  }

  if (isFromNull) {
    tokenInstance.increaseTotalIssuance(amount);
    await tokenInstance.save(event.block);
    token.increaseTotalIssuance(amount);
    await token.save(event.block);
  }

  if (isToNull) {
    tokenInstance.decreaseTotalIssuance(amount);
    await tokenInstance.save(event.block);
    token.decreaseTotalIssuance(amount);
    await token.save(event.block);
  }
});
