import { publicClients } from "ponder:api";
import { contracts } from "../../../ponder.config";
import { networkNames } from "../../chains";

/**
 * Gets the Viem public client for a given chainId
 * @param chainId - The EVM chain ID
 * @returns Viem public client
 */
export function getPublicClient(chainId: number) {
  const client =
    publicClients[
      networkNames[
        chainId.toString() as keyof typeof networkNames
      ] as keyof typeof publicClients
    ];
  if (!client) {
    throw new Error(`Public client not found for chainId ${chainId}`);
  }
  return client;
}

/**
 * Retrieves the ABI for a contract by name
 * @param name - The contract name as defined in ponder.config
 * @returns The contract ABI
 */
export function getContractAbi(name: keyof typeof contracts) {
  const a = contracts[name];
  return a.abi;
}
