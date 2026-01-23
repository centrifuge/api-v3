import { WhitelistedInvestor } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { MAX_UINT64_DATE } from "../config";

/**
 * Service class for managing investor whitelist records in the database.
 *
 * Provides static methods for creating, finding, and querying investor whitelist records.
 *
 * @extends {Service<typeof WhitelistedInvestor>}
 * @see {@link Service} Base service class for common CRUD operations
 * @see {@link WhitelistedInvestor} Investor whitelist entity schema definition
 */
export class WhitelistedInvestorService extends mixinCommonStatics(
  Service<typeof WhitelistedInvestor>,
  WhitelistedInvestor,
  "WhitelistedInvestor"
) {
  /**
   * Freezes the investor whitelist record.
   *
   * @returns {WhitelistedInvestorService} The current service instance for method chaining
   */
  public freeze() {
    this.data.isFrozen = true;
    return this;
  }

  /**
   * Unfreezes the investor whitelist record.
   *
   * @returns {WhitelistedInvestorService} The current service instance for method chaining
   */
  public unfreeze() {
    this.data.isFrozen = false;
    return this;
  }

  /**
   * Sets the valid until date for the investor whitelist record.
   *
   * @param validUntil - The date until which the investor whitelist record is valid
   * @returns {WhitelistedInvestorService} The current service instance for method chaining
   */
  public setValidUntil(validUntil: Date | null) {
    this.data.validUntil = validUntil ?? MAX_UINT64_DATE;
    return this;
  }
}
