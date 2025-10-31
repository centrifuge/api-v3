import { Token } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";


/**
 * Service class for managing Token entities.
 * Provides methods for activating/deactivating tokens, setting metadata,
 * managing token prices, and controlling total supply.
 *
 * @extends {mixinCommonStatics<Service<typeof Token>, Token, "Token">}
 */
export class TokenService extends mixinCommonStatics(Service<typeof Token>, Token, "Token") {
  /**
   * Activates the token by setting its isActive property to true.
   *
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public activate() {
    console.info(`Activating shareClass ${this.data.id}`);
    this.data.isActive = true;
    return this;
  }

  /**
   * Deactivates the token by setting its isActive property to false.
   *
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public deactivate() {
    console.info(`Deactivating shareClass ${this.data.id}`);
    this.data.isActive = false;
    return this;
  }

  /**
   * Sets the index value for the token.
   *
   * @param {number} index - The index value to set for the token
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public setIndex(index: number) {
    console.info(`Setting index for shareClass ${this.data.id} to ${index}`);
    this.data.index = index;
    return this;
  }

  /**
   * Sets the metadata for the token including name, symbol, and optional salt.
   *
   * @param {string} name - The name of the token
   * @param {string} symbol - The symbol/ticker of the token
   * @param {`0x${string}`} [salt] - Optional salt value as a hex string (0x-prefixed)
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public setMetadata(name: string, symbol: string, salt?: `0x${string}`) {
    console.info(`Setting metadata for shareClass ${this.data.id} to ${name}, ${symbol}`);
    this.data.name = name;
    this.data.symbol = symbol;
    this.data.salt = salt ?? null;
    return this;
  }

  /**
   * Sets the token price in wei (as bigint).
   *
   * @param {bigint} price - The token price in wei
   * @returns {TokenService} The current TokenService instance for method chaining
   */
  public setTokenPrice(price: bigint) {
    console.info(`Setting price for shareClass ${this.data.id} to ${price}`);
    this.data.tokenPrice = price;
    return this;
  }

  /**
   * Increases the totalIssuance of tokens by the specified amount.
   *
   * @param {bigint} tokenAmount - The amount of tokens to add to the totalIssuance
   * @returns {TokenService} The current TokenService instance for method chaining
   * @throws {Error} When totalIssuance is null (not initialized)
   */
  public increaseTotalIssuance(tokenAmount: bigint) {
    if(this.data.totalIssuance === null) throw new Error(`totalIssuance for token ${this.data.id} is not set`);
    this.data.totalIssuance += tokenAmount;
    console.info(`Increased totalIssuance for token ${this.data.id} by ${tokenAmount} to ${this.data.totalIssuance}`);
    return this;
  }

  /**
   * Decreases the totalIssuance of tokens by the specified amount.
   *
   * @param {bigint} tokenAmount - The amount of tokens to subtract from the totalIssuance
   * @returns {TokenService} The current TokenService instance for method chaining
   * @throws {Error} When totalIssuance is null (not initialized)
   */
  public decreaseTotalIssuance(tokenAmount: bigint) {
    if(this.data.totalIssuance === null) throw new Error(`totalIssuance for token ${this.data.id} is not set`);
    this.data.totalIssuance -= tokenAmount;
    console.info(`Decreased totalIssuance for token ${this.data.id} by ${tokenAmount} to ${this.data.totalIssuance}`);
    return this;
  }
}
