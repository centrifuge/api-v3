import { factory, mergeAbis } from "ponder";
import { type Abi, getAbiItem } from "viem";
import fullRegistry from "../generated";
import { type RegistryVersions, type Registry, type NetworkNames } from "./chains";
import { networkNames } from "./chains";

// ============================================================================
// Utility Types
// ============================================================================

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

type Uncapitalized<S extends string> = S extends `${infer First}${infer Rest}`
  ? `${Lowercase<First>}${Rest}`
  : S;

// ============================================================================
// ABI Types
// ============================================================================

export type Abis<V extends RegistryVersions> = V extends RegistryVersions
  ? Registry<V>["abis"]
  : never;
export type AbiName<V extends RegistryVersions> = keyof Abis<V> & string;
export type AbiItem<V extends RegistryVersions, T extends AbiName<V>> = Abis<V>[T];

export type AbiEvent<V extends RegistryVersions, T extends AbiName<V>> =
  AbiItem<V, T> extends readonly (infer U)[] ? Extract<U, { readonly type: "event" }> : never;

export type AbiEventName<V extends RegistryVersions, T extends AbiName<V>> = AbiEvent<V, T>["name"];

export type AbiEventParameter<
  V extends RegistryVersions,
  T extends AbiName<V>,
  E extends AbiEventName<V, T>,
> =
  Extract<AbiEvent<V, T>, { readonly name: E & string }> extends {
    readonly inputs: readonly (infer I)[];
  }
    ? I extends { readonly name: string }
      ? I["name"]
      : never
    : never;

export type AbiExport<V extends RegistryVersions, T extends AbiName<V>> = {
  [K in T]: AbiItem<V, K>;
};

export type AbiExports = { [K in RegistryVersions]: AbiExport<K, AbiName<K>> };

export type ExtractContractNames<T> =
  T extends Record<infer K, any> ? (K extends string ? K : never) : never;

// Type for direct ABI usage (bypassing registry)
// Preserves the const type so Ponder can extract event types
type DirectAbi = Abi;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to validate if a value is a valid ABI item.
 */
function isValidAbiItem(item: unknown): item is { type: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    typeof (item as { type: unknown }).type === "string"
  );
}

/**
 * Type guard to validate if a value is a valid ABI.
 */
function isValidAbi(abi: unknown): abi is Abi {
  return Array.isArray(abi) && abi.length > 0 && abi.every((item) => isValidAbiItem(item));
}

/**
 * Validates that an ABI item has a valid ABI type.
 */
function isValidAbiType(
  item: unknown
): item is { type: "function" | "event" | "constructor" | "error" } {
  if (!isValidAbiItem(item)) return false;
  const type = (item as { type: string }).type;
  return type === "function" || type === "event" || type === "constructor" || type === "error";
}

// ============================================================================
// Registry Loading
// ============================================================================

export const Abis = loadAbisFromRegistry();

/**
 * Loads ABIs from the registry and returns them as an object with ABI name as key.
 */
function loadAbisFromRegistry(): AbiExports {
  const versions = Object.keys(fullRegistry) as RegistryVersions[];
  const abis = versions.map((version) => {
    const versionAbis = fullRegistry[version]["abis"];
    const abiNames = Object.keys(versionAbis) as AbiName<RegistryVersions>[];
    const abiEntries = abiNames.map((name) => [name, versionAbis[name]]);
    return [version, Object.fromEntries(abiEntries)];
  });
  return Object.fromEntries(abis) as AbiExports;
}

// ============================================================================
// Contract Key Types
// ============================================================================

type ContractKeys<
  V extends RegistryVersions,
  N extends AbiName<V>,
> = `${Uncapitalized<N>}${Uppercase<V>}`;

// ============================================================================
// Factory Configuration Types
// ============================================================================

type ValidEventParameter<
  V extends RegistryVersions,
  FA extends AbiName<V>,
  FE extends AbiEventName<V, FA>,
  FEP extends string,
> = FEP extends AbiEventParameter<V, FA, FE> ? FEP : never;

type ValidFactoryConfig<
  V extends RegistryVersions,
  FactoryAbi extends AbiName<V>,
  EventName extends AbiEventName<V, FactoryAbi>,
  EventParameter extends string,
> = {
  abi: FactoryAbi;
  eventName: EventName;
  eventParameter: ValidEventParameter<V, FactoryAbi, EventName, EventParameter>;
};

