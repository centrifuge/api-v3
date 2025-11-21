import registry from "../generated";
export type Registry = typeof registry;
export type RegistryVersions = keyof Registry;
export type Abis<V extends RegistryVersions> = Registry[V]["abis"];
export type AbiName<V extends RegistryVersions> = Extract<keyof Abis<V>, string>;
export type AbiItem<V extends RegistryVersions, T extends AbiName<V>> = Abis<V>[T];
export type AbiExport<V extends RegistryVersions, T extends AbiName<V>> = {
  [K in T as `${K & string}Abi`]: AbiItem<V, K>
};
export type AbiExports = { [K in RegistryVersions]: AbiExport<K, AbiName<K>> };

export default loadAbisFromRegistry(registry);

/**
 * Loads the ABIs from the registry and returns them as an object with the ABI name as the key.
 * @param abis - The ABIs to load from the registry.
 * @returns An object with the ABI name as the key and the ABI as the value.
 */
function loadAbisFromRegistry(registry: Registry): AbiExports {
  const versions = Object.keys(registry) as RegistryVersions[];
  const abis = versions.map((version) => {
    const abis = registry[version as RegistryVersions]["abis"];
    const abiNames = Object.keys(abis) as AbiName<RegistryVersions>[];
    const abiEntries = abiNames.map((name) => [`${name}Abi`, abis[name]]);
    return abiEntries;
  })
  return Object.fromEntries(abis) as AbiExports;
}
