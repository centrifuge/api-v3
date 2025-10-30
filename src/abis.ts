/**
 * Dynamic ABI exports from compile-time generated registry
 * 
 * This module replaces the static ABI files in the abis/ folder
 * All ABIs are now loaded from the registry data that was fetched at build time.
 * 
 * Note: We export with "Abi" suffix for backwards compatibility,
 * but the registry stores them without the suffix.
 */

import { getAllAbis } from "./registry";

// Load ABIs synchronously from the generated registry file
const _abis = getAllAbis();

// Helper to validate and return ABI
function validateAbi(name: string): any[] {
  const abi = _abis[name];
  if (!abi) {
    throw new Error(`ABI not found in registry: ${name}`);
  }
  return abi;
}

// Export all ABIs with Abi suffix (registry names + "Abi")
export const HubRegistryAbi = validateAbi("HubRegistry");
export const SpokeAbi = validateAbi("Spoke");
export const ShareClassManagerAbi = validateAbi("ShareClassManager");
export const MessageDispatcherAbi = validateAbi("MessageDispatcher");
export const HoldingsAbi = validateAbi("Holdings");
export const BalanceSheetAbi = validateAbi("BalanceSheet");
export const AsyncVaultAbi = validateAbi("AsyncVault");
export const SyncDepositVaultAbi = validateAbi("SyncDepositVault");
export const PoolEscrowFactoryAbi = validateAbi("PoolEscrowFactory");
export const PoolEscrowAbi = validateAbi("PoolEscrow");
export const OnOfframpManagerFactoryAbi = validateAbi("OnOfframpManagerFactory");
export const OnOfframpManagerAbi = validateAbi("OnOfframpManager");
export const MerkleProofManagerFactoryAbi = validateAbi("MerkleProofManagerFactory");
export const MerkleProofManagerAbi = validateAbi("MerkleProofManager");
export const GatewayAbi = validateAbi("Gateway");
export const MultiAdapterAbi = validateAbi("MultiAdapter");
export const ERC20Abi = validateAbi("ERC20");
export const HubAbi = validateAbi("Hub");
