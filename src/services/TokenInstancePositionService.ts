import { TokenInstancePosition } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { ERC20Abi } from "../abis";
import { Context } from "ponder:registry";
import { serviceLog } from "../helpers/logger";

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
  public addBalance(amount: bigint) {
    this.data.balance += amount;
    return this;
  }

  /**
   * Subtracts a balance from the token position.
   * 
   * @param {bigint} balance - The amount to subtract from the balance
   * @returns {TokenPositionService} The current service instance for method chaining
   */
  public subBalance(amount: bigint) {
    this.data.balance -= amount;
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

/**
 * Initialises a token instance position by getting the initial balance of the token.
 * @param context - The context object
 * @param tokenAddress - The address of the token
 * @param tokenInstance - The token instance position data
 */
export async function initialisePosition(context: Context, tokenAddress: `0x${string}`, tokenInstancePosition: TokenInstancePositionService['data']) {
  const { accountAddress } = tokenInstancePosition;
  const balance = await context.client.readContract({
    abi: ERC20Abi,
    address: tokenAddress,
    functionName: "balanceOf",
    args: [accountAddress],
  });
  serviceLog(`Setting initial balance for account ${accountAddress} of token ${tokenAddress} to ${balance}`);
  tokenInstancePosition.balance = balance;
}