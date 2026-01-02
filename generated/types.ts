import type { Abi } from "viem";

// ============================================================================
// Registry Type Definitions
// These types define the expected structure of the generated registry
// Use with 'satisfies' to validate the generated registry structure
// ============================================================================

export type StringOf<N extends number> = `${N}`;
type ChainAddress = `0x${string}`;

export type RegistryAbis = Record<string, Abi>;
export type RegistryNetwork = "mainnet" | "testnet";

export interface RegistryDeploymentInfo {
  gitCommit: string;
  gitTag?: string;
}

export type RegistryChains<N extends number, C extends string> = Record<
  StringOf<N>,
  RegistryChain<N, C>
>;
export interface RegistryChain<N extends number, C extends string> {
  network: {
    chainId: N;
    centrifugeId: number;
    catapultaNetwork?: string;
    etherscanUrl?: string;
    network?: string;
    safeAdmin?: string;
  };
  adapters: unknown;
  contracts: ChainContracts<C>;
  deployment: {
    deployedAt: number | null;
    startBlock: number | null;
    endBlock?: number | null;
  };
}

type ChainContracts<C extends string> = Record<
  C,
  {
    blockNumber: number | null;
    address: ChainAddress;
    txHash: `0x${string}` | null;
  }
>;

type Capitalized<C extends string> = C extends `${infer First}${infer Rest}`
  ? `${Capitalize<First>}${Rest}`
  : C;
type FactoryContracts<C extends string> =
  C extends `${infer ContractName}Factory` ? `${ContractName}` : never;

export type Registry = {
  network: RegistryNetwork;
  previousRegistry: unknown;
  varsion: string;
  deploymentInfo: RegistryDeploymentInfo;
  chains: RegistryChains<number, string>;
  abis: Record<string, Abi>;
  pinTimestamp?: string
} extends {
  chains: infer TChains extends RegistryChains<
    number,
    infer ContractName extends string
  >;
}
  ? {
      network: RegistryNetwork;
      previousRegistry: unknown;
      version: string;
      deploymentInfo: RegistryDeploymentInfo;
      chains: TChains;
      pinTimestamp?: string;
      abis: Record<
        Capitalized<ContractName> | Capitalized<FactoryContracts<ContractName>>,
        Abi
      >;
    }
  : never;
