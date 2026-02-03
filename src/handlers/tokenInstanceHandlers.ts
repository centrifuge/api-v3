import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError, serviceLog } from "../helpers/logger";
import {
  BlockchainService,
  DeploymentService,
  TokenInstanceService,
  TokenInstancePositionService,
  AccountService,
  TokenService,
  InvestorTransactionService,
} from "../services";
import { initialisePosition } from "../services";

multiMapper("tokenInstance:Transfer", async ({ event, context }) => {
  logEvent(event, context, "tokenInstance:Transfer");
  const { from, to, value: amount } = event.args;
  const { address: tokenAddress } = event.log;

  const chainId = context.chain.id;
  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const tokenInstanceQuery = (await TokenInstanceService.query(context, {
    address: tokenAddress,
    centrifugeId,
  })) as TokenInstanceService[];
  const tokenInstance = tokenInstanceQuery.pop();
  if (!tokenInstance) {
    serviceError(`TokenInstance not found. Cannot retrieve tokenId`);
    return;
  }
  const { tokenId } = tokenInstance.read();

  const [isFromNull, isToNull] = [BigInt(from) === 0n, BigInt(to) === 0n];

  const deployment = (await DeploymentService.get(context, {
    chainId: chainId.toString(),
  })) as DeploymentService | null;
  if (!deployment) {
    serviceError(`Deployment not found. Cannot retrieve global escrow address`);
    return;
  }

  // TODO: Implement filtering based on poolEscrows for V3.1
  const { globalEscrow } = deployment.read();
  if (!globalEscrow) {
    serviceLog(`Global escrow not found. Fall back to tracking all transfers.`);
  }

  const [isFromGlobalEscrow, isToGlobalEscrow] = [
    !!globalEscrow && BigInt(from) === BigInt(globalEscrow.toLowerCase()),
    !!globalEscrow && BigInt(to) === BigInt(globalEscrow.toLowerCase()),
  ];

  const [isFromUserAccount, isToUserAccount] = [
    !isFromNull && !isFromGlobalEscrow,
    !isToNull && !isToGlobalEscrow,
  ];

  if (isFromUserAccount) {
    const _fromAccount = await AccountService.getOrInit(context, { address: from }, event);
    const fromPosition = (await TokenInstancePositionService.getOrInit(
      context,
      {
        tokenId: tokenId,
        centrifugeId,
        accountAddress: from,
      },
      event,
      async (tokenInstancePosition) =>
        await initialisePosition(context, tokenAddress, tokenInstancePosition)
    )) as TokenInstancePositionService;
    const { createdAtBlock } = fromPosition.read();
    if (!createdAtBlock) {
      serviceError(`TokenInstancePosition not found. Cannot update balance`);
      return;
    }
    if (createdAtBlock < Number(event.block.number)) fromPosition.subBalance(amount);
    await fromPosition.save(event);
  }

  if (isToUserAccount) {
    const _toAccount = await AccountService.getOrInit(context, { address: to }, event);
    const toPosition = (await TokenInstancePositionService.getOrInit(
      context,
      {
        tokenId: tokenId,
        centrifugeId,
        accountAddress: to,
      },
      event,
      async (tokenInstancePosition) =>
        await initialisePosition(context, tokenAddress, tokenInstancePosition)
    )) as TokenInstancePositionService;
    const { createdAtBlock } = toPosition.read();
    if (!createdAtBlock) {
      serviceError(`TokenInstancePosition not found. Cannot update balance`);
      return;
    }
    if (createdAtBlock < Number(event.block.number)) toPosition.addBalance(amount);
    await toPosition.save(event);
  }

  const token = (await TokenService.get(context, {
    id: tokenId,
  })) as TokenService | null;
  if (!token) {
    serviceError(`Token not found. Cannot update total issuance`);
    return;
  }

  // Handle tokenInstance and token total issuance change
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

  // Handle transfers IN and OUT
  if (isFromUserAccount && isToUserAccount) {
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
