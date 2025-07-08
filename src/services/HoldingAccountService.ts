import { HoldingAccount } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing HoldingAccount entities in the database.
 * 
 * HoldingAccount represents different types of accounts associated with holdings,
 * such as Asset, Equity, Loss, Gain, Expense, and Liability accounts. Each account
 * is linked to a specific token and has a defined account type (kind).
 * 
 * This service provides CRUD operations and database interaction utilities
 * for HoldingAccount entities, inheriting common functionality from the base
 * Service class and mixinCommonStatics.
 * 
 * @example
 * ```typescript
 * // Create a new holding account
 * const account = await HoldingAccountService.init(context, {
 *   id: "account-123",
 *   tokenId: "token-456", 
 *   kind: "Asset"
 * });
 * 
 * // Find an existing account
 * const account = await HoldingAccountService.get(context, {
 *   id: "account-123"
 * });
 * 
 * // Query accounts by token
 * const accounts = await HoldingAccountService.query(context, {
 *   tokenId: "token-456"
 * });
 * ```
 */
export class HoldingAccountService extends mixinCommonStatics(Service<typeof HoldingAccount>, HoldingAccount, "HoldingAccount") {
}