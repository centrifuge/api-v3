import { Account } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing Account entities in the database.
 *
 * Accounts represent different types of accounts associated with holdings,
 * such as Asset, Equity, Loss, Gain, Expense, and Liability accounts. Each account
 * is linked to a specific token and has a defined account type (kind).
 *
 * This service provides CRUD operations and database interaction utilities
 * for HoldingAccount entities, inheriting common functionality from the base
 * Service class and mixinCommonStatics.
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
export class AccountService extends mixinCommonStatics(
  Service<typeof Account>,
  Account,
  "Account"
) {}
