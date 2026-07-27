import { Token, TokenInstance, TokenInstanceCrosschainInProgressTypes } from "ponder:schema";
import { eq } from "drizzle-orm";
import type { Context, Event } from "ponder:registry";
import { computeInvestorPositionCheckpoint } from "../helpers/investorPositionCheckpoint";
import { serviceError, serviceLog, serviceWarn } from "../helpers/logger";
import { isUserAccount } from "../helpers/userAccount";
import { AccountService } from "./AccountService";
import { BlockchainService } from "./BlockchainService";
import { InvestorPositionCheckpointService } from "./InvestorPositionCheckpointService";
import { InvestorTransactionService } from "./InvestorTransactionService";
import { ReadOnlyContext, Service } from "./Service";
import { TokenInstancePositionService } from "./TokenInstancePositionService";
import { TokenService } from "./TokenService";

const transferTrigger = "tokenInstance:Transfer" as const;

/** Ponder Transfer event shape used by the tokenInstance handler. */
export type TransferEvent = Extract<
  Event,
  { transaction: { hash: `0x${string}` }; log: { logIndex: number } }
> & {
  args: { from: `0x${string}`; to: `0x${string}`; value: bigint };
  log: { address: `0x${string}`; logIndex: number };
};

/** Result of spoke share-class instance initialization. */
export type InitializeShareClassResult = {
  instance: TokenInstanceService;
  prevInstanceIssuance: bigint;
  decimals: number;
};

/** Row shape for token_instance ⟕ token (same as cross-chain route / quote SQL joins). */
export type TokenInstanceWithTokenRow = {
  token_instance: (typeof TokenInstance)["$inferSelect"];
  token: (typeof Token)["$inferSelect"];
};

/**
 * Service class for managing TokenInstance entities in the database.
 * Provides methods for updating token-specific properties like vault ID, token ID,
 * price, issuance amounts, and computation timestamps.
 *
 * Extends the base Service class with TokenInstance-specific functionality
 * extending [`Service`](./Service.ts) with the usual entity static methods.
 */
export class TokenInstanceService extends Service<typeof TokenInstance> {
  static readonly entityTable = TokenInstance;
  static readonly entityName = "TokenInstance";

  /**
   * Initializes or updates a spoke share token instance with decimals set at init.
   * @param context - Ponder context
   * @param event - `spoke:AddShareClass` event
   * @param params - Deployed share token identity, supply snapshot, and init decimals
   */
  static async initializeShareClass(
    context: Context,
    event: Event,
    params: {
      address: `0x${string}`;
      tokenId: `0x${string}`;
      poolId: bigint;
      centrifugeId: string;
      totalSupply: bigint;
      decimals: number;
    }
  ): Promise<InitializeShareClassResult> {
    const { address, tokenId, centrifugeId, totalSupply, decimals } = params;

    const instance = (await TokenInstanceService.getOrInit(
      context,
      { address, tokenId, centrifugeId, decimals },
      event
    )) as TokenInstanceService;

    const prevInstanceIssuance = instance.read().totalIssuance ?? 0n;
    instance.setTotalIssuance(totalSupply);
    instance.setDecimals(decimals);
    serviceLog(
      `TokenInstance initializeShareClass tokenId=${tokenId} centrifugeId=${centrifugeId} decimals=${decimals}`
    );

    return { instance, prevInstanceIssuance, decimals };
  }

  /**
   * All token instances joined to their token row (for bridge route listing).
   */
  /**
   * True when a transfer leg may mutate DB state (mint/burn or a tracked user side).
   */
  static transferNeedsWork(chainId: number, from: `0x${string}`, to: `0x${string}`): boolean {
    if (BigInt(from) === 0n || BigInt(to) === 0n) return true;
    return isUserAccount(chainId, from) || isUserAccount(chainId, to);
  }

