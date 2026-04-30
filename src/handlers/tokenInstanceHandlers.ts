import { multiMapper } from "../helpers/multiMapper";
import { logEvent, serviceError, serviceLog, serviceWarn } from "../helpers/logger";
import { computeInvestorPositionCheckpoint } from "../helpers/investorPositionCheckpoint";
import { isUserAccount } from "../helpers/userAccount";
import {
  BlockchainService,
  TokenInstanceService,
  TokenInstancePositionService,
  AccountService,
  InvestorPositionCheckpointService,
  TokenService,
  InvestorTransactionService,
} from "../services";

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
  const { poolId, decimals } = token.read();
  const { tokenPrice } = tokenInstance.read();

  const [isFromNull, isToNull] = [BigInt(from) === 0n, BigInt(to) === 0n];
  const [isFromUserAccount, isToUserAccount] = [
    isUserAccount(chainId, from),
    isUserAccount(chainId, to),
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

    const position = (await TokenInstancePositionService.getOrInit(
      context,
      positionQuery,
      event
    )) as TokenInstancePositionService;

    const positionData = position.read();
    const currentBalance = positionData.balance ?? 0n;

    // First-seen positions are created with `balance = 0` from the schema
    // default, so `currentBalance` is always the pre-Transfer balance — for
    // both newly tracked and existing positions. This works because we index
    // tokens from genesis: every Transfer that ever touched a user-tracked
    // address has been observed by the time we reach the next one.
    //
    // TODO: investor Safes are currently classified as user accounts and reach
    // this branch from a 0 balance bootstrap. Remove them from user-account
    // tracking once `SafeProxyFactory.ProxyCreation` indexing lands.
    const balanceBefore = currentBalance;
    const balanceAfter = isIncrease ? currentBalance + amount : currentBalance - amount;

    if (balanceAfter < 0n) {
      serviceError(
        "InvestorPositionCheckpoint impossible state: sender balance below transfer amount",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${event.transaction.hash}`,
        `block=${event.block.number}`,
        `amount=${amount}`,
        `currentBalance=${currentBalance}`
      );
      return;
    }

    if (decimals === null || decimals === undefined) {
      serviceError(
        "InvestorPositionCheckpoint skipped due to missing token decimals",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${event.transaction.hash}`,
        `block=${event.block.number}`,
        `amount=${amount}`
      );
      await position.setBalance(balanceAfter).save(event);
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
      await position.setBalance(balanceAfter).save(event);
      return;
    }

    const costBasisBefore = positionData.costBasis ?? 0n;

    const accounting = computeInvestorPositionCheckpoint({
      amount,
      balanceBefore,
      balanceAfter,
      tokenPrice,
      tokenDecimals: decimals,
      tokenPriceAtLastChange: positionData.tokenPriceAtLastChange ?? null,
      cumulativeEarningsBefore: positionData.cumulativeEarnings ?? 0n,
      costBasisBefore,
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
        costBasisBefore,
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
    serviceLog(
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
