import { TokenInstance } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing TokenInstance entities in the database.
 * Provides methods for updating token-specific properties like vault ID, token ID,
 * price, issuance amounts, and computation timestamps.
 * 
 * Extends the base Service class with TokenInstance-specific functionality
 * and inherits common static methods through mixinCommonStatics.
 */
export class TokenInstanceService extends mixinCommonStatics(Service<typeof TokenInstance>, TokenInstance, "TokenInstance") {
  /**
   * Sets the token ID for the current token instance.
   * 
   * @param tokenId - The token identifier to assign
   * @returns The service instance for method chaining
   */
  public setTokenId(tokenId: string) {
    console.log(`Setting tokenId for token ${this.data.centrifugeId}-${this.data.tokenId}`, tokenId);
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
    console.log(`Setting token price for token ${this.data.centrifugeId}-${this.data.tokenId}`, price);
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
    if(this.data.totalIssuance === null) throw new Error(`Total issuance for token ${this.data.centrifugeId}-${this.data.tokenId} is not set`);
    this.data.totalIssuance += tokenAmount;
    console.log(`Increased totalIssuance for token ${this.data.centrifugeId}-${this.data.tokenId} by ${tokenAmount} to ${this.data.totalIssuance}`);
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
    if(this.data.totalIssuance === null) throw new Error(`Total issuance for token ${this.data.centrifugeId}-${this.data.tokenId} is not set`);
    this.data.totalIssuance -= tokenAmount;
    console.log(`Decreased totalIssuance for token ${this.data.centrifugeId}-${this.data.tokenId} by ${tokenAmount} to ${this.data.totalIssuance}`);
    return this;
  }

  /**
   * Sets the computation timestamp for the current token instance.
   * 
   * @param computedAt - The date when the token data was computed
   * @returns The service instance for method chaining
   */
  public setComputedAt(computedAt: Date) {
    console.log(`Setting computed at for token ${this.data.centrifugeId}-${this.data.tokenId}`, computedAt);
    this.data.computedAt = computedAt;
    return this;
  }
}