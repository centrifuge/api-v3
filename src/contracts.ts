import { factory, mergeAbis } from "ponder";
import { type Abi, getAbiItem } from "viem";
import fullRegistry from "../generated";
import type { RegistryVersions, Registry, NetworkNames } from "./chains";
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

export type Abis<V extends RegistryVersions> = Registry<V>["abis"];
export type AbiName<V extends RegistryVersions> = keyof Abis<V> & string;
export type AbiItem<
  V extends RegistryVersions,
  T extends AbiName<V>
> = Abis<V>[T];

export type AbiEvent<
  V extends RegistryVersions,
  T extends AbiName<V>
> = AbiItem<V, T> extends readonly (infer U)[]
  ? Extract<U, { readonly type: "event" }>
  : never;

export type AbiEventName<
  V extends RegistryVersions,
  T extends AbiName<V>
> = AbiEvent<V, T>["name"];

export type AbiEventParameter<
  V extends RegistryVersions,
  T extends AbiName<V>,
  E extends AbiEventName<V, T>
> = Extract<AbiEvent<V, T>, { readonly name: E & string }> extends {
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

export type ExtractContractNames<T> = T extends Record<infer K, any>
  ? K extends string
    ? K
    : never
  : never;

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
  return (
    Array.isArray(abi) &&
    abi.length > 0 &&
    abi.every((item) => isValidAbiItem(item))
  );
}

/**
 * Validates that an ABI item has a valid ABI type.
 */
function isValidAbiType(
  item: unknown
): item is { type: "function" | "event" | "constructor" | "error" } {
  if (!isValidAbiItem(item)) return false;
  const type = (item as { type: string }).type;
  return (
    type === "function" ||
    type === "event" ||
    type === "constructor" ||
    type === "error"
  );
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
  N extends AbiName<V>
> = `${N}${Uppercase<V>}`;

// ============================================================================
// Factory Configuration Types
// ============================================================================

type ValidEventParameter<
  V extends RegistryVersions,
  FA extends AbiName<V>,
  FE extends AbiEventName<V, FA>,
  FEP extends string
> = FEP extends AbiEventParameter<V, FA, FE> ? FEP : never;

type ValidFactoryConfig<
  V extends RegistryVersions,
  FactoryAbi extends AbiName<V>,
  EventName extends AbiEventName<V, FactoryAbi>,
  EventParameter extends string
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
  EventParameter extends string
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
        endBlock?: number;
      };
    };
  };
};

type MultipleContractsConfig<
  V extends RegistryVersions,
  A extends AbiName<V>
> = {
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
  K extends PropertyKey
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
  T extends PropertyKey
> = MultipleContractsConfig<V, A> & AdditionalMappingsContracts<V, AM, T>;

type ContractChain<
  V extends RegistryVersions,
  N extends AbiName<V>
> = SingleContractConfig<V, N>[ContractKeys<V, N>]["chain"];

// ============================================================================
// Additional Mappings Type Constraint
// ============================================================================

type ValidateMappingEntry<
  V extends RegistryVersions,
  MappingAbi,
  FactoryAbi extends AbiName<V>,
  EventName,
  EventParameter
> = MappingAbi extends AbiName<V> | AbiName<V>[] | DirectAbi
  ? EventName extends AbiEventName<V, FactoryAbi>
    ? ValidAdditionalMappingEntry<
        V,
        MappingAbi,
        FactoryAbi,
        EventName,
        EventParameter & string
      >
    : never
  : never;

type AdditionalMappingsConstraint<
  V extends RegistryVersions,
  AM extends Record<string, unknown>
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
  const AM extends AdditionalMappingsConstraint<V, AM>
>(
  registryVersion: V,
  selectedAbiNames: A,
  additionalMappings: AM,
  endBlock?: number
): ContractsWithAdditionalMappings<V, A[number], AM, keyof AM & string> {
  // Validate registry version exists
  const abis = Abis[registryVersion];
  if (!abis) {
    throw new Error(
      `Registry version "${registryVersion}" not found in Abis. Available versions: ${Object.keys(
        Abis
      ).join(", ")}`
    );
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
      `${abiName}${registryVersion.toUpperCase()}`,
      {
        abi,
        chain: getContractChain(registryVersion, abiName),
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
            throw new Error(
              `ABI "${abiName}" not found in registry version "${registryVersion}"`
            );
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
          chain: getContractChain(registryVersion, m.factory.abi, endBlock, {
            // Type assertion: event name is validated above to exist in factory ABI
            // Cast through unknown to satisfy type system while maintaining runtime safety
            event: m.factory.eventName ,
            parameter: m.factory.eventParameter ,
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
  endBlock?: number,
  factoryConfig?: { event: AbiEventName<V, N>, parameter: AbiEventParameter<V, N, AbiEventName<V, N>>}
): ContractChain<V, N> {
  const abis = Abis[registryVersion];
  const registry = fullRegistry[registryVersion] as Registry<V>;
  const chainEntries = Object.entries(registry.chains) as Entries<
    typeof registry.chains
  >;

  const chain = chainEntries.map(([chainId, chainValue]) => {
    const chainName = networkNames[chainId];
    const resolvedAddress = chainValue.contracts[
      toContractCase(abiName) as keyof typeof chainValue.contracts
    ] as `0x${string}`;

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

    const startBlock = registry.chains[chainId]["deployment"][
      "deployedAtBlock"
    ] as number;

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
