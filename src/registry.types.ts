/**
 * Type definitions for the Centrifuge registry
 */

export interface RegistryChain {
  network: {
    chainId: number;
    environment: string;
    centrifugeId: number;
    name?: string;
    explorer?: string;
    alchemyName?: string;
    quicknodeName?: string;
    icon?: string;
    catapultaNetwork?: string;
    etherscanUrl?: string;
    connectsTo?: string[];
    safeAdmin?: string;
  };
  adapters: {
    wormhole?: {
      wormholeId: string;
      relayer: string;
      deploy: boolean;
    };
    axelar?: {
      axelarId: string;
      gateway: string | null;
      gasService: string | null;
      deploy: boolean;
    };
    layerZero?: {
      endpoint: string;
      layerZeroEid: number;
      deploy: boolean;
    };
  };
  contracts: Record<string, string>;
  deploymentInfo?: Record<string, {
    gitCommit: string;
    timestamp: string;
    version: string;
  }>;
}

export interface RegistryAbis {
  [contractName: string]: any[];
}

export interface Registry {
  chains: {
    mainnet: Record<string, RegistryChain>;
    testnet: Record<string, RegistryChain>;
  };
  abis: RegistryAbis;
}
