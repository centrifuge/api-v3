import { InvestorWhitelist } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing investor whitelist records in the database.
 * 
 * Provides static methods for creating, finding, and querying investor whitelist records.
 * 
 * @extends {Service<typeof InvestorWhitelist>}
 * @see {@link Service} Base service class for common CRUD operations
 * @see {@link InvestorWhitelist} Investor whitelist entity schema definition
 */
export class InvestorWhitelistService extends mixinCommonStatics(Service<typeof InvestorWhitelist>, InvestorWhitelist, "InvestorWhitelist") {
  /**
   * Freezes the investor whitelist record.
   * 
   * @returns {InvestorWhitelistService} The current service instance for method chaining
   */
  public freeze() {
    this.data.isFrozen = true;
    return this;
  }

  /**
   * Unfreezes the investor whitelist record.
   * 
   * @returns {InvestorWhitelistService} The current service instance for method chaining
   */
  public unfreeze() {
    this.data.isFrozen = false;
    return this;
  }
}