  /**
   * Applies issuance, position, checkpoint, and investor-tx effects for one Transfer log.
   */
  static async applyTransfer(context: Context, event: TransferEvent): Promise<void> {
    const txHash = event.transaction?.hash;
    if (!txHash) {
      serviceError("tokenInstance:Transfer missing transaction hash");
      return;
    }

    const chainId = context.chain.id;
    const tokenAddress = event.log.address;
    const { from, to, value: amount } = event.args;
    const logIndex = event.log.logIndex;
    const blockNumber = Number(event.block.number);

    if (!TokenInstanceService.transferNeedsWork(chainId, from, to)) {
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

    let issuanceDirty = false;
    if (BigInt(from) === 0n) {
      tokenInstance.increaseTotalIssuance(amount);
      issuanceDirty = true;
    }
    if (BigInt(to) === 0n) {
      tokenInstance.decreaseTotalIssuance(amount);
      issuanceDirty = true;
    }

    if (issuanceDirty) {
      await tokenInstance.save(event);
      await TokenService.syncTotalIssuanceFromInstances(context, tokenId, event);
    }

    const applyNetPositionChange = async (accountAddress: `0x${string}`, net: bigint) => {
      if (net === 0n) return;

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

      const balanceBefore = currentBalance;
      const balanceAfter = balanceBefore + net;
      const absAmount = net > 0n ? net : -net;
      const isIncrease = net > 0n;

      if (balanceAfter < 0n) {
        serviceError(
          "InvestorPositionCheckpoint impossible state: sender balance below transfer amount",
          `tokenId=${tokenId}`,
          `centrifugeId=${centrifugeId}`,
          `accountAddress=${accountAddress}`,
          `txHash=${txHash}`,
          `block=${blockNumber}`,
          `amount=${absAmount}`,
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
          `txHash=${txHash}`,
          `block=${blockNumber}`,
          `amount=${absAmount}`
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
          `txHash=${txHash}`,
          `block=${blockNumber}`,
          `amount=${absAmount}`
        );
        await position.setBalance(balanceAfter).save(event);
        return;
      }

      const costBasisBefore = positionData.costBasis ?? 0n;

      const accounting = computeInvestorPositionCheckpoint({
        amount: absAmount,
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
          trigger: transferTrigger,
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

    const recordInvestorTransfer = async (accountAddress: `0x${string}`, net: bigint) => {
      if (net === 0n) return;

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
          event
        );
      } else {
        await InvestorTransactionService.transferOut(
          context,
          {
            ...transferBase,
            account: accountAddress,
            fromAccount: accountAddress,
          },
          event
        );
      }
    };

    const userDeltas: Array<{ address: `0x${string}`; net: bigint }> = [];
    if (isUserAccount(chainId, from)) {
      userDeltas.push({ address: from, net: -amount });
    }
    if (isUserAccount(chainId, to)) {
      userDeltas.push({ address: to, net: amount });
    }

    for (const { address, net } of userDeltas) {
      await applyNetPositionChange(address, net);
    }
    for (const { address, net } of userDeltas) {
      await recordInvestorTransfer(address, net);
    }

    serviceLog(`Transfer applied txHash=${txHash} token=${tokenAddress} logIndex=${logIndex}`);
  }

  /**
   * All token instances joined to their token row (for bridge route listing).
   */
  static async listAllJoinedWithToken(
    context: Context | ReadOnlyContext
  ): Promise<TokenInstanceWithTokenRow[]> {
    const db = "sql" in context.db ? context.db.sql : context.db;
    serviceLog(`${this.entityName} listAllJoinedWithToken`);
    const rows = await db
      .select()
      .from(TokenInstance)
      .innerJoin(Token, eq(TokenInstance.tokenId, Token.id));
    serviceLog(`Found ${rows.length} token_instance+token rows`);
    return rows;
  }

  /**
   * Sets the token ID for the current token instance.
   *
   * @param tokenId - The token identifier to assign
   * @returns The service instance for method chaining
   */
  public setTokenId(tokenId: `0x${string}`) {
    serviceLog(`Setting tokenId for token ${this.data.centrifugeId}-${this.data.tokenId}`, tokenId);
    this.data.tokenId = tokenId;
    return this;
  }

  /**
   * Sets the price for the current token instance.
   *
   * @param price - The token price as a bigint value
   * @returns The service instance for method chaining
   */
  public setTokenPrice(price: bigint) {
    serviceLog(
      `Setting token price for token ${this.data.centrifugeId}-${this.data.tokenId}`,
      price
    );
    this.data.tokenPrice = price;
    return this;
  }

  /**
   * Increases the total issuance amount for the current token instance.
   *
   * @param tokenAmount - The amount to add to the total issuance
   * @returns The service instance for method chaining
   * @throws {Error} When total issuance is not set (null)
   */
  public increaseTotalIssuance(tokenAmount: bigint) {
    const { totalIssuance } = this.data;
    this.data.totalIssuance = (totalIssuance ?? 0n) + tokenAmount;
    serviceLog(
      `Increased totalIssuance for token ${this.data.centrifugeId}-${this.data.tokenId} by ${tokenAmount} to ${this.data.totalIssuance}`
    );
    return this;
  }

  /**
   * Decreases the total issuance amount for the current token instance.
   *
   * @param tokenAmount - The amount to subtract from the total issuance
   * @returns The service instance for method chaining
   * @throws {Error} When total issuance is not set (null)
   */
  public decreaseTotalIssuance(tokenAmount: bigint) {
    const { totalIssuance } = this.data;
    this.data.totalIssuance = (totalIssuance ?? 0n) - tokenAmount;
    serviceLog(
      `Decreased totalIssuance for token ${this.data.centrifugeId}-${this.data.tokenId} by ${tokenAmount} to ${this.data.totalIssuance}`
    );
    return this;
  }

  /**
   * Sets the computation timestamp for the current token instance.
   *
   * @param computedAt - The date when the token data was computed
   * @returns The service instance for method chaining
   */
  public setComputedAt(computedAt: Date) {
    serviceLog(
      `Setting computed at for token ${this.data.centrifugeId}-${this.data.tokenId}`,
      computedAt
    );
    this.data.computedAt = computedAt;
    return this;
  }

  /**
   * Sets the total issuance amount for the current token instance.
   *
   * @param tokenAmount - The amount to set as the total issuance
   * @returns The service instance for method chaining
   */
  public setTotalIssuance(tokenAmount: bigint) {
    this.data.totalIssuance = tokenAmount;
    serviceLog(
      `Set totalIssuance for token ${this.data.centrifugeId}-${this.data.tokenId} to ${this.data.totalIssuance}`
    );
    return this;
  }

  /**
   * Sets ERC-20-style decimal places for this share token instance (pool currency decimals).
   * @param decimals - Decimal places for share amounts on this chain
   */
  public setDecimals(decimals: number) {
    serviceLog(
      `Setting decimals for token instance ${this.data.centrifugeId}-${this.data.tokenId} to ${decimals}`
    );
    this.data.decimals = decimals;
    return this;
  }

  /**
   * Activates the token instance by setting its isActive property to true.
   *
   * @returns The service instance for method chaining
   */
  public activate() {
    serviceLog(`Activating token instance ${this.data.centrifugeId}-${this.data.tokenId}`);
    this.data.isActive = true;
    return this;
  }

  /**
   * @param crosschainInProgress - Set when Hub notifies destination of share price update; omit to clear
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof TokenInstanceCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }
}
