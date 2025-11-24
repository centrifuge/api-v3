//import { factory } from "ponder";
import fullRegistry from "../generated";
import type {
  RegistryVersions,
  Registry,
  NetworkNames,
} from "./chains";
import { networkNames } from "./chains";

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export type Abis<V extends RegistryVersions> = Registry<V>["abis"];
export type AbiName<V extends RegistryVersions> = keyof Abis<V> & string;

export type AbiItem<
  V extends RegistryVersions,
  T extends AbiName<V>
> = Abis<V>[T];

export type AbiExport<V extends RegistryVersions, T extends AbiName<V>> = {
  [K in T]: AbiItem<V, K>;
};
export type AbiExports = { [K in RegistryVersions]: AbiExport<K, AbiName<K>> };
export const Abis = loadAbisFromRegistry();

/**
 * Loads the ABIs from the registry and returns them as an object with the ABI name as the key.
 * @param abis - The ABIs to load from the registry.
 * @returns An object with the ABI name as the key and the ABI as the value.
 */
function loadAbisFromRegistry(): AbiExports {
  const versions = Object.keys(fullRegistry) as RegistryVersions[];
  const abis = versions.map((version) => {
    const abis = fullRegistry[version]["abis"];
    const abiNames = Object.keys(abis) as AbiName<RegistryVersions>[];
    const abiEntries = abiNames.map((name) => [name, abis[name]]);
    return abiEntries;
  });
  return Object.fromEntries(abis) as AbiExports;
}

type ContractKeys<
  V extends RegistryVersions,
  N extends AbiName<V>
> = `${N}${Uppercase<V>}`;
type Contracts<V extends RegistryVersions, N extends AbiName<V>> = {
  [K in ContractKeys<V, N>]: {
    abi: AbiItem<V, N>;
    chain: {
      [K in NetworkNames<V>]: {
        address: `0x${string}`;
        startBlock: number;
        endBlock?: number;
      };
    };
  };
};

/**
 * Decorates the deployment contracts for a given registry version and selected ABI names.
 * @param registryVersion - The registry version to decorate the deployment contracts for.
 * @param selectedAbiNames - The ABI names to decorate the deployment contracts for.
 * @returns The decorated deployment contracts for the given registry version and selected ABI names.
 */
export function decorateDeploymentContracts<V extends RegistryVersions>(
  registryVersion: V,
  selectedAbiNames: AbiName<V>[]
): Contracts<V, AbiName<V>> {
  const abis = Abis[registryVersion];
  const selectedContracts = selectedAbiNames.map((abiName: AbiName<V>) => {
    return [
      `${abiName}:${registryVersion.toUpperCase()}`,
      {
        abi: abis[abiName],
        chain: getContractChain(registryVersion, abiName),
      },
    ];
  });
  return Object.fromEntries(selectedContracts) as Contracts<V, AbiName<V>>;
}

type ContractChain<
  V extends RegistryVersions,
  N extends AbiName<V>
> = Contracts<V, N>[ContractKeys<V, N>]["chain"];
/**
 * Gets the contract chain for a given registry version and contract name.
 * @param registryVersion - The registry version to get the contract chain for.
 * @param contractName - The name of the contract to get the chain for.
 * @param factoryConfig - The factory configuration to use for the contract.
 * @returns The contract chain for the given registry version and contract name.
 */
function getContractChain<V extends RegistryVersions, N extends AbiName<V>>(
  registryVersion: V,
  abiName: N,
  endBlock?: number,
  //factoryConfig?: Omit<Parameters<typeof factory>[0], "address">
): ContractChain<V, N> {
  const registry = fullRegistry[registryVersion] as Registry<V>;
  const chainEntries = Object.entries(registry.chains) as Entries<typeof registry.chains>;
  const chain = chainEntries.map(([chainId, chainValue]) => {
    const chainName = networkNames[chainId];
    const address = chainValue.contracts[toContractCase(abiName) as keyof typeof chainValue.contracts];
    if (!address) throw new Error(`Address for ${abiName} on ${chainName} not found`);
    const startBlock = registry.chains[chainId]["deployment"]["deployedAtBlock"] as number;
    return [chainName, { address, startBlock, endBlock }]
  });
  return Object.fromEntries(chain);
}

type Uncapitalized<S extends string> = S extends `${infer First}${infer Rest}` ? `${Lowercase<First>}${Rest}` : S;
/**
 * Converts a string to contract case.
 * @param name - The string to convert to contract case.
 * @returns The string in contract case.
 */
function toContractCase<S extends string>(name: S): Uncapitalized<S> {
  return (name.charAt(0).toLowerCase() + name.slice(1)) as Uncapitalized<S>;
}