type ValidAdditionalMappingEntry<
  V extends RegistryVersions,
  MappingAbi extends AbiName<V> | AbiName<V>[] | DirectAbi,
  FactoryAbi extends AbiName<V>,
  EventName extends AbiEventName<V, FactoryAbi>,
  EventParameter extends string,
> = {
  abi: MappingAbi;
  factory: ValidFactoryConfig<V, FactoryAbi, EventName, EventParameter>;
};

// ============================================================================
// Contract Configuration Types
// ============================================================================

type SingleContractConfig<V extends RegistryVersions, N extends AbiName<V>> = {
  [K in ContractKeys<V, N>]: {
    abi: AbiItem<V, N>;
    chain: {
      [K in NetworkNames<V>]: {
        address: `0x${string}`;
        startBlock: number;
        endBlock: number | undefined;
      };
    };
  };
};

type MultipleContractsConfig<V extends RegistryVersions, A extends AbiName<V>> = {
  [K in A as ContractKeys<V, K>]: {
    abi: AbiItem<V, K>;
    chain: {
      [ChainKey in NetworkNames<V>]: {
        address: `0x${string}`;
        startBlock: number;
        endBlock?: number;
      };
    };
  };
};

type AdditionalMappingsContracts<
  V extends RegistryVersions,
  AM extends Record<string, { abi: unknown }>,
  K extends PropertyKey,
> = {
  [Key in K]: Key extends keyof AM
    ? {
        // Preserve exact ABI type from input mapping for Ponder's type system
        // This allows event type extraction from const ABIs
        abi: AM[Key]["abi"] extends readonly unknown[]
          ? AM[Key]["abi"] extends AbiName<V>[]
            ? AbiItem<V, AM[Key]["abi"][number]>
            : AM[Key]["abi"] // Direct ABI - preserve exact type for event inference
          : AM[Key]["abi"] extends AbiName<V>
            ? AbiItem<V, AM[Key]["abi"]>
            : Abi;
        chain: {
          [ChainKey in NetworkNames<V>]: {
            address: `0x${string}`;
            startBlock: number;
            endBlock?: number;
          };
        };
      }
    : never;
};

type ContractsWithAdditionalMappings<
  V extends RegistryVersions,
  A extends AbiName<V>,
  AM extends Record<string, { abi: unknown }>,
  T extends PropertyKey,
> = MultipleContractsConfig<V, A> & AdditionalMappingsContracts<V, AM, T>;

type ContractChain<V extends RegistryVersions, N extends AbiName<V>> = SingleContractConfig<
  V,
  N
>[ContractKeys<V, N>]["chain"];

// ============================================================================
// Additional Mappings Type Constraint
// ============================================================================

type ValidateMappingEntry<
  V extends RegistryVersions,
  MappingAbi,
  FactoryAbi extends AbiName<V>,
  EventName,
  EventParameter,
> = MappingAbi extends AbiName<V> | AbiName<V>[] | DirectAbi
  ? EventName extends AbiEventName<V, FactoryAbi>
    ? ValidAdditionalMappingEntry<V, MappingAbi, FactoryAbi, EventName, EventParameter & string>
    : never
  : never;

type AdditionalMappingsConstraint<
  V extends RegistryVersions,
  AM extends Record<string, unknown>,
> = {
  [K in keyof AM]: AM[K] extends {
    abi: infer MappingAbi;
    factory: {
      abi: infer FactoryAbi extends AbiName<V>;
      eventName: infer EventName;
      eventParameter: infer EventParameter;
    };
  }
    ? ValidateMappingEntry<V, MappingAbi, FactoryAbi, EventName, EventParameter>
    : never;
};

// ============================================================================
// Main Function
// ============================================================================

/**
 * Decorates deployment contracts for a given registry version and selected ABI names.
 * Supports both registry ABIs and direct ABIs (bypassing registry).
 */
export function decorateDeploymentContracts<
  V extends RegistryVersions,
  const A extends readonly AbiName<V>[],
  const AM extends AdditionalMappingsConstraint<V, AM>,
