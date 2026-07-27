import { WhitelistedInvestor } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { Service } from "./Service";
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
export class WhitelistedInvestorService extends Service<typeof WhitelistedInvestor> {
  static readonly entityTable = WhitelistedInvestor;
  static readonly entityName = "WhitelistedInvestor";
  /**
   * Freezes the investor whitelist record.
   *
   * @returns {WhitelistedInvestorService} The current service instance for method chaining
   */
  public freeze() {
    serviceLog(`WhitelistedInvestor freeze account=${this.data.accountAddress}`);
    this.data.isFrozen = true;
    return this;
  }

  /**
   * Unfreezes the investor whitelist record.
   *
   * @returns {WhitelistedInvestorService} The current service instance for method chaining
   */
  public unfreeze() {
    serviceLog(`WhitelistedInvestor unfreeze account=${this.data.accountAddress}`);
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
    serviceLog(
      `WhitelistedInvestor setValidUntil account=${this.data.accountAddress} validUntil=${validUntil?.toISOString() ?? "max"}`
    );
    this.data.validUntil = validUntil ?? MAX_UINT64_DATE;
    return this;
  }
}
