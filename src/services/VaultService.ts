import { Vault, VaultCrosschainInProgressTypes } from "ponder:schema";
import { Service, mixinCommonStatics } from "./Service";
import { VaultStatuses } from "ponder:schema";
import { serviceLog } from "../helpers/logger";
import { concatHex, encodeAbiParameters, getContractAddress, keccak256, padHex, toHex } from "viem";
import type { Address, Hex } from "viem";
import { VAULT_BYTECODES } from "../config";
import { getContractNameAndVersionForAddress, getContractAddressesForChain } from "../contracts";

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

/** Normalizes scId to bytes16 hex for protocol salt/constructor encoding (ShareClassId type). */
function scIdToBytes16(scId: bigint | Hex): Hex {
  const hex = typeof scId === "bigint" ? toHex(scId) : scId;
  const raw = hex.slice(2);
  // ABI bytes16 may be decoded as 32-byte (64 hex chars); use rightmost 16 bytes for ShareClassId.
  const size16Hex = raw.length > 32 ? raw.slice(-32) : raw;
  return padHex(`0x${size16Hex}` as Hex, { size: 16 }) as Hex;
}

/**
 * Predicts the AsyncVault address (vault id) for a DeployAndLink using hardcoded creation bytecode.
 */
export function predictVaultIdAsync(
  factoryAddress: Address,
  poolId: bigint,
  scId: bigint | Hex,
  assetAddress: Address,
  tokenAddress: Address,
  root: Address,
  asyncRequestManager: Address
): Address {
  const scId16 = scIdToBytes16(scId);
  const salt = keccak256(
    encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes16" }, { type: "address" }],
      [poolId, scId16, assetAddress]
    )
  );
  const constructorArgs = encodeAbiParameters(
    [
      { type: "uint64" },
      { type: "bytes16" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
    ],
    [poolId, scId16, assetAddress, tokenAddress, root, asyncRequestManager]
  );
  const initCodeHash = keccak256(
    concatHex([VAULT_BYTECODES.asyncVaultFactory as Hex, constructorArgs])
  );
  return getContractAddress({
    opcode: "CREATE2",
    from: factoryAddress,
    salt,
    bytecodeHash: initCodeHash,
  }).toLowerCase() as Address;
}

/**
 * Predicts the SyncDepositVault address (vault id) for a DeployAndLink using hardcoded creation bytecode.
 */
export function predictVaultIdSyncDeposit(
  factoryAddress: Address,
  poolId: bigint,
  scId: bigint | Hex,
  assetAddress: Address,
  tokenAddress: Address,
  root: Address,
  syncDepositManager: Address,
  asyncRedeemManager: Address
): Address {
  const scId16 = scIdToBytes16(scId);
  const salt = keccak256(
    encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes16" }, { type: "address" }],
      [poolId, scId16, assetAddress]
    )
  );
  const constructorArgs = encodeAbiParameters(
    [
      { type: "uint64" },
      { type: "bytes16" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
    ],
    [poolId, scId16, assetAddress, tokenAddress, root, syncDepositManager, asyncRedeemManager]
  );
  const initCodeHash = keccak256(
    concatHex([VAULT_BYTECODES.syncDepositVaultFactory as Hex, constructorArgs])
  );
  return getContractAddress({
    opcode: "CREATE2",
    from: factoryAddress,
    salt,
    bytecodeHash: initCodeHash,
  }).toLowerCase() as Address;
}

/** Registry contract name used as vault root (spoke) for CREATE2 prediction. */
const VAULT_ROOT_CONTRACT = "spoke";

/**
 * Predicts the vault address (vault id) by factory type.
 * Uses getContractNameAndVersionForAddress(chainId, factoryAddress) to route to async or sync-deposit prediction,
 * and resolves root and manager addresses from the registry for the same version and chainId.
 * @returns The predicted vault address, or null if factory is unknown or registry lacks required contracts.
 */
export function predictVaultId(
  chainId: number,
  factoryAddress: Address,
  poolId: bigint,
  scId: bigint | Hex,
  assetAddress: Address,
  tokenAddress: Address
): Address | null {
  serviceLog(`Predicting vault id for factory ${factoryAddress} on chain ${chainId}`);
  const resolved = getContractNameAndVersionForAddress(chainId, factoryAddress);
  if (!resolved) return null;
  const { contractName, versionIndex } = resolved;
  serviceLog(`Resolved factory as ${contractName} (versionIndex ${versionIndex})`);

  const addresses = getContractAddressesForChain(chainId, versionIndex);
  if (!addresses) return null;

  const root = addresses[VAULT_ROOT_CONTRACT];
  if (!root) return null;

  if (contractName === "asyncVaultFactory") {
    const asyncRequestManager = addresses["asyncRequestManager"];
    if (!asyncRequestManager) return null;
    const predicted = predictVaultIdAsync(
      factoryAddress,
      poolId,
      scId,
      assetAddress,
      tokenAddress,
      root,
      asyncRequestManager
    );
    serviceLog(`Predicted async vault id: ${predicted}`);
    return predicted;
  }

  if (contractName === "syncDepositVaultFactory") {
    const syncDepositManager = addresses["syncManager"];
    const asyncRedeemManager = addresses["asyncRequestManager"];
    if (!syncDepositManager || !asyncRedeemManager) return null;
    const predicted = predictVaultIdSyncDeposit(
      factoryAddress,
      poolId,
      scId,
      assetAddress,
      tokenAddress,
      root,
      syncDepositManager,
      asyncRedeemManager
    );
    serviceLog(`Predicted syncDeposit vault id: ${predicted}`);
    return predicted;
  }

  return null;
}
