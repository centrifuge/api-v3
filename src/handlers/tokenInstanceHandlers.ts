import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError, serviceLog, serviceWarn } from "../helpers/logger";
import { computeInvestorPositionCheckpoint } from "../helpers/investorPositionCheckpoint";
import {
  BlockchainService,
  DeploymentService,
  TokenInstanceService,
  TokenInstancePositionService,
  AccountService,
  InvestorPositionCheckpointService,
  TokenService,
  InvestorTransactionService,
  EscrowService,
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

  const token = (await TokenService.get(context, { id: tokenId })) as TokenService | null;
  if (!token) return serviceError(`Token not found. Cannot retrieve poolId`);
  const { poolId } = token.read();
  const { tokenPrice } = tokenInstance.read();

  const [isFromNull, isToNull] = [BigInt(from) === 0n, BigInt(to) === 0n];

  const deployment = (await DeploymentService.get(context, {
    chainId: chainId.toString(),
  })) as DeploymentService | null;
  if (!deployment) {
    serviceError(`Deployment not found. Cannot retrieve global escrow address`);
    return;
  }

  const { globalEscrow } = deployment.read();
  if (!globalEscrow) {
    serviceLog(`Global escrow not found. Fall back to tracking all transfers.`);
  }

  const [isFromGlobalEscrow, isToGlobalEscrow] = [
    !!globalEscrow && BigInt(from) === BigInt(globalEscrow.toLowerCase()),
    !!globalEscrow && BigInt(to) === BigInt(globalEscrow.toLowerCase()),
  ];

  const poolEscrowsQuery = await EscrowService.query(context, { centrifugeId, poolId });
  const poolEscrows = poolEscrowsQuery.map((escrow) => BigInt(escrow.read().address));
  const [isFromPoolEscrow, isToPoolEscrow] = [
    poolEscrows.includes(BigInt(from)),
    poolEscrows.includes(BigInt(to)),
  ];

  const [isFromUserAccount, isToUserAccount] = [
    !isFromNull && !isFromGlobalEscrow && !isFromPoolEscrow,
    !isToNull && !isToGlobalEscrow && !isToPoolEscrow,
  ];

  const isSelfTransfer = isFromUserAccount && isToUserAccount && from === to;
  const trigger = "tokenInstance:Transfer" as const;
  const logIndex = event.log.logIndex;

  const handleUserPositionChange = async ({
    accountAddress,
    isIncrease,
  }: {
    accountAddress: `0x${string}`;
    isIncrease: boolean;
  }) => {
    await AccountService.getOrInit(context, { address: accountAddress }, event);

    const positionQuery = {
      tokenId,
      centrifugeId,
      accountAddress,
    } as const;

    let positionWasInitialized = false;
    const position = (await TokenInstancePositionService.getOrInit(
      context,
      positionQuery,
      event,
      async (tokenInstancePosition) => {
        positionWasInitialized = true;
        await initialisePosition(context, event, tokenAddress, tokenInstancePosition);
      }
    )) as TokenInstancePositionService;

    const positionData = position.read();
    const positionAlreadyExisted = !positionWasInitialized;
    const currentBalance = positionData.balance ?? 0n;

    if (!positionAlreadyExisted && !isIncrease) {
      serviceWarn(
        "InvestorPositionCheckpoint invariant violated: first-seen sender position on Transfer",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${event.transaction.hash}`,
        `block=${event.block.number}`,
        `amount=${amount}`
      );
      return;
    }

    const balanceBefore = positionAlreadyExisted ? currentBalance : 0n;
    const balanceAfter = positionAlreadyExisted
      ? isIncrease
        ? currentBalance + amount
        : currentBalance - amount
      : amount;

    if (!positionAlreadyExisted && isIncrease && currentBalance !== amount) {
      serviceWarn(
        "InvestorPositionCheckpoint invariant violated: first-seen recipient balance mismatch",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${event.transaction.hash}`,
        `block=${event.block.number}`,
        `amount=${amount}`,
        `initializedBalance=${currentBalance}`
      );
      return;
    }

    if (tokenPrice === null || tokenPrice <= 0n) {
      serviceWarn(
        "InvestorPositionCheckpoint skipped due to unknown token price",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${event.transaction.hash}`,
        `block=${event.block.number}`,
        `amount=${amount}`
      );
      if (positionAlreadyExisted) {
        await position.setBalance(balanceAfter).save(event);
      }
      return;
    }

    const accounting = computeInvestorPositionCheckpoint({
      amount,
      balanceBefore,
      balanceAfter,
      tokenPrice,
      tokenPriceAtLastChange: positionData.tokenPriceAtLastChange ?? null,
      cumulativeEarningsBefore: positionData.cumulativeEarnings ?? 0n,
      costBasisBefore: positionData.costBasis ?? 0n,
      cumulativeRealizedPnlBefore: positionData.cumulativeRealizedPnl ?? 0n,
      isIncrease,
    });

    await InvestorPositionCheckpointService.createCheckpoint(
      context,
      {
        tokenId,
        centrifugeId,
        accountAddress,
        poolId,
        balanceBefore,
        balanceAfter,
        tokenPrice,
        periodEarnings: accounting.periodEarnings,
        cumulativeEarnings: accounting.cumulativeEarningsAfter,
        costBasisBefore: positionData.costBasis ?? 0n,
        costBasisAfter: accounting.costBasisAfter,
        realizedPnl: accounting.realizedPnl,
        cumulativeRealizedPnl: accounting.cumulativeRealizedPnlAfter,
        trigger,
        logIndex,
      },
      event
    );

    await position
      .applyCheckpointAccounting({
        balanceAfter,
        tokenPrice,
        cumulativeEarnings: accounting.cumulativeEarningsAfter,
        costBasisAfter: accounting.costBasisAfter,
        cumulativeRealizedPnl: accounting.cumulativeRealizedPnlAfter,
      })
      .save(event);
  };

  if (isSelfTransfer) {
    serviceWarn(
      "InvestorPositionCheckpoint skipped for self-transfer",
      `tokenId=${tokenId}`,
      `centrifugeId=${centrifugeId}`,
      `accountAddress=${from}`,
      `txHash=${event.transaction.hash}`,
      `block=${event.block.number}`,
      `amount=${amount}`
    );
  } else {
    if (isFromUserAccount) {
      await handleUserPositionChange({ accountAddress: from, isIncrease: false });
    }

    if (isToUserAccount) {
      await handleUserPositionChange({ accountAddress: to, isIncrease: true });
    }
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
