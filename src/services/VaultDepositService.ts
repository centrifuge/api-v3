import { VaultDeposit } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";

/**
 * Service class for managing VaultDeposit entities.
 * 
 * Extends the base Service class with VaultDeposit-specific functionality and common static methods.
 * Provides methods for vault deposit management and other vault deposit-related operations.
 * 
 * @extends {Service<typeof VaultDeposit>}
 */
export class VaultDepositService extends mixinCommonStatics(
  Service<typeof VaultDeposit>,
  VaultDeposit,
  "VaultDeposit"
) {}