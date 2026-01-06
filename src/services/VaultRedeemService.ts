import { VaultRedeem } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing VaultRedeem entities.
 * 
 * Extends the base Service class with VaultRedeem-specific functionality and common static methods.
 * Provides methods for vault redeem management and other vault redeem-related operations.
 * 
 * @extends {Service<typeof VaultRedeem>}
 */
export class VaultRedeemService extends mixinCommonStatics(
  Service<typeof VaultRedeem>,
  VaultRedeem,
  "VaultRedeem"
) {}