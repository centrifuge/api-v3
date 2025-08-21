import { TokenInstancePosition } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing token positions, which represent an account's balance and status for a specific token
 * @extends Service<typeof TokenPosition>
 * 
 * @property {string} tokenId - The ID of the token
 * @property {string} accountAddress - The account address that holds the position
 * @property {bigint} balance - The token balance for this position
 * @property {boolean} isFrozen - Whether the position is frozen
 * @property {Date} createdAt - When the position was created
 * @property {number} createdAtBlock - Block number when position was created
 * @property {Date} updatedAt - When the position was last updated
 * @property {number} updatedAtBlock - Block number of last update
 */
export class TokenInstancePositionService extends mixinCommonStatics(Service<typeof TokenInstancePosition>, TokenInstancePosition, "TokenInstancePosition") {
  /**
   * Adds a balance to the token position.
   * 
   * @param {bigint} balance - The amount to add to the balance
   * @returns {TokenPositionService} The current service instance for method chaining
   */
  public addBalance(balance: bigint) {
    this.data.balance += balance;
    return this;
  }

  /**
   * Subtracts a balance from the token position.
   * 
   * @param {bigint} balance - The amount to subtract from the balance
   * @returns {TokenPositionService} The current service instance for method chaining
   */
  public subBalance(balance: bigint) {
    this.data.balance -= balance;
    return this;
  }

  /**
   * Freezes the token position.
   * 
   * @returns {TokenPositionService} The current service instance for method chaining
   */
  public freeze() {
    this.data.isFrozen = true;
    return this;
  }

  /**
   * Unfreezes the token position.
   * 
   * @returns {TokenPositionService} The current service instance for method chaining
   */
  public unfreeze() {
    this.data.isFrozen = false;
    return this;
  }
}