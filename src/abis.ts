import registry from "../generated";
type Registry = typeof registry;
type Abis = Registry["v3"]["abis"];
type AbiName = keyof Abis;
type AbiItem<T extends AbiName> = Abis[T];
type AbiExport<T extends AbiName> = { [K in T as `${K}Abi`]: AbiItem<K> };

const { v3: { abis } } = registry;

/**
 * Loads the ABIs from the registry and returns them as an object with the ABI name as the key.
 * @param abis - The ABIs to load from the registry.
 * @returns An object with the ABI name as the key and the ABI as the value.
 */
function loadAbisFromRegistry(abis: Abis): AbiExport<AbiName> {
  const abiNames = Object.keys(abis) as AbiName[];
  const abiEntries = abiNames.map((name) => [`${name}Abi`, abis[name]]);
  return Object.fromEntries(abiEntries);
}

export const {
  HubRegistryAbi,
  ShareClassManagerAbi,
  SpokeAbi,
  AsyncVaultAbi,
  SyncDepositVaultAbi,
  MessageDispatcherAbi,
  HoldingsAbi,
  BalanceSheetAbi,
  PoolEscrowFactoryAbi,
  PoolEscrowAbi,
  OnOfframpManagerFactoryAbi,
  OnOfframpManagerAbi,
  MerkleProofManagerFactoryAbi,
  MerkleProofManagerAbi,
  GatewayAbi,
  MultiAdapterAbi,
  ERC20Abi,
  HubAbi,
  // Add additional keys as needed from your registry
} = loadAbisFromRegistry(abis);