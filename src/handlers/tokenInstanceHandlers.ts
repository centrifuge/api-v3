import { multiMapper } from "../helpers/multiMapper";
import { logEvent,serviceError } from "../helpers/logger";
import {
  BlockchainService,
  TokenInstanceService,
  TokenInstancePositionService,
  AccountService,
  TokenService,
  InvestorTransactionService,
} from "../services";
import { initialisePosition } from "../services/TokenInstancePositionService";

multiMapper("tokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "tokenInstance:Transfer");
  const { from, to, value: amount } = event.args;
  const { address: tokenAddress } = event.log;

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const tokenInstanceQuery = (await TokenInstanceService.query(context, {
    address: tokenAddress,
    centrifugeId,
  })) as TokenInstanceService[];
  const tokenInstance = tokenInstanceQuery.pop();
  if (!tokenInstance) {
    serviceError("TokenInstance not found for ", event.log.address);
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
        event
      )) as AccountService | null);

  const toAccount = isToNull
    ? null
    : ((await AccountService.getOrInit(
        context,
        {
          address: to,
        },
        event
      )) as AccountService | null);

  if (fromAccount) {
    const fromPosition = (await TokenInstancePositionService.getOrInit(
      context,
      {
        tokenId: tokenId,
        centrifugeId,
        accountAddress: from,
      },
      event,
      async (tokenInstancePosition) => await initialisePosition(context, tokenAddress, tokenInstancePosition)
    )) as TokenInstancePositionService;
    const { createdAtBlock } = fromPosition.read();
    if (!createdAtBlock) {serviceError("TokenInstancePosition not found for ", event.log.address); return;}
    if(createdAtBlock < Number(event.block.number)) fromPosition.subBalance(amount);
    await fromPosition.save(event);
  }

  if (toAccount) {
    const toPosition = (await TokenInstancePositionService.getOrInit(
      context,
      {
        tokenId: tokenId,
        centrifugeId,
        accountAddress: to,
      },
      event,
      async (tokenInstancePosition) => await initialisePosition(context, tokenAddress, tokenInstancePosition)
    )) as TokenInstancePositionService;
    const { createdAtBlock } = toPosition.read();
    if (!createdAtBlock) {serviceError("TokenInstancePosition not found for ", event.log.address); return;}
    if(createdAtBlock < Number(event.block.number)) toPosition.addBalance(amount);
    await toPosition.save(event);
  }

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService | null;
  if (!token) {
    serviceError("Token not found for ", tokenId);
    return;
  }

  if (isFromNull) {
    tokenInstance.increaseTotalIssuance(amount);
    await tokenInstance.save(event);
    token.increaseTotalIssuance(amount);
    await token.save(event);
  }

  if (isToNull) {
    tokenInstance.decreaseTotalIssuance(amount);
    await tokenInstance.save(event);
    token.decreaseTotalIssuance(amount);
    await token.save(event);
  }

  // Handle transfers
  if (!!fromAccount && !!toAccount) {
    const token = await TokenService.get(context, { id: tokenId });
    if (!token) {
      serviceError("Token not found for ", tokenId);
      return;
    }
    const { poolId } = token.read();
    const transferData = {
      poolId: poolId,
      tokenId: tokenId,
      tokenAmount: amount,
      txHash: event.transaction.hash,
      centrifugeId,
      fromAccount: from,
      toAccount: to,
      fromCentrifugeId: centrifugeId,
      toCentrifugeId: centrifugeId,
    } as const;
    await Promise.all([
      InvestorTransactionService.transferIn(
        context,
        {
          ...transferData,
          account: to,
        },
        event
      ),
      InvestorTransactionService.transferOut(
        context,
        {
          ...transferData,
          account: from,
        },
        event
      ),
    ]);
  }
});
