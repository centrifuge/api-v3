import { Account } from "ponder:schema";
import { Service } from "./Service";

/**
 * Service class for managing Account entities in the database.
 *
 * Accounts represent different types of accounts associated with holdings,
 * such as Asset, Equity, Loss, Gain, Expense, and Liability accounts. Each account
 * is linked to a specific token and has a defined account type (kind).
 *
 * This service provides CRUD operations and database interaction utilities
 * for HoldingAccount entities, inheriting common functionality from the base
 * Extends [`Service`](./Service.ts).
 *
 * @example
 * ```typescript
 * // Create a new account
 * const account = await AccountService.insert(context, {
 *   address: "0x...",
 *   centrifugeId: "centrifuge:123",
 *   // ... other account properties
 * });
 */
export class AccountService extends Service<typeof Account> {
  static readonly entityTable = Account;
  static readonly entityName = "Account";}