>(
  registryVersion: V,
  selectedAbiNames: A,
  additionalMappings: AM,
  endblocks?: Partial<Record<keyof typeof networkNames, number>>
): ContractsWithAdditionalMappings<V, A[number], AM, keyof AM & string> {
  // Validate registry version exists
  const abis = Abis[registryVersion];
  if (!abis) {
    process.stdout.write(
      `Registry version "${registryVersion}" not found in Abis. Available versions: ${Object.keys(Abis).join(", ")} skipping...\n`
    );
    return {} as ContractsWithAdditionalMappings<V, A[number], AM, keyof AM & string>;
  }

  // Process selected contracts from registry
  const selectedContracts = selectedAbiNames.map((abiName) => {
    // Validate ABI exists
    const abi = abis[abiName];
    if (!abi) {
      throw new Error(
        `ABI "${abiName}" not found in registry version "${registryVersion}". Available ABIs: ${Object.keys(
          abis
        ).join(", ")}`
      );
    }

    return [
      `${toContractCase(abiName)}${registryVersion.toUpperCase()}`,
      {
        abi,
        chain: getContractChain(registryVersion, abiName, endblocks),
      },
    ];
  });

  // Process additional mappings (factory-deployed contracts)
  const additionalMappingsContracts = Object.entries(additionalMappings).map(
    ([mappingName, mapping]) => {
      const m = mapping as {
        abi: AbiName<V> | AbiName<V>[] | DirectAbi;
        factory: {
          abi: AbiName<V>;
          eventName: AbiEventName<V, AbiName<V>>;
          eventParameter: AbiEventParameter<V, AbiName<V>, AbiEventName<V, AbiName<V>>>;
        };
      };

      // Detect if ABI is a direct ABI (bypassing registry)
      // Improved detection: checks for valid ABI structure with proper type validation
      const isDirectAbi =
        Array.isArray(m.abi) &&
        m.abi.length > 0 &&
        isValidAbiItem(m.abi[0]) &&
        isValidAbiType(m.abi[0]) &&
        isValidAbi(m.abi);

      // Resolve ABI: preserve exact type for direct ABIs, resolve registry ABIs
      let resolvedAbi: Abi;
      if (isDirectAbi) {
        // Direct ABI - preserve exact type for Ponder event inference
        resolvedAbi = m.abi as Abi;
      } else if (Array.isArray(m.abi)) {
        // Array of ABI names - validate all exist and merge them
        const missingAbis = m.abi.filter((name) => !abis[name as AbiName<V>]);
        if (missingAbis.length > 0) {
          throw new Error(
            `ABIs not found in registry version "${registryVersion}": ${missingAbis.join(
              ", "
            )}. Available ABIs: ${Object.keys(abis).join(", ")}`
          );
        }

        // Map ABI names to actual ABIs and merge
        const abiArray = m.abi.map((abiName) => {
          const resolved = abis[abiName as AbiName<V>];
          if (!resolved) {
            throw new Error(`ABI "${abiName}" not found in registry version "${registryVersion}"`);
          }
          // Type assertion: registry ABIs are guaranteed to be valid Abi types
          return resolved as Abi;
        });

        resolvedAbi = mergeAbis(abiArray);
      } else {
        // Single ABI name - validate it exists
        const abiName = m.abi as AbiName<V>;
        const resolved = abis[abiName];
        if (!resolved) {
          throw new Error(
            `ABI "${abiName}" not found in registry version "${registryVersion}". Available ABIs: ${Object.keys(
              abis
            ).join(", ")}`
          );
        }
        // Type assertion: registry ABIs are guaranteed to be valid Abi types
        resolvedAbi = resolved as Abi;
      }

      // Validate factory ABI exists
      const factoryAbi = abis[m.factory.abi];
      if (!factoryAbi) {
        throw new Error(
          `Factory ABI "${
            m.factory.abi
          }" not found in registry version "${registryVersion}". Available ABIs: ${Object.keys(
            abis
          ).join(", ")}`
        );
      }

      // Validate event exists in factory ABI
      const factoryAbiArray = Array.isArray(factoryAbi) ? factoryAbi : [];
      const eventExists = factoryAbiArray.some(
        (item) => item.type === "event" && item.name === m.factory.eventName
      );
      if (!eventExists) {
        const availableEvents = factoryAbiArray
          .filter((item) => item.type === "event")
          .map((item) => (item as { name: string }).name)
          .join(", ");
        throw new Error(
          `Event "${m.factory.eventName}" not found in factory ABI "${
            m.factory.abi
          }". Available events: ${availableEvents || "none"}`
        );
      }

      return [
        mappingName,
        {
          abi: resolvedAbi,
          chain: getContractChain(registryVersion, m.factory.abi, endblocks, {
            // Type assertion: event name is validated above to exist in factory ABI
            // Cast through unknown to satisfy type system while maintaining runtime safety
            event: m.factory.eventName,
            parameter: m.factory.eventParameter,
          }),
        },
      ];
    }
  ) as Entries<AdditionalMappingsContracts<V, AM, keyof AM & string>>;

  const result = Object.fromEntries([
    ...selectedContracts,
    ...additionalMappingsContracts,
  ]) as ContractsWithAdditionalMappings<V, A[number], AM, keyof AM & string>;

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the contract chain configuration for a given registry version and ABI name.
 */
function getContractChain<V extends RegistryVersions, N extends AbiName<V>>(
  registryVersion: V,
  abiName: N,
  endBlocks?: Partial<Record<keyof typeof networkNames, number | undefined>>,
  factoryConfig?: {
    event: AbiEventName<V, N>;
    parameter: AbiEventParameter<V, N, AbiEventName<V, N>>;
  }
): ContractChain<V, N> {
  const abis = Abis[registryVersion];
  const registry = fullRegistry[registryVersion] as Registry<V>;
  let chainEntries = Object.entries(registry.chains) as Entries<typeof registry.chains>;
  const selectedNetworks = process.env.SELECTED_NETWORKS?.split(",") ?? [];
  if (selectedNetworks.length > 0) {
    chainEntries = chainEntries.filter(([chainId]) =>
      process.env.SELECTED_NETWORKS!.split(",").includes(chainId)
    );
  }

  const chain = chainEntries.map(([chainId, chainValue]) => {
    const chainName = networkNames[chainId as keyof typeof networkNames];
    const resolvedAddress = chainValue.contracts[
      toContractCase(abiName) as keyof typeof chainValue.contracts
    ].address as `0x${string}`;

    const address = factoryConfig
      ? factory({
          address: resolvedAddress,
          event: getAbiItem({
            abi: abis[abiName] as Abi,
            name: factoryConfig.event as string,
          }) as Parameters<typeof factory>[0]["event"],
          parameter: factoryConfig.parameter,
        })
      : resolvedAddress;

    if (!address) {
      throw new Error(`Address for ${abiName} on ${chainName} not found`);
    }

    const startBlock = chainValue.deployment.startBlock as number;
    const endBlock = computeEndBlock(chainId, toContractCase(abiName), registryVersion, endBlocks);
    return [chainName, { address, startBlock, endBlock }];
  });

  return Object.fromEntries(chain);
}

/**
 * Converts a string to contract case (first letter lowercase).
 */
function toContractCase<S extends string>(name: S): Uncapitalized<S> {
  return (name.charAt(0).toLowerCase() + name.slice(1)) as Uncapitalized<S>;
}

/**
 * Computes the end block for a given chain ID, contract name, and start version.
 * The end block is the start block of the next version (after startVersion) minus 1.
 * @param chainId - The chain ID (as a string key from networkNames).
 * @param contractName - The name of the contract.
 * @param startVersion - The start version.
 * @returns The end block, or undefined if the contract is not found in the next registry version.
 */
function computeEndBlock(
  chainId: keyof typeof networkNames,
  contractName: string,
  startVersion: RegistryVersions,
  endBlocks?: Partial<Record<keyof typeof networkNames, number | undefined>>
): number | undefined {
  if (endBlocks) return endBlocks[chainId];

  // Get the versions array
  const versions = Object.keys(fullRegistry) as RegistryVersions[];

  // Find the index of startVersion in the versions array
  const currentVersionIndex = versions.indexOf(startVersion);

  if (currentVersionIndex === -1)
    throw new Error(`Start version "${startVersion}" not found in registry versions`);

  const nextVersionIndex = currentVersionIndex + 1;

  if (nextVersionIndex >= versions.length) return undefined;

  const nextVersion = versions[nextVersionIndex];
  if (!nextVersion) return undefined;

  // Get the registry for the next version
  const nextRegistry = fullRegistry[nextVersion] as Registry<RegistryVersions>;

  // Access the chain for the given chainId
  // Use Object.entries to safely access chains
  const nextChainEntries = Object.entries(nextRegistry.chains) as Entries<
    typeof nextRegistry.chains
  >;
  const nextChainEntry = nextChainEntries.find(([id]) => id === chainId);
  if (!nextChainEntry) return undefined;

  const nextChain = nextChainEntry[1];

  // Check if the contract exists in this version
  const newContract = nextChain.contracts[contractName as keyof typeof nextChain.contracts];
  if (!newContract) return undefined;

  // Get the block number: use contract.blockNumber if available, otherwise fallback to chain.deployment.startBlock
  const nextContractData = newContract as { blockNumber?: number | null };
  const nextContractStartBlock = nextContractData.blockNumber ?? nextChain.deployment.startBlock;

  if (!nextContractStartBlock) return undefined;

  return nextContractStartBlock - 1;
}

/** Ordered registry version keys (e.g. ["v3", "v3_1"]) for use as message/payload version index. */
export const REGISTRY_VERSION_ORDER = Object.keys(fullRegistry) as string[];

/**
 * Finds the version index where a contract with the given name and address was deployed on a specific chain.
 * Single-pass: iterates by index and returns it directly (no follow-up findIndex).
 * @param contractName - The name of the contract (will be converted to contract case).
 * @param chainId - The chain ID as a number (e.g., 1, 8453, 42161).
 * @param contractAddress - The address of the contract (case-insensitive comparison).
 * @returns The index of the version where the contract was found, or -1 if not found.
 */
export function getVersionIndexForContract(
  contractName: string,
  chainId: number,
  contractAddress: `0x${string}`
): number {
  const normalizedAddress = contractAddress.toLowerCase() as `0x${string}`;
  const contractCaseName = toContractCase(contractName);
  const versions = REGISTRY_VERSION_ORDER;

  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    if (!version) continue;

    const registry = fullRegistry[version as RegistryVersions] as Registry<RegistryVersions>;
    const chain = registry.chains[chainId.toString() as keyof typeof registry.chains];
    if (!chain) continue;

    const contract = chain.contracts[contractCaseName as keyof typeof chain.contracts];
    if (contract) {
      const contractAddr = contract.address as `0x${string}`;
      if (contractAddr.toLowerCase() === normalizedAddress) return i;
    }
  }
  return -1;
}

