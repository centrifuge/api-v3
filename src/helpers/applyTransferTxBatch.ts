import type { Context } from "ponder:registry";
import { computeInvestorPositionCheckpoint } from "./investorPositionCheckpoint";
import { serviceError, serviceLog, serviceWarn } from "./logger";
import { isUserAccount } from "./userAccount";
import {
  batchNeedsWork,
  maxLogIndex,
  computeNetDeltas,
  type TransferTxBatch,
} from "./transferTxBuffer";
import {
  BlockchainService,
  TokenInstanceService,
  TokenInstancePositionService,
  AccountService,
  InvestorPositionCheckpointService,
  TokenService,
  InvestorTransactionService,
} from "../services";

const trigger = "tokenInstance:Transfer" as const;

/**
 * Applies net-delta position, checkpoint, issuance, and investor-tx effects for one flushed batch.
 */
export async function applyTransferTxBatch(
  context: Context,
  batch: TransferTxBatch
): Promise<void> {
  const { chainId, tokenAddress, legs, anchorEvent } = batch;

  if (!batchNeedsWork(chainId, legs)) {
    return;
  }

  const centrifugeId = await BlockchainService.getCentrifugeId(context);

  const tokenInstance = (await TokenInstanceService.get(context, {
    address: tokenAddress,
    centrifugeId,
  })) as TokenInstanceService | null;
  if (!tokenInstance) {
    serviceError(`TokenInstance not found. Cannot retrieve tokenId`);
    return;
  }
  const { tokenId, tokenPrice, decimals: tokenDecimals } = tokenInstance.read();

  const token = (await TokenService.get(context, { id: tokenId })) as TokenService | null;
  if (!token) {
    serviceWarn(`Token not found for tokenInstance transfer tokenId=${tokenId}`);
    return;
  }
  const { poolId } = token.read();

  const logIndex = maxLogIndex(legs);
  let issuanceDirty = false;

  for (const leg of legs) {
    if (BigInt(leg.from) === 0n) {
      tokenInstance.increaseTotalIssuance(leg.amount);
      issuanceDirty = true;
    }
    if (BigInt(leg.to) === 0n) {
      tokenInstance.decreaseTotalIssuance(leg.amount);
      issuanceDirty = true;
    }
  }

  if (issuanceDirty) {
    await tokenInstance.save(anchorEvent);
    await TokenService.syncTotalIssuanceFromInstances(context, tokenId, anchorEvent);
  }

  const netDeltas = computeNetDeltas(legs);

  const applyNetPositionChange = async (accountAddress: `0x${string}`, net: bigint) => {
    if (net === 0n) return;

    await AccountService.getOrInit(context, { address: accountAddress }, anchorEvent);

    const positionQuery = {
      tokenId,
      centrifugeId,
      accountAddress,
    } as const;

    const position = (await TokenInstancePositionService.getOrInit(
      context,
      positionQuery,
      anchorEvent
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
    const balanceAfter = balanceBefore + net;
    const amount = net > 0n ? net : -net;
    const isIncrease = net > 0n;

    if (balanceAfter < 0n) {
      serviceError(
        "InvestorPositionCheckpoint impossible state: sender balance below transfer amount",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${batch.txHash}`,
        `block=${batch.blockNumber}`,
        `amount=${amount}`,
        `currentBalance=${currentBalance}`
      );
      return;
    }

    if (tokenDecimals === undefined) {
      serviceError(
        "InvestorPositionCheckpoint skipped due to missing token decimals",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${batch.txHash}`,
        `block=${batch.blockNumber}`,
        `amount=${amount}`
      );
      await position.setBalance(balanceAfter).save(anchorEvent);
      return;
    }

    if (tokenPrice === null || tokenPrice <= 0n) {
      serviceWarn(
        "InvestorPositionCheckpoint skipped due to unknown token price",
        `tokenId=${tokenId}`,
        `centrifugeId=${centrifugeId}`,
        `accountAddress=${accountAddress}`,
        `txHash=${batch.txHash}`,
        `block=${batch.blockNumber}`,
        `amount=${amount}`
      );
      await position.setBalance(balanceAfter).save(anchorEvent);
      return;
    }

    const costBasisBefore = positionData.costBasis ?? 0n;

    const accounting = computeInvestorPositionCheckpoint({
      amount,
      balanceBefore,
      balanceAfter,
      tokenPrice,
      tokenDecimals,
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
      anchorEvent
    );

    await position
      .applyCheckpointAccounting({
        balanceAfter,
        tokenPrice,
        cumulativeEarnings: accounting.cumulativeEarningsAfter,
        costBasisAfter: accounting.costBasisAfter,
        cumulativeRealizedPnl: accounting.cumulativeRealizedPnlAfter,
      })
      .save(anchorEvent);
  };

  for (const [addressKey, net] of netDeltas) {
    if (net === 0n) continue;
    const accountAddress = addressKey as `0x${string}`;
    if (!isUserAccount(chainId, accountAddress)) continue;
    await applyNetPositionChange(accountAddress, net);
  }

  for (const [addressKey, net] of netDeltas) {
    if (net === 0n) continue;
    const accountAddress = addressKey as `0x${string}`;
    if (!isUserAccount(chainId, accountAddress)) continue;

    const transferBase = {
      poolId,
      tokenId,
      tokenAmount: net > 0n ? net : -net,
      centrifugeId,
      fromCentrifugeId: centrifugeId,
      toCentrifugeId: centrifugeId,
    } as const;

    if (net > 0n) {
      await InvestorTransactionService.transferIn(
        context,
        {
          ...transferBase,
          account: accountAddress,
          toAccount: accountAddress,
        },
        anchorEvent
      );
    } else {
      await InvestorTransactionService.transferOut(
        context,
        {
          ...transferBase,
          account: accountAddress,
          fromAccount: accountAddress,
        },
        anchorEvent
      );
    }
  }

  serviceLog(
    `TransferTxBatch applied txHash=${batch.txHash} token=${tokenAddress} legs=${legs.length}`
  );
}
