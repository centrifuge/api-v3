import { Service, mixinCommonStatics } from "./Service";
import { InvestorTransaction } from "ponder:schema";
import type { Context, Event } from "ponder:registry";
import { serviceLog, expandInlineObject } from "../helpers/logger";

/**
 * Service class for managing investor transaction records in the database.
 * 
 * Provides static methods for creating various types of investor transactions
 * with appropriate type fields.
 * 
 * @example
 * ```typescript
 * // Create a new investor transaction
 * const investorTransaction = await InvestorTransactionService.init(context, {
 *   type: "DEPOSIT_REQUEST_UPDATED",
 *   data: {
 */
export class InvestorTransactionService extends mixinCommonStatics(
  Service<typeof InvestorTransaction>,
  InvestorTransaction,
  "InvestorTransaction"
) {
  /**
   * Creates an investor transaction record for an updated deposit request.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async updateDepositRequest(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type DEPOSIT_REQUEST_UPDATED with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "DEPOSIT_REQUEST_UPDATED" }, event);
  }

  /**
   * Creates an investor transaction record for an updated redeem request.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async updateRedeemRequest(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog("Creating redeem request", expandInlineObject(data));
    return this.insert(context, { ...data, type: "REDEEM_REQUEST_UPDATED" }, event);
  }

  /**
   * Creates an investor transaction record for a cancelled deposit request.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async cancelDepositRequest(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type DEPOSIT_REQUEST_CANCELLED with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "DEPOSIT_REQUEST_CANCELLED" }, event);
  }

  /**
   * Creates an investor transaction record for a cancelled redeem request.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async cancelRedeemRequest(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type REDEEM_REQUEST_CANCELLED with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "REDEEM_REQUEST_CANCELLED" }, event);
  }

  /**
   * Creates an investor transaction record for an executed deposit request.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
  * @returns Promise resolving to the created investor transaction
   */
  static async executeDepositRequest(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type DEPOSIT_REQUEST_EXECUTED with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "DEPOSIT_REQUEST_EXECUTED" }, event);
  }

  /**
   * Creates an investor transaction record for an executed redeem request.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async executeRedeemRequest(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type REDEEM_REQUEST_EXECUTED with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "REDEEM_REQUEST_EXECUTED" }, event);
  }

  /**
   * Creates an investor transaction record for a claimed deposit.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async claimDeposit(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type DEPOSIT_CLAIMED with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "DEPOSIT_CLAIMED" }, event);
  }

  /**
   * Creates an investor transaction record for a claimed redeem.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async claimRedeem(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type REDEEM_CLAIMED with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "REDEEM_CLAIMED" }, event);
  }

  /**
   * Creates an investor transaction record for a claimable deposit.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async depositClaimable(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type DEPOSIT_CLAIMABLE with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "DEPOSIT_CLAIMABLE" }, event);
  }

  /**
   * Creates an investor transaction record for a claimable redeem.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async redeemClaimable(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type REDEEM_CLAIMABLE with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "REDEEM_CLAIMABLE" }, event);
  }

  /**
   * Creates an investor transaction record for a deposit synchronization event.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async syncDeposit(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type SYNC_DEPOSIT with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "SYNC_DEPOSIT" }, event);
  }

  /**
   * Creates an investor transaction record for a redeem synchronization event.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async syncRedeem(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type SYNC_REDEEM with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "SYNC_REDEEM" }, event);
  }

  /**
   * Creates an investor transaction record for a transfer in.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async transferIn(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type TRANSFER_IN with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "TRANSFER_IN" }, event);
  }

  /**
   * Creates an investor transaction record for a transfer out.
   * 
   * @param context - The Ponder context for database operations
   * @param data - The transaction data excluding the type field
   * @param event - The event containing the block information
   * @returns Promise resolving to the created investor transaction
   */
  static async transferOut(
    context: Context,
    data: InvestorTransactionData,
    event: Event
  ) {
    serviceLog(
      "Creating investor transaction of type TRANSFER_OUT with data:",
      expandInlineObject(data)
    );
    return this.insert(context, { ...data, type: "TRANSFER_OUT" }, event);
  }
}

type InvestorTransactionData = Omit<typeof InvestorTransaction.$inferInsert, "type" | "createdAt" | "createdAtBlock" | "updatedAt" | "updatedAtBlock">