/**
 * Finds the registry version (e.g. "V3_1") where a contract with the given name and address was deployed on a specific chain.
 * Delegates to getVersionIndexForContract for a single-pass lookup, then maps index to version string.
 * @param contractName - The name of the contract (will be converted to contract case).
 * @param chainId - The chain ID as a number (e.g., 1, 8453, 42161).
 * @param contractAddress - The address of the contract (case-insensitive comparison).
 * @returns The registry version string in format V3_1, or null if not found.
 */
export function getVersionForContract(
  contractName: string,
  chainId: number,
  contractAddress: `0x${string}`
): string | null {
  const index = getVersionIndexForContract(contractName, chainId, contractAddress);
  if (index < 0) return null;
  const version = REGISTRY_VERSION_ORDER[index];
  return version ? version.toUpperCase() : null;
}

/**
 * Finds the contract name for a given chainId and address across all versions.
 * Returns the first matching contract name found.
 * Optimized for runtime efficiency by directly accessing the chain by chainId.
 * @param chainId - The chain ID as a number (e.g., 1, 8453, 42161).
 * @param contractAddress - The address of the contract (case-insensitive comparison).
 * @returns The contract name (in contract case, e.g., "gateway") of the first matching contract, or null if not found.
 */
export function getContractNameForAddress(
  chainId: number,
  contractAddress: `0x${string}`
): string | null {
  // Normalize the address to lowercase for comparison
  const normalizedAddress = contractAddress.toLowerCase() as `0x${string}`;

  // Get all versions
  const versions = Object.keys(fullRegistry) as RegistryVersions[];

  // Iterate through each version
  for (const version of versions) {
    const registry = fullRegistry[version] as Registry<RegistryVersions>;

    // Directly access the chain by chainId (more efficient than iterating all chains)
    const chain = registry.chains[chainId.toString() as keyof typeof registry.chains];

    // Iterate through all contracts in this chain
    const contractEntries = Object.entries(chain.contracts) as Entries<typeof chain.contracts>;

    for (const [contractName, contract] of contractEntries) {
      if (!contract) continue;

      // Compare addresses (case-insensitive)
      const contractAddr = contract.address as `0x${string}`;
      if (contractAddr.toLowerCase() === normalizedAddress) {
        // Return the first matching contract name (in contract case)
        return contractName;
      }
    }
  }

  // Contract not found in any version
  return null;
}
