import { Vault, VaultCrosschainInProgressTypes } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { VaultStatuses } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { encodeAbiParameters, getContractAddress, keccak256 } from "viem";
import type { Address, Hex } from "viem";

/**
 * Service class for managing Vault entities.
 *
 * Extends the base Service class with Vault-specific functionality and common static methods.
 * Provides methods for vault status management and other vault-related operations.
 *
 * @extends {Service<typeof Vault>}
 */
export class VaultService extends mixinCommonStatics(Service<typeof Vault>, Vault, "Vault") {
  /**
   * Sets the status of the vault.
   *
   * Updates the vault's status to the specified value and returns the service instance
   * for method chaining.
   *
   * @param {VaultStatuses[number]} status - The new status to set for the vault
   * @returns {VaultService} The current service instance for method chaining
   *
   * @example
   * ```typescript
   * const vaultService = new VaultService();
   * vaultService.setStatus('active');
   * ```
   */
  public setStatus(status: (typeof VaultStatuses)[number]) {
    serviceLog(`Setting status to ${status}`);
    this.data.status = status;
    return this;
  }

  /**
   * Sets the crosschain progress for the vault.
   *
   * @param crosschainInProgress - The value to set for crosschainInProgress
   * @returns The service instance for method chaining
   */
  public setCrosschainInProgress(
    crosschainInProgress?: (typeof VaultCrosschainInProgressTypes)[number]
  ) {
    this.data.crosschainInProgress = crosschainInProgress ?? null;
    serviceLog(`Setting crosschainInProgress to ${crosschainInProgress}`);
    return this;
  }
}

/**
 * Predicts the vault address (vault id) for a DeployAndLink update before the vault is deployed.
 * Uses CREATE2 with salt = keccak256(abi.encode(poolId, scId, asset)), matching AsyncVaultFactory and SyncDepositVaultFactory.
 *
 * @param factoryAddress - Address of AsyncVaultFactory or SyncDepositVaultFactory
 * @param poolId - Pool ID (uint64)
 * @param scId - Share class ID (uint64)
 * @param assetAddress - Asset contract address (from spoke.idToAsset(assetId))
 * @param initCodeHash - keccak256(initcode) where initcode = creationCode + abi.encode(constructor args). Must be computed from the protocol's compiled vault contract (e.g. AsyncVault or SyncDepositVault).
 * @returns The predicted vault address (same value used as Vault.id in the schema)
 *
 * @example
 * ```ts
 * const vaultId = predictVaultId(
 *   asyncVaultFactoryAddress,
 *   1n,
 *   1n,
 *   usdcAddress,
 *   initCodeHash
 * );
 * ```
 */
export function predictVaultId(
  factoryAddress: Address,
  poolId: bigint,
  scId: bigint,
  assetAddress: Address,
  initCodeHash: Hex
): Address {
  const salt = keccak256(
    encodeAbiParameters(
      [{ type: "uint64" }, { type: "uint64" }, { type: "address" }],
      [poolId, scId, assetAddress]
    )
  );
  return getContractAddress({
    opcode: "CREATE2",
    from: factoryAddress,
    salt,
    bytecodeHash: initCodeHash,
  });
}
