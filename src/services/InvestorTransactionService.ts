import { Service, mixinCommonStatics } from "./Service";
import { InvestorTransaction } from "ponder:schema";
import type { Context } from "ponder:registry";

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
   * @returns Promise resolving to the created investor transaction
   */
  static async updateDepositRequest(
    context: Context,
    data: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type DEPOSIT_REQUEST_UPDATED with data:",
      data
    );
    return this.insert(context, { ...data, type: "DEPOSIT_REQUEST_UPDATED" });
  }

  /**
   * Creates an investor transaction record for an updated redeem request.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async updateRedeemRequest(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info("Creating redeem request", query);
    return this.insert(context, { ...query, type: "REDEEM_REQUEST_UPDATED" });
  }

  /**
   * Creates an investor transaction record for a cancelled deposit request.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async cancelDepositRequest(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type DEPOSIT_REQUEST_CANCELLED with data:",
      query
    );
    return this.insert(context, { ...query, type: "DEPOSIT_REQUEST_CANCELLED" });
  }

  /**
   * Creates an investor transaction record for a cancelled redeem request.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async cancelRedeemRequest(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type REDEEM_REQUEST_CANCELLED with data:",
      query
    );
    return this.insert(context, { ...query, type: "REDEEM_REQUEST_CANCELLED" });
  }

  /**
   * Creates an investor transaction record for an executed deposit request.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async executeDepositRequest(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type DEPOSIT_REQUEST_EXECUTED with data:",
      query
    );
    return this.insert(context, { ...query, type: "DEPOSIT_REQUEST_EXECUTED" });
  }

  /**
   * Creates an investor transaction record for an executed redeem request.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async executeRedeemRequest(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type REDEEM_REQUEST_EXECUTED with data:",
      query
    );
    return this.insert(context, { ...query, type: "REDEEM_REQUEST_EXECUTED" });
  }

  /**
   * Creates an investor transaction record for a claimed deposit.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async claimDeposit(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type DEPOSIT_CLAIMED with data:",
      query
    );
    return this.insert(context, { ...query, type: "DEPOSIT_CLAIMED" });
  }

  /**
   * Creates an investor transaction record for a claimed redeem.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async claimRedeem(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type REDEEM_CLAIMED with data:",
      query
    );
    return this.insert(context, { ...query, type: "REDEEM_CLAIMED" });
  }

  /**
   * Creates an investor transaction record for a claimable deposit.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async depositClaimable(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type DEPOSIT_CLAIMABLE with data:",
      query
    );
    return this.insert(context, { ...query, type: "DEPOSIT_CLAIMABLE" });
  }

  /**
   * Creates an investor transaction record for a claimable redeem.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async redeemClaimable(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type REDEEM_CLAIMABLE with data:",
      query
    );
    return this.insert(context, { ...query, type: "REDEEM_CLAIMABLE" });
  }

  /**
   * Creates an investor transaction record for a deposit synchronization event.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async syncDeposit(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type SYNC_DEPOSIT with data:",
      query
    );
    return this.insert(context, { ...query, type: "SYNC_DEPOSIT" });
  }

  /**
   * Creates an investor transaction record for a redeem synchronization event.
   * 
   * @param context - The Ponder context for database operations
   * @param query - The transaction data excluding the type field
   * @returns Promise resolving to the created investor transaction
   */
  static async syncRedeem(
    context: Context,
    query: Omit<typeof InvestorTransaction.$inferInsert, "type">
  ) {
    console.info(
      "Creating investor transaction of type SYNC_REDEEM with data:",
      query
    );
    return this.insert(context, { ...query, type: "SYNC_REDEEM" });
  }
}
